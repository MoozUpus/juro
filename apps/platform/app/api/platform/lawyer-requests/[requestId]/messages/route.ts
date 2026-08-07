import { parseJsonRequest } from "../../../../../../lib/auth/input";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { isoNow } from "../../../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import { lawyerRequestMessageError, lawyerRequestMessageSchema } from "../../../../../../lib/platform/lawyer-request-message";
import { workspaceForUser } from "../../../../../../lib/platform/workspace";

type Context = { params: Promise<{ requestId: string }> };
type Participant = { workspaceId: string; role: "owner" | "lawyer" };

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

async function participantForRequest(userId: string, workspaceId: string, requestId: string): Promise<Participant | null> {
  const db = requireD1();
  const owner = await db.prepare("SELECT workspace_id AS workspaceId FROM lawyer_requests WHERE id=? AND workspace_id=? AND requester_user_id=? LIMIT 1").bind(requestId, workspaceId, userId).first<{ workspaceId: string }>();
  if (owner) return { workspaceId: owner.workspaceId, role: "owner" };
  const lawyer = await db.prepare(`SELECT r.workspace_id AS workspaceId
    FROM lawyer_requests r JOIN lawyer_profiles p ON p.id=r.lawyer_profile_id AND p.user_id=? AND p.status='public_approved' AND p.marketplace_status='public_approved'
    JOIN lawyer_access_grants g ON g.lawyer_request_id=r.id AND g.lawyer_user_id=? AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>?)
    WHERE r.id=? LIMIT 1`).bind(userId, userId, new Date().toISOString(), requestId).first<{ workspaceId: string }>();
  return lawyer ? { workspaceId: lawyer.workspaceId, role: "lawyer" } : null;
}

export const GET = withApiErrors(async function GET(_request: Request, context: Context) {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { requestId } = await context.params;
  const participant = await participantForRequest(user.id, workspace.id, requestId);
  if (!participant) return response({ code: "REQUEST_UNAVAILABLE", error: lawyerRequestMessageError("ru", "REQUEST_UNAVAILABLE") }, 404);
  const messages = await requireD1().prepare("SELECT id,author_role AS authorRole,body,created_at AS createdAt FROM lawyer_request_messages WHERE lawyer_request_id=? ORDER BY created_at ASC,id ASC LIMIT 200").bind(requestId).all();
  return response({ messages: messages.results, role: participant.role });
});

export const POST = withApiErrors(async function POST(request: Request, context: Context) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const { requestId } = await context.params;
  const parsed = await parseJsonRequest(request, lawyerRequestMessageSchema, 8_192);
  const locale = parsed.ok ? parsed.data.locale : "ru";
  if (!parsed.ok) return response({ code: "INVALID_INPUT", error: lawyerRequestMessageError(locale, "INVALID_INPUT") }, parsed.error === "payload_too_large" ? 413 : 400);
  const participant = await participantForRequest(user.id, workspace.id, requestId);
  if (!participant) return response({ code: "REQUEST_UNAVAILABLE", error: lawyerRequestMessageError(locale, "REQUEST_UNAVAILABLE") }, 404);
  const now = isoNow(); const id = crypto.randomUUID(); const db = requireD1();
  await db.batch([
    db.prepare("INSERT INTO lawyer_request_messages (id,lawyer_request_id,author_user_id,author_role,body,created_at) VALUES (?,?,?,?,?,?)").bind(id, requestId, user.id, participant.role, parsed.data.body, now),
    db.prepare("INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) VALUES (?,?,?,'lawyer_request_message',?,'lawyer_request_message_sent',?,?)").bind(crypto.randomUUID(), participant.workspaceId, user.id, id, JSON.stringify({ requestId, authorRole: participant.role }), now),
  ]);
  return response({ ok: true, message: { id, authorRole: participant.role, body: parsed.data.body, createdAt: now } }, 201);
});
