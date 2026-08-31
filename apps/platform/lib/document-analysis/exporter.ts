import { documentAnalysisResultSchema } from "./schema";

export type AnalysisExportRecord = {
  id: string;
  analysisId: string;
  format: "json";
  status: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
  sha256: string | null;
  errorCode: string | null;
  completedAt: string | null;
  createdAt: string;
};

export class AnalysisExportError extends Error {
  constructor(
    readonly code:
      | "ANALYSIS_EXPORT_NOT_FOUND"
      | "ANALYSIS_EXPORT_NOT_READY"
      | "ANALYSIS_EXPORT_INVALID_SOURCE"
      | "ANALYSIS_EXPORT_IDEMPOTENCY_CONFLICT"
      | "ANALYSIS_EXPORT_OBJECT_FAILED"
      | "ANALYSIS_EXPORT_NOT_TERMINAL"
      | "ANALYSIS_EXPORT_DELETE_FAILED"
      | "ANALYSIS_EXPORT_CAPACITY_UNAVAILABLE"
      | "ANALYSIS_EXPORT_FORMAT_INVALID",
    readonly retryable: boolean,
    readonly status = 422,
  ) {
    super(code);
    this.name = "AnalysisExportError";
  }
}

export async function requestAnalysisExport(input: {
  db: D1Database;
  analysisId: string;
  workspaceId: string;
  userId: string;
  idempotencyKey: string;
}): Promise<{ record: AnalysisExportRecord; replay: boolean }> {
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(input.idempotencyKey)) {
    throw new AnalysisExportError("ANALYSIS_EXPORT_IDEMPOTENCY_CONFLICT", false, 400);
  }
  const existing = await exportByIdempotency(input.db, input.idempotencyKey, input.workspaceId, input.userId);
  if (existing) {
    if (existing.analysisId !== input.analysisId) {
      throw new AnalysisExportError("ANALYSIS_EXPORT_IDEMPOTENCY_CONFLICT", false, 409);
    }
    return { record: existing, replay: true };
  }
  const idempotencyKeySha256 = await assertExportIdempotencyAvailable(
    input.db,
    input.idempotencyKey,
    input.workspaceId,
    input.userId,
    "json",
  );
  const source = await input.db.prepare(
    `SELECT id FROM document_analyses
     WHERE id=? AND workspace_id=? AND owner_user_id=? AND status='completed' LIMIT 1`,
  ).bind(input.analysisId, input.workspaceId, input.userId).first<{ id: string }>();
  if (!source) throw new AnalysisExportError("ANALYSIS_EXPORT_NOT_READY", false, 409);

  const id = crypto.randomUUID();
  const outboxId = crypto.randomUUID();
  const now = new Date().toISOString();
  const fileName = `juro-analysis-${input.analysisId}.json`;
  try {
    await input.db.batch([
      input.db.prepare(
        `INSERT INTO analysis_export_idempotency_registry
         (idempotency_key,analysis_id,export_kind,created_at) VALUES (?,?,'json',?)`,
      ).bind(input.idempotencyKey, input.analysisId, now),
      input.db.prepare(
        `INSERT INTO analysis_exports
         (id,analysis_id,workspace_id,owner_user_id,format,status,r2_key,file_name,mime_type,
          size_bytes,sha256,idempotency_key,error_code,completed_at,created_at,updated_at)
         VALUES (?,?,?,?,'json','queued',NULL,?,'application/json',NULL,NULL,?,NULL,NULL,?,?)`,
      ).bind(id, input.analysisId, input.workspaceId, input.userId, fileName, input.idempotencyKey, now, now),
      input.db.prepare(
        `INSERT INTO job_outbox
         (id,queue_binding,job_type,schema_version,idempotency_key,subject_id,workspace_id,
          correlation_id,enqueued_at,available_at,status,dispatch_attempts,lease_owner,
          lease_expires_at,next_attempt_at,dispatched_at,error_code,created_at,updated_at)
         VALUES (?,'DOCUMENT_EXPORT_QUEUE','document.export',1,?,?,?,? ,?,?,'pending',0,NULL,NULL,NULL,NULL,NULL,?,?)`,
      ).bind(outboxId, `analysis-export:${id}`, id, input.workspaceId, `analysis-export-${id}`, now, now, now, now),
      input.db.prepare(
        `INSERT INTO workspace_audit_events
         (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
         VALUES (?,?,?,'analysis_export',?,'export_requested',?,?)`,
      ).bind(
        crypto.randomUUID(), input.workspaceId, input.userId, id,
        JSON.stringify({ analysisId: input.analysisId, format: "json", idempotencyKeySha256 }),
        now,
      ),
    ]);
  } catch (error) {
    const raced = await exportByIdempotency(input.db, input.idempotencyKey, input.workspaceId, input.userId);
    if (raced?.analysisId === input.analysisId) return { record: raced, replay: true };
    if (isAnalysisExportCapacityError(error)) {
      throw new AnalysisExportError("ANALYSIS_EXPORT_CAPACITY_UNAVAILABLE", false, 429);
    }
    if (isAnalysisExportIdempotencyConflictError(error)) {
      throw new AnalysisExportError("ANALYSIS_EXPORT_IDEMPOTENCY_CONFLICT", false, 409);
    }
    if (isUniqueConstraintError(error)) {
      throw new AnalysisExportError("ANALYSIS_EXPORT_IDEMPOTENCY_CONFLICT", false, 409);
    }
    throw error;
  }
  return {
    replay: false,
    record: { id, analysisId: input.analysisId, format: "json", status: "queued", fileName, mimeType: "application/json", sizeBytes: null, sha256: null, errorCode: null, completedAt: null, createdAt: now },
  };
}

