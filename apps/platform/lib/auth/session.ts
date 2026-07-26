import { headers } from "next/headers";
import { requireD1 } from "../document-builder/storage/runtime";
import { sha256 } from "./crypto";
import {
  SESSION_COOKIE,
  sessionTokenFromCookie,
} from "./session-token";

export { SESSION_COOKIE } from "./session-token";

type SessionUser = { email: string; fullName: string | null; displayName: string };

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const requestHeaders = await headers();
    const token = sessionTokenFromCookie(requestHeaders.get("cookie"));
    if (!token) return null;
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
