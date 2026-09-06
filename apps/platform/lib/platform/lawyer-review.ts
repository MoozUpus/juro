import { z } from "zod";
export const lawyerReviewSchema = z.object({ overallRating: z.number().int().min(1).max(5), speedRating: z.number().int().min(1).max(5), qualityRating: z.number().int().min(1).max(5), communicationRating: z.number().int().min(1).max(5), body: z.string().trim().max(2_000).optional(), locale: z.enum(["ru", "uz", "en"]) }).strict();
