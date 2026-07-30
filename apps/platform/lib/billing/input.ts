import { z } from "zod";

export const billingPlanSelectionSchema = z.object({
  planCode: z.enum(["individual", "business", "legal_team"]),
  locale: z.enum(["ru", "uz"]),
}).strict();
