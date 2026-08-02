import { runtimeEnv } from "../document-builder/storage/runtime";

const supportCategories = new Set([
  "technical", "ai_error", "wrong_norm", "document", "ocr", "tariff",
  "lawyer", "privacy", "security", "deletion", "workspace", "feedback", "other",
]);
const supportSeverities = new Set(["low", "normal", "high", "critical"]);

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
