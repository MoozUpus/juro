import { requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { parseJson } from "../../../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import { workspaceForUser } from "../../../../../../lib/platform/workspace";

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
}

export const GET = withApiErrors(async function GET(
  _request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const user = await requireApiUser();
  const { caseId } = await params;
  const workspace = await workspaceForUser(user);
  const db = requireD1();
  const owned = await db.prepare(
    "SELECT id FROM cases WHERE id=? AND workspace_id=? AND archived_at IS NULL LIMIT 1",
  ).bind(caseId, workspace.id).first<{ id: string }>();
  if (!owned) return response({ error: "Дело недоступно.", code: "CASE_UNAVAILABLE" }, 404);

  const [documents, events] = await db.batch([
    db.prepare(
      "SELECT id,title,status,language,plan_step_id AS planStepId,updated_at AS updatedAt FROM documents WHERE workspace_id=? AND case_id=? AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 20",
    ).bind(workspace.id, caseId),
    db.prepare(
      "SELECT event_type AS eventType,metadata_json AS metadataJson,created_at AS createdAt FROM case_events WHERE case_id=? ORDER BY created_at DESC LIMIT 50",
    ).bind(caseId),
  ]);
  return response({
    documents: documents.results,
    activity: events.results.map((event) => ({
      eventType: String((event as { eventType?: unknown }).eventType || "case_updated"),
      createdAt: String((event as { createdAt?: unknown }).createdAt || ""),
      metadata: parseJson(String((event as { metadataJson?: unknown }).metadataJson || "{}"), {}),
    })),
  });
});
