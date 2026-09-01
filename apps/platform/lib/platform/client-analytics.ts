import type { PlatformLocale } from "./routing";

function hasAnalyticsConsent(): boolean {
  return typeof document !== "undefined"
    && /(?:^|;\s*)juro_consent=analytics(?:;|$)/.test(document.cookie);
}

export function trackPlatformSourceOpened(locale: PlatformLocale): boolean {
  if (typeof window === "undefined" || !hasAnalyticsConsent()) return false;
  void window.fetch("/api/platform/product-events", {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
    headers: {
      "Content-Type": "application/json",
      "X-JURO-CSRF": "1",
    },
    body: JSON.stringify({ event: "source_opened", locale }),
  }).catch(() => undefined);
  return true;
}
