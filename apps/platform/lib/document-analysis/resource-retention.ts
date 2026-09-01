import { deleteUserDocumentVectorsForAnalysis } from "./user-document-vectors";

const PURGE_BATCH_LIMIT = 100;
const R2_DELETE_BATCH_LIMIT = 1_000;
const UPLOAD_WRITER_LEASE_MS = 60 * 60 * 1_000;

type RetentionRow = {
  analysisId: string;
  workspaceId: string;
  userId: string;
  fileId: string;
  deletionReason: "owner_request" | "abandoned_upload";
};

type ObjectKeyRow = { objectKey: string | null };

export type DocumentAnalysisRetentionEnv = {
  DB: D1Database;
  BUCKET: R2Bucket;
  QUARANTINE_BUCKET: R2Bucket;
  USER_DOCUMENTS_INDEX?: VectorizeIndex;
};

export class DocumentAnalysisRetentionError extends Error {
  constructor(
    readonly code: "ANALYSIS_NOT_FOUND" | "ANALYSIS_IN_USE",
    readonly status: 404 | 409,
  ) {
    super(code);
    this.name = "DocumentAnalysisRetentionError";
  }
}

export async function requestDocumentAnalysisDeletion(
  env: DocumentAnalysisRetentionEnv,
  input: { analysisId: string; workspaceId: string; userId: string; now?: string },
): Promise<{ status: "purged" | "retrying" }> {
  const now = input.now ?? new Date().toISOString();
  const candidate = await env.DB.prepare(
    `SELECT analysis.id AS analysisId
     FROM document_analyses analysis
     WHERE analysis.id=? AND analysis.workspace_id=? AND analysis.owner_user_id=?
       AND analysis.status IN ('initiated','upload_failed','uploaded','completed','failed','deletion_pending')
       AND NOT EXISTS (
         SELECT 1 FROM legal_corpus_owner_upload_requests owner_upload
         WHERE owner_upload.analysis_id=analysis.id OR owner_upload.file_id=analysis.uploaded_file_id
       )
       AND NOT EXISTS (
         SELECT 1 FROM document_comparisons comparison
         WHERE comparison.version_one_file_id=analysis.uploaded_file_id
            OR comparison.version_two_file_id=analysis.uploaded_file_id
       )
     LIMIT 1`,
  ).bind(input.analysisId, input.workspaceId, input.userId).first<{ analysisId: string }>();
  if (!candidate) {
    const owned = await env.DB.prepare(
      "SELECT id FROM document_analyses WHERE id=? AND workspace_id=? AND owner_user_id=? LIMIT 1",
    ).bind(input.analysisId, input.workspaceId, input.userId).first<{ id: string }>();
    if (owned) throw new DocumentAnalysisRetentionError("ANALYSIS_IN_USE", 409);
    throw new DocumentAnalysisRetentionError("ANALYSIS_NOT_FOUND", 404);
  }
  try {
    const marked = await env.DB.prepare(
      `UPDATE document_analyses
       SET deletion_requested_at=coalesce(deletion_requested_at,?),
           deletion_reason=coalesce(deletion_reason,'owner_request'),
           status='deletion_pending',summary_json=NULL,result_sha256=NULL,error_code=NULL,
           last_purge_error=NULL,updated_at=?
       WHERE id=? AND workspace_id=? AND owner_user_id=?
         AND status IN ('initiated','upload_failed','uploaded','completed','failed','deletion_pending')`,
    ).bind(now, now, input.analysisId, input.workspaceId, input.userId).run();
    if (Number(marked.meta?.changes ?? 0) !== 1) {
      const owned = await env.DB.prepare(
        "SELECT id FROM document_analyses WHERE id=? AND workspace_id=? AND owner_user_id=? LIMIT 1",
      ).bind(input.analysisId, input.workspaceId, input.userId).first<{ id: string }>();
      throw new DocumentAnalysisRetentionError(owned ? "ANALYSIS_IN_USE" : "ANALYSIS_NOT_FOUND", owned ? 409 : 404);
    }
  } catch (error) {
    if (isAnalysisInUseError(error)) {
      throw new DocumentAnalysisRetentionError("ANALYSIS_IN_USE", 409);
    }
    throw error;
  }
  return purgeDocumentAnalysis(env, input.analysisId, now);
}

