import { SESSION_COOKIE } from "./session-token";

export const STANDARD_SESSION_TTL_SECONDS = 24 * 60 * 60;
export const REMEMBERED_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export function sessionTtlSeconds(rememberMe: boolean): number {
  return rememberMe
    ? REMEMBERED_SESSION_TTL_SECONDS
    : STANDARD_SESSION_TTL_SECONDS;
}

export function sharedAuthCookieDomain(hostname: string): string | undefined {
  const normalized = hostname.trim().toLowerCase().replace(/:\d+$/u, "");
  return normalized === "app.juro.uz" || normalized === "lawyer.juro.uz"
    ? ".juro.uz"
    : undefined;
}

function domainAttribute(domain?: string): string {
  return domain ? `; Domain=${domain}` : "";
}

export function sessionCookie(token: string, rememberMe = false, domain?: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${sessionTtlSeconds(rememberMe)}${domainAttribute(domain)}`;
}

export function sessionCookieUntil(
  token: string,
  expiresAt: string,
  now = new Date(),
  domain?: string,
): string {
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) {
    throw new RangeError("INVALID_SESSION_EXPIRY");
  }
  const maxAgeSeconds = Math.max(
    0,
    Math.floor((expiresAtMs - now.getTime()) / 1_000),
  );
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}${domainAttribute(domain)}`;
}
