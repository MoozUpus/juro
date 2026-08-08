import { lawyerReviewModerationListSchema } from "../../../../../lib/platform/lawyer-review-moderation";
import { requirePlatformStaffRequest } from "../../../../../lib/auth/staff-http";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import { listLawyerReviews } from "../../../../../lib/platform/lawyer-review-moderation-service";

export async function GET(request: Request) {
  await requirePlatformStaffRequest(request, "lawyer.reviews.moderate", { freshMfaWithinMs: 15 * 60 * 1000 });
  const url = new URL(request.url);
  const parsed = lawyerReviewModerationListSchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return Response.json({ code: "INVALID_INPUT" }, { status: 400 });
  const reviews = await listLawyerReviews(requireD1(), parsed.data);
  return Response.json({ reviews: reviews.results }, { headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}
