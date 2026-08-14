export type LawyerTrustDesignation = "juro_approval" | "top_lawyer";
export type LawyerTrustDecision = "approved" | "revoked";

export class LawyerProfileDesignationError extends Error {
  constructor(readonly code: "PROFILE_UNAVAILABLE" | "PROFILE_NOT_PUBLISHED" | "DESIGNATION_STATE_CONFLICT") {
    super(code);
  }
}

type PublishedProfile = {
  id: string;
  workspaceId: string | null;
  juroApprovalStatus: string;
  topLawyerStatus: string;
};

/**
 * A trust designation is intentionally not part of marketplace publication:
 * each decision has its own immutable operational and workspace audit event.
 */
export async function designateLawyerProfile(input: {
  db: D1Database;
  profileId: string;
  moderatorUserId: string;
  designation: LawyerTrustDesignation;
  decision: LawyerTrustDecision;
  reason: string;
  criteria?: string | null;
  now?: string;
}): Promise<{ juroApprovalStatus: "approved" | "not_approved"; topLawyerStatus: "featured" | "not_featured" }> {
  const profile = await input.db.prepare(`
    SELECT p.id,u.default_workspace_id AS workspaceId,
      p.juro_approval_status AS juroApprovalStatus,p.top_lawyer_status AS topLawyerStatus
    FROM lawyer_profiles p
    JOIN user_profiles u ON u.id=p.user_id
    WHERE p.id=? AND p.status='public_approved' AND p.marketplace_status='public_approved'
      AND p.public_approved_at IS NOT NULL
    LIMIT 1
  `).bind(input.profileId).first<PublishedProfile>();
  if (!profile?.workspaceId) throw new LawyerProfileDesignationError("PROFILE_NOT_PUBLISHED");

  const current = input.designation === "juro_approval"
    ? profile.juroApprovalStatus === "approved"
    : profile.topLawyerStatus === "featured";
  const requested = input.decision === "approved";
  if (current === requested) throw new LawyerProfileDesignationError("DESIGNATION_STATE_CONFLICT");

  const now = input.now ?? new Date().toISOString();
  const designationId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const criteria = input.designation === "top_lawyer" && input.decision === "approved"
    ? input.criteria?.trim() ?? null
    : null;
  if (input.designation === "top_lawyer" && input.decision === "approved" && (!criteria || criteria.length < 20)) {
    throw new LawyerProfileDesignationError("PROFILE_UNAVAILABLE");
  }
  const nextJuro = input.designation === "juro_approval" && requested ? "approved" : input.designation === "juro_approval" ? "not_approved" : profile.juroApprovalStatus;
  const nextTop = input.designation === "top_lawyer" && requested ? "featured" : input.designation === "top_lawyer" ? "not_featured" : profile.topLawyerStatus;
  const result = await input.db.batch([
    input.db.prepare(`
      INSERT INTO lawyer_profile_trust_designations
        (id,lawyer_profile_id,moderator_user_id,designation,decision,reason,criteria,created_at)
      VALUES (?,?,?,?,?,?,?,?)
    `).bind(designationId, profile.id, input.moderatorUserId, input.designation, input.decision, input.reason, criteria, now),
    input.db.prepare(`
      INSERT INTO workspace_audit_events
        (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
      VALUES (?,?,?,'lawyer_profile',?,'lawyer_profile_trust_designation',?,?)
    `).bind(
      auditId, profile.workspaceId, input.moderatorUserId, profile.id,
      JSON.stringify({ designation: input.designation, decision: input.decision, reason: input.reason, criteria, designationId }), now,
    ),
    input.db.prepare(`
      UPDATE lawyer_profiles
      SET juro_approval_status=?,
          juro_approved_at=CASE WHEN ?='approved' THEN ? WHEN ?='juro_approval' THEN NULL ELSE juro_approved_at END,
          juro_approved_by_user_id=CASE WHEN ?='approved' THEN ? WHEN ?='juro_approval' THEN NULL ELSE juro_approved_by_user_id END,
          top_lawyer_status=?,
          top_lawyer_criteria=CASE WHEN ?='featured' THEN ? WHEN ?='top_lawyer' THEN NULL ELSE top_lawyer_criteria END,
          top_lawyer_at=CASE WHEN ?='featured' THEN ? WHEN ?='top_lawyer' THEN NULL ELSE top_lawyer_at END,
          updated_at=?
      WHERE id=? AND status='public_approved' AND marketplace_status='public_approved'
        AND public_approved_at IS NOT NULL
        AND juro_approval_status=? AND top_lawyer_status=?
    `).bind(
      nextJuro, nextJuro, now, input.designation, nextJuro, input.moderatorUserId, input.designation,
      nextTop, nextTop, criteria, input.designation, nextTop, now, input.designation,
      now, profile.id, profile.juroApprovalStatus, profile.topLawyerStatus,
    ),
  ]);
  if (Number(result[2]?.meta.changes ?? 0) !== 1) throw new LawyerProfileDesignationError("DESIGNATION_STATE_CONFLICT");
  return {
    juroApprovalStatus: nextJuro === "approved" ? "approved" : "not_approved",
    topLawyerStatus: nextTop === "featured" ? "featured" : "not_featured",
  };
}
