type AnalyticsPayload = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

export function trackPublicEvent(event: string, payload: AnalyticsPayload = {}): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem("juro-cookie-consent") !== "analytics") return;
  } catch {
    return;
  }
  const safePayload = Object.fromEntries(
    Object.entries(payload).filter(([key, value]) =>
      !/text|content|document|email|phone|name|otp/i.test(key) &&
      ["string", "number", "boolean"].includes(typeof value),
    ),
  );
  window.dataLayer?.push({ event, ...safePayload });
}
