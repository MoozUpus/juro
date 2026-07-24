import { clearSessionCookie, SESSION_COOKIE } from "../../../../lib/auth/session";
import { sha256 } from "../../../../lib/auth/crypto";
import { requireD1 } from "../../../../lib/document-builder/storage/runtime";

export async function POST(request: Request) {
  const raw = request.headers.get("cookie") ?? "";
  const token = raw.split(";").map(value => value.trim()).find(value => value.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (token) await requireD1().prepare("UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ?").bind(new Date().toISOString(), await sha256(decodeURIComponent(token))).run();
  return new Response(null, { status: 204, headers: { "set-cookie": clearSessionCookie(), "cache-control": "private, no-store" } });
}
