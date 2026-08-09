import { parseJsonRequest } from "../../../../../../lib/auth/input";
import { assertSafeWrite } from "../../../../../../lib/auth/safe-write";
import { requirePlatformStaffRequest, withPlatformStaffErrors } from "../../../../../../lib/auth/staff-http";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import {
  LawyerReviewReplyError,
  lawyerReviewReplyIdSchema,
  lawyerReviewReplyModerationSchema,
  localizedLawyerReviewReplyError,
  moderateLawyerReviewReply,
} from "../../../../../../lib/platform/lawyer-review-reply";

type Context = { params: Promise<{ replyId: string }> };

async function patchLawyerReviewReply(request: Request, context: Context) {
  assertSafeWrite(request);
  const staff = await requirePlatformStaffRequest(request, "lawyer.reviews.moderate", { freshMfaWithinMs: 15 * 60 * 1000 });
  const parsed = await parseJsonRequest(request, lawyerReviewReplyModerationSchema, 8_192);
  const locale = parsed.ok ? parsed.data.locale : "ru";
  if (!parsed.ok) return Response.json({ code: "INVALID_INPUT", error: localizedLawyerReviewReplyError(locale, "INVALID_INPUT") }, { status: 400 });
  const { replyId: rawReplyId } = await context.params;
  const replyId = lawyerReviewReplyIdSchema.safeParse(rawReplyId);
  if (!replyId.success) return Response.json({ code: "REPLY_UNAVAILABLE", error: localizedLawyerReviewReplyError(locale, "REPLY_UNAVAILABLE") }, { status: 404 });
  try {
    const result = await moderateLawyerReviewReply({
      db: requireD1(), moderatorUserId: staff.userId, replyId: replyId.data,
      decision: parsed.data.decision, moderatedBody: parsed.data.moderatedBody,
      reason: parsed.data.reason, now: new Date(),
    });
    return Response.json({ ok: true, result }, { headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
  } catch (error) {
    if (error instanceof LawyerReviewReplyError) {
      const status = error.code === "LIKELY_PERSONAL_DATA" ? 400 : 409;
      return Response.json({ code: error.code, error: localizedLawyerReviewReplyError(locale, error.code) }, { status });
    }
    throw error;
  }
}

export const PATCH = withPlatformStaffErrors(patchLawyerReviewReply);
