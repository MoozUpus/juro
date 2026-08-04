import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../../lib/document-builder/auth/api";
import { requireD1, requireQuarantineR2, runtimeEnv } from "../../../../../../../lib/document-builder/storage/runtime";
import { ArchiveInspectionError, inspectArchiveBytes, type ArchiveInspection } from "../../../../../../../lib/document-analysis/archive-inspector";
import {
  arrayBufferHex,
  documentAnalysisUploadForUser,
  DocumentAnalysisUploadError,
  validateUploadMagicBytes,
} from "../../../../../../../lib/document-analysis/upload-pipeline";
import { workspaceForUser } from "../../../../../../../lib/platform/workspace";

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}

export const POST = withApiErrors(async function POST(
  request: Request,
  context: { params: Promise<{ analysisId: string }> },
) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { analysisId } = await context.params;
  const db = requireD1();
  try {
    const record = await documentAnalysisUploadForUser(db, analysisId, workspace.id, user.id);
    if (record.status === "quarantined") {
      const scanQueued = scannerConfigured();
      if (scanQueued) await ensureScanQueued(db, record, workspace.id, new Date().toISOString());
      return quarantinedResponse(record, true, scanQueued);
    }
    if (record.status !== "uploaded") {
      return response({ code: "UPLOAD_STATE_CONFLICT", error: "Сначала завершите загрузку файла." }, 409);
    }
    const bucket = requireQuarantineR2();
    const object = await bucket.head(record.r2Key);
    if (!object || object.size !== record.sizeBytes || arrayBufferHex(object.checksums.sha256) !== record.sha256) {
      await rejectFile(db, bucket, record, workspace.id, user.id, "UPLOAD_INTEGRITY_FAILED");
      return response({ code: "UPLOAD_INTEGRITY_FAILED", error: "Целостность приватного объекта не подтверждена." }, 422);
    }
    const [prefixObject, suffixObject] = await Promise.all([
      bucket.get(record.r2Key, { range: { offset: 0, length: Math.min(8, record.sizeBytes) } }),
      bucket.get(record.r2Key, { range: { suffix: Math.min(2, record.sizeBytes) } }),
    ]);
    if (!prefixObject || !suffixObject || !("body" in prefixObject) || !("body" in suffixObject)) {
      await rejectFile(db, bucket, record, workspace.id, user.id, "UPLOAD_INTEGRITY_FAILED");
      return response({ code: "UPLOAD_INTEGRITY_FAILED", error: "Файл не удалось прочитать после загрузки." }, 422);
    }
    const prefix = new Uint8Array(await prefixObject.arrayBuffer());
    const suffix = new Uint8Array(await suffixObject.arrayBuffer());
    if (!validateUploadMagicBytes(record.mimeType, prefix, suffix)) {
      await rejectFile(db, bucket, record, workspace.id, user.id, "CONTENT_TYPE_MISMATCH");
      return response({ code: "CONTENT_TYPE_MISMATCH", error: "Содержимое файла не соответствует заявленному формату." }, 422);
    }

    let archiveInspection: ArchiveInspection | null = null;
    if (record.mimeType === "application/zip" || record.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const archiveObject = await bucket.get(record.r2Key);
      if (!archiveObject || !("body" in archiveObject)) {
        await rejectFile(db, bucket, record, workspace.id, user.id, "UPLOAD_INTEGRITY_FAILED");
        return response({ code: "UPLOAD_INTEGRITY_FAILED", error: "Архив не удалось прочитать после загрузки." }, 422);
      }
      try {
        archiveInspection = inspectArchiveBytes(new Uint8Array(await archiveObject.arrayBuffer()), record.mimeType);
      } catch (error) {
        if (!(error instanceof ArchiveInspectionError)) throw error;
        await rejectFile(db, bucket, record, workspace.id, user.id, error.code);
        return response({
          code: "FILE_UNSAFE",
          reason: error.code,
          error: "Архив отклонён проверкой структуры и безопасных ограничений.",
        }, 422);
      }
    }

    const now = new Date().toISOString();
    const scanQueued = scannerConfigured();
    const statements: D1PreparedStatement[] = [
      db.prepare(
        "UPDATE document_files SET kind='analysis_quarantined',updated_at=? WHERE id=? AND workspace_id=? AND owner_user_id=? AND kind='analysis_uploaded'",
      ).bind(now, record.fileId, workspace.id, user.id),
      db.prepare(
        "UPDATE document_analyses SET status='quarantined',error_code=?,updated_at=? WHERE id=? AND workspace_id=? AND owner_user_id=? AND status='uploaded'",
      ).bind(scanQueued ? null : "MALWARE_SCANNER_UNAVAILABLE", now, analysisId, workspace.id, user.id),
      db.prepare(
        `INSERT INTO workspace_audit_events
         (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
         VALUES (?,?,?,'document_analysis',?,'upload_quarantined',?,?)`,
      ).bind(crypto.randomUUID(), workspace.id, user.id, analysisId, JSON.stringify({
        magicBytesVerified: true,
        archiveInspected: Boolean(archiveInspection),
        archiveEntryCount: archiveInspection?.entryCount ?? null,
        archiveFileCount: archiveInspection?.fileCount ?? null,
        archiveUncompressedBytes: archiveInspection?.uncompressedBytes ?? null,
        scannerQueued: scanQueued,
      }), now),
    ];
    if (scanQueued) statements.push(scanOutboxStatement(db, record, workspace.id, now));
    await db.batch(statements);
    return quarantinedResponse({
      ...record,
      status: "quarantined",
      errorCode: scanQueued ? null : "MALWARE_SCANNER_UNAVAILABLE",
    }, false, scanQueued);
  } catch (error) {
    if (error instanceof DocumentAnalysisUploadError) {
      return response({ code: error.code, error: error.message }, error.status);
    }
    throw error;
  }
});

