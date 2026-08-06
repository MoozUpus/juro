import {
  beginAnalysisVersionObjectAttachment,
  createAnalysisVersionObjectWrite,
  recordAnalysisVersionObjectWriteFailure,
  requireAttachedAnalysisVersionObjectWrite,
} from "./version-object-write";
import { scheduleUserDocumentIndexStatements } from "./user-document-vectors";

export type AnalysisDocumentVersion = {
  id: string;
  analysisId: string;
  version: number;
  sourceKind: "extracted" | "corrected";
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
};

export type SuggestedRevisionStatus = "pending" | "accepted" | "rejected" | "applied" | "stale" | "ambiguous";

export type SuggestedRevision = {
  id: string;
  analysisId: string;
  riskId: string;
  status: SuggestedRevisionStatus;
  originalText: string;
  proposedText: string;
  decidedAt: string | null;
  appliedVersionId: string | null;
  riskLevel: string;
  riskTitle: string;
  riskDescription: string;
  clause: string | null;
  page: number | null;
  recommendation: string | null;
  legalBasisSourceIds: string[];
};

type VersionRow = AnalysisDocumentVersion & { r2Key: string; ownerUserId: string; workspaceId: string };

type RevisionRow = {
  id: string;
  analysisId: string;
  riskId: string;
  sourceVersionId: string;
  workspaceId: string;
  ownerUserId: string;
  originalText: string;
  proposedText: string;
  status: SuggestedRevisionStatus;
  decidedAt: string | null;
  appliedVersionId: string | null;
  riskLevel: string;
  riskTitle: string;
  riskDescription: string;
  clause: string | null;
  page: number | null;
  recommendation: string | null;
  legalBasisSourceIdsJson: string;
};

export class AnalysisRevisionError extends Error {
  constructor(
    readonly code:
      | "ANALYSIS_REVISION_NOT_FOUND"
      | "ANALYSIS_REVISION_NOT_READY"
      | "ANALYSIS_REVISION_INVALID_DECISION"
      | "ANALYSIS_REVISION_INVALID_SELECTION"
      | "ANALYSIS_REVISION_IDEMPOTENCY_CONFLICT"
      | "ANALYSIS_REVISION_SOURCE_INVALID"
      | "ANALYSIS_REVISION_NO_APPLICABLE_CHANGES"
      | "ANALYSIS_REVISION_CONFLICT"
      | "ANALYSIS_REVISION_STORAGE_FAILED",
    readonly status: number,
    readonly diagnosticStage?: "create_intent" | "write_object" | "attach_version" | "verify_attachment",
  ) {
    super(code);
    this.name = "AnalysisRevisionError";
  }
}

export function analysisSourceVersionId(analysisId: string): string {
  return `analysis-source-${analysisId}`;
}

export function suggestedRevisionId(riskId: string): string {
  return `suggested-revision-${riskId}`;
}

