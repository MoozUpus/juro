export const ANALYTICS_CONSENT_STORAGE_KEY = "juro-cookie-consent";
export const ANALYTICS_CONSENT_COOKIE = "juro_consent";
export const ANALYTICS_CONSENT_CHANGED_EVENT = "juro:analytics-consent-changed";
export const ANALYTICS_CONSENT_SETTINGS_EVENT = "juro:analytics-consent-settings";

export type AnalyticsConsent = "essential" | "analytics";
export type PublicAnalyticsEvent =
  | "landing_view"
  | "start_scenario"
  | "source_opened"
  | "lawyer_viewed";
export type PublicAnalyticsLocale = "ru" | "uz" | "en";
export type PublicAnalyticsAccountType =
  | "individual"
  | "business"
  | "entrepreneur"
  | "lawyer"
  | "guest";

type PublicAnalyticsPayload = {
  locale: PublicAnalyticsLocale;
  accountType: PublicAnalyticsAccountType;
};

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

function parseConsent(value: string | null): AnalyticsConsent | null {
  return value === "essential" || value === "analytics" ? value : null;
}

function readConsentCookie(): AnalyticsConsent | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)juro_consent=(essential|analytics)(?:;|$)/);
  return parseConsent(match?.[1] ?? null);
}

function writeConsentCookie(value: AnalyticsConsent): void {
  const hostname = window.location.hostname.toLowerCase();
  const shared = hostname === "juro.uz" || hostname.endsWith(".juro.uz");
  document.cookie = `${ANALYTICS_CONSENT_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${shared ? "; Domain=.juro.uz; Secure" : ""}`;
}

export function readAnalyticsConsent(): AnalyticsConsent | null {
  if (typeof window === "undefined") return null;
  const cookieConsent = readConsentCookie();
  if (cookieConsent) {
    try {
      window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, cookieConsent);
    } catch {
      // The shared first-party cookie remains authoritative when storage is unavailable.
    }
    return cookieConsent;
  }
  try {
    const storedConsent = parseConsent(window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY));
    if (storedConsent) writeConsentCookie(storedConsent);
    return storedConsent;
  } catch {
    return null;
  }
}

export function writeAnalyticsConsent(value: AnalyticsConsent): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, value);
  } catch {
    // Consent is still persisted in the first-party cookie below.
  }
  writeConsentCookie(value);
  window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_CHANGED_EVENT, { detail: value }));
}

export function openAnalyticsConsentSettings(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ANALYTICS_CONSENT_SETTINGS_EVENT));
}

export function trackPublicEvent(
  event: PublicAnalyticsEvent,
  payload: PublicAnalyticsPayload,
): boolean {
  if (typeof window === "undefined" || readAnalyticsConsent() !== "analytics") return false;

  const body = JSON.stringify({ event, ...payload });
  window.dataLayer?.push({ event, ...payload });
  void window.fetch("/_juro/product-event", {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
    headers: {
      "Content-Type": "application/json",
      "X-JURO-Analytics-Consent": "analytics",
    },
    body,
  }).catch(() => undefined);
  return true;
}
