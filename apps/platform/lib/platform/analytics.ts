import { z } from "zod";
import { runtimeEnv } from "../document-builder/storage/runtime";

const supportCategories = new Set([
  "technical", "ai_error", "wrong_norm", "document", "ocr", "tariff",
  "lawyer", "privacy", "security", "deletion", "workspace", "feedback", "other",
]);
const supportSeverities = new Set(["low", "normal", "high", "critical"]);

export const productEventNameSchema = z.enum([
  "landing_view",
  "start_scenario",
  "signup_started",
  "signup_completed",
  "first_question_sent",
  "first_legal_answer_completed",
  "clarification_completed",
  "source_opened",
  "plan_created",
  "case_created",
  "document_uploaded",
  "document_analyzed",
  "document_compared",
  "lawyer_viewed",
  "lawyer_request_created",
  "lawyer_request_accepted",
  "consultation_scheduled",
  "paid_action_started",
  "AI_error",
  "retrieval_fallback",
  "source_not_found",
  "feedback_submitted",
]);

const productEventReasonSchema = z.enum([
  "none",
  "direct",
  "marketplace",
  "helpful",
  "not_helpful",
  "wrong_norm",
  "broken_link",
  "outdated",
  "incomplete",
  "language",
  "unsafe",
  "ignored_facts",
]);

export const productEventSchema = z.object({
  event: productEventNameSchema,
  surface: z.enum(["website", "platform"]),
  locale: z.enum(["ru", "uz", "en", "unknown"]),
  accountType: z.enum([
    "individual",
    "business",
    "entrepreneur",
    "lawyer",
    "staff",
    "guest",
    "unknown",
  ]),
  outcome: z.enum(["started", "completed", "failed"]),
  reason: productEventReasonSchema.optional().default("none"),
  durationMs: z.number().int().min(0).max(1_800_000).optional().default(0),
}).strict();

export type ProductEventInput = z.input<typeof productEventSchema>;

export const PRODUCT_EVENT_SCHEMA_VERSION = "product_event_v1";

/**
 * Fixed Analytics Engine row layout:
 * blob1 schema version, blob2 event, blob3 surface, blob4 locale,
 * blob5 account type, blob6 outcome, blob7 allowlisted reason;
 * double1 count, double2 bounded duration in milliseconds.
 *
 * There is intentionally no sampling index: user, workspace, request, case,
 * document, conversation, URL, IP, or stable pseudonymous identifiers are
 * forbidden from this dataset.
 */
export function writeProductEvent(
  dataset: AnalyticsEngineDataset | undefined,
  input: unknown,
): boolean {
  const parsed = productEventSchema.safeParse(input);
  if (!dataset || !parsed.success) return false;
  try {
    const value = parsed.data;
    dataset.writeDataPoint({
      blobs: [
        PRODUCT_EVENT_SCHEMA_VERSION,
        value.event,
        value.surface,
        value.locale,
        value.accountType,
        value.outcome,
        value.reason,
      ],
      doubles: [1, value.durationMs],
    });
    return true;
  } catch {
    return false;
  }
}

export function trackProductEvent(input: ProductEventInput): boolean {
  return writeProductEvent(runtimeEnv().PRODUCT_ANALYTICS, input);
}

/**
 * Privacy boundary for product metrics. Never add user IDs, workspace IDs,
 * request URLs, free text, document metadata, or provider payloads here.
 */
export function trackSupportTicketCreated(input: {
  category: string;
  severity: string;
  locale: "ru" | "uz";
}): void {
  if (!supportCategories.has(input.category) || !supportSeverities.has(input.severity)) return;
  try {
    runtimeEnv().PLATFORM_ANALYTICS?.writeDataPoint({
      blobs: ["user_support_ticket_created", input.category, input.severity, input.locale],
      doubles: [1],
    });
  } catch {
    // Metrics must never affect the durable support workflow.
  }
}
