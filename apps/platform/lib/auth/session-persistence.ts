import { SESSION_COOKIE } from "./session-token";

export const STANDARD_SESSION_TTL_SECONDS = 24 * 60 * 60;
export const REMEMBERED_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export function sessionTtlSeconds(rememberMe: boolean): number {
  return rememberMe
    ? REMEMBERED_SESSION_TTL_SECONDS
    : STANDARD_SESSION_TTL_SECONDS;
}

export function sessionCookie(token: string, rememberMe = false): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${sessionTtlSeconds(rememberMe)}`;
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
