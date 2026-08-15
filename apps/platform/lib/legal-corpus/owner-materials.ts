import { loadCompletedOcrExtraction, OcrProcessingError } from "../document-analysis/ocr-processor";
import type { PlatformStaffAccess } from "../auth/staff-access";
import { operationalEnvironment } from "../operations/operational-feature-flags";
import { chunkLegalProvision, parseLegalProvisions } from "./provision-parser";
import { buildSparseTermEntries, sparseTermsJson } from "./sparse-index";
import type { LegalCorpusLanguage } from "./trust";

const MAX_PROVISIONS = 8_000;
const MAX_CHUNKS = 16_000;
const WRITE_BATCH_SIZE = 90;

type PromotionEnv = Pick<Env, "APP_ENV" | "BUCKET" | "DB">;

type AnalysisRow = {
  analysisId: string;
  workspaceId: string;
  ownerUserId: string;
  analysisStatus: string;
  fileId: string;
  fileKind: string;
  scanResultId: string | null;
  sourceSha256: string | null;
  extractionSha256: string | null;
};

type ExistingPublication = {
  documentId: string;
  variantId: string;
  versionId: string;
  contentSha256: string;
};

type PublicationRecord = {
  id: string;
  environment: "development" | "staging" | "production";
  analysisId: string;
  workspaceId: string;
  fileId: string;
  scanResultId: string;
  sourceSha256: string;
  extractionSha256: string;
  contentSha256: string;
  documentId: string;
  variantId: string;
  versionId: string;
  language: LegalCorpusLanguage;
  rightsConfirmed: 1;
  trustMode: "technical_auto_trust";
  reason: string;
  actorUserId: string;
  actorSessionId: string;
  actorAssignmentId: string;
  actorMfaVerifiedAt: string;
  createdAt: string;
};

type WithdrawalRecord = {
  id: string;
  environment: "development" | "staging" | "production";
  publicationId: string;
  documentId: string;
  reason: string;
  actorUserId: string;
  actorSessionId: string;
  actorAssignmentId: string;
  actorMfaVerifiedAt: string;
  createdAt: string;
};

export type OwnerMaterialPromotionResult = {
  status: "published" | "unchanged";
  documentId: string;
  variantId: string;
  versionId: string;
  provisionCount: number;
  chunkCount: number;
};

export class OwnerMaterialPromotionError extends Error {
  constructor(readonly code:
    | "OWNER_MATERIAL_NOT_FOUND"
    | "OWNER_MATERIAL_NOT_OWNED"
    | "OWNER_MATERIAL_NOT_READY"
    | "OWNER_MATERIAL_EXTRACTION_INVALID"
    | "OWNER_MATERIAL_SENSITIVE_DATA_REJECTED"
    | "OWNER_MATERIAL_PROMPT_INJECTION_REJECTED"
    | "OWNER_MATERIAL_CAPACITY_REJECTED"
    | "OWNER_MATERIAL_STORAGE_FAILED"
    | "OWNER_MATERIAL_CONFLICT") {
    super(code);
    this.name = "OwnerMaterialPromotionError";
  }
}

async function sha256Hex(value: string | Uint8Array, uppercase = false): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const stable = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", stable.buffer);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return uppercase ? hex.toUpperCase() : hex;
}

