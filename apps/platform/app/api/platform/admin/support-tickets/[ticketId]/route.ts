import { z } from "zod";
import { parseJsonRequest } from "../../../../../../lib/auth/input";
import { requirePlatformStaffRequest } from "../../../../../../lib/auth/staff-http";
import { isoNow } from "../../../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";

const replySchema = z.object({ body: z.string().trim().min(1).max(8_000), status: z.enum(["open", "waiting_user", "resolved"]) }).strict();
type Context = { params: Promise<{ ticketId: string }> };

export async function POST(request: Request, context: Context) {
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
