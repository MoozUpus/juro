export const SESSION_COOKIE = "juro_session";
const SESSION_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function sessionTokenFromCookie(raw: string | null): string | null {
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name !== SESSION_COOKIE) continue;
    try {
      const token = decodeURIComponent(value.join("="));
      return SESSION_TOKEN_RE.test(token) ? token : null;
    } catch {
      return null;
    }
  }
  return null;
}
