import { z } from "zod";

export const optionalEmailPreferenceKeys = [
  "marketing_email",
  "weekly_case_summary",
  "unfinished_document",
  "comments",
  "lawyer_request_updates",
] as const;

export type OptionalEmailPreferenceKey = typeof optionalEmailPreferenceKeys[number];

export const notificationPreferencesSchema = z.object({
  preferences: z.object({
    marketing_email: z.boolean(),
    weekly_case_summary: z.boolean(),
    unfinished_document: z.boolean(),
    comments: z.boolean(),
    lawyer_request_updates: z.boolean(),
  }).strict(),
}).strict();

