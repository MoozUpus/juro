import { parseJsonRequest } from "../../../../../../lib/auth/input";
import { assertSafeWrite } from "../../../../../../lib/auth/safe-write";
import { requirePlatformStaffRequest, withPlatformStaffErrors } from "../../../../../../lib/auth/staff-http";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import { lawyerText } from "../../../../../../lib/platform/lawyer-localization";
import { assertReviewId, lawyerReviewModerationSchema } from "../../../../../../lib/platform/lawyer-review-moderation";
import { LawyerReviewModerationServiceError, moderateLawyerReview } from "../../../../../../lib/platform/lawyer-review-moderation-service";

type Context = { params: Promise<{ reviewId: string }> };

async function patchLawyerReview(request: Request, context: Context) {
  assertSafeWrite(request);
  const staff = await requirePlatformStaffRequest(request, "lawyer.reviews.moderate", { freshMfaWithinMs: 15 * 60 * 1000 });
  const parsed = await parseJsonRequest(request, lawyerReviewModerationSchema, 8_192);
  if (!parsed.ok) return Response.json({ code: "INVALID_INPUT" }, { status: 400 });
  const { reviewId: rawReviewId } = await context.params;
  let reviewId: string;
  try { reviewId = assertReviewId(rawReviewId); } catch { return Response.json({ code: "NOT_FOUND" }, { status: 404 }); }
  try {
    const result = await moderateLawyerReview(requireD1(), {
      reviewId,
      moderatorUserId: staff.userId,
      decision: parsed.data.decision,
      moderatedBody: parsed.data.moderatedBody,
      reason: parsed.data.reason,
    });
    return Response.json({ ok: true, status: result.status }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof LawyerReviewModerationServiceError && error.code === "LIKELY_PERSONAL_DATA") {
      return Response.json({
        code: error.code,
        error: lawyerText(
          parsed.data.locale,
          "Перед одобрением удалите персональные данные.",
          "Tasdiqlashdan oldin shaxsiy ma’lumotlarni olib tashlang.",
          "Remove personal data before approval.",
        ),
      }, { status: 400 });
    }
    return Response.json({ code: "REVIEW_UNAVAILABLE" }, { status: 409 });
  }
}

export const PATCH = withPlatformStaffErrors(patchLawyerReview);
