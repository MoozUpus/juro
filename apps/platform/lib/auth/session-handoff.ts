import { randomToken, sha256 } from "./crypto";
import { batchWithSecurityEvent } from "./security-events";
import {
  guardedSessionInsertStatements,
  prepareLocalSessionCreation,
} from "./session-management";
import { isLocale } from "../platform/routing";

const HANDOFF_TTL_MS = 90 * 1_000;
const AUTH_HOSTS = new Set(["app.juro.uz", "lawyer.juro.uz"]);

export type IssuedSessionHandoff = {
  action: string;
  ticket: string;
  expiresAt: string;
};

function canonicalHost(value: string): string {
  return value.trim().toLowerCase();
}

function destination(value: string): URL | null {
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:"
      || parsed.username
      || parsed.password
      || parsed.port
      || !AUTH_HOSTS.has(parsed.hostname)
      || !parsed.pathname.startsWith("/")
      || parsed.pathname.startsWith("//")
      || parsed.hash
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function issueSessionHandoff(
  db: D1Database,
  input: {
    userId: string;
    sourceSessionId: string;
    sourceHost: string;
    destinationUrl: string;
    rememberMe: boolean;
    now?: Date;
  },
): Promise<IssuedSessionHandoff | null> {
  const sourceHost = canonicalHost(input.sourceHost);
  const target = destination(input.destinationUrl);
  if (!target || !AUTH_HOSTS.has(sourceHost) || sourceHost === target.hostname) {
    return null;
  }
  const now = input.now ?? new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + HANDOFF_TTL_MS).toISOString();
  const ticket = randomToken(32);
  const tokenHash = await sha256(ticket);
  const id = crypto.randomUUID();
  const redirectPath = `${target.pathname}${target.search}`;
  const destinationLocaleCandidate = target.pathname.split("/").filter(Boolean)[0] ?? "";
  const destinationLocale = isLocale(destinationLocaleCandidate)
    ? destinationLocaleCandidate
    : "ru";
  const result = await db.prepare(
    `INSERT INTO auth_session_handoffs (
       id,token_hash,user_id,source_session_id,source_host,destination_host,
       redirect_path,remember_me,expires_at,created_at
     )
     SELECT ?,?,?,?,?,?,?,?,?,?
     WHERE EXISTS (
       SELECT 1 FROM auth_sessions
       WHERE id=? AND user_id=? AND revoked_at IS NULL
         AND expires_at>? AND coalesce(idle_expires_at,expires_at)>?
         AND assurance_level IN ('primary','mfa')
     )`,
  ).bind(
    id,
    tokenHash,
    input.userId,
    input.sourceSessionId,
    sourceHost,
    target.hostname,
    redirectPath,
    input.rememberMe ? 1 : 0,
    expiresAt,
    createdAt,
    input.sourceSessionId,
    input.userId,
    createdAt,
    createdAt,
  ).run();
  if (Number(result.meta.changes ?? 0) !== 1) {
    throw new Error("SESSION_HANDOFF_SOURCE_INVALID");
  }
  return {
    action: `https://${target.hostname}/api/auth/session-handoff?lang=${destinationLocale}`,
    ticket,
    expiresAt,
  };
}

type HandoffRow = {
  id: string;
  userId: string;
  sourceSessionId: string;
  sourceHost: string;
  destinationHost: string;
  redirectPath: string;
  rememberMe: number;
  sourceAuthMethod: string;
  sourceAssuranceLevel: "primary" | "mfa";
};

