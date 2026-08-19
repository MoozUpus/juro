import {
  clearMfaChallengeCookie,
  clearSessionCookie,
} from "../../../../lib/auth/session";
import {
  localSessionFromCookie,
  revokeOneSession,
} from "../../../../lib/auth/session-management";
import {
  assertSafeWrite,
  withApiErrors,
} from "../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const raw = request.headers.get("cookie") ?? "";
  const db = requireD1();
  const session = await localSessionFromCookie(db, raw, { touch: false });
  if (session) {
    await revokeOneSession(db, {
      userId: session.userId,
      sessionId: session.sessionId,
      currentSessionId: session.sessionId,
      revokeDeviceContinuity: false,
    });
  }
  const headers = new Headers({ "cache-control": "private, no-store" });
  headers.append("set-cookie", clearSessionCookie());
  const sharedDomain = new URL(request.url).hostname.toLowerCase().endsWith(".juro.uz") ? ".juro.uz" : undefined;
  if (sharedDomain) headers.append("set-cookie", clearSessionCookie(sharedDomain));
  headers.append("set-cookie", clearMfaChallengeCookie());
  return new Response(null, { status: 204, headers });
});
