import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { requireD1, requireR2 } from "../../../../../../lib/document-builder/storage/runtime";
import { AnalysisExportError, deleteAnalysisExport } from "../../../../../../lib/document-analysis/exporter";
import { workspaceForUser } from "../../../../../../lib/platform/workspace";

const response = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { "cache-control": "private, no-store", pragma: "no-cache" },
});

export const DELETE = withApiErrors(async function DELETE(
  request: Request,
  context: { params: Promise<{ exportId: string }> },
) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { exportId } = await context.params;
  try {
    const result = await deleteAnalysisExport(
      { DB: requireD1(), BUCKET: requireR2() },
      { exportId, workspaceId: workspace.id, userId: user.id },
    );
    return response(result);
  } catch (error) {
    if (error instanceof AnalysisExportError) {
      return response({ code: error.code, error: message(error.code) }, error.status);
    }
    throw error;
  }
});

function message(code: string): string {
  if (code === "ANALYSIS_EXPORT_NOT_TERMINAL") return "Дождитесь завершения экспорта.";
  if (code === "ANALYSIS_EXPORT_DELETE_FAILED") return "Экспорт не удалён. Повторите действие.";
  return "Экспорт не найден.";
}
