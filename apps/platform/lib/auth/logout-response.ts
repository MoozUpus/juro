import {
  clearMfaChallengeCookie,
  clearSessionCookie,
} from "./session";
import {
  clearLogoutPendingCookie,
  sharedAuthCookieDomain,
} from "./session-persistence";

/**
 * Browser-side logout must succeed even when D1 cannot confirm revocation.
 * Keep the cookie expiry response independent from every database operation.
 */
export function logoutResponseHeaders(requestUrl: string | URL): Headers {
  const url = typeof requestUrl === "string" ? new URL(requestUrl) : requestUrl;
  const headers = new Headers({
    "cache-control": "private, no-store, max-age=0",
    pragma: "no-cache",
    "clear-site-data": '"cache"',
  });
  headers.append("set-cookie", clearSessionCookie());
  const sharedDomain = sharedAuthCookieDomain(url.hostname);
  if (sharedDomain) {
    headers.append("set-cookie", clearSessionCookie(sharedDomain));
  }
  headers.append("set-cookie", clearMfaChallengeCookie());
  headers.append("set-cookie", clearLogoutPendingCookie());
  return headers;
}
