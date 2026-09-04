import {
  LOGOUT_PENDING_COOKIE,
  SESSION_COOKIE,
} from "./session-token";

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

/**
 * Bearer credentials are deliberately host-only. Cross-host authentication
 * must use the one-time, audience-bound handoff instead of a Domain cookie.
 */
export function sessionCookie(token: string, rememberMe = false): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${sessionTtlSeconds(rememberMe)}`;
}

/**
 * Keep the fail-closed marker for at least as long as the longest bearer.
 * SameSite=Lax intentionally mirrors juro_session: every navigation allowed
 * to carry the old bearer must also carry the marker. The __Host- prefix and
 * absence of Domain keep it bound to the current app/lawyer host.
 */
export function logoutPendingCookie(): string {
  return `${LOGOUT_PENDING_COOKIE}=1; Path=/; Secure; SameSite=Lax; Max-Age=${REMEMBERED_SESSION_TTL_SECONDS}`;
}

export function clearLogoutPendingCookie(): string {
  return `${LOGOUT_PENDING_COOKIE}=; Path=/; Secure; SameSite=Lax; Max-Age=0`;
}

export function sessionCookieUntil(
  token: string,
  expiresAt: string,
  now = new Date(),
): string {
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) {
    throw new RangeError("INVALID_SESSION_EXPIRY");
  }
  const maxAgeSeconds = Math.max(
    0,
    Math.floor((expiresAtMs - now.getTime()) / 1_000),
  );
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}