export async function consumeSessionHandoff(
  db: D1Database,
  input: {
    ticket: string;
    destinationHost: string;
    origin: string | null;
    userAgent: string | null;
    now?: Date;
  },
): Promise<{
  token: string;
  rememberMe: boolean;
  redirectPath: string;
} | null> {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(input.ticket)) return null;
  const destinationHost = canonicalHost(input.destinationHost);
  if (!AUTH_HOSTS.has(destinationHost)) return null;
  const tokenHash = await sha256(input.ticket);
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();
  const row = await db.prepare(
    `SELECT h.id,h.user_id AS userId,h.source_session_id AS sourceSessionId,
       h.source_host AS sourceHost,h.destination_host AS destinationHost,
       h.redirect_path AS redirectPath,h.remember_me AS rememberMe,
       source.auth_method AS sourceAuthMethod,
       source.assurance_level AS sourceAssuranceLevel
     FROM auth_session_handoffs h
     JOIN auth_sessions source ON source.id=h.source_session_id
       AND source.user_id=h.user_id
     WHERE h.token_hash=? AND h.destination_host=?
       AND h.consumed_at IS NULL AND h.expires_at>?
       AND source.revoked_at IS NULL AND source.expires_at>?
       AND coalesce(source.idle_expires_at,source.expires_at)>?
     LIMIT 1`,
  ).bind(tokenHash, destinationHost, timestamp, timestamp, timestamp)
    .first<HandoffRow>();
  if (
    !row
    || input.origin !== `https://${row.sourceHost}`
    || (row.sourceAssuranceLevel !== "primary" && row.sourceAssuranceLevel !== "mfa")
  ) return null;

  const prepared = await prepareLocalSessionCreation(db, {
    userId: row.userId,
    userAgent: input.userAgent,
    authMethod: `session_handoff:${row.sourceAuthMethod}`,
    assuranceLevel: row.sourceAssuranceLevel,
    rememberMe: Boolean(row.rememberMe),
    now,
  });
  const consumedGuard = {
    selectSql: `SELECT 1 FROM auth_session_handoffs
      WHERE id=? AND consumed_by_session_id=? AND consumed_at=?`,
    bindings: [row.id, prepared.session.sessionId, timestamp],
  };
  const sessionStatements = guardedSessionInsertStatements(
    db,
    prepared,
    consumedGuard,
  );
  await batchWithSecurityEvent(
    db,
    {
      userId: row.userId,
      sessionId: prepared.session.sessionId,
      deviceId: prepared.session.deviceId,
      eventType: "session.handoff_consumed",
      authSource: "local_session",
      assuranceLevel: row.sourceAssuranceLevel,
      metadata: {
        sourceSessionId: row.sourceSessionId,
        sourceHost: row.sourceHost,
        destinationHost,
      },
      createdAt: timestamp,
    },
    () => [
      db.prepare(
        `UPDATE auth_session_handoffs
         SET consumed_at=?,consumed_by_session_id=?
         WHERE id=? AND token_hash=? AND destination_host=?
           AND consumed_at IS NULL AND expires_at>?
           AND EXISTS (
             SELECT 1 FROM auth_sessions source
             WHERE source.id=auth_session_handoffs.source_session_id
               AND source.user_id=auth_session_handoffs.user_id
               AND source.revoked_at IS NULL
               AND source.expires_at>?
               AND coalesce(source.idle_expires_at,source.expires_at)>?
               AND source.assurance_level IN ('primary','mfa')
           )`,
      ).bind(
        timestamp,
        prepared.session.sessionId,
        row.id,
        tokenHash,
        destinationHost,
        timestamp,
        timestamp,
        timestamp,
      ),
      ...sessionStatements,
      db.prepare(
        `UPDATE auth_sessions
         SET revoked_at=?
         WHERE id=? AND user_id=? AND revoked_at IS NULL
           AND EXISTS (${consumedGuard.selectSql})`,
      ).bind(
        timestamp,
        row.sourceSessionId,
        row.userId,
        ...consumedGuard.bindings,
      ),
    ],
    consumedGuard,
  );
  const created = await db.prepare(
    `SELECT 1 AS ok FROM auth_sessions
     WHERE id=? AND user_id=? AND revoked_at IS NULL LIMIT 1`,
  ).bind(prepared.session.sessionId, row.userId).first<{ ok: number }>();
  if (!created) return null;
  return {
    token: prepared.session.token,
    rememberMe: Boolean(row.rememberMe),
    redirectPath: row.redirectPath,
  };
}
