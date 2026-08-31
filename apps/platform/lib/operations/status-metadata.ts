import type { Metadata } from "next";

const applicationOrigin = "https://app.juro.uz";
const deployedStatusHostnames = new Set([
  "status.juro.uz",
  "status.staging.juro.uz",
  "status.localhost",
]);

export const STATUS_ORIGIN_HEADER = "x-juro-status-origin";

function trustedStatusOrigin(originHeader: string | null): URL | null {
  if (!originHeader?.trim()) return null;
  try {
    const parsed = new URL(originHeader.trim());
    const hostname = parsed.hostname.toLowerCase();
    const validProtocol = hostname === "status.localhost"
      ? parsed.protocol === "http:" || parsed.protocol === "https:"
      : parsed.protocol === "https:";
    if (
      !deployedStatusHostnames.has(hostname)
      || !validProtocol
      || parsed.username
      || parsed.password
      || parsed.pathname !== "/"
      || parsed.search
      || parsed.hash
    ) {
      return null;
    }
    return new URL(parsed.origin);
  } catch {
    return null;
  }
}

export function publicStatusMetadata(statusOriginHeader: string | null) {
  const metadataBase = trustedStatusOrigin(statusOriginHeader) ?? new URL(applicationOrigin);

  return {
    metadataBase,
    title: "Статус платформы",
    robots: { index: false, follow: false, nocache: true },
    icons: {
      icon: new URL("/favicon.png", metadataBase),
      shortcut: new URL("/favicon.png", metadataBase),
      apple: new URL("/apple-touch-icon.png", metadataBase),
    },
  } satisfies Metadata;
}
