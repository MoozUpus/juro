import { generateDocx } from "../document-builder/generation/docx";
import { generatePdf } from "../document-builder/generation/pdf";
import { AnalysisExportError } from "./exporter";
import { analysisReportParagraphs } from "./report";
import { documentAnalysisResultSchema } from "./schema";

export type AnalysisReportFormat = "pdf" | "docx";

export type AnalysisReportExportRecord = {
  id: string;
  analysisId: string;
  format: AnalysisReportFormat;
  status: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
  sha256: string | null;
  errorCode: string | null;
  completedAt: string | null;
  createdAt: string;
};

type ReportDownloadRow = {
  id: string;
  analysisId: string;
  workspaceId: string;
  ownerUserId: string;
  format: AnalysisReportFormat;
  status: string;
  r2Key: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
  sha256: string | null;
};

type SourceRow = ReportDownloadRow & {
  analysisStatus: string;
  summaryJson: string;
  createdAt: string;
  sourceFileName: string;
};

type DeleteRow = Pick<
  ReportDownloadRow,
  "id" | "analysisId" | "workspaceId" | "ownerUserId" | "format" | "status" | "r2Key"
>;

const formatInfo = {
  pdf: { extension: "pdf", mimeType: "application/pdf" },
  docx: {
    extension: "docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
} as const;

export async function requestAnalysisReportExport(input: {
  db: D1Database;
  analysisId: string;
  workspaceId: string;
  userId: string;
  format: AnalysisReportFormat;
  idempotencyKey: string;
}): Promise<{ record: AnalysisReportExportRecord; replay: boolean }> {
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(input.idempotencyKey)) {
    throw new AnalysisExportError("ANALYSIS_EXPORT_IDEMPOTENCY_CONFLICT", false, 400);
  }
  const existing = await byIdempotency(
    input.db,
    input.idempotencyKey,
    input.workspaceId,
    input.userId,
  );
  if (existing) {
    if (existing.analysisId !== input.analysisId || existing.format !== input.format) {
      throw new AnalysisExportError("ANALYSIS_EXPORT_IDEMPOTENCY_CONFLICT", false, 409);
    }
    return { record: existing, replay: true };
  }
  const source = await input.db.prepare(
    `SELECT id FROM document_analyses
     WHERE id=? AND workspace_id=? AND owner_user_id=? AND status='completed' LIMIT 1`,
  ).bind(input.analysisId, input.workspaceId, input.userId).first<{ id: string }>();
  if (!source) throw new AnalysisExportError("ANALYSIS_EXPORT_NOT_READY", false, 409);

  const id = crypto.randomUUID();
  const outboxId = crypto.randomUUID();
  const now = new Date().toISOString();
  const info = formatInfo[input.format];
  const fileName = `juro-analysis-${input.analysisId}.${info.extension}`;
  try {
    await input.db.batch([
      input.db.prepare(
        `INSERT INTO analysis_report_exports
         (id,analysis_id,workspace_id,owner_user_id,format,status,r2_key,file_name,mime_type,
          size_bytes,sha256,idempotency_key,error_code,completed_at,created_at,updated_at)
         VALUES (?,?,?,?,?,'queued',NULL,?,?,NULL,NULL,?,NULL,NULL,?,?)`,
      ).bind(
        id,
        input.analysisId,
        input.workspaceId,
        input.userId,
        input.format,
        fileName,
        info.mimeType,
        input.idempotencyKey,
        now,
        now,
      ),
      input.db.prepare(
        `INSERT INTO job_outbox
         (id,queue_binding,job_type,schema_version,idempotency_key,subject_id,workspace_id,
          correlation_id,enqueued_at,available_at,status,dispatch_attempts,lease_owner,
          lease_expires_at,next_attempt_at,dispatched_at,error_code,created_at,updated_at)
         VALUES (?,'DOCUMENT_EXPORT_QUEUE','document.export',1,?,?,?,? ,?,?,'pending',0,NULL,NULL,NULL,NULL,NULL,?,?)`,
      ).bind(
        outboxId,
        `analysis-report-export:${id}`,
        id,
        input.workspaceId,
        `analysis-report-export-${id}`,
        now,
        now,
        now,
        now,
      ),
      input.db.prepare(
        `INSERT INTO workspace_audit_events
         (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
         VALUES (?,?,?,'analysis_export',?,'export_requested',?,?)`,
      ).bind(
        crypto.randomUUID(),
        input.workspaceId,
        input.userId,
        id,
        JSON.stringify({ analysisId: input.analysisId, format: input.format }),
        now,
      ),
    ]);
  } catch (error) {
    const raced = await byIdempotency(
      input.db,
      input.idempotencyKey,
      input.workspaceId,
      input.userId,
    );
    if (raced?.analysisId === input.analysisId && raced.format === input.format) {
      return { record: raced, replay: true };
    }
    if (error instanceof Error && /unique constraint/i.test(error.message)) {
      throw new AnalysisExportError("ANALYSIS_EXPORT_IDEMPOTENCY_CONFLICT", false, 409);
    }
    throw error;
  }
  return {
    replay: false,
    record: {
      id,
      analysisId: input.analysisId,
      format: input.format,
      status: "queued",
      fileName,
      mimeType: info.mimeType,
      sizeBytes: null,
      sha256: null,
      errorCode: null,
      completedAt: null,
      createdAt: now,
    },
  };
}

