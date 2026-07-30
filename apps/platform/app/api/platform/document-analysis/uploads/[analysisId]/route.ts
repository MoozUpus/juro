import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { requireD1, requireR2 } from "../../../../../../lib/document-builder/storage/runtime";
import {
  arrayBufferHex,
  documentAnalysisUploadForUser,
  DocumentAnalysisUploadError,
} from "../../../../../../lib/document-analysis/upload-pipeline";
import { workspaceForUser } from "../../../../../../lib/platform/workspace";

type Context = { params: Promise<{ analysisId: string }> };

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}

export const GET = withApiErrors(async function GET(_request: Request, context: Context) {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { analysisId } = await context.params;
  try {
    const record = await documentAnalysisUploadForUser(requireD1(), analysisId, workspace.id, user.id);
    return response({ analysis: publicRecord(record) });
  } catch (error) {
    return uploadError(error);
  }
});

export const PUT = withApiErrors(async function PUT(request: Request, context: Context) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { analysisId } = await context.params;
  const db = requireD1();
  try {
    const record = await documentAnalysisUploadForUser(db, analysisId, workspace.id, user.id);
    if (["uploaded", "quarantined"].includes(record.status)) {
      const existing = await requireR2().head(record.r2Key);
      if (existing && existing.size === record.sizeBytes && arrayBufferHex(existing.checksums.sha256) === record.sha256) {
        return response({ analysis: publicRecord(record), replay: true });
      }
      return response({ code: "UPLOAD_STATE_CONFLICT", error: "Состояние загрузки не совпадает с приватным объектом." }, 409);
    }
    if (!["initiated", "upload_failed"].includes(record.status)) {
      return response({ code: "UPLOAD_STATE_CONFLICT", error: "Файл нельзя загрузить в текущем состоянии." }, 409);
    }
    const length = Number(request.headers.get("content-length"));
    if (!Number.isSafeInteger(length) || length !== record.sizeBytes) {
      return response({ code: "UPLOAD_SIZE_MISMATCH", error: "Размер тела запроса не совпадает с заявленным размером файла." }, 400);
    }
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLocaleLowerCase() !== record.mimeType) {
      return response({ code: "CONTENT_TYPE_MISMATCH", error: "MIME-тип тела запроса не совпадает с заявленным." }, 415);
    }
    if (request.headers.get("x-juro-file-sha256")?.trim().toLocaleLowerCase() !== record.sha256) {
      return response({ code: "UPLOAD_CHECKSUM_MISMATCH", error: "SHA-256 заголовок не совпадает с заявленным." }, 400);
    }
    if (!request.body) return response({ code: "EMPTY_FILE", error: "Файл пуст." }, 400);

    let stored: R2Object | null;
    try {
      stored = await requireR2().put(record.r2Key, request.body, {
        onlyIf: new Headers({ "if-none-match": "*" }),
        sha256: record.sha256,
        httpMetadata: { contentType: record.mimeType, cacheControl: "private, no-store" },
        customMetadata: {
          workspaceId: workspace.id,
          ownerUserId: user.id,
          analysisId: record.analysisId,
          fileId: record.fileId,
          lifecycle: "quarantine",
        },
      });
    } catch {
      await db.prepare(
        "UPDATE document_analyses SET status='upload_failed',error_code='UPLOAD_INTEGRITY_FAILED',updated_at=? WHERE id=? AND workspace_id=? AND owner_user_id=?",
      ).bind(new Date().toISOString(), analysisId, workspace.id, user.id).run();
      return response({ code: "UPLOAD_INTEGRITY_FAILED", error: "R2 отклонил файл: проверьте размер и SHA-256." }, 422);
    }
    if (!stored) {
      stored = await requireR2().head(record.r2Key);
    }
    if (!stored || stored.size !== record.sizeBytes || arrayBufferHex(stored.checksums.sha256) !== record.sha256) {
      await requireR2().delete(record.r2Key);
      await db.prepare(
        "UPDATE document_analyses SET status='upload_failed',error_code='UPLOAD_INTEGRITY_FAILED',updated_at=? WHERE id=? AND workspace_id=? AND owner_user_id=?",
      ).bind(new Date().toISOString(), analysisId, workspace.id, user.id).run();
      return response({ code: "UPLOAD_INTEGRITY_FAILED", error: "Размер или SHA-256 сохранённого объекта не совпадает." }, 422);
    }
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(
        "UPDATE document_files SET kind='analysis_uploaded',updated_at=? WHERE id=? AND workspace_id=? AND owner_user_id=? AND kind='analysis_upload_pending'",
      ).bind(now, record.fileId, workspace.id, user.id),
      db.prepare(
        "UPDATE document_analyses SET status='uploaded',error_code=NULL,updated_at=? WHERE id=? AND workspace_id=? AND owner_user_id=? AND status IN ('initiated','upload_failed')",
      ).bind(now, analysisId, workspace.id, user.id),
      db.prepare(
        `INSERT INTO workspace_audit_events
         (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
         VALUES (?,?,?,'document_analysis',?,'upload_completed',?,?)`,
      ).bind(crypto.randomUUID(), workspace.id, user.id, analysisId, JSON.stringify({ sizeBytes: stored.size, sha256Verified: true }), now),
    ]);
    return response({ analysis: { ...publicRecord(record), status: "uploaded", errorCode: null } });
  } catch (error) {
    return uploadError(error);
  }
});

function uploadError(error: unknown): Response {
  if (error instanceof DocumentAnalysisUploadError) {
    return response({ code: error.code, error: error.message }, error.status);
  }
  throw error;
}

function publicRecord(record: Awaited<ReturnType<typeof documentAnalysisUploadForUser>>) {
  return {
    id: record.analysisId,
    fileId: record.fileId,
    fileName: record.fileName,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    status: record.status,
    errorCode: record.errorCode,
  };
}