export async function purgeExpiredDocumentAnalysisUploads(input: {
  env: DocumentAnalysisRetentionEnv;
  now?: string;
  limit?: number;
}): Promise<{ eligible: number; purged: number; retrying: number; idempotencyPurged: number }> {
  const now = input.now ?? new Date().toISOString();
  if (!await retentionSchemaAvailable(input.env.DB)) return { eligible: 0, purged: 0, retrying: 0, idempotencyPurged: 0 };
  const staleUploadCutoff = new Date(Date.parse(now) - UPLOAD_WRITER_LEASE_MS).toISOString();
  const staleUploadRecoveryAfter = new Date(Date.parse(now) + UPLOAD_WRITER_LEASE_MS).toISOString();
  await input.env.DB.prepare(
    `UPDATE document_analyses
     SET status='upload_failed',error_code='UPLOAD_LEASE_EXPIRED',abandoned_after=?,updated_at=?
     WHERE resource_scope='interactive_analysis' AND deletion_requested_at IS NULL
       AND status='uploading' AND updated_at<=?`,
  ).bind(staleUploadRecoveryAfter, now, staleUploadCutoff).run();
  const idempotency = await input.env.DB.prepare(
    `DELETE FROM idempotency_keys
     WHERE expires_at<=? AND scope LIKE 'document-analysis-upload:%'
       AND (
         result_ref IS NULL
         OR NOT EXISTS (SELECT 1 FROM document_analyses analysis WHERE analysis.id=idempotency_keys.result_ref)
       )`,
  ).bind(now).run();
  const idempotencyPurged = Number(idempotency.meta?.changes ?? 0);
  const limit = Math.min(Math.max(input.limit ?? PURGE_BATCH_LIMIT, 1), 500);
  const rows = await input.env.DB.prepare(
    `SELECT analysis.id AS analysisId
     FROM document_analyses analysis
     WHERE (
       analysis.deletion_requested_at IS NOT NULL
       OR (
         analysis.resource_scope='interactive_analysis'
         AND analysis.deletion_requested_at IS NULL
         AND analysis.abandoned_after<=?
         AND analysis.status IN ('initiated','upload_failed','uploaded')
       )
     )
       AND NOT EXISTS (
         SELECT 1 FROM legal_corpus_owner_upload_requests owner_upload
         WHERE owner_upload.analysis_id=analysis.id OR owner_upload.file_id=analysis.uploaded_file_id
       )
       AND NOT EXISTS (
         SELECT 1 FROM document_comparisons comparison
         WHERE comparison.version_one_file_id=analysis.uploaded_file_id
            OR comparison.version_two_file_id=analysis.uploaded_file_id
       )
     ORDER BY coalesce(analysis.deletion_requested_at,analysis.abandoned_after),analysis.id
     LIMIT ?`,
  ).bind(now, limit).all<{ analysisId: string }>();
  let purged = 0;
  let retrying = 0;
  for (const row of rows.results) {
    await input.env.DB.prepare(
      `UPDATE document_analyses
       SET deletion_requested_at=coalesce(deletion_requested_at,?),
           deletion_reason=coalesce(deletion_reason,'abandoned_upload'),
           status='deletion_pending',summary_json=NULL,result_sha256=NULL,error_code=NULL,
           updated_at=?
       WHERE id=? AND deletion_requested_at IS NULL
         AND resource_scope='interactive_analysis' AND abandoned_after<=?
         AND status IN ('initiated','upload_failed','uploaded')`,
    ).bind(now, now, row.analysisId, now).run();
    const result = await purgeDocumentAnalysis(input.env, row.analysisId, now);
    if (result.status === "purged") purged += 1;
    else retrying += 1;
  }
  return { eligible: rows.results.length, purged, retrying, idempotencyPurged };
}