export async function executeAnalysisReportExportJob(
  env: { DB: D1Database; BUCKET: R2Bucket; ASSETS: Fetcher },
  exportId: string,
  workspaceId: string,
): Promise<{ status: "completed" | "already_completed"; exportId: string }> {
  const row = await sourceRow(env.DB, exportId, workspaceId);
  if (!row) throw new AnalysisExportError("ANALYSIS_EXPORT_NOT_FOUND", false, 404);
  if (row.status === "completed") {
    await verifyCompleted(env.BUCKET, row);
    return { status: "already_completed", exportId };
  }
  if (!["queued", "processing", "retrying"].includes(row.status) || row.analysisStatus !== "completed") {
    throw new AnalysisExportError("ANALYSIS_EXPORT_NOT_READY", false, 409);
  }
  const claimed = await env.DB.prepare(
    `UPDATE analysis_report_exports SET status='processing',error_code=NULL,updated_at=?
     WHERE id=? AND workspace_id=? AND status IN ('queued','retrying')`,
  ).bind(new Date().toISOString(), exportId, workspaceId).run();
  if (Number(claimed.meta.changes ?? 0) === 0 && row.status !== "processing") {
    throw new AnalysisExportError("ANALYSIS_EXPORT_NOT_READY", true, 409);
  }

  const result = normalizedResult(row.summaryJson);
  const paragraphs = analysisReportParagraphs({
    result,
    sourceFileName: row.sourceFileName,
    generatedAt: row.createdAt,
  });
  const bytes = row.format === "pdf"
    ? await generatePdf(
      paragraphs,
      await asset(env.ASSETS, "/document-templates/DejaVuSans-JURO.ttf"),
      await asset(env.ASSETS, "/document-templates/DejaVuSans-Bold-JURO.ttf"),
      await asset(env.ASSETS, "/document-templates/juro-mark-footer.png"),
      {
        title: result.outputLanguage === "ru"
          ? "JURO — отчёт об анализе документа"
          : "JURO — hujjat tahlili hisoboti",
        producer: "JURO Document Analysis",
        footerLabel: result.outputLanguage === "ru" ? "Сформировано в JURO" : "JURO’da yaratildi",
        pageLabel: result.outputLanguage === "ru" ? "Страница" : "Sahifa",
      },
    )
    : generateDocx(
      await asset(
        env.ASSETS,
        result.outputLanguage === "ru"
          ? "/document-templates/receipt-ru.docx"
          : "/document-templates/receipt-uz-cyrl.docx",
      ),
      paragraphs,
    );
  const sha256 = await sha256Hex(bytes);
  const r2Key = `exports/${row.workspaceId}/${row.analysisId}/${row.id}.${row.format}`;
  const existing = await env.BUCKET.head(r2Key);
  if (existing) {
    if (existing.size !== bytes.byteLength || hex(existing.checksums.sha256) !== sha256) {
      throw new AnalysisExportError("ANALYSIS_EXPORT_OBJECT_FAILED", false);
    }
  } else {
    const stored = await env.BUCKET.put(r2Key, bytes, {
      onlyIf: new Headers({ "if-none-match": "*" }),
      sha256,
      httpMetadata: { contentType: row.mimeType, cacheControl: "private, no-store" },
      customMetadata: {
        workspaceId: row.workspaceId,
        ownerUserId: row.ownerUserId,
        analysisId: row.analysisId,
        exportId: row.id,
        format: row.format,
      },
    });
    if (!stored || stored.size !== bytes.byteLength || hex(stored.checksums.sha256) !== sha256) {
      throw new AnalysisExportError("ANALYSIS_EXPORT_OBJECT_FAILED", true);
    }
  }

  const now = new Date().toISOString();
  const completed = await env.DB.batch([
    env.DB.prepare(
      `UPDATE analysis_report_exports SET status='completed',r2_key=?,size_bytes=?,sha256=?,error_code=NULL,
       completed_at=?,updated_at=? WHERE id=? AND workspace_id=? AND status='processing'`,
    ).bind(r2Key, bytes.byteLength, sha256, now, now, row.id, row.workspaceId),
    env.DB.prepare(
      `INSERT INTO workspace_audit_events
       (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
       VALUES (?,?,?,'analysis_export',?,'export_completed',?,?)`,
    ).bind(
      crypto.randomUUID(),
      row.workspaceId,
      row.ownerUserId,
      row.id,
      JSON.stringify({ analysisId: row.analysisId, format: row.format, sizeBytes: bytes.byteLength, sha256 }),
      now,
    ),
  ]);
  if (Number(completed[0]?.meta?.changes ?? 0) !== 1) {
    throw new AnalysisExportError("ANALYSIS_EXPORT_OBJECT_FAILED", true);
  }
  return { status: "completed", exportId };
}