export async function storeInitialAnalysisDocumentVersion(
  env: { DB: D1Database; BUCKET: R2Bucket },
  input: {
    analysisId: string;
    workspaceId: string;
    ownerUserId: string;
    fileName: string;
    text: string;
  },
): Promise<AnalysisDocumentVersion> {
  const normalized = input.text.replace(/\r\n?/g, "\n");
  const bytes = new TextEncoder().encode(normalized);
  if (bytes.byteLength === 0) throw new AnalysisRevisionError("ANALYSIS_REVISION_SOURCE_INVALID", 422);
  const sha256 = await sha256Hex(bytes);
  const existing = await versionByNumber(env.DB, input.analysisId, input.workspaceId, input.ownerUserId, 1);
  if (existing) {
    if (existing.sha256 !== sha256 || existing.sizeBytes !== bytes.byteLength) {
      throw new AnalysisRevisionError("ANALYSIS_REVISION_SOURCE_INVALID", 409);
    }
    return publicVersion(existing);
  }

  const id = analysisSourceVersionId(input.analysisId);
  let objectWrite: Awaited<ReturnType<typeof createAnalysisVersionObjectWrite>>;
  try {
    objectWrite = await createAnalysisVersionObjectWrite(env.DB, {
      analysisId: input.analysisId,
      workspaceId: input.workspaceId,
      ownerUserId: input.ownerUserId,
      targetVersion: 1,
      sourceKind: "extracted",
      sizeBytes: bytes.byteLength,
      sha256,
    });
  } catch {
    throw new AnalysisRevisionError("ANALYSIS_REVISION_STORAGE_FAILED", 503, "create_intent");
  }
  const r2Key = objectWrite.r2Key;
  try {
    await putImmutableText(env.BUCKET, r2Key, bytes, sha256, {
      analysisId: input.analysisId,
      version: "1",
      sourceKind: "extracted",
      objectWriteId: objectWrite.id,
    });
  } catch {
    await recordAnalysisVersionObjectWriteFailure(env.DB, objectWrite, "R2_PUT_FAILED").catch(() => undefined);
    throw new AnalysisRevisionError("ANALYSIS_REVISION_STORAGE_FAILED", 503, "write_object");
  }
  const now = new Date().toISOString();
  const fileName = normalizedFileName(input.fileName, 1);
  try {
    await env.DB.batch([
      beginAnalysisVersionObjectAttachment(env.DB, objectWrite, now),
      env.DB.prepare(
        `INSERT INTO analysis_document_versions
       (id,analysis_id,workspace_id,owner_user_id,version,parent_version_id,source_kind,r2_key,object_write_id,
        file_name,mime_type,size_bytes,sha256,idempotency_key,selection_sha256,revision_ids_json,
        created_by_user_id,created_at)
       VALUES (?,?,?,?,1,NULL,'extracted',?, ?,?,'text/markdown; charset=utf-8',?,?,NULL,NULL,'[]',NULL,?)`,
      ).bind(
        id, input.analysisId, input.workspaceId, input.ownerUserId,
        r2Key, objectWrite.id, fileName, bytes.byteLength, sha256, now,
      ),
    ]);
  } catch {
    await recordAnalysisVersionObjectWriteFailure(env.DB, objectWrite, "D1_ATTACH_CONFLICT").catch(() => undefined);
    const raced = await versionByNumber(env.DB, input.analysisId, input.workspaceId, input.ownerUserId, 1);
    if (!raced || raced.sha256 !== sha256 || raced.sizeBytes !== bytes.byteLength) {
      throw new AnalysisRevisionError("ANALYSIS_REVISION_STORAGE_FAILED", 503, "attach_version");
    }
    return publicVersion(raced);
  }
  try {
    await requireAttachedAnalysisVersionObjectWrite(env.DB, objectWrite.id, id);
  } catch {
    throw new AnalysisRevisionError("ANALYSIS_REVISION_STORAGE_FAILED", 503, "verify_attachment");
  }
  return { id, analysisId: input.analysisId, version: 1, sourceKind: "extracted", fileName, mimeType: "text/markdown; charset=utf-8", sizeBytes: bytes.byteLength, sha256, createdAt: now };
}

