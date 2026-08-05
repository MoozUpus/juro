import {
  normalizePhoneForLookup,
  userIdentityById,
  type IdentityProtectionContext,
} from "../auth/identity-protection";

export type LawyerPhoneContactErrorCode =
  | "REQUEST_UNAVAILABLE"
  | "PHONE_UNAVAILABLE"
  | "IDENTITY_UNAVAILABLE";

export class LawyerPhoneContactError extends Error {
  constructor(
    readonly code: LawyerPhoneContactErrorCode,
    readonly status: number,
  ) {
    super(code);
    this.name = "LawyerPhoneContactError";
  }
}

type ParticipantRow = {
  workspaceId: string;
  requesterUserId: string;
  lawyerUserId: string;
  actorRole: "owner" | "lawyer";
};

export async function revealLawyerRequestPhone(input: {
  db: D1Database;
  identity: IdentityProtectionContext;
  requestId: string;
  userId: string;
  activeWorkspaceId: string;
}): Promise<{
  display: string;
  href: string;
  counterpartRole: "owner" | "lawyer";
}> {
  const now = new Date().toISOString();
  const participant = await input.db.prepare(
    `SELECT r.workspace_id AS workspaceId,r.requester_user_id AS requesterUserId,
       p.user_id AS lawyerUserId,
       CASE
         WHEN r.requester_user_id=? AND r.workspace_id=? THEN 'owner'
         WHEN p.user_id=? THEN 'lawyer'
       END AS actorRole
     FROM lawyer_requests r
     JOIN lawyer_profiles p ON p.id=r.lawyer_profile_id AND p.status='public_approved'
     JOIN lawyer_access_grants g ON g.lawyer_request_id=r.id
       AND g.lawyer_user_id=p.user_id
       AND g.revoked_at IS NULL
       AND (g.expires_at IS NULL OR g.expires_at>?)
     WHERE r.id=?
       AND EXISTS (
         SELECT 1 FROM consents owner_consent
         WHERE owner_consent.user_id=r.requester_user_id
           AND owner_consent.workspace_id=r.workspace_id
           AND owner_consent.type='lawyer_case_access'
           AND owner_consent.revoked_at IS NULL
           AND json_extract(owner_consent.scope_json,'$.requestId')=r.id
           AND json_extract(owner_consent.scope_json,'$.reciprocalPhoneDisclosure')=1
       )
       AND EXISTS (
         SELECT 1 FROM consents lawyer_consent
         WHERE lawyer_consent.user_id=p.user_id
           AND lawyer_consent.workspace_id=r.workspace_id
           AND lawyer_consent.type='lawyer_phone_contact_sharing'
           AND lawyer_consent.revoked_at IS NULL
           AND json_extract(lawyer_consent.scope_json,'$.requestId')=r.id
           AND json_extract(lawyer_consent.scope_json,'$.reciprocalPhoneDisclosure')=1
       )
       AND (
       (r.requester_user_id=? AND r.workspace_id=?)
       OR (p.user_id=? AND g.lawyer_user_id=?)
     ) LIMIT 1`,
  ).bind(
    input.userId,
    input.activeWorkspaceId,
    input.userId,
    now,
    input.requestId,
    input.userId,
    input.activeWorkspaceId,
    input.userId,
    input.userId,
  ).first<ParticipantRow>();
  if (!participant?.actorRole) {
    throw new LawyerPhoneContactError("REQUEST_UNAVAILABLE", 404);
  }

  const counterpartRole = participant.actorRole === "owner" ? "lawyer" : "owner";
  const counterpartUserId = participant.actorRole === "owner"
    ? participant.lawyerUserId
    : participant.requesterUserId;
  let phone: string | null;
  try {
    phone = (await userIdentityById(input.db, input.identity, counterpartUserId))?.phone ?? null;
  } catch {
    throw new LawyerPhoneContactError("IDENTITY_UNAVAILABLE", 503);
  }
  if (!phone) {
    throw new LawyerPhoneContactError("PHONE_UNAVAILABLE", 409);
  }
  const normalized = normalizePhoneForLookup(phone);
  if (!/^\+[1-9]\d{7,14}$/u.test(normalized)) {
    throw new LawyerPhoneContactError("PHONE_UNAVAILABLE", 409);
  }

  await input.db.prepare(
    `INSERT INTO workspace_audit_events
     (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
     VALUES (?,?,?,'lawyer_request_contact',?,'lawyer_phone_contact_revealed',?,?)`,
  ).bind(
    crypto.randomUUID(),
    participant.workspaceId,
    input.userId,
    input.requestId,
    JSON.stringify({ actorRole: participant.actorRole, counterpartRole }),
    now,
  ).run();

  return { display: phone.trim(), href: `tel:${normalized}`, counterpartRole };
}