async function rejectFile(
  db: D1Database,
  bucket: R2Bucket,
  record: Awaited<ReturnType<typeof documentAnalysisUploadForUser>>,
  workspaceId: string,
  userId: string,
  errorCode: string,
) {
  await bucket.delete(record.r2Key);
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(
      "UPDATE document_files SET kind='analysis_rejected',archived_at=?,updated_at=? WHERE id=? AND workspace_id=? AND owner_user_id=?",
    ).bind(now, now, record.fileId, workspaceId, userId),
    db.prepare(
      "UPDATE document_analyses SET status='failed',error_code=?,updated_at=? WHERE id=? AND workspace_id=? AND owner_user_id=?",
    ).bind(errorCode, now, record.analysisId, workspaceId, userId),
    db.prepare(
      `INSERT INTO workspace_audit_events
       (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
       VALUES (?,?,?,'document_analysis',?,'upload_rejected',?,?)`,
    ).bind(crypto.randomUUID(), workspaceId, userId, record.analysisId, JSON.stringify({ errorCode, objectDeleted: true }), now),
  ]);
}

function quarantinedResponse(
  record: Awaited<ReturnType<typeof documentAnalysisUploadForUser>>,
  replay: boolean,
  scanQueued: boolean,
) {
  return response({
    code: scanQueued ? "FILE_SCAN_QUEUED" : "FILE_SCAN_UNAVAILABLE",
    analysis: {
      id: record.analysisId,
      fileId: record.fileId,
      fileName: record.fileName,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      status: "quarantined",
      errorCode: scanQueued ? null : "MALWARE_SCANNER_UNAVAILABLE",
    },
    replay,
    message: scanQueued
      ? "Файл приватно загружен и передан на обязательную проверку безопасности. Анализ начнётся только после чистого результата."
      : "Файл приватно загружен и помещён в карантин. Анализ не запускался: staging malware scanner ещё не подключён.",
  }, 202);
}

function scannerConfigured(): boolean {
  const environment = runtimeEnv();
  return environment.MALWARE_SCAN_ENABLED === "true"
    && Boolean(environment.MALWARE_SCANNER)
    && Boolean(environment.MALWARE_SCAN_QUEUE);
}

async function ensureScanQueued(
  db: D1Database,
  record: Awaited<ReturnType<typeof documentAnalysisUploadForUser>>,
  workspaceId: string,
  now: string,
): Promise<void> {
  await scanOutboxStatement(db, record, workspaceId, now).run();
}

function scanOutboxStatement(
  db: D1Database,
  record: Awaited<ReturnType<typeof documentAnalysisUploadForUser>>,
  workspaceId: string,
  now: string,
): D1PreparedStatement {
  const jobId = `job-malware-${record.analysisId}`;
  const idempotencyKey = `idem-malware-${record.analysisId}-${record.sha256.slice(0, 16)}`;
  return db.prepare(`INSERT OR IGNORE INTO job_outbox
    (id,queue_binding,job_type,schema_version,idempotency_key,subject_id,workspace_id,
     correlation_id,enqueued_at,available_at,status,dispatch_attempts,created_at,updated_at)
    VALUES (?,'MALWARE_SCAN_QUEUE','malware.scan',1,?,?,?, ?,?,?,'pending',0,?,?)`).bind(
    jobId,
    idempotencyKey,
    record.analysisId,
    workspaceId,
    `corr-malware-${record.analysisId}`,
    now,
    now,
    now,
    now,
  );
}
