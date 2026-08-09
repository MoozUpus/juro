import { z } from "zod";
import { parseJsonRequest } from "../../../../../../lib/auth/input";
import { requirePlatformStaffRequest, withPlatformStaffErrors } from "../../../../../../lib/auth/staff-http";
import { isoNow } from "../../../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";

const replySchema = z.object({ body: z.string().trim().min(1).max(8_000), status: z.enum(["open", "waiting_user", "resolved"]) }).strict();
type Context = { params: Promise<{ ticketId: string }> };

async function getSupportTicket(request: Request, context: Context) {
  const staff = await requirePlatformStaffRequest(request, "support.tickets.manage", { freshMfaWithinMs: 15 * 60 * 1000 });
  const { ticketId } = await context.params;
  const db = requireD1();
  const ticket = await db.prepare("SELECT id,workspace_id AS workspaceId,category,severity,status,subject,created_at AS createdAt,updated_at AS updatedAt FROM support_tickets WHERE id=? LIMIT 1").bind(ticketId).first<{ id: string; workspaceId: string; category: string; severity: string; status: string; subject: string; createdAt: string; updatedAt: string }>();
  if (!ticket) return Response.json({ code: "NOT_FOUND" }, { status: 404, headers: { "cache-control": "private, no-store" } });
  const messages = await db.prepare("SELECT id,author_type AS authorType,body,created_at AS createdAt FROM support_messages WHERE ticket_id=? ORDER BY created_at ASC,id ASC LIMIT 200").bind(ticketId).all();
  await db.prepare("INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) VALUES (?,?,?,'support_ticket',?,'support_ticket_viewed',?,?)").bind(crypto.randomUUID(), ticket.workspaceId, staff.userId, ticketId, JSON.stringify({ source: "staff_support_inbox" }), isoNow()).run();
  return Response.json({ ticket, messages: messages.results }, { headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

async function postSupportTicket(request: Request, context: Context) {
  const staff = await requirePlatformStaffRequest(request, "support.tickets.manage", { freshMfaWithinMs: 15 * 60 * 1000 });
  const parsed = await parseJsonRequest(request, replySchema, 10_240);
  if (!parsed.ok) return Response.json({ code: "INVALID_INPUT" }, { status: 400 });
  const { ticketId } = await context.params; const db = requireD1(); const ticket = await db.prepare("SELECT workspace_id AS workspaceId FROM support_tickets WHERE id=? LIMIT 1").bind(ticketId).first<{ workspaceId: string }>();
  if (!ticket) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  const now = isoNow();
  await db.batch([
    db.prepare("INSERT INTO support_messages (id,ticket_id,author_user_id,author_type,body,created_at) VALUES (?,?,?,'staff',?,?)").bind(crypto.randomUUID(), ticketId, staff.userId, parsed.data.body, now),
    db.prepare("UPDATE support_tickets SET status=?,updated_at=?,closed_at=? WHERE id=?").bind(parsed.data.status, now, parsed.data.status === "resolved" ? now : null, ticketId),
    db.prepare("INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) VALUES (?,?,?,'support_ticket',?,'support_ticket_replied',?,?)").bind(crypto.randomUUID(), ticket.workspaceId, staff.userId, ticketId, JSON.stringify({ status: parsed.data.status }), now),
  ]);
  return Response.json({ ok: true, status: parsed.data.status }, { headers: { "cache-control": "private, no-store" } });
}

export const GET = withPlatformStaffErrors(getSupportTicket);
export const POST = withPlatformStaffErrors(postSupportTicket);
