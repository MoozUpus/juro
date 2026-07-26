import { headers } from "next/headers";
import { requireD1 } from "../document-builder/storage/runtime";
import {
  SESSION_COOKIE,
} from "./session-token";
import { localSessionFromCookie } from "./session-management";
import type { LocalAssuranceLevel } from "./session-management";

export { SESSION_COOKIE } from "./session-token";

export type SessionUser = {
  email: string;
  fullName: string | null;
  displayName: string;
  userId: string;
  sessionId: string;
  authSource: "local_session";
  assuranceLevel: LocalAssuranceLevel;
  authenticatedAt: string | null;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const requestHeaders = await headers();
    const session = await localSessionFromCookie(
      requireD1(),
      requestHeaders.get("cookie"),
    );
    if (!session) return null;
    return {
      email: session.email,
      fullName: session.fullName,
      displayName: session.fullName || session.email,
      userId: session.userId,
      sessionId: session.sessionId,
      authSource: "local_session",
      assuranceLevel: session.assuranceLevel,
      authenticatedAt: session.authenticatedAt,
    };
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