export async function recordAnalysisReportExportFailure(
  db: D1Database,
  exportId: string,
  workspaceId: string,
  error: AnalysisExportError,
) {
  const status = error.retryable ? "retrying" : "failed";
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(
      `UPDATE analysis_report_exports SET status=?,error_code=?,r2_key=NULL,size_bytes=NULL,sha256=NULL,
       completed_at=NULL,updated_at=? WHERE id=? AND workspace_id=?
       AND status IN ('queued','processing','retrying')`,
    ).bind(status, error.code, now, exportId, workspaceId),
    db.prepare(
      `INSERT INTO workspace_audit_events
       (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
       SELECT ?,workspace_id,owner_user_id,'analysis_export',id,'export_failed',?,?
       FROM analysis_report_exports
       WHERE id=? AND workspace_id=? AND status=? AND error_code=? AND updated_at=?`,
    ).bind(
      crypto.randomUUID(),
      JSON.stringify({ errorCode: error.code, retryable: error.retryable }),
      now,
      exportId,
      workspaceId,
      status,
      error.code,
      now,
    ),
  ]);
}

export async function reportExportForDownload(
  db: D1Database,
  input: { exportId: string; workspaceId: string; userId: string },
): Promise<ReportDownloadRow> {
  const row = await db.prepare(
    `SELECT id,analysis_id AS analysisId,workspace_id AS workspaceId,owner_user_id AS ownerUserId,
      format,status,r2_key AS r2Key,file_name AS fileName,mime_type AS mimeType,size_bytes AS sizeBytes,sha256
     FROM analysis_report_exports WHERE id=? AND workspace_id=? AND owner_user_id=? LIMIT 1`,
  ).bind(input.exportId, input.workspaceId, input.userId).first<ReportDownloadRow>();
  if (!row) throw new AnalysisExportError("ANALYSIS_EXPORT_NOT_FOUND", false, 404);
  if (row.status !== "completed" || !row.r2Key || !row.sha256 || row.sizeBytes === null) {
    throw new AnalysisExportError("ANALYSIS_EXPORT_NOT_READY", false, 409);
  }
  return row;
}

export async function verifyReportObject(
  bucket: R2Bucket,
  row: ReportDownloadRow,
): Promise<R2ObjectBody> {
  const object = await bucket.get(row.r2Key!);
  if (!object || object.size !== row.sizeBytes || hex(object.checksums.sha256) !== row.sha256) {
    throw new AnalysisExportError("ANALYSIS_EXPORT_OBJECT_FAILED", false, 422);
  }
  return object;
}

export async function recordAnalysisReportDownload(
  db: D1Database,
  row: ReportDownloadRow,
  userId: string,
) {
  await db.prepare(
    `INSERT INTO workspace_audit_events
     (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
     VALUES (?,?,?,'analysis_export',?,'export_downloaded',?,?)`,
  ).bind(
    crypto.randomUUID(),
    row.workspaceId,
    userId,
    row.id,
    JSON.stringify({
      analysisId: row.analysisId,
      format: row.format,
      sizeBytes: row.sizeBytes,
      sha256: row.sha256,
    }),
    new Date().toISOString(),
  ).run();
}

