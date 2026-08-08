import { z } from "zod";

const reviewId = z.string().uuid();
const body = z.string().trim().min(1).max(2_000);

const moderationFields = {
  decision: z.enum(["approved", "rejected"]),
  moderatedBody: z.string().trim().max(2_000).optional(),
  reason: body,
};

function validateModeratedBody(value: { decision: "approved" | "rejected"; moderatedBody?: string }, context: z.RefinementCtx) {
  if (value.decision === "approved" && value.moderatedBody !== undefined && !value.moderatedBody) {
    context.addIssue({ code: "custom", path: ["moderatedBody"], message: "Moderated body must not be empty." });
  }
}

export const lawyerReviewModerationInputSchema = z.object(moderationFields).strict().superRefine(validateModeratedBody);

export const lawyerReviewModerationSchema = z.object({
  ...moderationFields,
  locale: z.enum(["ru", "uz"]),
}).strict().superRefine(validateModeratedBody);

export const lawyerReviewModerationListSchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).default("pending"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

export function assertReviewId(value: string) {
  return reviewId.parse(value);
}

const likelyPiiPatterns = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
  /(?:\+?998|\+?7|0)?[\s().-]*\d(?:[\s().-]*\d){7,13}/u,
  /\b\d{14}\b/u,
];

export function hasLikelyPersonalData(value: string | null | undefined): boolean {
  if (!value) return false;
  return likelyPiiPatterns.some((pattern) => pattern.test(value));
}
