import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { requireD1, requireR2 } from "../../../../../../lib/document-builder/storage/runtime";
import { AnalysisExportError, deleteAnalysisExport } from "../../../../../../lib/document-analysis/exporter";
import { deleteAnalysisReportExport } from "../../../../../../lib/document-analysis/report-exporter";
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
    const env = { DB: requireD1(), BUCKET: requireR2() };
    const report = await env.DB.prepare(
      `SELECT 1 AS found FROM analysis_report_exports
       WHERE id=? AND workspace_id=? AND owner_user_id=? LIMIT 1`,
    ).bind(exportId, workspace.id, user.id).first<{ found: number }>();
    const input = { exportId, workspaceId: workspace.id, userId: user.id };
    const result = report?.found
      ? await deleteAnalysisReportExport(env, input)
      : await deleteAnalysisExport(env, input);
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
