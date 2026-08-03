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

const legacyAiPlanStepIdSchema = z.string().regex(/^plan_ai_[0-9a-f]{32}:step:[1-9]\d{0,2}$/);

const actionPlanConfirmedChangeSchema = actionPlanStepPatchSchema.extend({
  id: z.union([z.string().uuid(), legacyAiPlanStepIdSchema]),
});

export const confirmedActionPlanPatchSchema = z.object({
  revision: z.number().int().positive(),
  changes: z.array(actionPlanConfirmedChangeSchema).min(1).max(40),
}).strict().superRefine((value, context) => {
  const ids = new Set<string>();
  for (const [index, change] of value.changes.entries()) {
    if (ids.has(change.id)) {
      context.addIssue({
        code: "custom",
        path: ["changes", index, "id"],
        message: "A step may be changed only once per confirmed plan update.",
      });
    }
    ids.add(change.id);
  }
});

export type ConfirmedActionPlanPatch = z.infer<typeof confirmedActionPlanPatchSchema>;
