import {
  assertSafeWrite,
  requireApiUser,
  withApiErrors,
} from "../../../../../lib/document-builder/auth/api";
import { requireD1 } from "../../../../../lib/document-builder/storage/runtime";
import {
  clearDeviceContinuityCookie,
  clearSessionCookie,
} from "../../../../../lib/auth/session";
import { sharedAuthCookieDomain } from "../../../../../lib/auth/session-persistence";
import {
  localSessionFromCookie,
  revokeSessions,
} from "../../../../../lib/auth/session-management";

function response(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store", ...headers },
  });
}

export const GET = withApiErrors(async function GET(request: Request) {
  const user = await requireApiUser();
  const db = requireD1();
  const now = new Date().toISOString();
  const current = await localSessionFromCookie(
    db,
    request.headers.get("cookie"),
    { touch: false },
  );
  const sessions = await db
    .prepare(
      `SELECT
       s.id,s.created_at AS createdAt,s.authenticated_at AS authenticatedAt,
       s.last_seen_at AS lastSeenAt,s.expires_at AS expiresAt,
       s.idle_expires_at AS idleExpiresAt,s.auth_method AS authMethod,
       s.assurance_level AS assuranceLevel,
       coalesce(d.display_name,'Unknown device') AS deviceName,
       continuity.last_country_code AS countryCode,
       continuity.last_region_code AS regionCode,
       CASE WHEN s.id=? THEN 1 ELSE 0 END AS isCurrent
     FROM auth_sessions s
     LEFT JOIN auth_devices d ON d.id=s.device_id
     LEFT JOIN auth_device_continuities continuity ON continuity.id=d.continuity_id
     WHERE s.user_id=?
       AND s.revoked_at IS NULL
       AND s.expires_at>?
       AND coalesce(s.idle_expires_at,s.expires_at)>?
       AND (s.device_id IS NULL OR d.revoked_at IS NULL)
       AND (d.continuity_id IS NULL OR EXISTS (
         SELECT 1 FROM auth_device_continuities continuity
         WHERE continuity.id=d.continuity_id
           AND continuity.user_id=s.user_id
           AND continuity.revoked_at IS NULL
       ))
     ORDER BY isCurrent DESC,s.last_seen_at DESC
     LIMIT 50`,
    )
    .bind(current?.sessionId ?? "", user.id, now, now)
    .all();
  return response({
    sessions: sessions.results,
    currentSessionId: current?.userId === user.id ? current.sessionId : null,
    managedScope: "juro_local_sessions",
    externalProviderSessionsIncluded: false,
  });
});

export const DELETE = withApiErrors(async function DELETE(request: Request) {
  assertSafeWrite(request);
  const user = await requireApiUser();
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") ?? "all";
  if (scope !== "all" && scope !== "others") {
    return response(
      {
        code: "INVALID_SCOPE",
        error: "Неизвестная область завершения сессий.",
      },
      400,
    );
  }
  const db = requireD1();
  const current = await localSessionFromCookie(
    db,
    request.headers.get("cookie"),
    { touch: false },
  );
  if (scope === "others" && (!current || current.userId !== user.id)) {
    return response(
      {
        code: "LOCAL_SESSION_REQUIRED",
        error: "Для этого действия нужна текущая JURO email-сессия.",
      },
      409,
    );
  }
  const revoked = await revokeSessions(db, {
    userId: user.id,
    currentSessionId: current?.userId === user.id ? current.sessionId : null,
    scope,
  });
  if (scope === "all") {
    const headers = new Headers({ "cache-control": "private, no-store" });
    headers.append("set-cookie", clearSessionCookie());
    const domain = sharedAuthCookieDomain(url.hostname);
    if (domain) headers.append("set-cookie", clearSessionCookie(domain));
    headers.append("set-cookie", clearDeviceContinuityCookie());
    return Response.json(
      { ok: true, scope, revoked },
      { status: 200, headers },
    );
  }
  return response({ ok: true, scope, revoked });
});
