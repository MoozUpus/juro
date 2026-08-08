import { parseJsonRequest } from "../../../../lib/auth/input";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { isoNow } from "../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import { supportTicketSchema } from "../../../../lib/platform/support";
import { trackSupportTicketCreated } from "../../../../lib/platform/analytics";
import { workspaceForUser } from "../../../../lib/platform/workspace";

function response(body: unknown, status = 200) { return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } }); }

export const GET = withApiErrors(async function GET() {
  const user = await requireApiUser(); const workspace = await workspaceForUser(user); const db = requireD1();
  const tickets = await db.prepare("SELECT id,category,severity,status,subject,created_at AS createdAt,updated_at AS updatedAt,closed_at AS closedAt FROM support_tickets WHERE workspace_id=? AND requester_user_id=? ORDER BY updated_at DESC LIMIT 100").bind(workspace.id, user.id).all();
  return response({ tickets: tickets.results });
});

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request); const user = await requireApiUser(); const workspace = await workspaceForUser(user);
  const parsed = await parseJsonRequest(request, supportTicketSchema, 10_240);
  if (!parsed.ok) return response({ code: "INVALID_INPUT", error: "Проверьте обращение / Murojaatni tekshiring." }, parsed.error === "payload_too_large" ? 413 : 400);
  const db = requireD1(); const now = isoNow(); const ticketId = crypto.randomUUID();
  await db.batch([
    db.prepare("INSERT INTO support_tickets (id,workspace_id,requester_user_id,category,severity,status,subject,created_at,updated_at) VALUES (?,?,?,?,?,'open',?,?,?)").bind(ticketId, workspace.id, user.id, parsed.data.category, parsed.data.severity, parsed.data.subject, now, now),
    db.prepare("INSERT INTO support_messages (id,ticket_id,author_user_id,author_type,body,created_at) VALUES (?,?,?,'requester',?,?)").bind(crypto.randomUUID(), ticketId, user.id, parsed.data.message, now),
    db.prepare("INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) VALUES (?,?,?,'support_ticket',?,'support_ticket_created',?,?)").bind(crypto.randomUUID(), workspace.id, user.id, ticketId, JSON.stringify({ category: parsed.data.category, severity: parsed.data.severity }), now),
  ]);
  trackSupportTicketCreated({ category: parsed.data.category, severity: parsed.data.severity, locale: parsed.data.locale });
  return response({ ok: true, ticketId, status: "open" }, 201);
});
