import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../../lib/document-builder/auth/api";
import { requireD1, requireR2 } from "../../../../../../../lib/document-builder/storage/runtime";
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
    if (record.status === "quarantined") return quarantinedResponse(record, true);
    if (record.status !== "uploaded") {
      return response({ code: "UPLOAD_STATE_CONFLICT", error: "Сначала завершите загрузку файла." }, 409);
    }
    const bucket = requireR2();
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

    const now = new Date().toISOString();
    await db.batch([
      db.prepare(
        "UPDATE document_files SET kind='analysis_quarantined',updated_at=? WHERE id=? AND workspace_id=? AND owner_user_id=? AND kind='analysis_uploaded'",
      ).bind(now, record.fileId, workspace.id, user.id),
      db.prepare(
        "UPDATE document_analyses SET status='quarantined',error_code='MALWARE_SCANNER_UNAVAILABLE',updated_at=? WHERE id=? AND workspace_id=? AND owner_user_id=? AND status='uploaded'",
      ).bind(now, analysisId, workspace.id, user.id),
      db.prepare(
        `INSERT INTO workspace_audit_events
         (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
         VALUES (?,?,?,'document_analysis',?,'upload_quarantined',?,?)`,
      ).bind(crypto.randomUUID(), workspace.id, user.id, analysisId, JSON.stringify({ magicBytesVerified: true, scannerDispatched: false }), now),
    ]);
    return quarantinedResponse({ ...record, status: "quarantined", errorCode: "MALWARE_SCANNER_UNAVAILABLE" }, false);
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

function quarantinedResponse(record: Awaited<ReturnType<typeof documentAnalysisUploadForUser>>, replay: boolean) {
  return response({
    code: "FILE_SCAN_UNAVAILABLE",
    analysis: {
      id: record.analysisId,
      fileId: record.fileId,
      fileName: record.fileName,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      status: "quarantined",
      errorCode: "MALWARE_SCANNER_UNAVAILABLE",
    },
    replay,
    message: "Файл приватно загружен и помещён в карантин. Анализ не запускался: staging malware scanner ещё не подключён.",
  }, 202);
}