export async function executeAnalysisExportJob(
  env: { DB: D1Database; BUCKET: R2Bucket },
  exportId: string,
  workspaceId: string,
): Promise<{ status: "completed" | "already_completed"; exportId: string }> {
  const row = await loadExportSource(env.DB, exportId, workspaceId);
  if (!row) throw new AnalysisExportError("ANALYSIS_EXPORT_NOT_FOUND", false, 404);
  if (row.status === "completed") {
    await verifyCompletedObject(env.BUCKET, row);
    return { status: "already_completed", exportId };
  }
  if (!['queued', 'processing', 'retrying'].includes(row.status) || row.analysisStatus !== "completed") {
    throw new AnalysisExportError("ANALYSIS_EXPORT_NOT_READY", false, 409);
  }
  const claimed = await env.DB.prepare(
    `UPDATE analysis_exports SET status='processing',error_code=NULL,updated_at=?
     WHERE id=? AND workspace_id=? AND status IN ('queued','retrying')`,
  ).bind(new Date().toISOString(), exportId, workspaceId).run();
  if (Number(claimed.meta.changes ?? 0) === 0 && row.status !== "processing") {
    throw new AnalysisExportError("ANALYSIS_EXPORT_NOT_READY", true, 409);
  }

  const bytes = buildExportBytes(row, await loadRisks(env.DB, row.analysisId));
  const sha256 = await sha256Hex(bytes);
  const r2Key = `exports/${row.workspaceId}/${row.analysisId}/${row.id}.json`;
  const existing = await env.BUCKET.head(r2Key);
  if (existing) {
    if (existing.size !== bytes.byteLength || arrayBufferHex(existing.checksums.sha256) !== sha256) {
      throw new AnalysisExportError("ANALYSIS_EXPORT_OBJECT_FAILED", false);
    }
  } else {
    const stored = await env.BUCKET.put(r2Key, bytes, {
      onlyIf: new Headers({ "if-none-match": "*" }),
      sha256,
      httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "private, no-store" },
      customMetadata: { workspaceId: row.workspaceId, ownerUserId: row.ownerUserId, analysisId: row.analysisId, exportId: row.id },
    });
    if (!stored || stored.size !== bytes.byteLength || arrayBufferHex(stored.checksums.sha256) !== sha256) {
      throw new AnalysisExportError("ANALYSIS_EXPORT_OBJECT_FAILED", true);
    }
  }

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE analysis_exports SET status='completed',r2_key=?,size_bytes=?,sha256=?,error_code=NULL,
       completed_at=?,updated_at=? WHERE id=? AND workspace_id=? AND status='processing'`,
    ).bind(r2Key, bytes.byteLength, sha256, now, now, row.id, row.workspaceId),
    env.DB.prepare(
      `INSERT INTO workspace_audit_events
       (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
       VALUES (?,?,?,'analysis_export',?,'export_completed',?,?)`,
    ).bind(crypto.randomUUID(), row.workspaceId, row.ownerUserId, row.id, JSON.stringify({ analysisId: row.analysisId, format: "json", sizeBytes: bytes.byteLength, sha256 }), now),
  ]);
  return { status: "completed", exportId };
}

export async function recordAnalysisExportFailure(db: D1Database, exportId: string, workspaceId: string, error: AnalysisExportError) {
  const status = error.retryable ? "retrying" : "failed";
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(
      `UPDATE analysis_exports SET status=?,error_code=?,r2_key=NULL,size_bytes=NULL,sha256=NULL,
       completed_at=NULL,updated_at=? WHERE id=? AND workspace_id=?
       AND status IN ('queued','processing','retrying')`,
    ).bind(status, error.code, now, exportId, workspaceId),
    db.prepare(
      `INSERT INTO workspace_audit_events
       (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
       SELECT ?,workspace_id,owner_user_id,'analysis_export',id,'export_failed',?,?
       FROM analysis_exports
       WHERE id=? AND workspace_id=? AND status=? AND error_code=? AND updated_at=?`,
    ).bind(
      crypto.randomUUID(), JSON.stringify({ errorCode: error.code, retryable: error.retryable }), now,
      exportId, workspaceId, status, error.code, now,
    ),
  ]);
}

export async function exportForDownload(db: D1Database, input: { exportId: string; workspaceId: string; userId: string }) {
  const record = await db.prepare(
    `SELECT id,analysis_id AS analysisId,workspace_id AS workspaceId,owner_user_id AS ownerUserId,
      status,r2_key AS r2Key,file_name AS fileName,mime_type AS mimeType,size_bytes AS sizeBytes,sha256
     FROM analysis_exports WHERE id=? AND workspace_id=? AND owner_user_id=? LIMIT 1`,
  ).bind(input.exportId, input.workspaceId, input.userId).first<DownloadRow>();
  if (!record) throw new AnalysisExportError("ANALYSIS_EXPORT_NOT_FOUND", false, 404);
  if (record.status !== "completed" || !record.r2Key || !record.sha256 || record.sizeBytes === null) {
    throw new AnalysisExportError("ANALYSIS_EXPORT_NOT_READY", false, 409);
  }
  return record;
}
export async function recordAnalysisExportDownload(db: D1Database, record: DownloadRow, userId: string) {
  await db.prepare(
    `INSERT INTO workspace_audit_events
     (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
     VALUES (?,?,?,'analysis_export',?,'export_downloaded',?,?)`,
  ).bind(
    crypto.randomUUID(), record.workspaceId, userId, record.id,
    JSON.stringify({ analysisId: record.analysisId, format: "json", sizeBytes: record.sizeBytes, sha256: record.sha256 }),
    new Date().toISOString(),
  ).run();
}

export async function deleteAnalysisExport(
  env: { DB: D1Database; BUCKET: R2Bucket },
  input: { exportId: string; workspaceId: string; userId: string },
): Promise<{ status: "deleted" | "already_deleted"; exportId: string }> {
  const auditId = `analysis-export-deleted:${input.exportId}`;
  const row = await env.DB.prepare(
    `SELECT id,analysis_id AS analysisId,workspace_id AS workspaceId,
       owner_user_id AS ownerUserId,status,r2_key AS r2Key
     FROM analysis_exports
     WHERE id=? AND workspace_id=? AND owner_user_id=? LIMIT 1`,
  ).bind(input.exportId, input.workspaceId, input.userId).first<DeleteRow>();
  if (!row) {
    if (await deletionAuditExists(env.DB, auditId, input)) {
      return { status: "already_deleted", exportId: input.exportId };
    }
    throw new AnalysisExportError("ANALYSIS_EXPORT_NOT_FOUND", false, 404);
  }
  if (!['completed', 'failed'].includes(row.status)) {
    throw new AnalysisExportError("ANALYSIS_EXPORT_NOT_TERMINAL", false, 409);
  }
  if (row.r2Key) {
    try {
      await env.BUCKET.delete(row.r2Key);
      if (await env.BUCKET.head(row.r2Key)) {
        throw new Error("R2_DELETE_NOT_VISIBLE");
      }
    } catch {
      throw new AnalysisExportError("ANALYSIS_EXPORT_DELETE_FAILED", true, 503);
    }
  }

  const now = new Date().toISOString();
  try {
    const results = await env.DB.batch([
      env.DB.prepare(
        `DELETE FROM analysis_exports
         WHERE id=? AND workspace_id=? AND owner_user_id=? AND status=?
           AND ((? IS NULL AND r2_key IS NULL) OR r2_key=?)`,
      ).bind(
        row.id,
        row.workspaceId,
        row.ownerUserId,
        row.status,
        row.r2Key,
        row.r2Key,
      ),
      env.DB.prepare(
        `INSERT INTO workspace_audit_events
         (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
         VALUES (?,?,?,'analysis_export',?,'export_deleted',?,?)`,
      ).bind(
        auditId,
        row.workspaceId,
        row.ownerUserId,
        row.id,
        JSON.stringify({ analysisId: row.analysisId, format: "json", priorStatus: row.status }),
        now,
      ),
    ]);
    if (Number(results[0]?.meta?.changes ?? 0) !== 1) {
      throw new Error("EXPORT_DELETE_STATE_CONFLICT");
    }
  } catch {
    if (await deletionAuditExists(env.DB, auditId, input)) {
      return { status: "already_deleted", exportId: input.exportId };
    }
    throw new AnalysisExportError("ANALYSIS_EXPORT_DELETE_FAILED", true, 503);
  }
  return { status: "deleted", exportId: row.id };
}


export async function verifyExportObject(bucket: R2Bucket, record: DownloadRow): Promise<R2ObjectBody> {
  const object = await bucket.get(record.r2Key!);
  if (!object || object.size !== record.sizeBytes || arrayBufferHex(object.checksums.sha256) !== record.sha256) {
    throw new AnalysisExportError("ANALYSIS_EXPORT_OBJECT_FAILED", false, 422);
  }
  return object;
}

type ExportSourceRow = DownloadRow & { analysisStatus: string; summaryJson: string; createdAt: string; sourceFileName: string };
type DownloadRow = { id: string; analysisId: string; workspaceId: string; ownerUserId: string; status: string; r2Key: string | null; fileName: string; mimeType: string; sizeBytes: number | null; sha256: string | null };
type DeleteRow = Pick<DownloadRow, "id" | "analysisId" | "workspaceId" | "ownerUserId" | "status" | "r2Key">;


async function loadExportSource(db: D1Database, exportId: string, workspaceId: string): Promise<ExportSourceRow | null> {
  return db.prepare(
    `SELECT e.id,e.analysis_id AS analysisId,e.workspace_id AS workspaceId,e.owner_user_id AS ownerUserId,
      e.status,e.r2_key AS r2Key,e.file_name AS fileName,e.mime_type AS mimeType,e.size_bytes AS sizeBytes,e.sha256,
      e.created_at AS createdAt,a.status AS analysisStatus,a.summary_json AS summaryJson,f.file_name AS sourceFileName
     FROM analysis_exports e JOIN document_analyses a ON a.id=e.analysis_id
     JOIN document_files f ON f.id=a.uploaded_file_id
     WHERE e.id=? AND e.workspace_id=? AND a.workspace_id=e.workspace_id AND a.owner_user_id=e.owner_user_id LIMIT 1`,
  ).bind(exportId, workspaceId).first<ExportSourceRow>();
}

async function loadRisks(db: D1Database, analysisId: string) {
  const rows = await db.prepare(
    `SELECT level,title,description,excerpt,confidence_percent AS confidencePercent
     FROM document_risks WHERE analysis_id=? ORDER BY created_at,id`,
  ).bind(analysisId).all<Record<string, unknown>>();
  return rows.results;
}

function buildExportBytes(row: ExportSourceRow, risks: Record<string, unknown>[]): Uint8Array {
  let summary: unknown;
  try { summary = JSON.parse(row.summaryJson); } catch { throw new AnalysisExportError("ANALYSIS_EXPORT_INVALID_SOURCE", false); }
  const candidate = summary && typeof summary === "object" ? (summary as Record<string, unknown>).result : null;
  const result = documentAnalysisResultSchema.safeParse(candidate);
  if (!result.success) throw new AnalysisExportError("ANALYSIS_EXPORT_INVALID_SOURCE", false);
  return new TextEncoder().encode(`${JSON.stringify({
    schemaVersion: 1,
    exportId: row.id,
    analysisId: row.analysisId,
    generatedAt: row.createdAt,
    sourceFileName: row.sourceFileName,
    result: result.data,
    risks,
  }, null, 2)}\n`);
}

async function verifyCompletedObject(bucket: R2Bucket, row: ExportSourceRow) {
  if (!row.r2Key || !row.sha256 || row.sizeBytes === null) throw new AnalysisExportError("ANALYSIS_EXPORT_OBJECT_FAILED", false);
  const object = await bucket.head(row.r2Key);
  if (!object || object.size !== row.sizeBytes || arrayBufferHex(object.checksums.sha256) !== row.sha256) {
    throw new AnalysisExportError("ANALYSIS_EXPORT_OBJECT_FAILED", false);
  }
}

async function exportByIdempotency(
  db: D1Database,
  key: string,
  workspaceId: string,
  userId: string,
): Promise<AnalysisExportRecord | null> {
  return db.prepare(
    `SELECT id,analysis_id AS analysisId,format,status,file_name AS fileName,mime_type AS mimeType,
      size_bytes AS sizeBytes,sha256,error_code AS errorCode,completed_at AS completedAt,created_at AS createdAt
     FROM analysis_exports WHERE idempotency_key=? AND workspace_id=? AND owner_user_id=? LIMIT 1`,
  ).bind(key, workspaceId, userId).first<AnalysisExportRecord>();
}

async function deletionAuditExists(
  db: D1Database,
  auditId: string,
  input: { exportId: string; workspaceId: string; userId: string },
): Promise<boolean> {
  const row = await db.prepare(
    `SELECT 1 AS found FROM workspace_audit_events
     WHERE id=? AND workspace_id=? AND actor_user_id=?
       AND entity_type='analysis_export' AND entity_id=?
       AND action='export_deleted' LIMIT 1`,
  ).bind(auditId, input.workspaceId, input.userId, input.exportId).first<{ found: number }>();
  return Boolean(row?.found);
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && /unique constraint/i.test(error.message);
}

export function isAnalysisExportCapacityError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("ANALYSIS_EXPORT_CAPACITY_EXCEEDED");
}

export function isAnalysisExportIdempotencyConflictError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("ANALYSIS_EXPORT_IDEMPOTENCY_CONFLICT");
}

export async function assertExportIdempotencyAvailable(
  db: D1Database,
  key: string,
  workspaceId: string,
  userId: string,
  kind: "json" | "report",
): Promise<string> {
  const allocated = await db.prepare(
    `SELECT 1 AS found
     FROM analysis_export_idempotency_registry registry
     INNER JOIN document_analyses analysis ON analysis.id=registry.analysis_id
     WHERE registry.idempotency_key=?
       AND analysis.workspace_id=? AND analysis.owner_user_id=?
     LIMIT 1`,
  ).bind(key, workspaceId, userId).first<{ found: number }>();
  if (allocated?.found) {
    throw new AnalysisExportError("ANALYSIS_EXPORT_IDEMPOTENCY_CONFLICT", false, 409);
  }
  const otherTable = kind === "json" ? "analysis_report_exports" : "analysis_exports";
  const liveOther = await db.prepare(
    `SELECT 1 AS found FROM ${otherTable}
     WHERE idempotency_key=? AND workspace_id=? AND owner_user_id=? LIMIT 1`,
  ).bind(key, workspaceId, userId).first<{ found: number }>();
  if (liveOther?.found) {
    throw new AnalysisExportError("ANALYSIS_EXPORT_IDEMPOTENCY_CONFLICT", false, 409);
  }
  const digest = await sha256Hex(new TextEncoder().encode(key));
  const retired = await db.prepare(
    `SELECT 1 AS found FROM workspace_audit_events event
     WHERE event.workspace_id=? AND event.actor_user_id=?
       AND event.entity_type='analysis_export' AND event.action='export_requested'
       AND CASE WHEN json_valid(event.metadata_json)
         THEN json_extract(event.metadata_json,'$.idempotencyKeySha256') END=?
     LIMIT 1`,
  ).bind(workspaceId, userId, digest).first<{ found: number }>();
  if (retired?.found) {
    throw new AnalysisExportError("ANALYSIS_EXPORT_IDEMPOTENCY_CONFLICT", false, 409);
  }
  return digest;
}

async function sha256Hex(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(value).buffer);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function arrayBufferHex(value: ArrayBuffer | undefined): string | null {
  return value ? Array.from(new Uint8Array(value), byte => byte.toString(16).padStart(2, "0")).join("") : null;
}
