import { z } from "zod";
import { configuredAnswersSchema, receiptAnswersSchema } from "./validation/schema";

const MAX_SNAPSHOT_BYTES = 4_000_000;
const encoder = new TextEncoder();

export const documentVersionIdempotencyKeySchema = z.string().trim().min(16).max(200);
export const createDocumentVersionSchema = z.object({
  revision: z.number().int().positive(),
}).strict();
export const restoreDocumentVersionSchema = z.object({
  revision: z.number().int().positive(),
}).strict();

const snapshotSchema = z.object({
  schemaVersion: z.literal(1),
  documentId: z.string().uuid(),
  sourceRevision: z.number().int().positive(),
  capturedAt: z.string().datetime(),
  title: z.string().trim().min(1).max(300),
  language: z.enum(["ru", "uz", "uz-cyrl"]),
  participantMode: z.string().min(1).max(50),
  status: z.string().min(1).max(80),
  answers: z.unknown(),
  autoContent: z.string().max(500_000),
  finalContent: z.string().max(500_000),
  manuallyEdited: z.boolean(),
}).strict();

type Snapshot = z.infer<typeof snapshotSchema>;

type CurrentRow = {
  documentId: string;
  workspaceId: string;
  ownerUserId: string;
  revision: number;
  title: string;
  language: string;
  participantMode: string;
  status: string;
  archivedAt: string | null;
  answersJson: string;
  autoContent: string;
  finalContent: string;
  manuallyEdited: number;
};

