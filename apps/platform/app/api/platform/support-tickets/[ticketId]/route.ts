import { requireApiUser, withApiErrors } from "../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import { workspaceForUser } from "../../../../../lib/platform/workspace";

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

export const GET = withApiErrors(async function GET(_request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const db = requireD1();
  const ticket = await db.prepare(
    "SELECT id,category,severity,status,subject,created_at AS createdAt,updated_at AS updatedAt,closed_at AS closedAt FROM support_tickets WHERE id=? AND workspace_id=? AND requester_user_id=?",
  ).bind(ticketId, workspace.id, user.id).first();
  if (!ticket) return response({ code: "NOT_FOUND" }, 404);
  const messages = await db.prepare("SELECT id,author_type AS authorType,body,created_at AS createdAt FROM support_messages WHERE ticket_id=? ORDER BY created_at ASC").bind(ticketId).all();
  return response({ ticket, messages: messages.results });
});
