import { parseJsonRequest } from "../../../../lib/auth/input";
import { workspaceEntitlements } from "../../../../lib/billing/entitlements";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { isoNow } from "../../../../lib/document-builder/storage/db";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";
import { lawyerRequestSchema, localizedHandoffError } from "../../../../lib/platform/lawyer-request";
import { workspaceForUser } from "../../../../lib/platform/workspace";

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

export const GET = withApiErrors(async function GET() {
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const db = requireD1();
  const results = await db.prepare(
    `SELECT r.id,r.case_id AS caseId,r.lawyer_profile_id AS lawyerProfileId,r.status,r.anonymized_summary AS anonymizedSummary,
      r.created_at AS createdAt,r.updated_at AS updatedAt,p.display_name AS lawyerName,
      c.status AS conflictStatus,g.id AS activeGrantId,g.created_at AS grantedAt
     FROM lawyer_requests r
     LEFT JOIN lawyer_profiles p ON p.id=r.lawyer_profile_id
     LEFT JOIN conflict_checks c ON c.lawyer_request_id=r.id
     LEFT JOIN lawyer_access_grants g ON g.lawyer_request_id=r.id AND g.revoked_at IS NULL
     WHERE r.workspace_id=? AND r.requester_user_id=?
     ORDER BY r.updated_at DESC LIMIT 100`,
  ).bind(workspace.id, user.id).all();
  return response({ requests: results.results });
});

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const workspace = await workspaceForUser(user);
  const parsed = await parseJsonRequest(request, lawyerRequestSchema, 4_096);
  const locale = parsed.ok ? parsed.data.locale : "ru";
  if (!parsed.ok) {
    return response({ code: "INVALID_INPUT", error: localizedHandoffError(locale, "INVALID_INPUT") }, parsed.error === "payload_too_large" ? 413 : 400);
  }

  const db = requireD1();
  const entitlements = await workspaceEntitlements(db, workspace.id);
  if (!entitlements.lawyerHandoff) {
    return response({ code: "PLAN_LIMIT", error: localizedHandoffError(locale, "PLAN_LIMIT") }, 403);
  }

  const caseRow = await db.prepare(
    "SELECT id FROM cases WHERE id=? AND workspace_id=? AND archived_at IS NULL LIMIT 1",
  ).bind(parsed.data.caseId, workspace.id).first();
  if (!caseRow) {
    return response({ code: "CASE_UNAVAILABLE", error: localizedHandoffError(locale, "CASE_UNAVAILABLE") }, 404);
  }

  const lawyer = parsed.data.lawyerProfileId
    ? await db.prepare(
      "SELECT id,user_id AS userId FROM lawyer_profiles WHERE id=? AND status='public_approved' LIMIT 1",
    ).bind(parsed.data.lawyerProfileId).first<{ id: string; userId: string }>()
    : null;
  if (parsed.data.lawyerProfileId && !lawyer) {
    return response({ code: "LAWYER_UNAVAILABLE", error: localizedHandoffError(locale, "LAWYER_UNAVAILABLE") }, 404);
  }

  const now = isoNow();
  const requestId = crypto.randomUUID();
  const conflictCheckId = lawyer ? crypto.randomUUID() : null;
  const status = lawyer ? "conflict_check_pending" : "unassigned";
  const scope = { caseId: parsed.data.caseId, stage: "anonymized_conflict_check", lawyerProfileId: lawyer?.id ?? null };
  await db.batch([
    db.prepare(
      "INSERT INTO lawyer_requests (id,workspace_id,case_id,requester_user_id,lawyer_profile_id,status,anonymized_summary,requested_scope_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ).bind(requestId, workspace.id, parsed.data.caseId, user.id, lawyer?.id ?? null, status, parsed.data.anonymizedSummary, JSON.stringify({ scope: "case", consentVersion: "2026-07-31" }), now, now),
    ...(lawyer && conflictCheckId ? [db.prepare(
      "INSERT INTO conflict_checks (id,lawyer_request_id,lawyer_profile_id,status,created_at) VALUES (?,?,?,'pending',?)",
    ).bind(conflictCheckId, requestId, lawyer.id, now)] : []),
    db.prepare(
      "INSERT INTO consents (id,user_id,workspace_id,type,version,scope_json,granted_at) VALUES (?,?,?,'lawyer_handoff','2026-07-31',?,?)",
    ).bind(crypto.randomUUID(), user.id, workspace.id, JSON.stringify(scope), now),
    db.prepare(
      "INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) VALUES (?,?,?,'lawyer_request',?,'lawyer_request_created',?,?)",
    ).bind(crypto.randomUUID(), workspace.id, user.id, requestId, JSON.stringify({ caseId: parsed.data.caseId, lawyerProfileId: lawyer?.id ?? null, planCode: entitlements.planCode }), now),
  ]);

  return response({ ok: true, requestId, status, conflictCheckRequired: Boolean(lawyer) }, 201);
});