async function purgeDocumentAnalysis(
  env: DocumentAnalysisRetentionEnv,
  analysisId: string,
  now: string,
): Promise<{ status: "purged" | "retrying" }> {
  const row = await env.DB.prepare(
    `SELECT analysis.id AS analysisId,analysis.workspace_id AS workspaceId,
       analysis.owner_user_id AS userId,analysis.uploaded_file_id AS fileId,
       analysis.deletion_reason AS deletionReason
     FROM document_analyses analysis
     WHERE analysis.id=? AND analysis.deletion_requested_at IS NOT NULL
       AND analysis.deletion_reason IN ('owner_request','abandoned_upload')
       AND NOT EXISTS (
         SELECT 1 FROM legal_corpus_owner_upload_requests owner_upload
         WHERE owner_upload.analysis_id=analysis.id OR owner_upload.file_id=analysis.uploaded_file_id
       )
       AND NOT EXISTS (
         SELECT 1 FROM document_comparisons comparison
         WHERE comparison.version_one_file_id=analysis.uploaded_file_id
            OR comparison.version_two_file_id=analysis.uploaded_file_id
       )
     LIMIT 1`,
  ).bind(analysisId).first<RetentionRow>();
  if (!row) {
    const retained = await env.DB.prepare(
      "SELECT 1 AS found FROM document_analyses WHERE id=? AND deletion_requested_at IS NOT NULL LIMIT 1",
    ).bind(analysisId).first<{ found: number }>();
    return retained?.found ? { status: "retrying" } : { status: "purged" };
  }

  try {
    if (await hasActiveAnalysisObjectWriter(env.DB, row.analysisId)) {
      await env.DB.prepare(
        `UPDATE document_analyses SET last_purge_error='ACTIVE_OBJECT_WRITER',updated_at=?
         WHERE id=? AND deletion_requested_at IS NOT NULL`,
      ).bind(now, row.analysisId).run();
      return { status: "retrying" };
    }
    const keys = await analysisObjectKeys(env.DB, row.analysisId, row.fileId);
    const deletedVectors = await deleteUserDocumentVectorsForAnalysis(env, {
      analysisId: row.analysisId,
      workspaceId: row.workspaceId,
      userId: row.userId,
    }, now);
    const quarantineKeys = keys.filter((key) => key.startsWith("quarantine-v2/"));
    const primaryKeys = keys.filter((key) => !key.startsWith("quarantine-v2/"));
    await deleteAndVerify(env.QUARANTINE_BUCKET, quarantineKeys);
    // Historical URL-import rows used a quarantine-shaped key in the primary
    // bucket. Deleting that exact tenant/analysis/file key from both bindings
    // closes the legacy ambiguity without widening the deletion scope.
    await deleteAndVerify(env.BUCKET, quarantineKeys);
    await deleteAndVerify(env.BUCKET, primaryKeys);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT OR IGNORE INTO workspace_audit_events
         (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
         VALUES (?,?,?,'document_analysis',?,'analysis_content_purged',?,?)`,
      ).bind(
        `document-analysis-purge:${row.analysisId}`,
        row.workspaceId,
        row.deletionReason === "owner_request" ? row.userId : null,
        row.analysisId,
        JSON.stringify({ reason: row.deletionReason, objectCount: keys.length, vectorCount: deletedVectors }),
        now,
      ),
      env.DB.prepare(
        "DELETE FROM idempotency_keys WHERE result_ref=? AND scope LIKE 'document-analysis-upload:%'",
      ).bind(row.analysisId),
      env.DB.prepare(
        "DELETE FROM document_analyses WHERE id=? AND workspace_id=? AND owner_user_id=? AND deletion_requested_at IS NOT NULL",
      ).bind(row.analysisId, row.workspaceId, row.userId),
      env.DB.prepare(
        `DELETE FROM document_files
         WHERE id=? AND workspace_id=? AND owner_user_id=?
           AND NOT EXISTS (
             SELECT 1 FROM document_comparisons comparison
             WHERE comparison.version_one_file_id=document_files.id
                OR comparison.version_two_file_id=document_files.id
           )`,
      ).bind(row.fileId, row.workspaceId, row.userId),
    ]);
    return { status: "purged" };
  } catch (error) {
    const code = purgeErrorCode(error);
    try {
      await env.DB.prepare(
        `UPDATE document_analyses
         SET purge_attempt_count=purge_attempt_count+1,last_purge_error=?,updated_at=?
         WHERE id=? AND deletion_requested_at IS NOT NULL`,
      ).bind(code, now, row.analysisId).run();
    } catch {
      // The durable deletion tombstone remains authoritative even if recording
      // this attempt fails. The next scheduled pass will retry the same row.
    }
    return { status: "retrying" };
  }
}

async function hasActiveAnalysisObjectWriter(db: D1Database, analysisId: string): Promise<boolean> {
  const row = await db.prepare(
    `SELECT EXISTS(
       SELECT 1 FROM analysis_exports
       WHERE analysis_id=? AND status IN ('queued','processing','retrying')
       UNION ALL
       SELECT 1 FROM analysis_report_exports
       WHERE analysis_id=? AND status IN ('queued','processing','retrying')
       UNION ALL
       SELECT 1 FROM user_document_index_jobs
       WHERE analysis_id=? AND status='processing'
       UNION ALL
       SELECT 1 FROM analysis_version_object_writes
       WHERE analysis_id=? AND status IN ('pending','attaching')
     ) AS active`,
  ).bind(analysisId, analysisId, analysisId, analysisId).first<{ active: number }>();
  return Boolean(row?.active);
}

async function analysisObjectKeys(db: D1Database, analysisId: string, fileId: string): Promise<string[]> {
  const analysis = await db.prepare(
    "SELECT workspace_id AS workspaceId FROM document_analyses WHERE id=? LIMIT 1",
  ).bind(analysisId).first<{ workspaceId: string }>();
  const rows = await db.prepare(
    `SELECT r2_key AS objectKey FROM document_files WHERE id=?
     UNION SELECT r2_key AS objectKey FROM file_extractions WHERE analysis_id=? AND r2_key IS NOT NULL
     UNION SELECT r2_key AS objectKey FROM analysis_document_versions WHERE analysis_id=?
     UNION SELECT r2_key AS objectKey FROM analysis_version_object_writes WHERE analysis_id=?
     UNION SELECT r2_key AS objectKey FROM analysis_exports WHERE analysis_id=? AND r2_key IS NOT NULL
     UNION SELECT r2_key AS objectKey FROM analysis_report_exports WHERE analysis_id=? AND r2_key IS NOT NULL`,
  ).bind(fileId, analysisId, analysisId, analysisId, analysisId, analysisId).all<ObjectKeyRow>();
  const keys = new Set(rows.results
    .map((row) => row.objectKey)
    .filter((key): key is string => Boolean(key && key.length <= 1_024)));
  if (analysis?.workspaceId) {
    keys.add(`quarantine-v2/${analysis.workspaceId}/${analysisId}/${fileId}`);
  }
  return [...keys].sort();
}

async function deleteAndVerify(bucket: R2Bucket, keys: string[]): Promise<void> {
  for (let start = 0; start < keys.length; start += R2_DELETE_BATCH_LIMIT) {
    const batch = keys.slice(start, start + R2_DELETE_BATCH_LIMIT);
    await bucket.delete(batch);
    for (const key of batch) {
      if (await bucket.head(key)) throw new Error("R2_DELETE_NOT_VISIBLE");
    }
  }
}

async function retentionSchemaAvailable(db: D1Database): Promise<boolean> {
  const row = await db.prepare(
    `SELECT count(*) AS count FROM pragma_table_info('document_analyses')
     WHERE name IN ('resource_scope','abandoned_after','deletion_requested_at','deletion_reason','purge_attempt_count','last_purge_error')`,
  ).first<{ count: number }>();
  return Number(row?.count ?? 0) === 6;
}

function purgeErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("USER_DOCUMENT_VECTOR")) return "VECTOR_DELETE_FAILED";
  if (message.includes("R2") || message.includes("object")) return "R2_DELETE_FAILED";
  return "PURGE_FINALIZATION_FAILED";
}

function isAnalysisInUseError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("DOCUMENT_ANALYSIS_IN_USE");
}
