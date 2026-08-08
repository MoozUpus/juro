import { z } from "zod";

export const consultationBookingSchema = z.object({
  slotId: z.string().uuid(),
  caseId: z.string().uuid().optional(),
  planStepId: z.string().uuid().optional(),
  comparisonId: z.string().uuid().optional(),
  consent: z.literal(true),
  locale: z.enum(["ru", "uz"]),
}).strict().superRefine((value, context) => {
  if (value.planStepId && !value.caseId) {
    context.addIssue({
      code: "custom",
      path: ["planStepId"],
      message: "A plan step requires a case",
    });
  }
});

export type ConsultationBookingInput = z.infer<typeof consultationBookingSchema>;
