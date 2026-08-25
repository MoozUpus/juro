import { runtimeEnv } from "../document-builder/storage/runtime";

export const productEventNames = [
  "landing_view",
  "start_scenario",
  "signup_started",
  "signup_completed",
  "first_question_sent",
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
] as const;

export type ProductEventName = (typeof productEventNames)[number];
type ProductLocale = "ru" | "uz" | "unknown";
type ProductSurface =
  | "public_site"
  | "onboarding"
  | "ai_chat"
  | "case_management"
  | "document_analysis"
  | "document_comparison"
  | "lawyer_marketplace"
  | "billing"
  | "support";
type ProductOutcome = "success" | "failure" | "partial" | "unknown";
type ProductProvider = "openai" | "anthropic" | "none";
type ProductFallback = "none" | "provider" | "retrieval";
type PublicPageKind = "landing" | "lawyers" | "video" | "legal" | "knowledge" | "other";

const productEvents = new Set<string>(productEventNames);
const productLocales = new Set(["ru", "uz", "unknown"]);
const productSurfaces = new Set([
  "public_site", "onboarding", "ai_chat", "case_management", "document_analysis",
  "document_comparison", "lawyer_marketplace", "billing", "support",
]);
const productOutcomes = new Set(["success", "failure", "partial", "unknown"]);
const productProviders = new Set(["openai", "anthropic", "none"]);
const productFallbacks = new Set(["none", "provider", "retrieval"]);
const publicEvents = new Set(["landing_view", "start_scenario", "signup_started", "lawyer_viewed"]);
const publicLocales = new Set(["ru", "uz", "en"]);
const publicPages = new Set(["landing", "lawyers", "video", "legal", "knowledge", "other"]);
const publicEventPages: Record<string, ReadonlySet<string>> = {
  landing_view: new Set(["landing"]),
  start_scenario: new Set(["landing"]),
  signup_started: publicPages,
  lawyer_viewed: new Set(["lawyers"]),
};

const supportCategories = new Set([
  "technical", "ai_error", "wrong_norm", "document", "ocr", "tariff",
  "lawyer", "privacy", "security", "deletion", "workspace", "feedback", "other",
]);
const supportSeverities = new Set(["low", "normal", "high", "critical"]);

/**
 * Content-free product telemetry. Callers can provide only bounded enum
 * dimensions and an optional coarse duration; the API deliberately has no
 * field for tenant references, route URLs, questions, filenames, or comments.
 */
export function trackProductEvent(input: {
  event: ProductEventName;
  surface: ProductSurface;
  locale?: ProductLocale;
  outcome?: ProductOutcome;
  provider?: ProductProvider;
  fallback?: ProductFallback;
  elapsedMs?: number;
}): void {
  const locale = input.locale ?? "unknown";
  const outcome = input.outcome ?? "success";
  const provider = input.provider ?? "none";
  const fallback = input.fallback ?? "none";
  if (
    !productEvents.has(input.event)
    || !productSurfaces.has(input.surface)
    || !productLocales.has(locale)
    || !productOutcomes.has(outcome)
    || !productProviders.has(provider)
    || !productFallbacks.has(fallback)
  ) return;
  const elapsedMs = Number.isSafeInteger(input.elapsedMs) && (input.elapsedMs ?? -1) >= 0
    ? Math.min(input.elapsedMs ?? 0, 3_600_000)
    : 0;
  try {
    runtimeEnv().PLATFORM_ANALYTICS?.writeDataPoint({
      blobs: [input.event, input.surface, locale, outcome, provider, fallback],
      doubles: [1, elapsedMs],
    });
  } catch {
    // Telemetry never changes the product result.
  }
}

export function trackPublicSiteEvent(input: {
  event: ProductEventName;
  locale: string;
  page: PublicPageKind;
}): boolean {
  if (
    !publicEvents.has(input.event)
    || !publicLocales.has(input.locale)
    || !publicPages.has(input.page)
    || !publicEventPages[input.event]?.has(input.page)
  ) return false;
  try {
    runtimeEnv().PLATFORM_ANALYTICS?.writeDataPoint({
      blobs: [input.event, "public_site", input.locale, "success", "none", input.page],
      doubles: [1, 0],
    });
    return true;
  } catch {
    return false;
  }
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