export async function listAnalysisRevisionState(
  db: D1Database,
  input: { analysisId: string; workspaceId: string; userId: string },
): Promise<{ revisions: SuggestedRevision[]; versions: AnalysisDocumentVersion[] }> {
  const analysis = await db.prepare(
    "SELECT id FROM document_analyses WHERE id=? AND workspace_id=? AND owner_user_id=? AND status='completed' LIMIT 1",
  ).bind(input.analysisId, input.workspaceId, input.userId).first<{ id: string }>();
  if (!analysis) throw new AnalysisRevisionError("ANALYSIS_REVISION_NOT_FOUND", 404);
  const [revisionRows, versionRows] = await Promise.all([
    db.prepare(
      `SELECT revision.id,revision.analysis_id AS analysisId,revision.risk_id AS riskId,
        revision.source_version_id AS sourceVersionId,revision.workspace_id AS workspaceId,
        revision.owner_user_id AS ownerUserId,revision.original_text AS originalText,
        revision.proposed_text AS proposedText,revision.status,revision.decided_at AS decidedAt,
        revision.applied_version_id AS appliedVersionId,risk.level AS riskLevel,risk.title AS riskTitle,
        risk.description AS riskDescription,risk.clause,risk.page,risk.recommendation,
        risk.legal_basis_source_ids_json AS legalBasisSourceIdsJson
       FROM suggested_revisions revision
       JOIN document_risks risk ON risk.id=revision.risk_id AND risk.analysis_id=revision.analysis_id
       WHERE revision.analysis_id=? AND revision.workspace_id=? AND revision.owner_user_id=?
       ORDER BY risk.created_at,revision.id`,
    ).bind(input.analysisId, input.workspaceId, input.userId).all<RevisionRow>(),
    db.prepare(
      `SELECT id,analysis_id AS analysisId,workspace_id AS workspaceId,owner_user_id AS ownerUserId,
        version,source_kind AS sourceKind,r2_key AS r2Key,file_name AS fileName,mime_type AS mimeType,
        size_bytes AS sizeBytes,sha256,created_at AS createdAt
       FROM analysis_document_versions
       WHERE analysis_id=? AND workspace_id=? AND owner_user_id=? ORDER BY version DESC`,
    ).bind(input.analysisId, input.workspaceId, input.userId).all<VersionRow>(),
  ]);
  return {
    revisions: revisionRows.results.map(publicRevision),
    versions: versionRows.results.map(publicVersion),
  };
}

export async function decideSuggestedRevision(
  db: D1Database,
  input: {
    analysisId: string;
    revisionId: string;
    workspaceId: string;
    userId: string;
    decision: "accepted" | "rejected";
  },
): Promise<{ revision: SuggestedRevision; replay: boolean }> {
  const current = await revisionById(db, input);
  if (!current) throw new AnalysisRevisionError("ANALYSIS_REVISION_NOT_FOUND", 404);
  if (["applied", "stale", "ambiguous"].includes(current.status)) {
    throw new AnalysisRevisionError("ANALYSIS_REVISION_INVALID_DECISION", 409);
  }
  if (current.status === input.decision) return { revision: publicRevision(current), replay: true };
  const now = new Date().toISOString();
  const [result] = await db.batch([
    db.prepare(
      `UPDATE suggested_revisions SET status=?,decided_by_user_id=?,decided_at=?,applied_version_id=NULL,updated_at=?
       WHERE id=? AND analysis_id=? AND workspace_id=? AND owner_user_id=?
         AND status IN ('pending','accepted','rejected')`,
    ).bind(
      input.decision, input.userId, now, now, input.revisionId,
      input.analysisId, input.workspaceId, input.userId,
    ),
    db.prepare(
      `INSERT INTO workspace_audit_events
       (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
       SELECT ?,?,?,'suggested_revision',?,?,?,?
       WHERE EXISTS (
         SELECT 1 FROM suggested_revisions
         WHERE id=? AND analysis_id=? AND workspace_id=? AND owner_user_id=?
           AND status=? AND decided_by_user_id=? AND decided_at=?
       )`,
    ).bind(
      crypto.randomUUID(), input.workspaceId, input.userId, input.revisionId,
      input.decision === "accepted" ? "revision_accepted" : "revision_rejected",
      JSON.stringify({ analysisId: input.analysisId }), now,
      input.revisionId, input.analysisId, input.workspaceId, input.userId,
      input.decision, input.userId, now,
    ),
  ]);
  if (Number(result?.meta.changes ?? 0) !== 1) throw new AnalysisRevisionError("ANALYSIS_REVISION_CONFLICT", 409);
  const updated = await revisionById(db, input);
  if (!updated) throw new AnalysisRevisionError("ANALYSIS_REVISION_CONFLICT", 409);
  return { revision: publicRevision(updated), replay: false };
}

