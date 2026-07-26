import {
  clearSessionCookie,
} from "../../../../lib/auth/session";
import { sessionTokenFromCookie } from "../../../../lib/auth/session-token";
import { sha256 } from "../../../../lib/auth/crypto";
import {
  assertSafeWrite,
  withApiErrors,
} from "../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";

export const POST = withApiErrors(async function POST(request: Request) {
  assertSafeWrite(request);
  const raw = request.headers.get("cookie") ?? "";
  const token = sessionTokenFromCookie(raw);
  if (token) await requireD1().prepare("UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ?").bind(new Date().toISOString(), await sha256(token)).run();
  return new Response(null, { status: 204, headers: { "set-cookie": clearSessionCookie(), "cache-control": "private, no-store" } });
});