type VersionRow = {
  id: string;
  workspaceId: string;
  ownerUserId: string;
  documentId: string;
  version: number;
  documentRevision: number;
  source: DocumentVersionSource;
  r2Key: string;
  sizeBytes: number;
  sha256: string;
  idempotencyKeySha256: string;
  status: "pending" | "ready";
  attemptCount: number;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

type RestoreEventRow = {
  id: string;
  documentId: string;
  sourceVersionId: string;
  fromRevision: number;
  toRevision: number;
  contentSha256: string;
};

export type DocumentVersionSource =
  | "user_checkpoint"
  | "restore_checkpoint"
  | "analysis_correction"
  | "suggestion"
  | "review"
  | "approval"
  | "signature"
  | "finalize";

export type DocumentVersionSummary = {
  id: string;
  version: number;
  documentRevision: number;
  source: DocumentVersionSource;
  status: "pending" | "ready";
  attemptCount: number;
  lastErrorCode: string | null;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
};

export class DocumentVersionError extends Error {
  constructor(
    readonly code:
      | "DOCUMENT_NOT_FOUND"
      | "DOCUMENT_ARCHIVED"
      | "REVISION_CONFLICT"
      | "IDEMPOTENCY_CONFLICT"
      | "VERSION_NOT_FOUND"
      | "VERSION_NOT_READY"
      | "VERSION_OBJECT_INVALID"
      | "VERSION_STORAGE_FAILED",
    readonly status: number,
  ) {
    super(code);
    this.name = "DocumentVersionError";
  }
}

export async function listDocumentVersions(input: {
  db: D1Database;
  documentId: string;
  workspaceId: string;
  ownerUserId: string;
}): Promise<DocumentVersionSummary[]> {
  const rows = await input.db.prepare(
    `SELECT id,version,document_revision AS documentRevision,source,status,
      attempt_count AS attemptCount,last_error_code AS lastErrorCode,
      size_bytes AS sizeBytes,sha256,created_at AS createdAt
     FROM builder_document_versions
     WHERE document_id=? AND workspace_id=? AND owner_user_id=?
     ORDER BY version DESC LIMIT 100`,
  ).bind(input.documentId, input.workspaceId, input.ownerUserId).all<DocumentVersionSummary>();
  return rows.results.map((row) => ({ ...row, version: Number(row.version), documentRevision: Number(row.documentRevision), attemptCount: Number(row.attemptCount), sizeBytes: Number(row.sizeBytes) }));
}

export async function createDocumentVersion(input: {
  db: D1Database;
  bucket: R2Bucket;
  documentId: string;
  workspaceId: string;
  ownerUserId: string;
  revision: number;
  idempotencyKey: string;
  source?: DocumentVersionSource;
}): Promise<{ version: DocumentVersionSummary; replayed: boolean }> {
  const idempotencyKey = documentVersionIdempotencyKeySchema.parse(input.idempotencyKey);
  const idempotencyKeySha256 = await sha256Hex(encoder.encode(idempotencyKey));
  let row = await findVersionByRequest(input.db, input.workspaceId, input.ownerUserId, idempotencyKeySha256);
  if (row) {
    assertVersionIdentity(row, input.documentId, input.revision);
    await ensureReadyObject(input.db, input.bucket, row, await loadCurrent(input.db, input));
    row = await requireVersion(input.db, row.id);
    return { version: publicVersion(row), replayed: true };
  }

  const current = await loadCurrent(input.db, input);
  if (current.revision !== input.revision) throw new DocumentVersionError("REVISION_CONFLICT", 409);
  const next = await input.db.prepare(
    "SELECT COALESCE(MAX(version),0)+1 AS version FROM builder_document_versions WHERE document_id=?",
  ).bind(input.documentId).first<{ version: number }>();
  const version = Number(next?.version ?? 1);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const snapshot = snapshotFromCurrent(current, now);
  const bytes = encoder.encode(JSON.stringify(snapshot));
  if (bytes.byteLength > MAX_SNAPSHOT_BYTES) throw new DocumentVersionError("VERSION_OBJECT_INVALID", 422);
  const sha256 = await sha256Hex(bytes);
  const r2Key = `builder-document-versions/${input.workspaceId}/${input.documentId}/${id}.json`;

  try {
    await input.db.prepare(
      `INSERT INTO builder_document_versions
       (id,workspace_id,owner_user_id,document_id,version,document_revision,source,
        r2_key,size_bytes,sha256,idempotency_key_sha256,status,attempt_count,
        last_error_code,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,'pending',0,NULL,?,?)`,
    ).bind(
      id, input.workspaceId, input.ownerUserId, input.documentId, version,
      input.revision, input.source ?? "user_checkpoint", r2Key, bytes.byteLength,
      sha256, idempotencyKeySha256, now, now,
    ).run();
  } catch (cause) {
    row = await findVersionByRevision(input.db, input.documentId, input.revision);
    if (!row) throw cause;
    assertVersionIdentity(row, input.documentId, input.revision);
    await ensureReadyObject(input.db, input.bucket, row, current);
    row = await requireVersion(input.db, row.id);
    return { version: publicVersion(row), replayed: true };
  }
  row = await requireVersion(input.db, id);
  await ensureReadyObject(input.db, input.bucket, row, current);
  row = await requireVersion(input.db, id);
  return { version: publicVersion(row), replayed: false };
}

export async function restoreDocumentVersion(input: {
  db: D1Database;
  bucket: R2Bucket;
  documentId: string;
  versionId: string;
  workspaceId: string;
  ownerUserId: string;
  revision: number;
  idempotencyKey: string;
}): Promise<{ revision: number; sourceVersionId: string; replayed: boolean }> {
  const idempotencyKey = documentVersionIdempotencyKeySchema.parse(input.idempotencyKey);
  const idempotencyKeySha256 = await sha256Hex(encoder.encode(idempotencyKey));
  const replay = await findRestoreEvent(input.db, input.workspaceId, input.ownerUserId, idempotencyKeySha256);
  if (replay) {
    if (replay.documentId !== input.documentId || replay.sourceVersionId !== input.versionId) {
      throw new DocumentVersionError("IDEMPOTENCY_CONFLICT", 409);
    }
    return { revision: Number(replay.toRevision), sourceVersionId: replay.sourceVersionId, replayed: true };
  }

  const current = await loadCurrent(input.db, input);
  if (current.revision !== input.revision) throw new DocumentVersionError("REVISION_CONFLICT", 409);
  const version = await loadVersionForOwner(input.db, input);
  if (!version) throw new DocumentVersionError("VERSION_NOT_FOUND", 404);
  if (version.status !== "ready") throw new DocumentVersionError("VERSION_NOT_READY", 409);
  const snapshot = await readVerifiedSnapshot(input.bucket, version);
  const parsedAnswers = parseSnapshotAnswers(snapshot);
  const identities = partyIdentities(snapshot.participantMode, parsedAnswers);
  const nextRevision = current.revision + 1;
  const now = new Date().toISOString();
  const eventId = crypto.randomUUID();
  const nextStatus = snapshot.status === "Черновик" ? "Черновик" : "Готов";
  try {
    await input.db.batch([
      input.db.prepare(
        `INSERT INTO builder_document_version_restore_events
         (id,workspace_id,owner_user_id,document_id,source_version_id,from_revision,
          to_revision,content_sha256,idempotency_key_sha256,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ).bind(eventId, input.workspaceId, input.ownerUserId, input.documentId, version.id, current.revision, nextRevision, version.sha256, idempotencyKeySha256, now),
      input.db.prepare(
        `UPDATE documents SET title=?,language=?,lender_name=?,borrower_name=?,status=?,
         revision=?,updated_at=? WHERE id=? AND workspace_id=? AND owner_user_id=?
         AND revision=? AND archived_at IS NULL`,
      ).bind(snapshot.title, snapshot.language, identities.primary, identities.secondary, nextStatus, nextRevision, now, input.documentId, input.workspaceId, input.ownerUserId, current.revision),
      input.db.prepare("UPDATE document_answers SET answers_json=?,updated_at=? WHERE document_id=?")
        .bind(JSON.stringify(parsedAnswers), now, input.documentId),
      input.db.prepare("UPDATE document_current_content SET auto_content=?,final_content=?,manually_edited=?,updated_at=? WHERE document_id=?")
        .bind(snapshot.autoContent, snapshot.finalContent, snapshot.manuallyEdited ? 1 : 0, now, input.documentId),
      input.db.prepare(
        `INSERT INTO document_revisions (id,document_id,revision,actor_user_id,source,changes_json,created_at)
         VALUES (?,?,?,?, 'restore_version', ?,?)`,
      ).bind(crypto.randomUUID(), input.documentId, nextRevision, input.ownerUserId, JSON.stringify({ sourceVersionId: version.id, sourceVersion: version.version, sourceRevision: version.documentRevision, contentSha256: version.sha256 }), now),
    ]);
  } catch (cause) {
    const concurrent = await findRestoreEvent(input.db, input.workspaceId, input.ownerUserId, idempotencyKeySha256);
    if (concurrent && concurrent.documentId === input.documentId && concurrent.sourceVersionId === input.versionId) {
      return { revision: Number(concurrent.toRevision), sourceVersionId: concurrent.sourceVersionId, replayed: true };
    }
    throw cause;
  }
  return { revision: nextRevision, sourceVersionId: version.id, replayed: false };
}

async function loadCurrent(db: D1Database, input: { documentId: string; workspaceId: string; ownerUserId: string }): Promise<CurrentRow> {
  const row = await db.prepare(
    `SELECT d.id AS documentId,d.workspace_id AS workspaceId,d.owner_user_id AS ownerUserId,
      d.revision,d.title,d.language,d.participant_mode AS participantMode,d.status,
      d.archived_at AS archivedAt,a.answers_json AS answersJson,c.auto_content AS autoContent,
      c.final_content AS finalContent,c.manually_edited AS manuallyEdited
     FROM documents d
     JOIN workspace_members m ON m.workspace_id=d.workspace_id AND m.user_id=d.owner_user_id AND m.status='active'
     JOIN document_answers a ON a.document_id=d.id
     JOIN document_current_content c ON c.document_id=d.id
     WHERE d.id=? AND d.workspace_id=? AND d.owner_user_id=? LIMIT 1`,
  ).bind(input.documentId, input.workspaceId, input.ownerUserId).first<CurrentRow>();
  if (!row) throw new DocumentVersionError("DOCUMENT_NOT_FOUND", 404);
  if (row.archivedAt) throw new DocumentVersionError("DOCUMENT_ARCHIVED", 409);
  return { ...row, revision: Number(row.revision), manuallyEdited: Number(row.manuallyEdited) };
}

function snapshotFromCurrent(row: CurrentRow, capturedAt: string): Snapshot {
  let answers: unknown;
  try { answers = JSON.parse(row.answersJson); } catch { throw new DocumentVersionError("VERSION_OBJECT_INVALID", 422); }
  answers = parseAnswers(row.participantMode, answers);
  return snapshotSchema.parse({
    schemaVersion: 1,
    documentId: row.documentId,
    sourceRevision: row.revision,
    capturedAt,
    title: row.title,
    language: row.language,
    participantMode: row.participantMode,
    status: row.status,
    answers,
    autoContent: row.autoContent,
    finalContent: row.finalContent,
    manuallyEdited: Boolean(row.manuallyEdited),
  });
}

async function ensureReadyObject(db: D1Database, bucket: R2Bucket, row: VersionRow, current: CurrentRow): Promise<void> {
  if (row.status === "ready") {
    await verifyObject(bucket, row);
    return;
  }
  const snapshot = snapshotFromCurrent(current, row.createdAt);
  const bytes = encoder.encode(JSON.stringify(snapshot));
  if (bytes.byteLength !== Number(row.sizeBytes) || await sha256Hex(bytes) !== row.sha256) {
    throw new DocumentVersionError("IDEMPOTENCY_CONFLICT", 409);
  }
  try {
    let object = await bucket.head(row.r2Key);
    if (!object) {
      object = await bucket.put(row.r2Key, bytes, {
        onlyIf: new Headers({ "if-none-match": "*" }),
        sha256: row.sha256,
        httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "private, no-store" },
        customMetadata: {
          workspaceId: row.workspaceId,
          ownerUserId: row.ownerUserId,
          documentId: row.documentId,
          documentRevision: String(row.documentRevision),
          source: row.source,
        },
      }) ?? await bucket.head(row.r2Key);
    }
    assertObjectIdentity(object, row);
    const result = await db.prepare(
      `UPDATE builder_document_versions SET status='ready',last_error_code=NULL,updated_at=?
       WHERE id=? AND status='pending' AND sha256=? AND size_bytes=?`,
    ).bind(new Date().toISOString(), row.id, row.sha256, row.sizeBytes).run();
    if (Number(result.meta.changes ?? 0) !== 1) {
      const completed = await requireVersion(db, row.id);
      if (completed.status !== "ready") throw new DocumentVersionError("VERSION_STORAGE_FAILED", 503);
    }
  } catch (cause) {
    await db.prepare(
      `UPDATE builder_document_versions SET attempt_count=attempt_count+1,last_error_code='R2_WRITE_FAILED',updated_at=?
       WHERE id=? AND status='pending'`,
    ).bind(new Date().toISOString(), row.id).run().catch(() => undefined);
    if (cause instanceof DocumentVersionError) throw cause;
    throw new DocumentVersionError("VERSION_STORAGE_FAILED", 503);
  }
}

async function readVerifiedSnapshot(bucket: R2Bucket, row: VersionRow): Promise<Snapshot> {
  let object: R2ObjectBody | null;
  try { object = await bucket.get(row.r2Key); } catch { throw new DocumentVersionError("VERSION_STORAGE_FAILED", 503); }
  assertObjectIdentity(object, row);
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (bytes.byteLength !== Number(row.sizeBytes) || await sha256Hex(bytes) !== row.sha256) {
    throw new DocumentVersionError("VERSION_OBJECT_INVALID", 422);
  }
  try {
    const snapshot = snapshotSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
    if (snapshot.documentId !== row.documentId || snapshot.sourceRevision !== Number(row.documentRevision)) throw new Error("identity");
    return snapshot;
  } catch {
    throw new DocumentVersionError("VERSION_OBJECT_INVALID", 422);
  }
}

async function verifyObject(bucket: R2Bucket, row: VersionRow): Promise<void> {
  try { assertObjectIdentity(await bucket.head(row.r2Key), row); }
  catch (cause) { if (cause instanceof DocumentVersionError) throw cause; throw new DocumentVersionError("VERSION_STORAGE_FAILED", 503); }
}

function assertObjectIdentity(object: R2Object | R2ObjectBody | null, row: VersionRow): asserts object is R2Object | R2ObjectBody {
  if (!object || object.size !== Number(row.sizeBytes) || checksumHex(object.checksums.sha256) !== row.sha256) {
    throw new DocumentVersionError("VERSION_OBJECT_INVALID", 422);
  }
}

function parseSnapshotAnswers(snapshot: Snapshot): Record<string, unknown> {
  return parseAnswers(snapshot.participantMode, snapshot.answers);
}

function parseAnswers(participantMode: string, value: unknown): Record<string, unknown> {
  const parsed = participantMode === "configurable" ? configuredAnswersSchema.safeParse(value) : receiptAnswersSchema.safeParse(value);
  if (!parsed.success) throw new DocumentVersionError("VERSION_OBJECT_INVALID", 422);
  return parsed.data as Record<string, unknown>;
}

function partyIdentities(participantMode: string, answers: Record<string, unknown>): { primary: string | null; secondary: string | null } {
  if (participantMode !== "configurable") {
    const lender = answers.lender as { fullName?: unknown } | undefined;
    const borrower = answers.borrower as { fullName?: unknown } | undefined;
    return { primary: textValue(lender?.fullName), secondary: textValue(borrower?.fullName) };
  }
  return {
    primary: firstText(answers, ["claimant.fullName", "employee.fullName", "creditor.fullName"]),
    secondary: firstText(answers, ["respondent.fullName", "employer.name", "debtor.fullName"]),
  };
}

function firstText(answers: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) { const value = textValue(answers[key]); if (value) return value; }
  return null;
}
function textValue(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }

async function findVersionByRequest(db: D1Database, workspaceId: string, ownerUserId: string, hash: string): Promise<VersionRow | null> {
  return db.prepare(versionSelect("workspace_id=? AND owner_user_id=? AND idempotency_key_sha256=?"))
    .bind(workspaceId, ownerUserId, hash).first<VersionRow>();
}
async function findVersionByRevision(db: D1Database, documentId: string, revision: number): Promise<VersionRow | null> {
  return db.prepare(versionSelect("document_id=? AND document_revision=?")).bind(documentId, revision).first<VersionRow>();
}
async function requireVersion(db: D1Database, id: string): Promise<VersionRow> {
  const row = await db.prepare(versionSelect("id=?")).bind(id).first<VersionRow>();
  if (!row) throw new DocumentVersionError("VERSION_NOT_FOUND", 404);
  return normalizeVersion(row);
}
async function loadVersionForOwner(db: D1Database, input: { documentId: string; versionId: string; workspaceId: string; ownerUserId: string }): Promise<VersionRow | null> {
  const row = await db.prepare(versionSelect("id=? AND document_id=? AND workspace_id=? AND owner_user_id=?"))
    .bind(input.versionId, input.documentId, input.workspaceId, input.ownerUserId).first<VersionRow>();
  return row ? normalizeVersion(row) : null;
}
function versionSelect(where: string): string {
  return `SELECT id,workspace_id AS workspaceId,owner_user_id AS ownerUserId,document_id AS documentId,
    version,document_revision AS documentRevision,source,r2_key AS r2Key,size_bytes AS sizeBytes,sha256,
    idempotency_key_sha256 AS idempotencyKeySha256,status,attempt_count AS attemptCount,
    last_error_code AS lastErrorCode,created_at AS createdAt,updated_at AS updatedAt
    FROM builder_document_versions WHERE ${where} LIMIT 1`;
}
function normalizeVersion(row: VersionRow): VersionRow {
  return { ...row, version: Number(row.version), documentRevision: Number(row.documentRevision), sizeBytes: Number(row.sizeBytes), attemptCount: Number(row.attemptCount) };
}
function assertVersionIdentity(row: VersionRow, documentId: string, revision: number): void {
  if (row.documentId !== documentId || Number(row.documentRevision) !== revision) throw new DocumentVersionError("IDEMPOTENCY_CONFLICT", 409);
}
async function findRestoreEvent(db: D1Database, workspaceId: string, ownerUserId: string, hash: string): Promise<RestoreEventRow | null> {
  return db.prepare(
    `SELECT id,document_id AS documentId,source_version_id AS sourceVersionId,
      from_revision AS fromRevision,to_revision AS toRevision,content_sha256 AS contentSha256
     FROM builder_document_version_restore_events
     WHERE workspace_id=? AND owner_user_id=? AND idempotency_key_sha256=? LIMIT 1`,
  ).bind(workspaceId, ownerUserId, hash).first<RestoreEventRow>();
}
function publicVersion(row: VersionRow): DocumentVersionSummary {
  const normalized = normalizeVersion(row);
  return { id: normalized.id, version: normalized.version, documentRevision: normalized.documentRevision, source: normalized.source, status: normalized.status, attemptCount: normalized.attemptCount, lastErrorCode: normalized.lastErrorCode, sizeBytes: normalized.sizeBytes, sha256: normalized.sha256, createdAt: normalized.createdAt };
}
async function sha256Hex(value: Uint8Array): Promise<string> {
  const copy = new Uint8Array(value);
  return checksumHex(await crypto.subtle.digest("SHA-256", copy.buffer));
}
function checksumHex(value: ArrayBuffer | null | undefined): string {
  if (!value) return "";
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
