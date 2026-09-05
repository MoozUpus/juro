import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { requireD1, requireR2 } from "../../../../../../lib/document-builder/storage/runtime";
import { AnalysisExportError } from "../../../../../../lib/document-analysis/exporter";
import { deleteComparisonExport } from "../../../../../../lib/document-comparison/exporter";
import { workspaceForContentEditor } from "../../../../../../lib/platform/workspace";

export const DELETE = withApiErrors(async function DELETE(
  request: Request,
  context: { params: Promise<{ exportId: string }> },
) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForContentEditor(user);
  const { exportId } = await context.params;
  try {
    const result = await deleteComparisonExport(
      { DB: requireD1(), BUCKET: requireR2() },
      { exportId, workspaceId: workspace.id, userId: user.id },
    );
    return Response.json(result, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AnalysisExportError) {
      return Response.json({ code: error.code, error: error.code === "ANALYSIS_EXPORT_NOT_TERMINAL" ? "Дождитесь завершения экспорта." : "Экспорт не найден или не удалён." }, { status: error.status, headers: { "cache-control": "private, no-store" } });
    }
    throw error;
  }
});
