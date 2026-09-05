import type { PlatformLocale } from "./routing";

export type LawyerWorkspaceParticipant = {
  requestId: string;
  workspaceId: string;
  caseId: string;
  clientUserId: string;
  lawyerProfileId: string;
  lawyerUserId: string;
  clientLocale: PlatformLocale;
  lawyerLocale: PlatformLocale;
  role: "client" | "lawyer";
};

export type LawyerMessageAttachmentRecipientRole = "client" | "lawyer";

type ParticipantRow = Omit<LawyerWorkspaceParticipant, "role"> & {
  profileStatus: string;
  marketplaceStatus: string;
  grantId: string;
};

/**
 * Resolves a current handoff participant only while the case grant is active.
 * The requester workspace is deliberately returned from the server record; a
 * lawyer's own default workspace must never be trusted for client case access.
 */
export async function activeLawyerWorkspaceParticipant(
  db: D1Database,
  userId: string,
  requestId: string,
  now = new Date().toISOString(),
): Promise<LawyerWorkspaceParticipant | null> {
  const row = await db.prepare(
    `SELECT r.id AS requestId,r.workspace_id AS workspaceId,r.case_id AS caseId,
      r.requester_user_id AS clientUserId,p.id AS lawyerProfileId,p.user_id AS lawyerUserId,
      CASE client.locale WHEN 'uz' THEN 'uz' WHEN 'en' THEN 'en' ELSE 'ru' END AS clientLocale,
      CASE lawyer.locale WHEN 'uz' THEN 'uz' WHEN 'en' THEN 'en' ELSE 'ru' END AS lawyerLocale,
      p.status AS profileStatus,p.marketplace_status AS marketplaceStatus,g.id AS grantId
     FROM lawyer_requests r
     JOIN lawyer_profiles p ON p.id=r.lawyer_profile_id
     JOIN user_profiles client ON client.id=r.requester_user_id
     JOIN user_profiles lawyer ON lawyer.id=p.user_id
     JOIN lawyer_access_grants g ON g.lawyer_request_id=r.id AND g.case_id=r.case_id
       AND g.lawyer_user_id=p.user_id AND g.revoked_at IS NULL
       AND (g.expires_at IS NULL OR g.expires_at>?)
     WHERE r.id=? AND (r.requester_user_id=? OR p.user_id=?) LIMIT 1`,
  ).bind(now, requestId, userId, userId).first<ParticipantRow>();
  if (!row) return null;
  const role = row.clientUserId === userId
    ? "client"
    : row.lawyerUserId === userId && row.profileStatus === "public_approved" && row.marketplaceStatus === "public_approved"
      ? "lawyer"
      : null;
  return role ? {
    requestId: row.requestId,
    workspaceId: row.workspaceId,
    caseId: row.caseId,
    clientUserId: row.clientUserId,
    lawyerProfileId: row.lawyerProfileId,
    lawyerUserId: row.lawyerUserId,
    clientLocale: row.clientLocale,
    lawyerLocale: row.lawyerLocale,
    role,
  } : null;
}

export async function hasActiveLawyerDocumentGrant(
  db: D1Database,
  input: {
    caseId: string;
    workspaceId: string;
    ownerUserId: string;
    lawyerUserId: string;
    now?: string;
  },
): Promise<boolean> {
  const row = await db.prepare(
    `SELECT g.id FROM lawyer_access_grants g
     JOIN lawyer_requests r ON r.id=g.lawyer_request_id AND r.case_id=? AND r.workspace_id=? AND r.requester_user_id=?
     JOIN lawyer_profiles p ON p.id=r.lawyer_profile_id AND p.user_id=?
       AND p.status='public_approved' AND p.marketplace_status='public_approved'
     WHERE g.case_id=? AND g.lawyer_user_id=? AND g.revoked_at IS NULL
       AND (g.expires_at IS NULL OR g.expires_at>?) LIMIT 1`,
  ).bind(input.caseId, input.workspaceId, input.ownerUserId, input.lawyerUserId, input.caseId, input.lawyerUserId, input.now ?? new Date().toISOString()).first<{ id: string }>();
  return Boolean(row);
}

/**
 * Resolves access created by an explicit document attachment in a two-party
 * lawyer request. Client access to a lawyer-delivered result persists as part
 * of the request record. Lawyer access to a client document remains contingent
 * on the current approved profile and active case grant.
 */
export async function lawyerMessageAttachmentRecipientRole(
  db: D1Database,
  input: {
    documentId: string;
    recipientUserId: string;
    now?: string;
  },
): Promise<LawyerMessageAttachmentRecipientRole | null> {
  const row = await db.prepare(
    `SELECT r.requester_user_id AS clientUserId,p.user_id AS lawyerUserId,
      p.status AS profileStatus,p.marketplace_status AS marketplaceStatus,
      a.shared_by_user_id AS sharedByUserId,a.recipient_user_id AS recipientUserId,
      g.id AS grantId
     FROM lawyer_request_message_attachments a
     JOIN lawyer_request_messages m ON m.id=a.message_id AND m.lawyer_request_id=a.lawyer_request_id
     JOIN lawyer_requests r ON r.id=a.lawyer_request_id
     JOIN lawyer_profiles p ON p.id=r.lawyer_profile_id
     LEFT JOIN lawyer_access_grants g ON g.lawyer_request_id=r.id AND g.case_id=r.case_id
       AND g.lawyer_user_id=p.user_id AND g.revoked_at IS NULL
       AND (g.expires_at IS NULL OR g.expires_at>?)
     WHERE a.document_id=? AND a.recipient_user_id=?
     ORDER BY a.created_at DESC,a.id DESC LIMIT 1`,
  ).bind(
    input.now ?? new Date().toISOString(),
    input.documentId,
    input.recipientUserId,
  ).first<{
    clientUserId: string;
    lawyerUserId: string;
    profileStatus: string;
    marketplaceStatus: string;
    sharedByUserId: string;
    recipientUserId: string;
    grantId: string | null;
  }>();
  if (!row || row.recipientUserId !== input.recipientUserId) return null;
  if (
    row.clientUserId === input.recipientUserId
    && row.sharedByUserId === row.lawyerUserId
  ) return "client";
  if (
    row.lawyerUserId === input.recipientUserId
    && row.sharedByUserId === row.clientUserId
    && row.grantId
    && row.profileStatus === "public_approved"
    && row.marketplaceStatus === "public_approved"
  ) return "lawyer";
  return null;
}
