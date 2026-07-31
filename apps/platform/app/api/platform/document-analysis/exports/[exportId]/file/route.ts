import { requireApiUser, withApiErrors } from "../../../../../../../lib/document-builder/auth/api";
import { requireD1, requireR2 } from "../../../../../../../lib/document-builder/storage/runtime";
import { AnalysisExportError, exportForDownload, recordAnalysisExportDownload, verifyExportObject } from "../../../../../../../lib/document-analysis/exporter";
import { workspaceForUser } from "../../../../../../../lib/platform/workspace";

export const GET = withApiErrors(async function GET(_request: Request, context: { params: Promise<{ exportId: string }> }) {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { exportId } = await context.params;
  try {
    const db = requireD1();
    const record = await exportForDownload(db, { exportId, workspaceId: workspace.id, userId: user.id });
    const object = await verifyExportObject(requireR2(), record);
    await recordAnalysisExportDownload(db, record, user.id);
    return new Response(object.body, { headers: {
      "content-type": "application/json; charset=utf-8",
      "content-length": String(record.sizeBytes),
      "content-disposition": `attachment; filename="${record.fileName.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow, noarchive",
    } });
  } catch (error) {
    if (error instanceof AnalysisExportError) {
      return Response.json({ code: error.code, error: "Экспорт недоступен." }, { status: error.status, headers: { "cache-control": "private, no-store" } });
    }
    throw error;
  }
});
