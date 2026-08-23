import type { PlatformLocale } from "./routing";

export type LawyerRequestDecision = "accept" | "request_information" | "decline";

type DecisionRow = {
  requestId: string;
  requestStatus: string;
  workspaceId: string;
  caseId: string;
  clientUserId: string;
  grantId: string;
  caseLocale: string | null;
};

export class LawyerRequestDecisionError extends Error {
  constructor(readonly code: "DECISION_UNAVAILABLE" | "DECISION_LOCKED") {
    super(code);
    this.name = "LawyerRequestDecisionError";
  }
}

function targetStatus(decision: LawyerRequestDecision) {
  if (decision === "accept") return "accepted";
  if (decision === "request_information") return "needs_information";
  return "declined";
}

function eventAction(decision: LawyerRequestDecision) {
  if (decision === "accept") return "lawyer_request_accepted";
  if (decision === "request_information") return "lawyer_request_information_requested";
  return "lawyer_request_declined";
}

function notificationCopy(
  decision: LawyerRequestDecision,
  locale: PlatformLocale,
  message: string | undefined,
) {
  const ru = locale === "ru";
  if (decision === "accept") return {
    title: ru ? "Юрист принял заявку" : "Yurist so‘rovni qabul qildi",
    body: ru
      ? "Заявка принята. Следующие действия появятся в этом деле."
      : "So‘rov qabul qilindi. Keyingi harakatlar ushbu ishda ko‘rinadi.",
  };
  if (decision === "request_information") return {
    title: ru ? "Юрист запросил сведения" : "Yurist ma’lumot so‘radi",
    body: message ?? "",
  };
  return {
    title: ru ? "Юрист отклонил заявку" : "Yurist so‘rovni rad etdi",
    body: ru
      ? "Работа по заявке не начата; доступ юриста к материалам закрыт."
      : "So‘rov bo‘yicha ish boshlanmadi; yuristning materiallarga kirishi yopildi.",
  };
}

