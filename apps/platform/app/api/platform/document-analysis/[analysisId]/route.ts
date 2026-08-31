import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../lib/document-builder/auth/api";
import {
  requireD1,
  requireQuarantineR2,
  requireR2,
  runtimeEnv,
} from "../../../../../lib/document-builder/storage/runtime";
import {
  DocumentAnalysisRetentionError,
  requestDocumentAnalysisDeletion,
} from "../../../../../lib/document-analysis/resource-retention";
import { workspaceForUser } from "../../../../../lib/platform/workspace";

type Context = { params: Promise<{ analysisId: string }> };

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}

export const DELETE = withApiErrors(async function DELETE(request: Request, context: Context) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { analysisId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(analysisId)) {
    return response({ code: "ANALYSIS_NOT_FOUND", error: "Анализ недоступен." }, 404);
  }
  try {
    const environment = runtimeEnv();
    const result = await requestDocumentAnalysisDeletion({
      DB: requireD1(),
      BUCKET: requireR2(),
      QUARANTINE_BUCKET: requireQuarantineR2(),
      USER_DOCUMENTS_INDEX: environment.USER_DOCUMENTS_INDEX,
    }, {
      analysisId,
      workspaceId: workspace.id,
      userId: user.id,
    });
    return response(
      { ok: true, status: result.status },
      result.status === "purged" ? 200 : 202,
    );
  } catch (error) {
    if (error instanceof DocumentAnalysisRetentionError) {
      return response({
        code: error.code,
        error: error.code === "ANALYSIS_IN_USE"
          ? "Анализ используется сравнением или защищённым материалом и пока не может быть удалён."
          : "Анализ недоступен.",
      }, error.status);
    }
    throw error;
  }
});