export async function deleteAnalysisReportExport(
  env: { DB: D1Database; BUCKET: R2Bucket },
  input: { exportId: string; workspaceId: string; userId: string },
): Promise<{ status: "deleted" | "already_deleted"; exportId: string }> {
  const auditId = `analysis-export-deleted:${input.exportId}`;
  const row = await env.DB.prepare(
    `SELECT id,analysis_id AS analysisId,workspace_id AS workspaceId,
       owner_user_id AS ownerUserId,format,status,r2_key AS r2Key
     FROM analysis_report_exports
     WHERE id=? AND workspace_id=? AND owner_user_id=? LIMIT 1`,
  ).bind(input.exportId, input.workspaceId, input.userId).first<DeleteRow>();
  if (!row) {
    if (await deletionAuditExists(env.DB, auditId, input)) {
      return { status: "already_deleted", exportId: input.exportId };
    }
    throw new AnalysisExportError("ANALYSIS_EXPORT_NOT_FOUND", false, 404);
  }
  if (!["completed", "failed"].includes(row.status)) {
    throw new AnalysisExportError("ANALYSIS_EXPORT_NOT_TERMINAL", false, 409);
  }
  if (row.r2Key) {
    try {
      await env.BUCKET.delete(row.r2Key);
      if (await env.BUCKET.head(row.r2Key)) throw new Error("R2_DELETE_NOT_VISIBLE");
    } catch {
      throw new AnalysisExportError("ANALYSIS_EXPORT_DELETE_FAILED", true, 503);
    }
  }
  const now = new Date().toISOString();
  try {
    const results = await env.DB.batch([
      env.DB.prepare(
        `DELETE FROM analysis_report_exports
         WHERE id=? AND workspace_id=? AND owner_user_id=? AND status=?
           AND ((? IS NULL AND r2_key IS NULL) OR r2_key=?)`,
      ).bind(row.id, row.workspaceId, row.ownerUserId, row.status, row.r2Key, row.r2Key),
      env.DB.prepare(
        `INSERT INTO workspace_audit_events
         (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
         VALUES (?,?,?,'analysis_export',?,'export_deleted',?,?)`,
      ).bind(
        auditId,
        row.workspaceId,
        row.ownerUserId,
        row.id,
        JSON.stringify({ analysisId: row.analysisId, format: row.format, priorStatus: row.status }),
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

async function sourceRow(
  db: D1Database,
  exportId: string,
  workspaceId: string,
): Promise<SourceRow | null> {
  return db.prepare(
    `SELECT e.id,e.analysis_id AS analysisId,e.workspace_id AS workspaceId,e.owner_user_id AS ownerUserId,
      e.format,e.status,e.r2_key AS r2Key,e.file_name AS fileName,e.mime_type AS mimeType,
      e.size_bytes AS sizeBytes,e.sha256,e.created_at AS createdAt,a.status AS analysisStatus,
      a.summary_json AS summaryJson,f.file_name AS sourceFileName
     FROM analysis_report_exports e JOIN document_analyses a ON a.id=e.analysis_id
     JOIN document_files f ON f.id=a.uploaded_file_id
     WHERE e.id=? AND e.workspace_id=? AND a.workspace_id=e.workspace_id
       AND a.owner_user_id=e.owner_user_id LIMIT 1`,
  ).bind(exportId, workspaceId).first<SourceRow>();
}

async function byIdempotency(
  db: D1Database,
  key: string,
  workspaceId: string,
  userId: string,
): Promise<AnalysisReportExportRecord | null> {
  return db.prepare(
    `SELECT id,analysis_id AS analysisId,format,status,file_name AS fileName,mime_type AS mimeType,
      size_bytes AS sizeBytes,sha256,error_code AS errorCode,completed_at AS completedAt,created_at AS createdAt
     FROM analysis_report_exports WHERE idempotency_key=? AND workspace_id=? AND owner_user_id=? LIMIT 1`,
  ).bind(key, workspaceId, userId).first<AnalysisReportExportRecord>();
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

function normalizedResult(summaryJson: string) {
  let summary: unknown;
  try {
    summary = JSON.parse(summaryJson);
  } catch {
    throw new AnalysisExportError("ANALYSIS_EXPORT_INVALID_SOURCE", false);
  }
  const candidate = summary && typeof summary === "object"
    ? (summary as Record<string, unknown>).result
    : null;
  const parsed = documentAnalysisResultSchema.safeParse(candidate);
  if (!parsed.success) throw new AnalysisExportError("ANALYSIS_EXPORT_INVALID_SOURCE", false);
  return parsed.data;
}

async function asset(fetcher: Fetcher, path: string): Promise<ArrayBuffer> {
  const response = await fetcher.fetch(new Request(new URL(path, "https://juro-assets.invalid")));
  if (!response.ok) throw new AnalysisExportError("ANALYSIS_EXPORT_OBJECT_FAILED", true, 503);
  return response.arrayBuffer();
}

async function verifyCompleted(bucket: R2Bucket, row: SourceRow) {
  if (!row.r2Key || !row.sha256 || row.sizeBytes === null) {
    throw new AnalysisExportError("ANALYSIS_EXPORT_OBJECT_FAILED", false);
  }
  const object = await bucket.head(row.r2Key);
  if (!object || object.size !== row.sizeBytes || hex(object.checksums.sha256) !== row.sha256) {
    throw new AnalysisExportError("ANALYSIS_EXPORT_OBJECT_FAILED", false);
  }
}

async function sha256Hex(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(value).buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hex(value: ArrayBuffer | undefined): string | null {
  return value
    ? Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("")
    : null;
}
