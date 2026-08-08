import { parseJsonRequest } from "../../../../../../lib/auth/input";
import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import {
  LawyerReviewReplyError,
  lawyerReviewReplyIdSchema,
  lawyerReviewReplySubmissionSchema,
  localizedLawyerReviewReplyError,
  submitLawyerReviewReply,
} from "../../../../../../lib/platform/lawyer-review-reply";

type Context = { params: Promise<{ reviewId: string }> };

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", pragma: "no-cache" } });
}

export const POST = withApiErrors(async function POST(request: Request, context: Context) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const parsed = await parseJsonRequest(request, lawyerReviewReplySubmissionSchema, 8_192);
  const locale = parsed.ok ? parsed.data.locale : "ru";
  if (!parsed.ok) return response({ code: "INVALID_INPUT", error: localizedLawyerReviewReplyError(locale, "INVALID_INPUT") }, parsed.error === "payload_too_large" ? 413 : 400);
  const { reviewId: rawReviewId } = await context.params;
  const reviewId = lawyerReviewReplyIdSchema.safeParse(rawReviewId);
  if (!reviewId.success) return response({ code: "REVIEW_UNAVAILABLE", error: localizedLawyerReviewReplyError(locale, "REVIEW_UNAVAILABLE") }, 404);
  try {
    const reply = await submitLawyerReviewReply({
      db: requireD1(), actorUserId: user.id, reviewId: reviewId.data,
      body: parsed.data.body, clientRequestId: parsed.data.clientRequestId, now: new Date(),
    });
    return response({ ok: true, reply }, reply.replayed ? 200 : 201);
  } catch (error) {
    if (error instanceof LawyerReviewReplyError) {
      const status = error.code === "REVIEW_UNAVAILABLE" ? 404 : 409;
      return response({ code: error.code, error: localizedLawyerReviewReplyError(locale, error.code) }, status);
    }
    throw error;
  }
});