export async function applySuggestedRevisions(
  env: { DB: D1Database; BUCKET: R2Bucket },
  input: {
    analysisId: string;
    workspaceId: string;
    userId: string;
    mode: "selected" | "all";
    revisionIds: string[];
    idempotencyKey: string;
  },
): Promise<{
  version: AnalysisDocumentVersion;
  appliedRevisionIds: string[];
  skipped: Array<{ id: string; status: "stale" | "ambiguous" }>;
  replay: boolean;
  partial: boolean;
}> {
  const idempotencyKey = input.idempotencyKey.trim();
  if (!/^[A-Za-z0-9._:-]{16,160}$/.test(idempotencyKey)) {
    throw new AnalysisRevisionError("ANALYSIS_REVISION_IDEMPOTENCY_CONFLICT", 400);
  }
  const requestedIds = input.mode === "selected"
    ? [...new Set(input.revisionIds.map((id) => id.trim()).filter(Boolean))].sort()
    : [];
  if (input.mode === "selected" && requestedIds.length === 0) {
    throw new AnalysisRevisionError("ANALYSIS_REVISION_INVALID_SELECTION", 400);
  }
  const selectionSha256 = await sha256Hex(new TextEncoder().encode(`${input.mode}:${requestedIds.join("|")}`));
  const replay = await versionByIdempotency(env.DB, idempotencyKey);
  if (replay) {
    if (
      replay.analysisId !== input.analysisId || replay.workspaceId !== input.workspaceId
      || replay.ownerUserId !== input.userId || replay.selectionSha256 !== selectionSha256
    ) {
      throw new AnalysisRevisionError("ANALYSIS_REVISION_IDEMPOTENCY_CONFLICT", 409);
    }
    return {
      version: publicVersion(replay),
      appliedRevisionIds: parseStringArray(replay.revisionIdsJson),
      skipped: [], replay: true, partial: false,
    };
  }

  const analysis = await env.DB.prepare(
    "SELECT id FROM document_analyses WHERE id=? AND workspace_id=? AND owner_user_id=? AND status='completed' LIMIT 1",
  ).bind(input.analysisId, input.workspaceId, input.userId).first<{ id: string }>();
  if (!analysis) throw new AnalysisRevisionError("ANALYSIS_REVISION_NOT_READY", 409);
  const latest = await latestVersion(env.DB, input.analysisId, input.workspaceId, input.userId);
  if (!latest) throw new AnalysisRevisionError("ANALYSIS_REVISION_SOURCE_INVALID", 409);

  const rows = await env.DB.prepare(
    `SELECT revision.id,revision.analysis_id AS analysisId,revision.risk_id AS riskId,
      revision.source_version_id AS sourceVersionId,revision.workspace_id AS workspaceId,
      revision.owner_user_id AS ownerUserId,revision.original_text AS originalText,
      revision.proposed_text AS proposedText,revision.status,revision.decided_at AS decidedAt,
      revision.applied_version_id AS appliedVersionId,risk.level AS riskLevel,risk.title AS riskTitle,
      risk.description AS riskDescription,risk.clause,risk.page,risk.recommendation,
      risk.legal_basis_source_ids_json AS legalBasisSourceIdsJson
     FROM suggested_revisions revision
     JOIN document_risks risk ON risk.id=revision.risk_id AND risk.analysis_id=revision.analysis_id
     WHERE revision.analysis_id=? AND revision.workspace_id=? AND revision.owner_user_id=?
       AND revision.status IN ('pending','accepted')
     ORDER BY revision.created_at,revision.id`,
  ).bind(input.analysisId, input.workspaceId, input.userId).all<RevisionRow>();
  const candidates = input.mode === "all"
    ? rows.results
    : rows.results.filter((row) => requestedIds.includes(row.id) && row.status === "accepted");
  if (
    candidates.length === 0
    || (input.mode === "selected" && candidates.length !== requestedIds.length)
  ) {
    throw new AnalysisRevisionError("ANALYSIS_REVISION_INVALID_SELECTION", 409);
  }

  const sourceText = await readVerifiedText(env.BUCKET, latest);
  const located = candidates.map((revision) => locateRevision(sourceText, revision));
  markOverlaps(located);
  const valid = located.filter((item): item is LocatedRevision & { start: number; invalid: null } => item.invalid === null && item.start !== null);
  const invalid = located.filter((item): item is LocatedRevision & { invalid: "stale" | "ambiguous" } => item.invalid !== null);
  if (valid.length === 0) {
    await persistInvalidRevisions(env.DB, invalid, input, new Date().toISOString());
    throw new AnalysisRevisionError("ANALYSIS_REVISION_NO_APPLICABLE_CHANGES", 422);
  }

  let corrected = sourceText;
  for (const item of [...valid].sort((left, right) => right.start - left.start)) {
    corrected = corrected.slice(0, item.start) + item.revision.proposedText + corrected.slice(item.start + item.revision.originalText.length);
  }
  const bytes = new TextEncoder().encode(corrected);
  const sha256 = await sha256Hex(bytes);
  const nextVersion = latest.version + 1;
  const versionId = `analysis-version-${crypto.randomUUID()}`;
  const objectWrite = await createAnalysisVersionObjectWrite(env.DB, {
    analysisId: input.analysisId,
    workspaceId: input.workspaceId,
    ownerUserId: input.userId,
    targetVersion: nextVersion,
    sourceKind: "corrected",
    sizeBytes: bytes.byteLength,
    sha256,
  });
  const r2Key = objectWrite.r2Key;
  const appliedRevisionIds = valid.map((item) => item.revision.id).sort();
  try {
    await putImmutableText(env.BUCKET, r2Key, bytes, sha256, {
      analysisId: input.analysisId,
      version: String(nextVersion),
      sourceKind: "corrected",
      objectWriteId: objectWrite.id,
    });
  } catch (error) {
    await recordAnalysisVersionObjectWriteFailure(env.DB, objectWrite, "R2_PUT_FAILED").catch(() => undefined);
    throw error;
  }
  const now = new Date().toISOString();
  const fileName = normalizedFileName(latest.fileName, nextVersion);
  const inheritedLanguage = await env.DB.prepare(
    `SELECT job.language FROM user_document_index_jobs job
     JOIN analysis_document_versions version ON version.id=job.document_version_id
     WHERE job.analysis_id=? AND job.workspace_id=? AND job.owner_user_id=?
     ORDER BY version.version DESC LIMIT 1`,
  ).bind(input.analysisId, input.workspaceId, input.userId).first<{
    language: "ru" | "uz" | "mixed" | "unknown";
  }>();
  const statements: D1PreparedStatement[] = [
    beginAnalysisVersionObjectAttachment(env.DB, objectWrite, now),
    env.DB.prepare(
      `INSERT INTO analysis_document_versions
       (id,analysis_id,workspace_id,owner_user_id,version,parent_version_id,source_kind,r2_key,object_write_id,
        file_name,mime_type,size_bytes,sha256,idempotency_key,selection_sha256,revision_ids_json,
        created_by_user_id,created_at)
       VALUES (?,?,?,?,?,?,'corrected',?, ?,?,'text/markdown; charset=utf-8',?,?,?,?,?,?,?)`,
    ).bind(
      versionId, input.analysisId, input.workspaceId, input.userId, nextVersion, latest.id,
      r2Key, objectWrite.id, fileName, bytes.byteLength, sha256, idempotencyKey, selectionSha256,
      JSON.stringify(appliedRevisionIds), input.userId, now,
    ),
    ...scheduleUserDocumentIndexStatements(env.DB, {
      analysisId: input.analysisId,
      documentVersionId: versionId,
      workspaceId: input.workspaceId,
      ownerUserId: input.userId,
      sourceHash: sha256,
      language: inheritedLanguage?.language ?? "unknown",
      now,
    }),
    ...valid.map((item) => env.DB.prepare(
      `UPDATE suggested_revisions SET status='applied',decided_by_user_id=?,decided_at=?,
        applied_version_id=?,updated_at=?
       WHERE id=? AND analysis_id=? AND workspace_id=? AND owner_user_id=?
         AND status IN ('pending','accepted')`,
    ).bind(
      input.userId, now, versionId, now, item.revision.id,
      input.analysisId, input.workspaceId, input.userId,
    )),
    ...invalid.map((item) => invalidUpdate(env.DB, item, input, now)),
    env.DB.prepare(
      `INSERT INTO workspace_audit_events
       (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
       VALUES (?,?,?,'analysis_document_version',?,'analysis_revisions_applied',?,?)`,
    ).bind(
      crypto.randomUUID(), input.workspaceId, input.userId, versionId,
      JSON.stringify({
        analysisId: input.analysisId,
        parentVersionId: latest.id,
        version: nextVersion,
        appliedRevisionIds,
        skippedRevisionIds: invalid.map((item) => item.revision.id),
        normalizedTextOnly: true,
      }), now,
    ),
  ];
  try {
    await env.DB.batch(statements);
  } catch (error) {
    await recordAnalysisVersionObjectWriteFailure(env.DB, objectWrite, "D1_ATTACH_CONFLICT").catch(() => undefined);
    const conflict = new AnalysisRevisionError("ANALYSIS_REVISION_CONFLICT", 409) as AnalysisRevisionError & { cause?: unknown };
    conflict.cause = error;
    throw conflict;
  }
  await requireAttachedAnalysisVersionObjectWrite(env.DB, objectWrite.id, versionId);
  return {
    version: { id: versionId, analysisId: input.analysisId, version: nextVersion, sourceKind: "corrected", fileName, mimeType: "text/markdown; charset=utf-8", sizeBytes: bytes.byteLength, sha256, createdAt: now },
    appliedRevisionIds,
    skipped: invalid.map((item) => ({ id: item.revision.id, status: item.invalid })),
    replay: false,
    partial: invalid.length > 0,
  };
}

