import { parseJsonRequest } from "../../../../../lib/auth/input";
import { assertSafeWrite } from "../../../../../lib/auth/safe-write";
import { requirePlatformStaffRequest, withPlatformStaffErrors } from "../../../../../lib/auth/staff-http";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import {
  aiQualityReviewRequestSchema,
  AiQualityReviewError,
  executeAiQualityReview,
} from "../../../../../lib/ai/quality-review";

const privateHeaders = { "cache-control": "private, no-store", pragma: "no-cache" };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: privateHeaders });
}

async function postAiQuality(request: Request): Promise<Response> {
  assertSafeWrite(request);
  const staff = await requirePlatformStaffRequest(request, "ai.quality.review", {
    freshMfaWithinMs: 15 * 60 * 1_000,
  });
  const parsed = await parseJsonRequest(request, aiQualityReviewRequestSchema, 120_000);
  if (!parsed.ok) {
    return json({
      code: parsed.error === "payload_too_large" ? "PAYLOAD_TOO_LARGE" : "AI_QUALITY_REVIEW_INVALID",
    }, parsed.error === "payload_too_large" ? 413 : 400);
  }
  try {
    return json(await executeAiQualityReview({ db: requireD1(), staff, request: parsed.data }));
  } catch (error) {
    if (!(error instanceof AiQualityReviewError)) throw error;
    if (error.code === "AI_QUALITY_REVIEW_INVALID") return json({ code: error.code }, 400);
    if (error.code === "AI_QUALITY_REVIEW_NOT_FOUND") return json({ code: error.code }, 404);
    if (error.code === "AI_QUALITY_REVIEW_ACCESS_DENIED") return json({ code: error.code }, 403);
    if (error.code === "AI_QUALITY_REVIEW_STALE") return json({ code: error.code }, 409);
    return json({ code: error.code }, 409);
  }
}

export const POST = withPlatformStaffErrors(postAiQuality);
