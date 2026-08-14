import { parseJsonRequest } from "../../../../../../lib/auth/input";
import { assertSafeWrite } from "../../../../../../lib/auth/safe-write";
import { requirePlatformStaffRequest, withPlatformStaffErrors } from "../../../../../../lib/auth/staff-http";
import { requireD1 } from "../../../../../../lib/document-builder/storage/runtime";
import { executeLegalEvaluationHumanReview, legalEvaluationHumanReviewRequestSchema, LegalEvaluationHumanReviewError } from "../../../../../../lib/ai/legal-evaluation-human-review";

const headers = { "cache-control": "private, no-store", pragma: "no-cache" };

async function post(request: Request): Promise<Response> {
  assertSafeWrite(request);
  const staff = await requirePlatformStaffRequest(request, "ai.quality.review", { freshMfaWithinMs: 15 * 60 * 1_000 });
  const parsed = await parseJsonRequest(request, legalEvaluationHumanReviewRequestSchema, 12_000);
  if (!parsed.ok) return Response.json({ code: "LEGAL_EVALUATION_HUMAN_REVIEW_INVALID" }, { status: 400, headers });
  try {
    return Response.json(await executeLegalEvaluationHumanReview({ db: requireD1(), staff, request: parsed.data }), { headers });
  } catch (error) {
    if (error instanceof LegalEvaluationHumanReviewError) return Response.json({ code: error.code }, { status: error.code === "LEGAL_EVALUATION_HUMAN_REVIEW_INCOMPLETE" ? 409 : 400, headers });
    throw error;
  }
}

export const POST = withPlatformStaffErrors(post);
