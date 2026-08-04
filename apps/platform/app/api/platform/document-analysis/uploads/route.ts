import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import {
  DocumentAnalysisUploadError,
  hashUploadIntent,
  initializeDocumentAnalysisUpload,
  parseDocumentAnalysisUploadIntent,
  parseUploadIdempotencyKey,
} from "../../../../../lib/document-analysis/upload-pipeline";
import { workspaceForUser } from "../../../../../lib/platform/workspace";

function response(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache", ...headers },
  });
}

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  try {
    if (!request.headers.get("content-type")?.toLocaleLowerCase().startsWith("application/json")) {
      return response({ code: "INVALID_CONTENT_TYPE", error: "Инициализация загрузки принимает только JSON." }, 415);
    }
    const intent = parseDocumentAnalysisUploadIntent(await request.json());
    if (intent.caseId) {
      const targetCase = await requireD1().prepare(
        "SELECT id FROM cases WHERE id=? AND workspace_id=? AND archived_at IS NULL LIMIT 1",
      ).bind(intent.caseId, workspace.id).first<{ id: string }>();
      if (!targetCase) {
        throw new DocumentAnalysisUploadError("CASE_UNAVAILABLE", "Дело недоступно.", 404);
      }
    }
    const idempotencyKey = parseUploadIdempotencyKey(request.headers.get("idempotency-key"));
    const result = await initializeDocumentAnalysisUpload({
      db: requireD1(),
      workspaceId: workspace.id,
      userId: user.id,
      idempotencyKey,
      requestHash: await hashUploadIntent(intent),
      intent,
    });
    const analysis = publicRecord(result.record);
    return response(
      { analysis, upload: { method: "PUT", url: `/api/platform/document-analysis/uploads/${encodeURIComponent(analysis.id)}` } },
      result.replay ? 200 : 201,
      { location: `/api/platform/document-analysis/uploads/${encodeURIComponent(analysis.id)}` },
    );
  } catch (error) {
    if (error instanceof DocumentAnalysisUploadError) {
      return response({ code: error.code, error: error.message }, error.status);
    }
    if (error instanceof SyntaxError) return response({ code: "INVALID_JSON", error: "Некорректный JSON." }, 400);
    throw error;
  }
});

function publicRecord(record: Awaited<ReturnType<typeof initializeDocumentAnalysisUpload>>["record"]) {
  return {
    id: record.analysisId,
    fileId: record.fileId,
    fileName: record.fileName,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    status: record.status,
    errorCode: record.errorCode,
    caseId: record.caseId,
  };
}
