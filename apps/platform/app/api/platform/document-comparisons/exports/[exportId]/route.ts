import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { authLocaleFromRequest } from "../../../../../../lib/auth/request-locale";
import { requireD1, requireR2 } from "../../../../../../lib/document-builder/storage/runtime";
import { AnalysisExportError } from "../../../../../../lib/document-analysis/exporter";
import { deleteComparisonExport } from "../../../../../../lib/document-comparison/exporter";
import { comparisonExportErrorMessage } from "../../../../../../lib/document-comparison/localization";
import { workspaceForContentEditor } from "../../../../../../lib/platform/workspace";

export const DELETE = withApiErrors(async function DELETE(
  request: Request,
  context: { params: Promise<{ exportId: string }> },
) {
  assertSafeWrite(request);
  const locale = authLocaleFromRequest(request);
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
      return Response.json({
        code: error.code,
        error: comparisonExportErrorMessage(error.code, locale),
      }, {
        status: error.status,
        headers: { "cache-control": "private, no-store" },
      });
    }
    throw error;
  }
});
