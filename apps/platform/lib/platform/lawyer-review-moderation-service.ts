import { hasLikelyPersonalData } from "./lawyer-review-moderation";

export type LawyerReviewModerationDecision = "approved" | "rejected";
export type LawyerReviewModerationStatus = "pending" | "approved" | "rejected";

type LawyerReview = {
  id: string;
  workspaceId: string;
  body: string | null;
  status: string;
};

export class LawyerReviewModerationServiceError extends Error {
  constructor(public readonly code: "REVIEW_UNAVAILABLE" | "LIKELY_PERSONAL_DATA") {
    super(code);
    this.name = "LawyerReviewModerationServiceError";
  }
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (item) => item.toString(16).padStart(2, "0")).join("");
}

/**
 * This list deliberately projects only moderation data. It is shared by the
 * legacy platform route and the isolated admin Worker so neither surface has
 * a competing query or a broader user-data projection.
 */
export async function listLawyerReviews(
  db: D1Database,
  input: { status: LawyerReviewModerationStatus; limit: number },
) {
  return db.prepare(
    `SELECT r.id,r.lawyer_request_id AS lawyerRequestId,r.workspace_id AS workspaceId,
      r.lawyer_profile_id AS lawyerProfileId,r.overall_rating AS overallRating,
      r.speed_rating AS speedRating,r.quality_rating AS qualityRating,
      r.communication_rating AS communicationRating,r.body,r.status,
      r.created_at AS createdAt,r.updated_at AS updatedAt,
      p.display_name AS lawyerName
     FROM lawyer_reviews r
     JOIN lawyer_profiles p ON p.id=r.lawyer_profile_id
     WHERE r.status=? ORDER BY r.created_at ASC,r.id ASC LIMIT ?`,
  ).bind(input.status, input.limit).all();
}

/**
 * Keep the terminal status transition, PII guard and workspace audit together
 * for both admin surfaces. The D1 moderation trigger remains the authority
 * that applies the public review state.
 */
export async function moderateLawyerReview(
  db: D1Database,
  input: {
    reviewId: string;
    moderatorUserId: string;
    decision: LawyerReviewModerationDecision;
    moderatedBody?: string;
    reason: string;
    now?: Date;
  },
): Promise<{ status: LawyerReviewModerationDecision }> {
  const review = await db.prepare(
    "SELECT id,workspace_id AS workspaceId,body,status FROM lawyer_reviews WHERE id=? LIMIT 1",
  ).bind(input.reviewId).first<LawyerReview>();
  if (!review || review.status !== "pending") {
    throw new LawyerReviewModerationServiceError("REVIEW_UNAVAILABLE");
  }
  const effectiveBody = input.moderatedBody ?? review.body;
  if (input.decision === "approved" && hasLikelyPersonalData(effectiveBody)) {
    throw new LawyerReviewModerationServiceError("LIKELY_PERSONAL_DATA");
  }
  const timestamp = input.now ?? new Date();
  if (!Number.isFinite(timestamp.getTime())) {
    throw new LawyerReviewModerationServiceError("REVIEW_UNAVAILABLE");
  }
  const now = timestamp.toISOString();
  const originalBodySha256 = await sha256(review.body ?? "");
  try {
    const writes = await db.batch([
      db.prepare(
        "INSERT INTO lawyer_review_moderation (id,review_id,moderator_user_id,decision,moderated_body,reason,original_body_sha256,created_at) VALUES (?,?,?,?,?,?,?,?)",
      ).bind(
        crypto.randomUUID(), review.id, input.moderatorUserId, input.decision,
        input.moderatedBody ?? null, input.reason, originalBodySha256, now,
      ),
      db.prepare(
        "INSERT INTO workspace_audit_events (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at) VALUES (?,?,?,'lawyer_review',?,'lawyer_review_moderated',?,?)",
      ).bind(
        crypto.randomUUID(), review.workspaceId, input.moderatorUserId, review.id,
        JSON.stringify({ decision: input.decision, originalBodySha256 }), now,
      ),
    ]);
    if (Number(writes[0]?.meta.changes ?? 0) !== 1 || Number(writes[1]?.meta.changes ?? 0) !== 1) {
      throw new LawyerReviewModerationServiceError("REVIEW_UNAVAILABLE");
    }
  } catch (error) {
    if (error instanceof LawyerReviewModerationServiceError) throw error;
    throw new LawyerReviewModerationServiceError("REVIEW_UNAVAILABLE");
  }
  return { status: input.decision };
}
