import { lawyerReviewModerationListSchema } from "../../../../../lib/platform/lawyer-review-moderation";
import { requirePlatformStaffRequest } from "../../../../../lib/auth/staff-http";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";

export async function GET(request: Request) {
  await requirePlatformStaffRequest(request, "lawyer.reviews.moderate", { freshMfaWithinMs: 15 * 60 * 1000 });
  const url = new URL(request.url);
  const parsed = lawyerReviewModerationListSchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return Response.json({ code: "INVALID_INPUT" }, { status: 400 });
  const reviews = await requireD1().prepare(
    `SELECT r.id,r.lawyer_request_id AS lawyerRequestId,r.workspace_id AS workspaceId,
      r.lawyer_profile_id AS lawyerProfileId,r.overall_rating AS overallRating,
      r.speed_rating AS speedRating,r.quality_rating AS qualityRating,
      r.communication_rating AS communicationRating,r.body,r.status,
      r.created_at AS createdAt,r.updated_at AS updatedAt,
      p.display_name AS lawyerName
     FROM lawyer_reviews r
     JOIN lawyer_profiles p ON p.id=r.lawyer_profile_id
     WHERE r.status=? ORDER BY r.created_at ASC,r.id ASC LIMIT ?`,
  ).bind(parsed.data.status, parsed.data.limit).all();
  return Response.json({ reviews: reviews.results }, { headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}