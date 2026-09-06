export const SESSION_COOKIE = "juro_session";
export const MFA_CHALLENGE_COOKIE = "juro_mfa_challenge";
export const DEVICE_CONTINUITY_COOKIE = "juro_device";
export const LOGOUT_PENDING_COOKIE = "__Host-juro_logout_pending";
const SESSION_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

function tokenFromCookie(
  raw: string | null,
  cookieName: string,
): string | null {
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name !== cookieName) continue;
    try {
      const token = decodeURIComponent(value.join("="));
      return SESSION_TOKEN_RE.test(token) ? token : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function sessionTokenFromCookie(raw: string | null): string | null {
  return tokenFromCookie(raw, SESSION_COOKIE);
}

/**
 * The marker is deliberately presence-based and fail-closed. Browser expiry
 * removes the cookie entirely; any surviving duplicate or malformed value
 * must continue to suppress the old bearer instead of being reinterpreted.
 */
export function logoutPendingFromCookie(raw: string | null): boolean {
  if (!raw) return false;
  return raw.split(";").some(part => {
    const separator = part.indexOf("=");
    const name = (separator === -1 ? part : part.slice(0, separator)).trim();
    return name === LOGOUT_PENDING_COOKIE;
  });
}

export function mfaChallengeTokenFromCookie(
  raw: string | null,
): string | null {
  return tokenFromCookie(raw, MFA_CHALLENGE_COOKIE);
}

export function deviceContinuityTokenFromCookie(
  raw: string | null,
): string | null {
  return tokenFromCookie(raw, DEVICE_CONTINUITY_COOKIE);
}