export async function analysisVersionForDownload(
  db: D1Database,
  input: { analysisId: string; versionId: string; workspaceId: string; userId: string },
): Promise<VersionRow> {
  const row = await db.prepare(
    `SELECT id,analysis_id AS analysisId,workspace_id AS workspaceId,owner_user_id AS ownerUserId,
      version,source_kind AS sourceKind,r2_key AS r2Key,file_name AS fileName,mime_type AS mimeType,
      size_bytes AS sizeBytes,sha256,created_at AS createdAt
     FROM analysis_document_versions WHERE id=? AND analysis_id=? AND workspace_id=? AND owner_user_id=? LIMIT 1`,
  ).bind(input.versionId, input.analysisId, input.workspaceId, input.userId).first<VersionRow>();
  if (!row) throw new AnalysisRevisionError("ANALYSIS_REVISION_NOT_FOUND", 404);
  return row;
}

export async function verifiedAnalysisVersionObject(bucket: R2Bucket, row: VersionRow): Promise<R2ObjectBody> {
  const object = await bucket.get(row.r2Key);
  if (!object || object.size !== row.sizeBytes || checksumHex(object.checksums.sha256) !== row.sha256) {
    throw new AnalysisRevisionError("ANALYSIS_REVISION_STORAGE_FAILED", 422);
  }
  return object;
}

