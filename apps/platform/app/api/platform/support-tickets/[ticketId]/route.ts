import { parseJsonRequest } from "../../../../../lib/auth/input";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../lib/document-builder/auth/api";
import { isoNow } from "../../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import { supportTicketReplySchema } from "../../../../../lib/platform/support";
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

export const POST = withApiErrors(async function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  assertSafeWrite(request);
  const { ticketId } = await params;
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const parsed = await parseJsonRequest(request, supportTicketReplySchema, 8_512);
  if (!parsed.ok) return response({ code: "INVALID_INPUT", error: "Проверьте сообщение / Xabarni tekshiring." }, parsed.error === "payload_too_large" ? 413 : 400);
  const db = requireD1();
  const ticket = await db.prepare(
    "SELECT id,status FROM support_tickets WHERE id=? AND workspace_id=? AND requester_user_id=? LIMIT 1",
  ).bind(ticketId, workspace.id, user.id).first<{ id: string; status: string }>();
  if (!ticket) return response({ code: "NOT_FOUND" }, 404);
  if (ticket.status === "resolved") return response({ code: "TICKET_RESOLVED", error: "Обращение уже закрыто / Murojaat yopilgan." }, 409);
  const now = isoNow();
  await db.batch([
    db.prepare("INSERT INTO support_messages (id,ticket_id,author_user_id,author_type,body,created_at) VALUES (?,?,?,'requester',?,?)").bind(crypto.randomUUID(), ticketId, user.id, parsed.data.message, now),
    db.prepare("UPDATE support_tickets SET status='open',updated_at=?,closed_at=NULL WHERE id=? AND workspace_id=? AND requester_user_id=? AND status<>'resolved'").bind(now, ticketId, workspace.id, user.id),
    db.prepare("INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) VALUES (?,?,?,'support_ticket',?,'support_ticket_replied',?,?)").bind(crypto.randomUUID(), workspace.id, user.id, ticketId, JSON.stringify({ priorStatus: ticket.status }), now),
  ]);
  return response({ ok: true, status: "open" }, 201);
});
