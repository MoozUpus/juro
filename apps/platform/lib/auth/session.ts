import { headers } from "next/headers";
import { requireD1 } from "../document-builder/storage/runtime";
import { runtimeIdentityProtection } from "./identity-runtime";
import {
  DEVICE_CONTINUITY_COOKIE,
  MFA_CHALLENGE_COOKIE,
  SESSION_COOKIE,
} from "./session-token";
import {
  clearLogoutPendingCookie,
  logoutPendingCookie,
  sessionCookie,
  sessionCookieUntil,
  sharedAuthCookieDomain,
} from "./session-persistence";
import { localSessionFromCookie } from "./session-management";
import type { LocalAssuranceLevel } from "./session-management";

export {
  DEVICE_CONTINUITY_COOKIE,
  LOGOUT_PENDING_COOKIE,
  MFA_CHALLENGE_COOKIE,
  SESSION_COOKIE,
} from "./session-token";
export {
  clearLogoutPendingCookie,
  logoutPendingCookie,
  sessionCookie,
  sessionCookieUntil,
  sharedAuthCookieDomain,
};

export type SessionUser = {
  email: string;
  fullName: string | null;
  displayName: string;
  userId: string;
  sessionId: string;
  authMethod: string;
  authSource: "local_session";
  assuranceLevel: LocalAssuranceLevel;
  authenticatedAt: string | null;
  mfaVerifiedAt: string | null;
};

export async function getSessionUser(request?: Request): Promise<SessionUser | null> {
  try {
    const requestHeaders = request?.headers ?? await headers();
    const session = await localSessionFromCookie(
      requireD1(),
      requestHeaders.get("cookie"),
      { identity: runtimeIdentityProtection() },
    );
    if (!session) return null;
    return {
      email: session.email,
      fullName: session.fullName,
      displayName: session.fullName || session.email,
      userId: session.userId,
      sessionId: session.sessionId,
      authMethod: session.authMethod,
      authSource: "local_session",
      assuranceLevel: session.assuranceLevel,
      authenticatedAt: session.authenticatedAt,
      mfaVerifiedAt: session.mfaVerifiedAt,
    };
  } catch {
    return null;
  }
}

export function clearSessionCookie(domain?: string): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0${domain ? `; Domain=${domain}` : ""}`;
}

/**
 * Install a host-only bearer cookie. The parent-domain expiry removes the
 * historical shared credential so unrelated juro.uz services no longer
 * receive authentication cookies; cross-host continuity uses a one-time
 * audience-bound session handoff instead.
 */
export function replacementSessionCookies(
  token: string,
  rememberMe: boolean,
  hostname: string,
): string[] {
  const sharedDomain = sharedAuthCookieDomain(hostname);
  return [
    ...(sharedDomain ? [clearSessionCookie(sharedDomain)] : []),
    clearSessionCookie(),
    clearLogoutPendingCookie(),
    sessionCookie(token, rememberMe),
  ];
}

/**
 * Replace a rotated bearer credential without extending its persisted
 * absolute expiry. Legacy parent-domain credentials are expired first.
 */
export function replacementSessionCookiesUntil(
  token: string,
  expiresAt: string,
  hostname: string,
  now = new Date(),
): string[] {
  const sharedDomain = sharedAuthCookieDomain(hostname);
  return [
    ...(sharedDomain ? [clearSessionCookie(sharedDomain)] : []),
    clearSessionCookie(),
    clearLogoutPendingCookie(),
    sessionCookieUntil(token, expiresAt, now),
  ];
}

export function deviceContinuityCookie(
  token: string,
  maxAgeSeconds = 365 * 24 * 60 * 60,
): string {
  return `${DEVICE_CONTINUITY_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearDeviceContinuityCookie(): string {
  return `${DEVICE_CONTINUITY_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
export function mfaChallengeCookie(
  token: string,
  maxAgeSeconds = 5 * 60,
): string {
  return `${MFA_CHALLENGE_COOKIE}=${encodeURIComponent(token)}; Path=/api/auth/verify-mfa; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

export function clearMfaChallengeCookie(): string {
  return `${MFA_CHALLENGE_COOKIE}=; Path=/api/auth/verify-mfa; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
