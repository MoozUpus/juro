import { requireApiUser, withApiErrors } from "../../../../../../../../lib/document-builder/auth/api";
import { requireD1, requireR2 } from "../../../../../../../../lib/document-builder/storage/runtime";
import {
  AnalysisRevisionError,
  analysisVersionForDownload,
  verifiedAnalysisVersionObject,
} from "../../../../../../../../lib/document-analysis/revisions";
import { workspaceForUser } from "../../../../../../../../lib/platform/workspace";

export const GET = withApiErrors(async function GET(
  _request: Request,
  context: { params: Promise<{ analysisId: string; versionId: string }> },
) {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { analysisId, versionId } = await context.params;
  try {
    const db = requireD1();
    const record = await analysisVersionForDownload(db, {
      analysisId, versionId, workspaceId: workspace.id, userId: user.id,
    });
    const object = await verifiedAnalysisVersionObject(requireR2(), record);
    await db.prepare(
      `INSERT INTO workspace_audit_events
       (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
       VALUES (?,?,?,'analysis_document_version',?,'analysis_version_downloaded',?,?)`,
    ).bind(
      crypto.randomUUID(), workspace.id, user.id, record.id,
      JSON.stringify({ analysisId, version: record.version }), new Date().toISOString(),
    ).run();
    return new Response(object.body, { headers: {
      "content-type": record.mimeType,
      "content-length": String(record.sizeBytes),
      "content-disposition": `attachment; filename="${record.fileName.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow, noarchive",
    } });
  } catch (error) {
    if (error instanceof AnalysisRevisionError) {
      return Response.json(
        { code: error.code, error: "Версия документа недоступна." },
        { status: error.status, headers: { "cache-control": "private, no-store" } },
      );
    }
    throw error;
  }
});