function checksumHex(value: ArrayBuffer | undefined): string | null {
  if (!value) return null;
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeMaterialText(value: string): string {
  return value.normalize("NFKC").replace(/\r\n?/gu, "\n").trim();
}

function validateGlobalMaterialText(text: string): void {
  const sensitivePatterns = [
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu,
    /(?:\+?998[\s().-]*)?(?:\d[\s().-]*){9}\b/u,
    /\b\d{14}\b/u,
    /\b[A-Z]{2}\d{7}\b/iu,
  ];
  if (sensitivePatterns.some((pattern) => pattern.test(text))) {
    throw new OwnerMaterialPromotionError("OWNER_MATERIAL_SENSITIVE_DATA_REJECTED");
  }
  const normalized = text.toLocaleLowerCase("und");
  const injectionPatterns = [
    /ignore\s+(?:all\s+)?previous\s+instructions/u,
    /reveal\s+(?:the\s+)?system\s+prompt/u,
    /call\s+this\s+url/u,
    /delete\s+(?:the\s+)?database/u,
    /return\s+all\s+user\s+files/u,
  ];
  if (injectionPatterns.some((pattern) => pattern.test(normalized))) {
    throw new OwnerMaterialPromotionError("OWNER_MATERIAL_PROMPT_INJECTION_REJECTED");
  }
}

async function runBatches(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {
  for (let index = 0; index < statements.length; index += WRITE_BATCH_SIZE) {
    await db.batch(statements.slice(index, index + WRITE_BATCH_SIZE));
  }
}

function canonicalPublication(record: PublicationRecord): string {
  return JSON.stringify(record);
}

function validFreshMfa(mfaVerifiedAt: string, now: Date): boolean {
  const mfaAt = Date.parse(mfaVerifiedAt);
  const nowMs = now.getTime();
  return Number.isFinite(mfaAt) && mfaAt <= nowMs && mfaAt >= nowMs - 15 * 60_000;
}

async function requireCorpusPublisherAssignment(
  db: D1Database,
  staff: Pick<PlatformStaffAccess, "userId" | "assignmentIds" | "mfaVerifiedAt">,
  now: Date,
): Promise<string> {
  if (staff.assignmentIds.length === 0 || !validFreshMfa(staff.mfaVerifiedAt, now)) {
    throw new OwnerMaterialPromotionError("OWNER_MATERIAL_NOT_READY");
  }
  const nowIso = now.toISOString();
  for (const assignmentId of staff.assignmentIds) {
    const assignment = await db.prepare(`SELECT id FROM platform_staff_assignments
      WHERE id=? AND user_id=? AND role IN ('administrator','legal_reviewer') AND revoked_at IS NULL
        AND granted_at<=? AND expires_at>? LIMIT 1`).bind(
      assignmentId, staff.userId, nowIso, nowIso,
    ).first<{ id: string }>();
    if (assignment) return assignment.id;
  }
  throw new OwnerMaterialPromotionError("OWNER_MATERIAL_NOT_READY");
}

async function persistImmutableObject(
  bucket: R2Bucket,
  key: string,
  bytes: Uint8Array,
  sha256: string,
): Promise<void> {
  const existing = await bucket.head(key);
  if (existing) {
    if (existing.size !== bytes.byteLength || checksumHex(existing.checksums.sha256) !== sha256) {
      throw new OwnerMaterialPromotionError("OWNER_MATERIAL_STORAGE_FAILED");
    }
    return;
  }
  await bucket.put(key, bytes, {
    onlyIf: new Headers({ "if-none-match": "*" }),
    sha256,
    httpMetadata: {
      contentType: "application/json; charset=utf-8",
      cacheControl: "private, no-store",
    },
    customMetadata: { contentSha256: sha256, source: "owner-auto-trusted-analysis" },
  });
  const stored = await bucket.head(key);
  if (!stored || stored.size !== bytes.byteLength || checksumHex(stored.checksums.sha256) !== sha256) {
    throw new OwnerMaterialPromotionError("OWNER_MATERIAL_STORAGE_FAILED");
  }
}

async function analysisRow(env: PromotionEnv, input: {
  analysisId: string;
  workspaceId: string;
}): Promise<AnalysisRow | null> {
  return env.DB.prepare(`SELECT analysis.id AS analysisId,analysis.workspace_id AS workspaceId,
      analysis.owner_user_id AS ownerUserId,analysis.status AS analysisStatus,
      file.id AS fileId,file.kind AS fileKind,file.sha256 AS sourceSha256,
      scan.id AS scanResultId,
      extraction.text_sha256 AS extractionSha256
    FROM document_analyses analysis
    JOIN document_files file ON file.id=analysis.uploaded_file_id
      AND file.workspace_id=analysis.workspace_id AND file.owner_user_id=analysis.owner_user_id
    LEFT JOIN file_extractions extraction ON extraction.analysis_id=analysis.id
      AND extraction.file_id=file.id AND extraction.workspace_id=analysis.workspace_id
      AND extraction.owner_user_id=analysis.owner_user_id AND extraction.status='completed'
    LEFT JOIN file_scan_results scan ON scan.analysis_id=analysis.id AND scan.file_id=file.id
      AND scan.workspace_id=analysis.workspace_id AND scan.owner_user_id=analysis.owner_user_id
      AND scan.verdict='clean' AND lower(scan.source_sha256)=lower(file.sha256)
    WHERE analysis.id=? AND analysis.workspace_id=? AND file.archived_at IS NULL
    LIMIT 1`).bind(input.analysisId, input.workspaceId).first<AnalysisRow>();
}

/**
 * Publishes only an analysis owned by the same MFA-bound owner/administrator.
 * Trust follows from the authenticated source owner after technical validation;
 * it is not a separate legal-review decision. The
 * completed OCR derivative is read with its existing R2 size/SHA verification;
 * source content is treated only as immutable data and never as instructions.
 */
export async function promoteCompletedAnalysisToOwnerCorpus(input: {
  env: PromotionEnv;
  staff: Pick<PlatformStaffAccess, "userId" | "sessionId" | "assignmentIds" | "mfaVerifiedAt">;
  analysisId: string;
  workspaceId: string;
  title: string;
  language: LegalCorpusLanguage;
  rightsConfirmed: true;
  reason: string;
  now?: Date;
}): Promise<OwnerMaterialPromotionResult> {
  const now = input.now ?? new Date();
  const createdAt = now.toISOString();
  const title = input.title.trim();
  const reason = input.reason.trim();
  if (input.rightsConfirmed !== true
    || !/^[A-Za-z0-9:_-]{1,180}$/u.test(input.analysisId)
    || !/^[A-Za-z0-9:_-]{1,180}$/u.test(input.workspaceId)
    || title.length < 2 || title.length > 300 || reason.length < 10 || reason.length > 500) {
    throw new OwnerMaterialPromotionError("OWNER_MATERIAL_NOT_READY");
  }
  const row = await analysisRow(input.env, input);
  if (!row) throw new OwnerMaterialPromotionError("OWNER_MATERIAL_NOT_FOUND");
  if (row.ownerUserId !== input.staff.userId) {
    throw new OwnerMaterialPromotionError("OWNER_MATERIAL_NOT_OWNED");
  }
  if (row.analysisStatus !== "completed" || row.fileKind !== "analysis_safe"
    || !row.scanResultId
    || !row.sourceSha256 || !/^[a-f0-9]{64}$/u.test(row.sourceSha256)
    || !row.extractionSha256 || !/^[a-f0-9]{64}$/u.test(row.extractionSha256)) {
    throw new OwnerMaterialPromotionError("OWNER_MATERIAL_NOT_READY");
  }
  const publisherAssignmentId = await requireCorpusPublisherAssignment(input.env.DB, input.staff, now);

  let extracted;
  try {
    extracted = await loadCompletedOcrExtraction(input.env, {
      analysisId: row.analysisId,
      workspaceId: row.workspaceId,
      fileId: row.fileId,
      sourceSha256: row.sourceSha256,
    });
  } catch (error) {
    if (error instanceof OcrProcessingError) {
      throw new OwnerMaterialPromotionError("OWNER_MATERIAL_EXTRACTION_INVALID");
    }
    throw error;
  }
  const text = normalizeMaterialText(extracted?.text ?? "");
  if (!text) throw new OwnerMaterialPromotionError("OWNER_MATERIAL_EXTRACTION_INVALID");
  validateGlobalMaterialText(text);
  const contentSha256 = await sha256Hex(text);
  const existing = await input.env.DB.prepare(`SELECT document_id AS documentId,variant_id AS variantId,
      version_id AS versionId,content_sha256 AS contentSha256
    FROM legal_corpus_owner_ingestions WHERE analysis_id=? AND language=? LIMIT 1`)
    .bind(row.analysisId, input.language).first<ExistingPublication>();
  if (existing) {
    if (existing.contentSha256 !== contentSha256) {
      throw new OwnerMaterialPromotionError("OWNER_MATERIAL_CONFLICT");
    }
    return { status: "unchanged", ...existing, provisionCount: 0, chunkCount: 0 };
  }

  const provisions = parseLegalProvisions(text, input.language);
  const chunks = provisions.flatMap((provision) => chunkLegalProvision(provision)
    .map((chunkText, chunkIndex, all) => ({ provision, chunkText, chunkIndex, totalChunks: all.length })));
  if (provisions.length === 0 || provisions.length > MAX_PROVISIONS
    || chunks.length === 0 || chunks.length > MAX_CHUNKS) {
    throw new OwnerMaterialPromotionError("OWNER_MATERIAL_CAPACITY_REJECTED");
  }

  const identityHash = await sha256Hex(`owner-material:${row.analysisId}`);
  const documentId = `juro-owner:${identityHash.slice(0, 32)}`;
  const variantId = `${documentId}:${input.language}`;
  const versionId = `${variantId}:v1:${contentSha256.slice(0, 12)}`;
  const normalizedObjectKey = `legal-corpus/owner/${identityHash.slice(0, 32)}/${input.language}/${contentSha256}/normalized.json`;
  const normalizedBytes = new TextEncoder().encode(JSON.stringify({
    schemaVersion: 1,
    source: "owner-auto-trusted-analysis",
    analysisId: row.analysisId,
    fileId: row.fileId,
    scanResultId: row.scanResultId,
    sourceSha256: row.sourceSha256,
    extractionSha256: row.extractionSha256,
    contentSha256,
    language: input.language,
    title,
    text,
  }));
  await persistImmutableObject(
    input.env.BUCKET,
    normalizedObjectKey,
    normalizedBytes,
    await sha256Hex(normalizedBytes),
  );

  const date = createdAt.slice(0, 10);
  await input.env.DB.batch([
    input.env.DB.prepare(`INSERT INTO legal_corpus_documents
      (id,provider,jurisdiction,source_class,scope,tenant_id,owner_user_id,matter_id,visibility,canonical_url,
       title,short_title,document_type,availability_status,trusted,verification_status,approval_required,created_at,updated_at)
      VALUES (?,'juro_owner','UZ','OWNER_TRUSTED_GLOBAL','global',NULL,NULL,NULL,'global',NULL,
       ?,?,'owner_material','ready',1,'owner_approved',0,?,?)
      ON CONFLICT(id) DO NOTHING`).bind(
      documentId, title, title.slice(0, 240), createdAt, createdAt,
    ),
    input.env.DB.prepare(`INSERT INTO legal_corpus_variants
      (id,document_id,language,is_official_language_version,translation_type,source_url,last_verified_at,current_version_id,created_at,updated_at,title,short_title)
      VALUES (?,?,?,1,NULL,NULL,?,NULL,?,?,?,?) ON CONFLICT(id) DO NOTHING`).bind(
      variantId, documentId, input.language, createdAt, createdAt, createdAt,
      title, title.slice(0, 240),
    ),
    input.env.DB.prepare(`INSERT INTO legal_corpus_versions
      (id,variant_id,previous_version_id,version_number,status,valid_from,valid_to,version_date,content_sha256,
       raw_object_key,normalized_object_key,source_url,fetched_at,change_type,created_at)
      VALUES (?,?,NULL,1,'active',NULL,NULL,?,?,NULL,?,NULL,?,'new',?)
      ON CONFLICT(variant_id,content_sha256) DO NOTHING`).bind(
      versionId, variantId, date, contentSha256, normalizedObjectKey, createdAt, createdAt,
    ),
  ]);

  const statements: D1PreparedStatement[] = [];
  for (const provision of provisions) {
    const provisionId = `${versionId}:p${provision.sequence}`;
    statements.push(input.env.DB.prepare(`INSERT INTO legal_corpus_provisions
      (id,document_id,variant_id,version_id,article_number,article_number_normalized,article_title,part,chapter,section,
       sequence,text,exact_quote_source,language,status,valid_from,valid_to,source_url,content_sha256,created_at)
      VALUES (?,?,?,?,?,?,?,NULL,NULL,NULL,?,?,?,?,'active',NULL,NULL,NULL,?,?)
      ON CONFLICT(version_id,article_number_normalized,sequence) DO NOTHING`).bind(
      provisionId, documentId, variantId, versionId, provision.articleNumber,
      provision.articleNumberNormalized, provision.title, provision.sequence,
      provision.text, provision.text, input.language, await sha256Hex(provision.text), createdAt,
    ));
  }
  for (const chunk of chunks) {
    const provisionId = `${versionId}:p${chunk.provision.sequence}`;
    const chunkId = `${provisionId}:c${chunk.chunkIndex}`;
    const sparse = sparseTermsJson(buildSparseTermEntries({
      text: chunk.chunkText,
      articleNumber: chunk.provision.articleNumber,
      title: chunk.provision.title,
    }));
    statements.push(input.env.DB.prepare(`INSERT INTO legal_corpus_chunks
      (id,provision_id,version_id,chunk_index,total_chunks,content_text,content_sha256,dense_vector_id,sparse_terms_json,indexed_at,created_at)
      VALUES (?,?,?,?,?,?,?,NULL,?,?,?) ON CONFLICT(provision_id,chunk_index) DO NOTHING`).bind(
      chunkId, provisionId, versionId, chunk.chunkIndex, chunk.totalChunks,
      chunk.chunkText, await sha256Hex(chunk.chunkText), sparse, createdAt, createdAt,
    ));
    statements.push(input.env.DB.prepare("DELETE FROM legal_corpus_sparse_terms WHERE chunk_id=?").bind(chunkId));
    statements.push(input.env.DB.prepare(`INSERT INTO legal_corpus_sparse_terms
      (term,chunk_id,document_id,version_id,language,term_frequency,title_frequency,article_frequency)
      SELECT CAST(json_extract(value,'$.term') AS TEXT),?,?,?, ?,
        CAST(json_extract(value,'$.termFrequency') AS INTEGER),
        CAST(json_extract(value,'$.titleFrequency') AS INTEGER),
        CAST(json_extract(value,'$.articleFrequency') AS INTEGER)
      FROM json_each(?)
      WHERE 1=1
      ON CONFLICT(term,chunk_id) DO UPDATE SET term_frequency=excluded.term_frequency,
        title_frequency=excluded.title_frequency,article_frequency=excluded.article_frequency`).bind(
      chunkId, documentId, versionId, input.language, sparse,
    ));
  }
  await runBatches(input.env.DB, statements);

  const record: PublicationRecord = {
    id: crypto.randomUUID(),
    environment: operationalEnvironment(input.env.APP_ENV),
    analysisId: row.analysisId,
    workspaceId: row.workspaceId,
    fileId: row.fileId,
    scanResultId: row.scanResultId,
    sourceSha256: row.sourceSha256,
    extractionSha256: row.extractionSha256,
    contentSha256,
    documentId,
    variantId,
    versionId,
    language: input.language,
    rightsConfirmed: 1,
    trustMode: "technical_auto_trust",
    reason,
    actorUserId: input.staff.userId,
    actorSessionId: input.staff.sessionId,
    actorAssignmentId: publisherAssignmentId,
    actorMfaVerifiedAt: input.staff.mfaVerifiedAt,
    createdAt,
  };
  const recordHash = await sha256Hex(canonicalPublication(record), true);
  try {
    const result = await input.env.DB.batch([
      input.env.DB.prepare(`UPDATE legal_corpus_variants SET current_version_id=?,last_verified_at=?,updated_at=?
        WHERE id=? AND (current_version_id IS NULL OR current_version_id=?)`).bind(
        versionId, createdAt, createdAt, variantId, versionId,
      ),
      input.env.DB.prepare(`INSERT INTO legal_corpus_owner_ingestions
        (id,environment,analysis_id,workspace_id,file_id,scan_result_id,source_sha256,extraction_sha256,content_sha256,
        document_id,variant_id,version_id,language,rights_confirmed,trust_mode,reason,
         actor_user_id,actor_session_id,actor_assignment_id,
         actor_mfa_verified_at,record_hash,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        record.id, record.environment, record.analysisId, record.workspaceId, record.fileId,
        record.scanResultId, record.sourceSha256, record.extractionSha256, record.contentSha256, record.documentId,
        record.variantId, record.versionId, record.language, record.rightsConfirmed,
        record.trustMode, record.reason, record.actorUserId,
        record.actorSessionId, record.actorAssignmentId, record.actorMfaVerifiedAt, recordHash,
        record.createdAt,
      ),
    ]);
    if (Number(result[0]?.meta.changes ?? 0) !== 1 || Number(result[1]?.meta.changes ?? 0) !== 1) {
      throw new OwnerMaterialPromotionError("OWNER_MATERIAL_CONFLICT");
    }
  } catch (error) {
    if (error instanceof OwnerMaterialPromotionError) throw error;
    throw new OwnerMaterialPromotionError("OWNER_MATERIAL_CONFLICT");
  }
  return {
    status: "published",
    documentId,
    variantId,
    versionId,
    provisionCount: provisions.length,
    chunkCount: chunks.length,
  };
}

/** Disables an owner material through a separate immutable lifecycle event. */
export async function withdrawOwnerMaterial(input: {
  env: Pick<PromotionEnv, "APP_ENV" | "DB">;
  staff: Pick<PlatformStaffAccess, "userId" | "sessionId" | "assignmentIds" | "mfaVerifiedAt">;
  documentId: string;
  reason: string;
  now?: Date;
}): Promise<{ status: "withdrawn"; documentId: string }> {
  const now = input.now ?? new Date();
  const createdAt = now.toISOString();
  const reason = input.reason.trim();
  if (!/^[A-Za-z0-9:_-]{1,180}$/u.test(input.documentId)
    || reason.length < 10 || reason.length > 500) {
    throw new OwnerMaterialPromotionError("OWNER_MATERIAL_NOT_READY");
  }
  const publication = await input.env.DB.prepare(`SELECT publication.id AS publicationId,
      publication.actor_user_id AS actorUserId,document.availability_status AS availabilityStatus,
      withdrawal.id AS withdrawalId
    FROM legal_corpus_owner_ingestions publication
    JOIN legal_corpus_documents document ON document.id=publication.document_id
    LEFT JOIN legal_corpus_owner_ingestion_withdrawals withdrawal ON withdrawal.publication_id=publication.id
    WHERE publication.document_id=? AND publication.environment=? LIMIT 1`).bind(
    input.documentId, operationalEnvironment(input.env.APP_ENV),
  ).first<{
    publicationId: string;
    actorUserId: string;
    availabilityStatus: string;
    withdrawalId: string | null;
  }>();
  if (!publication) throw new OwnerMaterialPromotionError("OWNER_MATERIAL_NOT_FOUND");
  if (publication.actorUserId !== input.staff.userId) {
    throw new OwnerMaterialPromotionError("OWNER_MATERIAL_NOT_OWNED");
  }
  if (publication.withdrawalId || publication.availabilityStatus !== "ready") {
    throw new OwnerMaterialPromotionError("OWNER_MATERIAL_CONFLICT");
  }
  const reviewerAssignmentId = await requireCorpusPublisherAssignment(input.env.DB, input.staff, now);
  const record: WithdrawalRecord = {
    id: crypto.randomUUID(),
    environment: operationalEnvironment(input.env.APP_ENV),
    publicationId: publication.publicationId,
    documentId: input.documentId,
    reason,
    actorUserId: input.staff.userId,
    actorSessionId: input.staff.sessionId,
    actorAssignmentId: reviewerAssignmentId,
    actorMfaVerifiedAt: input.staff.mfaVerifiedAt,
    createdAt,
  };
  const recordHash = await sha256Hex(JSON.stringify(record), true);
  try {
    const result = await input.env.DB.prepare(`INSERT INTO legal_corpus_owner_ingestion_withdrawals
      (id,environment,publication_id,document_id,reason,actor_user_id,actor_session_id,
       actor_assignment_id,actor_mfa_verified_at,record_hash,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(
      record.id, record.environment, record.publicationId, record.documentId, record.reason,
      record.actorUserId, record.actorSessionId, record.actorAssignmentId,
      record.actorMfaVerifiedAt, recordHash, record.createdAt,
    ).run();
    if (Number(result.meta.changes ?? 0) !== 1) {
      throw new OwnerMaterialPromotionError("OWNER_MATERIAL_CONFLICT");
    }
  } catch (error) {
    if (error instanceof OwnerMaterialPromotionError) throw error;
    throw new OwnerMaterialPromotionError("OWNER_MATERIAL_CONFLICT");
  }
  return { status: "withdrawn", documentId: input.documentId };
}
