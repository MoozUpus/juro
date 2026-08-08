import { parseJsonRequest } from "../../../../../../lib/auth/input";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { isoNow } from "../../../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import { conflictCheckDecisionSchema, localizedHandoffError } from "../../../../../../lib/platform/lawyer-request";

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

type Context = { params: Promise<{ requestId: string }> };

export const GET = withApiErrors(async function GET(_request: Request, context: Context) {
  const user = await requireApiUser();
  const { requestId } = await context.params;
  const db = requireD1();
  const result = await db.prepare(
    `SELECT r.id,r.status,r.anonymized_summary AS anonymizedSummary,r.created_at AS createdAt,
      c.id AS conflictCheckId,c.status AS conflictStatus
     FROM lawyer_requests r
     JOIN lawyer_profiles p ON p.id=r.lawyer_profile_id AND p.user_id=? AND p.status='public_approved' AND p.marketplace_status='public_approved'
     JOIN conflict_checks c ON c.lawyer_request_id=r.id AND c.lawyer_profile_id=p.id
     WHERE r.id=? LIMIT 1`,
  ).bind(user.id, requestId).first();
  if (!result) return response({ code: "REQUEST_UNAVAILABLE", error: "Заявка недоступна / So‘rov mavjud emas." }, 404);
  // The user sees only an anonymized summary until the requester explicitly grants access.
  return response({ request: result });
});

export const POST = withApiErrors(async function POST(request: Request, context: Context) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const { requestId } = await context.params;
  const parsed = await parseJsonRequest(request, conflictCheckDecisionSchema, 1_024);
  const locale = parsed.ok ? parsed.data.locale : "ru";
  if (!parsed.ok) return response({ code: "INVALID_INPUT", error: localizedHandoffError(locale, "INVALID_INPUT") }, 400);

  const db = requireD1();
  const check = await db.prepare(
    `SELECT c.id,c.lawyer_request_id AS requestId,r.workspace_id AS workspaceId
     FROM conflict_checks c
     JOIN lawyer_requests r ON r.id=c.lawyer_request_id
     JOIN lawyer_profiles p ON p.id=c.lawyer_profile_id AND p.user_id=? AND p.status='public_approved' AND p.marketplace_status='public_approved'
     WHERE c.lawyer_request_id=? AND c.status='pending' LIMIT 1`,
  ).bind(user.id, requestId).first<{ id: string; requestId: string; workspaceId: string }>();
  if (!check) return response({ code: "REQUEST_UNAVAILABLE", error: localizedHandoffError(locale, "REQUEST_UNAVAILABLE") }, 404);

  const now = isoNow();
  const conflictStatus = parsed.data.decision === "clear" ? "clear" : "conflict";
  const requestStatus = parsed.data.decision === "clear" ? "awaiting_user_consent" : "conflict_declined";
  const result = await db.prepare(
    "UPDATE conflict_checks SET status=?,reviewed_at=?,reviewed_by_user_id=? WHERE id=? AND status='pending'",
  ).bind(conflictStatus, now, user.id, check.id).run();
  if ((result.meta.changes ?? 0) !== 1) {
    return response({ code: "REQUEST_UNAVAILABLE", error: localizedHandoffError(locale, "REQUEST_UNAVAILABLE") }, 409);
  }
  await db.batch([
    db.prepare("UPDATE lawyer_requests SET status=?,updated_at=? WHERE id=? AND status='conflict_check_pending'")
      .bind(requestStatus, now, check.requestId),
    ...(parsed.data.decision === "clear" ? [db.prepare(
      "INSERT INTO consents (id,user_id,workspace_id,type,version,scope_json,granted_at) VALUES (?,?,?,'lawyer_phone_contact_sharing','2026-08-06',?,?)",
    ).bind(
      crypto.randomUUID(),
      user.id,
      check.workspaceId,
      JSON.stringify({ requestId: check.requestId, reciprocalPhoneDisclosure: true }),
      now,
    )] : []),
    db.prepare(
      "INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) VALUES (?,?,?,'lawyer_request',?,'conflict_check_completed',?,?)",
    ).bind(crypto.randomUUID(), check.workspaceId, user.id, check.requestId, JSON.stringify({ result: conflictStatus, reciprocalPhoneDisclosure: parsed.data.decision === "clear" }), now),
  ]);
  return response({ ok: true, status: requestStatus });
});
