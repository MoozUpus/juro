export const publicEventNames = [
  "landing_view",
  "start_scenario",
  "signup_started",
  "lawyer_viewed",
] as const;

export type PublicEventName = (typeof publicEventNames)[number];
export type PublicAnalyticsLocale = "ru" | "uz" | "en";
export type PublicPageKind = "landing" | "lawyers" | "video" | "legal" | "knowledge" | "other";

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

const eventNames = new Set<string>(publicEventNames);
const locales = new Set(["ru", "uz", "en"]);
const pages = new Set(["landing", "lawyers", "video", "legal", "knowledge", "other"]);

function collectionOrigin(hostname: string): string | null {
  if (hostname === "juro.uz" || hostname === "www.juro.uz") return "https://app.juro.uz";
  if (hostname === "staging.juro.uz" || hostname === "www.staging.juro.uz") return "https://app.staging.juro.uz";
  return null;
}

/** Consent-gated aggregate events only: no route, query, content, contact, or device fields. */
export function trackPublicEvent(input: {
  event: PublicEventName;
  locale: PublicAnalyticsLocale;
  page: PublicPageKind;
}): void {
  if (typeof window === "undefined") return;
  if (!eventNames.has(input.event) || !locales.has(input.locale) || !pages.has(input.page)) return;
  try {
    if (window.localStorage.getItem("juro-cookie-consent") !== "analytics") return;
  } catch {
    return;
  }
  const payload = { event: input.event, locale: input.locale, page: input.page };
  window.dataLayer ??= [];
  window.dataLayer.push(payload);
  const origin = collectionOrigin(window.location.hostname);
  if (!origin) return;
  void fetch(`${origin}/api/public/analytics`, {
    method: "POST",
    mode: "no-cors",
    credentials: "omit",
    keepalive: true,
    headers: { "content-type": "text/plain;charset=UTF-8" },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}