export async function decideLawyerRequest(input: {
  db: D1Database;
  requestId: string;
  lawyerUserId: string;
  decision: LawyerRequestDecision;
  message?: string;
  now?: Date;
}): Promise<{ status: string; messageId: string | null }> {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const row = await input.db.prepare(
    `SELECT r.id AS requestId,r.status AS requestStatus,r.workspace_id AS workspaceId,
      r.case_id AS caseId,r.requester_user_id AS clientUserId,g.id AS grantId,
      cs.locale AS caseLocale
     FROM lawyer_requests r
     JOIN lawyer_profiles p ON p.id=r.lawyer_profile_id AND p.user_id=?
       AND p.status='public_approved' AND p.marketplace_status='public_approved'
     JOIN lawyer_access_grants g ON g.lawyer_request_id=r.id AND g.case_id=r.case_id
       AND g.lawyer_user_id=? AND g.revoked_at IS NULL
       AND (g.expires_at IS NULL OR g.expires_at>?)
     JOIN cases cs ON cs.id=r.case_id AND cs.workspace_id=r.workspace_id
     WHERE r.id=? LIMIT 1`,
  ).bind(input.lawyerUserId, input.lawyerUserId, nowIso, input.requestId)
    .first<DecisionRow>();
  if (!row || !["access_granted", "needs_information"].includes(row.requestStatus)) {
    throw new LawyerRequestDecisionError("DECISION_UNAVAILABLE");
  }

  if (input.decision === "decline") {
    const downstream = await input.db.prepare(
      `SELECT
        (SELECT count(*) FROM lawyer_offers WHERE lawyer_request_id=? AND status IN ('proposed','accepted')) AS offers,
        (SELECT count(*) FROM lawyer_consultations WHERE lawyer_request_id=? AND status<>'cancelled') AS consultations,
        (SELECT count(*) FROM legal_service_proposals WHERE lawyer_request_id=?
          AND status IN ('DRAFT','PROPOSED','ACCEPTED','FUNDED')) AS serviceProposals`,
    ).bind(row.requestId, row.requestId, row.requestId).first<{
      offers: number;
      consultations: number;
      serviceProposals: number;
    }>();
    if (
      Number(downstream?.offers ?? 0) > 0
      || Number(downstream?.consultations ?? 0) > 0
      || Number(downstream?.serviceProposals ?? 0) > 0
    ) {
      throw new LawyerRequestDecisionError("DECISION_LOCKED");
    }
  }

  const status = targetStatus(input.decision);
  const action = eventAction(input.decision);
  const caseLocale: PlatformLocale = row.caseLocale === "uz" ? "uz" : "ru";
  const copy = notificationCopy(input.decision, caseLocale, input.message);
  const claimId = crypto.randomUUID();
  const messageId = input.decision === "request_information" ? crypto.randomUUID() : null;
  const auditId = crypto.randomUUID();
  const caseEventId = crypto.randomUUID();
  const notificationId = crypto.randomUUID();

  const results = await input.db.batch([
    input.db.prepare(
      `UPDATE lawyer_requests SET status=?,lawyer_decision_claim_id=?,lawyer_decision_by_user_id=?,
         lawyer_decision_at=?,updated_at=?
       WHERE id=? AND status=?
         AND EXISTS (
           SELECT 1 FROM lawyer_profiles p
           JOIN lawyer_access_grants g ON g.lawyer_request_id=lawyer_requests.id
             AND g.lawyer_user_id=p.user_id AND g.revoked_at IS NULL
             AND (g.expires_at IS NULL OR g.expires_at>?)
           WHERE p.id=lawyer_requests.lawyer_profile_id AND p.user_id=?
             AND p.status='public_approved' AND p.marketplace_status='public_approved'
         )
         AND (?<>'declined' OR (
           NOT EXISTS (SELECT 1 FROM lawyer_offers WHERE lawyer_request_id=? AND status IN ('proposed','accepted'))
           AND NOT EXISTS (SELECT 1 FROM lawyer_consultations WHERE lawyer_request_id=? AND status<>'cancelled')
           AND NOT EXISTS (SELECT 1 FROM legal_service_proposals WHERE lawyer_request_id=?
             AND status IN ('DRAFT','PROPOSED','ACCEPTED','FUNDED'))
         ))`,
    ).bind(
      status,
      claimId,
      input.lawyerUserId,
      nowIso,
      nowIso,
      row.requestId,
      row.requestStatus,
      nowIso,
      input.lawyerUserId,
      status,
      row.requestId,
      row.requestId,
      row.requestId,
    ),
    ...(messageId ? [input.db.prepare(
      `INSERT INTO lawyer_request_messages
        (id,lawyer_request_id,author_user_id,author_role,body,read_at,reply_to_message_id,created_at)
       SELECT ?,id,?,'lawyer',?,NULL,NULL,?
       FROM lawyer_requests WHERE id=? AND status=? AND lawyer_decision_claim_id=?`,
    ).bind(messageId, input.lawyerUserId, input.message ?? "", nowIso, row.requestId, status, claimId)] : []),
    ...(input.decision === "decline" ? [input.db.prepare(
      `UPDATE lawyer_access_grants SET revoked_at=?,revoke_reason='lawyer_declined'
       WHERE id=? AND revoked_at IS NULL
         AND EXISTS (SELECT 1 FROM lawyer_requests WHERE id=? AND status=? AND lawyer_decision_claim_id=?)`,
    ).bind(nowIso, row.grantId, row.requestId, status, claimId)] : []),
    input.db.prepare(
      `INSERT INTO workspace_audit_events
        (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
       SELECT ?,workspace_id,?,'lawyer_request',id,?,?,?
       FROM lawyer_requests WHERE id=? AND status=? AND lawyer_decision_claim_id=?`,
    ).bind(
      auditId,
      input.lawyerUserId,
      action,
      JSON.stringify({
        previousStatus: row.requestStatus,
        status,
        messageId,
        accessRevoked: input.decision === "decline",
      }),
      nowIso,
      row.requestId,
      status,
      claimId,
    ),
    input.db.prepare(
      `INSERT INTO case_events
        (id,case_id,actor_user_id,event_type,metadata_json,created_at)
       SELECT ?,case_id,?,?,?,?
       FROM lawyer_requests WHERE id=? AND status=? AND lawyer_decision_claim_id=?`,
    ).bind(
      caseEventId,
      input.lawyerUserId,
      action,
      JSON.stringify({ requestId: row.requestId, messageId }),
      nowIso,
      row.requestId,
      status,
      claimId,
    ),
    input.db.prepare(
      `INSERT INTO notifications
        (id,workspace_id,user_id,document_id,target_type,target_id,type,title,body,read_at,created_at)
       SELECT ?,r.workspace_id,r.requester_user_id,NULL,'lawyer_request',r.id,?,?,?,NULL,?
       FROM lawyer_requests r
       WHERE r.id=? AND r.status=? AND r.lawyer_decision_claim_id=?`,
    ).bind(
      notificationId,
      action,
      copy.title,
      copy.body,
      nowIso,
      row.requestId,
      status,
      claimId,
    ),
  ]);

  if (Number(results[0]?.meta?.changes ?? 0) !== 1) {
    throw new LawyerRequestDecisionError("DECISION_UNAVAILABLE");
  }
  return { status, messageId };
}
