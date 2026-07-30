import { z } from "zod";

export const actionPlanStepStatuses = [
  "not_started",
  "in_progress",
  "waiting_user",
  "waiting_response",
  "overdue",
  "completed",
  "cancelled",
] as const;

const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
  (value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
      && date.getUTCMonth() === month - 1
      && date.getUTCDate() === day;
  },
  "Invalid calendar date",
);

export const actionPlanStepPatchSchema = z.object({
  status: z.enum(actionPlanStepStatuses),
  revision: z.number().int().positive(),
  dueAt: z.union([calendarDateSchema, z.null()]),
}).strict();

export type ActionPlanStepPatch = z.infer<typeof actionPlanStepPatchSchema>;
