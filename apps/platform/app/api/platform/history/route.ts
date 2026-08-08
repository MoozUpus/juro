import { requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import { canManageTeam } from "../../../../lib/platform/permissions";
import { workspaceForUser } from "../../../../lib/platform/workspace";

export const GET = withApiErrors(async function GET() {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const db = requireD1();
  const auditWhere = canManageTeam(workspace.role) ? "workspace_id=?" : "workspace_id=? AND actor_user_id=?";
  const auditBinds = canManageTeam(workspace.role) ? [workspace.id] : [workspace.id, user.id];
  const [audit, documents, cases] = await db.batch([
    db.prepare(
      `SELECT id,'workspace' AS source,entity_type AS entityType,entity_id AS entityId,action,
        metadata_json AS metadataJson,actor_user_id AS actorUserId,created_at AS createdAt
       FROM workspace_audit_events WHERE ${auditWhere} ORDER BY created_at DESC LIMIT 150`,
    ).bind(...auditBinds),
    db.prepare(
      `SELECT e.id,'document' AS source,'document' AS entityType,e.document_id AS entityId,e.type AS action,
        e.metadata_json AS metadataJson,e.actor_user_id AS actorUserId,e.created_at AS createdAt
       FROM activity_events e JOIN documents d ON d.id=e.document_id
       WHERE d.workspace_id=? AND (e.actor_user_id=? OR d.owner_user_id=?)
       ORDER BY e.created_at DESC LIMIT 150`,
    ).bind(workspace.id, user.id, user.id),
    db.prepare(
      `SELECT e.id,'case' AS source,'case' AS entityType,e.case_id AS entityId,e.event_type AS action,
        e.metadata_json AS metadataJson,e.actor_user_id AS actorUserId,e.created_at AS createdAt
       FROM case_events e JOIN cases c ON c.id=e.case_id
       WHERE c.workspace_id=? ORDER BY e.created_at DESC LIMIT 150`,
    ).bind(workspace.id),
  ]);
  const events = [...audit.results, ...documents.results, ...cases.results]
    .sort((left, right) => String((right as Record<string, unknown>).createdAt).localeCompare(String((left as Record<string, unknown>).createdAt)))
    .slice(0, 250);
  return Response.json({ events }, { headers: { "cache-control": "private, no-store" } });
});