type LocatedRevision = {
  revision: RevisionRow;
  start: number | null;
  invalid: "stale" | "ambiguous" | null;
};

function locateRevision(text: string, revision: RevisionRow): LocatedRevision {
  if (revision.originalText === revision.proposedText) return { revision, start: null, invalid: "stale" };
  const first = text.indexOf(revision.originalText);
  if (first < 0) return { revision, start: null, invalid: "stale" };
  if (text.indexOf(revision.originalText, first + revision.originalText.length) >= 0) {
    return { revision, start: null, invalid: "ambiguous" };
  }
  return { revision, start: first, invalid: null };
}

function markOverlaps(items: LocatedRevision[]): void {
  const valid = items.filter((item) => item.start !== null && item.invalid === null)
    .sort((left, right) => (left.start ?? 0) - (right.start ?? 0));
  for (let index = 1; index < valid.length; index += 1) {
    const previous = valid[index - 1]!;
    const current = valid[index]!;
    if (current.start !== null && previous.start !== null && current.start < previous.start + previous.revision.originalText.length) {
      previous.invalid = "ambiguous";
      previous.start = null;
      current.invalid = "ambiguous";
      current.start = null;
    }
  }
}

async function persistInvalidRevisions(
  db: D1Database,
  invalid: Array<LocatedRevision & { invalid: "stale" | "ambiguous" }>,
  input: { analysisId: string; workspaceId: string; userId: string },
  now: string,
): Promise<void> {
  if (invalid.length === 0) return;
  await db.batch(invalid.map((item) => invalidUpdate(db, item, input, now)));
}

