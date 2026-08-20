export type LawyerWorkspaceParticipant = {
  requestId: string;
  workspaceId: string;
  caseId: string;
  clientUserId: string;
  lawyerProfileId: string;
  lawyerUserId: string;
  role: "client" | "lawyer";
};

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
      p.status AS profileStatus,p.marketplace_status AS marketplaceStatus,g.id AS grantId
     FROM lawyer_requests r
     JOIN lawyer_profiles p ON p.id=r.lawyer_profile_id
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
