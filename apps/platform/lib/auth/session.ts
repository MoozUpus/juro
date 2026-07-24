import { headers } from "next/headers";
import { requireD1 } from "../document-builder/storage/runtime";
import { sha256 } from "./crypto";

export const SESSION_COOKIE = "juro_session";

type SessionUser = { email: string; fullName: string | null; displayName: string };

function cookieValue(raw: string | null, key: string): string | null {
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === key) return decodeURIComponent(value.join("="));
  }
  return null;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const requestHeaders = await headers();
    const token = cookieValue(requestHeaders.get("cookie"), SESSION_COOKIE);
    if (!token || token.length < 32) return null;
    const tokenHash = await sha256(token);
    const row = await requireD1().prepare(
      `SELECT u.email, u.full_name AS fullName
       FROM auth_sessions s JOIN user_profiles u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? LIMIT 1`,
    ).bind(tokenHash, new Date().toISOString()).first<{ email: string; fullName: string | null }>();
    if (!row) return null;
    return { ...row, displayName: row.fullName || row.email };
  } catch {
    return null;
  }
}

export function sessionCookie(token: string, maxAgeSeconds = 60 * 60 * 24 * 30): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