function invalidUpdate(
  db: D1Database,
  item: LocatedRevision & { invalid: "stale" | "ambiguous" },
  input: { analysisId: string; workspaceId: string; userId: string },
  now: string,
): D1PreparedStatement {
  return db.prepare(
    `UPDATE suggested_revisions SET status=?,decided_by_user_id=NULL,decided_at=?,applied_version_id=NULL,updated_at=?
     WHERE id=? AND analysis_id=? AND workspace_id=? AND owner_user_id=? AND status IN ('pending','accepted')`,
  ).bind(item.invalid, now, now, item.revision.id, input.analysisId, input.workspaceId, input.userId);
}

async function readVerifiedText(bucket: R2Bucket, row: VersionRow): Promise<string> {
  const object = await verifiedAnalysisVersionObject(bucket, row);
  return new TextDecoder("utf-8", { fatal: true }).decode(await object.arrayBuffer());
}

async function putImmutableText(
  bucket: R2Bucket,
  key: string,
  bytes: Uint8Array,
  sha256: string,
  metadata: Record<string, string>,
): Promise<void> {
  const existing = await bucket.head(key);
  if (existing) {
    if (existing.size !== bytes.byteLength || checksumHex(existing.checksums.sha256) !== sha256) {
      throw new AnalysisRevisionError("ANALYSIS_REVISION_STORAGE_FAILED", 409);
    }
    return;
  }
  const stored = await bucket.put(key, bytes, {
    onlyIf: new Headers({ "if-none-match": "*" }),
    sha256,
    httpMetadata: { contentType: "text/markdown; charset=utf-8", cacheControl: "private, no-store" },
    customMetadata: metadata,
  });
  if (!stored || stored.size !== bytes.byteLength || checksumHex(stored.checksums.sha256) !== sha256) {
    throw new AnalysisRevisionError("ANALYSIS_REVISION_STORAGE_FAILED", 503);
  }
}

async function revisionById(
  db: D1Database,
  input: { analysisId: string; revisionId: string; workspaceId: string; userId: string },
): Promise<RevisionRow | null> {
  return db.prepare(
    `SELECT revision.id,revision.analysis_id AS analysisId,revision.risk_id AS riskId,
      revision.source_version_id AS sourceVersionId,revision.workspace_id AS workspaceId,
      revision.owner_user_id AS ownerUserId,revision.original_text AS originalText,
      revision.proposed_text AS proposedText,revision.status,revision.decided_at AS decidedAt,
      revision.applied_version_id AS appliedVersionId,risk.level AS riskLevel,risk.title AS riskTitle,
      risk.description AS riskDescription,risk.clause,risk.page,risk.recommendation,
      risk.legal_basis_source_ids_json AS legalBasisSourceIdsJson
     FROM suggested_revisions revision
     JOIN document_risks risk ON risk.id=revision.risk_id AND risk.analysis_id=revision.analysis_id
     WHERE revision.id=? AND revision.analysis_id=? AND revision.workspace_id=? AND revision.owner_user_id=? LIMIT 1`,
  ).bind(input.revisionId, input.analysisId, input.workspaceId, input.userId).first<RevisionRow>();
}

