import { assertSafeWrite, requireApiUser, withApiErrors } from "../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import { clearSessionCookie } from "../../../../../lib/auth/session";

function response(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", ...headers } });
}

export const GET = withApiErrors(async function GET() {
  const user = await requireApiUser();
  const sessions = await requireD1().prepare(
    `SELECT id,created_at AS createdAt,last_seen_at AS lastSeenAt,expires_at AS expiresAt,
      CASE WHEN revoked_at IS NULL AND expires_at>? THEN 'active' ELSE 'closed' END AS status
     FROM auth_sessions WHERE user_id=? ORDER BY last_seen_at DESC LIMIT 50`,
  ).bind(new Date().toISOString(), user.id).all();
  return response({ sessions: sessions.results });
});

export const DELETE = withApiErrors(async function DELETE(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const now = new Date().toISOString();
  await requireD1().prepare("UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL").bind(now, user.id).run();
  return response({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
});
