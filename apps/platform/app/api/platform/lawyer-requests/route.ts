import { parseJsonRequest } from "../../../../lib/auth/input";
import { workspaceEntitlements } from "../../../../lib/billing/entitlements";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../lib/document-builder/auth/api";
import { isoNow } from "../../../../lib/document-builder/storage/db";
import { requireD1, runtimeEnv } from "../../../../lib/document-builder/storage/runtime";
import { lawyerRequestSchema, localizedHandoffError } from "../../../../lib/platform/lawyer-request";
import { caseScenarioSteps } from "../../../../lib/platform/case-create";
import { workspaceForUser } from "../../../../lib/platform/workspace";
import { assertOperationalFeatureEnabled, operationalEnvironment, OperationalFeatureError, operationalFeatureMessage } from "../../../../lib/operations/operational-feature-flags";

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
      json_extract(r.requested_scope_json,'$.serviceCode') AS serviceCode,
      json_extract(r.requested_scope_json,'$.preferredFormat') AS preferredFormat,
      json_extract(r.requested_scope_json,'$.proposedStartsAt') AS proposedStartsAt,
      c.status AS conflictStatus,g.id AS activeGrantId,g.created_at AS grantedAt,
      (SELECT o.id FROM lawyer_offers o WHERE o.lawyer_request_id=r.id ORDER BY o.version DESC LIMIT 1) AS offerId,
      (SELECT o.status FROM lawyer_offers o WHERE o.lawyer_request_id=r.id ORDER BY o.version DESC LIMIT 1) AS offerStatus,
      (SELECT o.scope_description FROM lawyer_offers o WHERE o.lawyer_request_id=r.id ORDER BY o.version DESC LIMIT 1) AS offerScopeDescription,
      (SELECT o.price_description FROM lawyer_offers o WHERE o.lawyer_request_id=r.id ORDER BY o.version DESC LIMIT 1) AS offerPriceDescription,
      (SELECT o.duration_description FROM lawyer_offers o WHERE o.lawyer_request_id=r.id ORDER BY o.version DESC LIMIT 1) AS offerDurationDescription
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
  try {
    await assertOperationalFeatureEnabled({ db, environment: operationalEnvironment(runtimeEnv().APP_ENV), key: "lawyer_handoff" });
  } catch (error) {
    if (!(error instanceof OperationalFeatureError)) throw error;
    return response({ code: error.code, error: operationalFeatureMessage(locale) }, 503);
  }
  const entitlements = await workspaceEntitlements(db, workspace.id);
  if (!entitlements.lawyerHandoff) {
    return response({ code: "PLAN_LIMIT", error: localizedHandoffError(locale, "PLAN_LIMIT") }, 403);
  }

  const autoCreatedCase = !parsed.data.caseId;
  const caseId = parsed.data.caseId ?? crypto.randomUUID();
  if (parsed.data.caseId) {
    const caseRow = await db.prepare(
      "SELECT id FROM cases WHERE id=? AND workspace_id=? AND archived_at IS NULL LIMIT 1",
    ).bind(caseId, workspace.id).first();
    if (!caseRow) {
      return response({ code: "CASE_UNAVAILABLE", error: localizedHandoffError(locale, "CASE_UNAVAILABLE") }, 404);
    }
  }

  const lawyer = parsed.data.lawyerProfileId
    ? await db.prepare(
      `SELECT id,user_id AS userId FROM lawyer_profiles WHERE id=? AND status='public_approved'
       AND marketplace_status='public_approved' AND accepting_new_requests=1
       AND NOT EXISTS (SELECT 1 FROM lawyer_trials t WHERE t.lawyer_profile_id=lawyer_profiles.id
         AND t.ends_at<=? AND t.post_expiry_mode IN ('limit_new_requests','hide_profile')) LIMIT 1`,
    ).bind(parsed.data.lawyerProfileId, isoNow()).first<{ id: string; userId: string }>()
    : null;
  if (parsed.data.lawyerProfileId && !lawyer) {
    return response({ code: "LAWYER_UNAVAILABLE", error: localizedHandoffError(locale, "LAWYER_UNAVAILABLE") }, 404);
  }

  const now = isoNow();
  const requestId = crypto.randomUUID();
  const conflictCheckId = lawyer ? crypto.randomUUID() : null;
  const status = lawyer ? "conflict_check_pending" : "unassigned";
  const scope = { caseId, stage: "anonymized_conflict_check", lawyerProfileId: lawyer?.id ?? null };
  const automaticPlanId = autoCreatedCase ? crypto.randomUUID() : null;
  const automaticCaseTitle = locale === "ru" ? "Запрос на консультацию" : "Maslahat so‘rovi";
  const automaticPlanTitle = locale === "ru"
    ? `План: ${automaticCaseTitle}`
    : `Reja: ${automaticCaseTitle}`;
  const automaticSteps = autoCreatedCase
    ? caseScenarioSteps("other", locale).map((title, ordinal) => ({
      id: crypto.randomUUID(),
      title,
      ordinal: ordinal + 1,
      status: "not_started",
    }))
    : [];
  const automaticPlanSnapshot = JSON.stringify({
    version: 1,
    title: automaticPlanTitle,
    status: "in_progress",
    progressPercent: 0,
    steps: automaticSteps,
  });
  await db.batch([
    ...(autoCreatedCase && automaticPlanId ? [
      db.prepare(
        "INSERT INTO cases (id,workspace_id,owner_user_id,account_type,locale,title,description,legal_area,status,current_revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'open',1,?,?)",
      ).bind(
        caseId,
        workspace.id,
        user.id,
        workspace.type === "business" ? "business" : "individual",
        locale,
        automaticCaseTitle,
        parsed.data.anonymizedSummary,
        "other",
        now,
        now,
      ),
      db.prepare(
        "INSERT INTO action_plans (id,case_id,created_by_user_id,title,status,progress_percent,current_revision,created_at,updated_at) VALUES (?,?,?,?,'in_progress',0,1,?,?)",
      ).bind(automaticPlanId, caseId, user.id, automaticPlanTitle, now, now),
      ...automaticSteps.map((step) => db.prepare(
        "INSERT INTO action_plan_steps (id,plan_id,ordinal,title,status,deadline_type,revision,created_at,updated_at) VALUES (?,?,?,?,'not_started','calendar_days',1,?,?)",
      ).bind(step.id, automaticPlanId, step.ordinal, step.title, now, now)),
      db.prepare(
        "INSERT INTO action_plan_versions (id,plan_id,version,created_by_user_id,reason,snapshot_json,created_at) VALUES (?,?,1,?,'plan_created',?,?)",
      ).bind(crypto.randomUUID(), automaticPlanId, user.id, automaticPlanSnapshot, now),
      db.prepare(
        "INSERT INTO case_events (id,case_id,actor_user_id,event_type,metadata_json,created_at) VALUES (?,?,?,'case_created',?,?)",
      ).bind(
        crypto.randomUUID(),
        caseId,
        user.id,
        JSON.stringify({ legalArea: "other", source: "lawyer_handoff_intake" }),
        now,
      ),
    ] : []),
    db.prepare(
      "INSERT INTO lawyer_requests (id,workspace_id,case_id,requester_user_id,lawyer_profile_id,status,anonymized_summary,requested_scope_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ).bind(requestId, workspace.id, caseId, user.id, lawyer?.id ?? null, status, parsed.data.anonymizedSummary, JSON.stringify({
      scope: "case",
      consentVersion: "2026-07-31",
      serviceCode: parsed.data.serviceCode ?? null,
      preferredFormat: parsed.data.preferredFormat ?? null,
      proposedStartsAt: parsed.data.proposedStartsAt ?? null,
    }), now, now),
    ...(lawyer && conflictCheckId ? [db.prepare(
      "INSERT INTO conflict_checks (id,lawyer_request_id,lawyer_profile_id,status,created_at) VALUES (?,?,?,'pending',?)",
    ).bind(conflictCheckId, requestId, lawyer.id, now)] : []),
    db.prepare(
      "INSERT INTO consents (id,user_id,workspace_id,type,version,scope_json,granted_at) VALUES (?,?,?,'lawyer_handoff','2026-07-31',?,?)",
    ).bind(crypto.randomUUID(), user.id, workspace.id, JSON.stringify(scope), now),
    db.prepare(
      "INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) VALUES (?,?,?,'lawyer_request',?,'lawyer_request_created',?,?)",
    ).bind(crypto.randomUUID(), workspace.id, user.id, requestId, JSON.stringify({
      caseId,
      autoCreatedCase,
      lawyerProfileId: lawyer?.id ?? null,
      planCode: entitlements.planCode,
      serviceCode: parsed.data.serviceCode ?? null,
      preferredFormat: parsed.data.preferredFormat ?? null,
      hasProposedStart: Boolean(parsed.data.proposedStartsAt),
    }), now),
    ...(lawyer ? [db.prepare(
      `INSERT INTO notifications
        (id,workspace_id,user_id,document_id,target_type,target_id,type,title,body,read_at,created_at)
       VALUES (?,(SELECT default_workspace_id FROM user_profiles WHERE id=?),?,NULL,
         'lawyer_request',?,'lawyer_request_received',?,?,NULL,?)`,
    ).bind(
      crypto.randomUUID(),
      lawyer.userId,
      lawyer.userId,
      requestId,
      "Новая заявка клиента / Yangi mijoz so‘rovi",
      parsed.data.anonymizedSummary,
      now,
    )] : []),
  ]);

  return response({ ok: true, requestId, caseId, autoCreatedCase, status, conflictCheckRequired: Boolean(lawyer) }, 201);
});
