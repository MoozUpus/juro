import { requireApiUser, withApiErrors } from "../../../../../../../lib/document-builder/auth/api";
import { requireD1, requireR2 } from "../../../../../../../lib/document-builder/storage/runtime";
import { AnalysisExportError } from "../../../../../../../lib/document-analysis/exporter";
import { comparisonExportForDownload, recordComparisonExportDownload, verifyComparisonExportObject } from "../../../../../../../lib/document-comparison/exporter";
import { assertComparisonSourceFilesCleanById } from "../../../../../../../lib/document-comparison/scan-evidence";
import { ComparisonProcessingError } from "../../../../../../../lib/document-comparison/types";
import { workspaceForUser } from "../../../../../../../lib/platform/workspace";

export const GET = withApiErrors(async function GET(
  _request: Request,
  context: { params: Promise<{ exportId: string }> },
) {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { exportId } = await context.params;
  try {
    const db = requireD1();
    const record = await comparisonExportForDownload(db, { exportId, workspaceId: workspace.id, userId: user.id });
    await assertComparisonSourceFilesCleanById(db, {
      comparisonId: record.comparisonId,
      workspaceId: workspace.id,
      ownerUserId: user.id,
    });
    const object = await verifyComparisonExportObject(requireR2(), record);
    await recordComparisonExportDownload(db, record, user.id);
    return new Response(object.body, { headers: {
      "content-type": record.mimeType,
      "content-length": String(record.sizeBytes),
      "content-disposition": `attachment; filename="${record.fileName.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow, noarchive",
    } });
  } catch (error) {
    if (error instanceof ComparisonProcessingError) {
      return Response.json({ code: error.code, error: error.message }, {
        status: 422,
        headers: { "cache-control": "private, no-store" },
      });
    }
    if (error instanceof AnalysisExportError) {
      return Response.json({ code: error.code, error: "Экспорт недоступен." }, { status: error.status, headers: { "cache-control": "private, no-store" } });
    }
    throw error;
  }
});