async function versionByNumber(
  db: D1Database,
  analysisId: string,
  workspaceId: string,
  userId: string,
  version: number,
): Promise<VersionRow | null> {
  return db.prepare(
    `SELECT id,analysis_id AS analysisId,workspace_id AS workspaceId,owner_user_id AS ownerUserId,
      version,source_kind AS sourceKind,r2_key AS r2Key,file_name AS fileName,mime_type AS mimeType,
      size_bytes AS sizeBytes,sha256,created_at AS createdAt
     FROM analysis_document_versions
     WHERE analysis_id=? AND workspace_id=? AND owner_user_id=? AND version=? LIMIT 1`,
  ).bind(analysisId, workspaceId, userId, version).first<VersionRow>();
}

async function latestVersion(db: D1Database, analysisId: string, workspaceId: string, userId: string): Promise<VersionRow | null> {
  return db.prepare(
    `SELECT id,analysis_id AS analysisId,workspace_id AS workspaceId,owner_user_id AS ownerUserId,
      version,source_kind AS sourceKind,r2_key AS r2Key,file_name AS fileName,mime_type AS mimeType,
      size_bytes AS sizeBytes,sha256,created_at AS createdAt
     FROM analysis_document_versions
     WHERE analysis_id=? AND workspace_id=? AND owner_user_id=? ORDER BY version DESC LIMIT 1`,
  ).bind(analysisId, workspaceId, userId).first<VersionRow>();
}

async function versionByIdempotency(db: D1Database, idempotencyKey: string): Promise<(VersionRow & { selectionSha256: string; revisionIdsJson: string }) | null> {
  return db.prepare(
    `SELECT id,analysis_id AS analysisId,workspace_id AS workspaceId,owner_user_id AS ownerUserId,
      version,source_kind AS sourceKind,r2_key AS r2Key,file_name AS fileName,mime_type AS mimeType,
      size_bytes AS sizeBytes,sha256,created_at AS createdAt,selection_sha256 AS selectionSha256,
      revision_ids_json AS revisionIdsJson
     FROM analysis_document_versions WHERE idempotency_key=? LIMIT 1`,
  ).bind(idempotencyKey).first<VersionRow & { selectionSha256: string; revisionIdsJson: string }>();
}

function publicVersion(row: VersionRow): AnalysisDocumentVersion {
  return {
    id: row.id, analysisId: row.analysisId, version: Number(row.version), sourceKind: row.sourceKind,
    fileName: row.fileName, mimeType: row.mimeType, sizeBytes: Number(row.sizeBytes),
    sha256: row.sha256, createdAt: row.createdAt,
  };
}

function publicRevision(row: RevisionRow): SuggestedRevision {
  return {
    id: row.id, analysisId: row.analysisId, riskId: row.riskId, status: row.status,
    originalText: row.originalText, proposedText: row.proposedText, decidedAt: row.decidedAt,
    appliedVersionId: row.appliedVersionId, riskLevel: row.riskLevel, riskTitle: row.riskTitle,
    riskDescription: row.riskDescription, clause: row.clause, page: row.page,
    recommendation: row.recommendation, legalBasisSourceIds: parseStringArray(row.legalBasisSourceIdsJson),
  };
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function normalizedFileName(source: string, version: number): string {
  const base = source.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 80) || "document";
  return `${base}.normalized-v${version}.md`;
}

async function sha256Hex(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(value).buffer);
  return checksumHex(digest);
}

function checksumHex(value: ArrayBuffer | null | undefined): string {
  if (!value) return "";
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
