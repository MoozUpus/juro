import { randomToken, sha256 } from "./crypto";
import {
  createIdentityProtectionContext,
  resolveUserIdentity,
  userIdentitySelect,
  type IdentityProtectionContext,
  type UserIdentityRow,
} from "./identity-protection";
import { sessionTokenFromCookie } from "./session-token";
import {
  batchWithSecurityEvent,
} from "./security-events";
import { sessionTtlSeconds } from "./session-persistence";

const IDLE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const TOUCH_INTERVAL_MS = 5 * 60 * 1_000;

export type AuthSource = "local_session" | "platform_header";
export type AssuranceLevel = "primary" | "mfa" | "upstream";
export type LocalAssuranceLevel = Exclude<AssuranceLevel, "upstream">;

export type LocalSession = {
  sessionId: string;
  userId: string;
  email: string;
  fullName: string | null;
  deviceId: string | null;
  deviceName: string | null;
  authMethod: string;
  assuranceLevel: LocalAssuranceLevel;
  authenticatedAt: string | null;
  mfaVerifiedAt: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  idleExpiresAt: string | null;
};

export type CreatedSession = {
  token: string;
  sessionId: string;
  deviceId: string;
  expiresAt: string;
  idleExpiresAt: string;
};

export type PreparedSessionCreation = {
  session: CreatedSession;
  userId: string;
  tokenHash: string;
  displayName: string;
  authMethod: string;
  assuranceLevel: LocalAssuranceLevel;
  createdAt: string;
  statements: D1PreparedStatement[];
};

export type SessionInsertGuard = {
  selectSql: string;
  bindings: Array<string | number | null>;
};

function dateAt(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function browserName(userAgent: string): string {
  if (/Edg\//.test(userAgent)) return "Microsoft Edge";
  if (/OPR\//.test(userAgent)) return "Opera";
  if (/Firefox\//.test(userAgent)) return "Firefox";
  if (/CriOS\//.test(userAgent)) return "Chrome";
  if (/Chrome\//.test(userAgent)) return "Chrome";
  if (/FxiOS\//.test(userAgent)) return "Firefox";
  if (/Safari\//.test(userAgent)) return "Safari";
  return "Browser";
}

function operatingSystem(userAgent: string): string {
  if (/iPhone|iPad|iPod/.test(userAgent)) return "iOS";
  if (/Android/.test(userAgent)) return "Android";
  if (/Windows/.test(userAgent)) return "Windows";
  if (/Mac OS X|Macintosh/.test(userAgent)) return "macOS";
  if (/Linux/.test(userAgent)) return "Linux";
  return "Unknown device";
}

export function deviceDisplayName(userAgent: string | null): string {
  if (!userAgent?.trim()) return "Unknown device";
  return `${browserName(userAgent)} · ${operatingSystem(userAgent)}`;
}

function cappedIdleExpiry(nowMs: number, absoluteExpiry: string): string {
  return dateAt(Math.min(
    nowMs + IDLE_TTL_MS,
    new Date(absoluteExpiry).getTime(),
  ));
}

function assertGuard(guard: SessionInsertGuard): void {
  if (
    !/^\s*SELECT\b/i.test(guard.selectSql)
    || guard.selectSql.includes(";")
  ) {
    throw new Error("INVALID_SESSION_INSERT_GUARD");
  }
}

export function guardedSessionInsertStatements(
  db: D1Database,
  prepared: Omit<PreparedSessionCreation, "statements">,
  guard: SessionInsertGuard,
): D1PreparedStatement[] {
  assertGuard(guard);
  return [
    db.prepare(
      `INSERT INTO auth_devices (
         id,user_id,display_name,user_agent_hash,first_seen_at,last_seen_at
       )
       SELECT ?,?,?,NULL,?,?
       WHERE EXISTS (${guard.selectSql})`,
    ).bind(
      prepared.session.deviceId,
      prepared.userId,
      prepared.displayName,
      prepared.createdAt,
      prepared.createdAt,
      ...guard.bindings,
    ),
    db.prepare(
      `INSERT INTO auth_sessions (
         id,user_id,device_id,token_hash,auth_method,assurance_level,
         authenticated_at,mfa_verified_at,expires_at,idle_expires_at,
         created_at,last_seen_at
       )
       SELECT ?,?,?,?,?,?,?,?,?,?,?,?
       WHERE EXISTS (${guard.selectSql})
         AND EXISTS (
           SELECT 1 FROM auth_devices
           WHERE id=? AND user_id=? AND revoked_at IS NULL
         )`,
    ).bind(
      prepared.session.sessionId,
      prepared.userId,
      prepared.session.deviceId,
      prepared.tokenHash,
      prepared.authMethod,
      prepared.assuranceLevel,
      prepared.createdAt,
      prepared.assuranceLevel === "mfa" ? prepared.createdAt : null,
      prepared.session.expiresAt,
      prepared.session.idleExpiresAt,
      prepared.createdAt,
      prepared.createdAt,
      ...guard.bindings,
      prepared.session.deviceId,
      prepared.userId,
    ),
  ];
}

export async function prepareLocalSessionCreation(
  db: D1Database,
  input: {
    userId: string;
    userAgent: string | null;
    authMethod: string;
    assuranceLevel: LocalAssuranceLevel;
    rememberMe?: boolean;
    now?: Date;
  },
): Promise<PreparedSessionCreation> {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const sessionId = crypto.randomUUID();
  const deviceId = crypto.randomUUID();
  const expiresAt = dateAt(
    now.getTime() + sessionTtlSeconds(input.rememberMe ?? false) * 1_000,
  );
  const idleExpiresAt = cappedIdleExpiry(now.getTime(), expiresAt);
  const displayName = deviceDisplayName(input.userAgent);
  // A raw SHA-256 of a user agent is a stable fingerprint. Keep this empty
  // until the versioned identity HMAC key ring is configured.
  const userAgentHash = null;

  return {
    session: { token, sessionId, deviceId, expiresAt, idleExpiresAt },
    userId: input.userId,
    tokenHash,
    displayName,
    authMethod: input.authMethod,
    assuranceLevel: input.assuranceLevel,
    createdAt: nowIso,
    statements: [
      db.prepare(
        `INSERT INTO auth_devices (
           id,user_id,display_name,user_agent_hash,first_seen_at,last_seen_at
         ) VALUES (?,?,?,?,?,?)`,
      ).bind(
        deviceId,
        input.userId,
        displayName,
        userAgentHash,
        nowIso,
        nowIso,
      ),
      db.prepare(
        `INSERT INTO auth_sessions (
           id,user_id,device_id,token_hash,auth_method,assurance_level,
           authenticated_at,mfa_verified_at,expires_at,idle_expires_at,
           created_at,last_seen_at
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        sessionId,
        input.userId,
        deviceId,
        tokenHash,
        input.authMethod,
        input.assuranceLevel,
        nowIso,
        input.assuranceLevel === "mfa" ? nowIso : null,
        expiresAt,
        idleExpiresAt,
        nowIso,
        nowIso,
      ),
    ],
  };
}

export async function createEmailOtpSession(
  db: D1Database,
  input: {
    userId: string;
    userAgent: string | null;
    rememberMe?: boolean;
    now?: Date;
  },
): Promise<CreatedSession> {
  const prepared = await prepareLocalSessionCreation(db, {
    ...input,
    authMethod: "email_otp",
    assuranceLevel: "primary",
  });
  await batchWithSecurityEvent(
    db,
    {
      userId: input.userId,
      sessionId: prepared.session.sessionId,
      deviceId: prepared.session.deviceId,
      eventType: "session.created",
      authSource: "local_session",
      assuranceLevel: "primary",
      userAgentHash: null,
      metadata: {
        authMethod: "email_otp",
        deviceName: prepared.displayName,
      },
      createdAt: prepared.createdAt,
    },
    () => prepared.statements,
  );

  return prepared.session;
}

export async function createPrimarySessionIfMfaDisabled(
  db: D1Database,
  input: {
    userId: string;
    userAgent: string | null;
    rememberMe?: boolean;
    now?: Date;
  },
): Promise<CreatedSession | null> {
  const prepared = await prepareLocalSessionCreation(db, {
    ...input,
    authMethod: "email_otp",
    assuranceLevel: "primary",
  });
  const guard = {
    selectSql: `SELECT 1
      WHERE NOT EXISTS (
        SELECT 1 FROM auth_totp_credentials
        WHERE user_id=? AND status='active'
      )`,
    bindings: [input.userId],
  } satisfies SessionInsertGuard;
  const statements = guardedSessionInsertStatements(db, prepared, guard);
  const results = await batchWithSecurityEvent(
    db,
    {
      userId: input.userId,
      sessionId: prepared.session.sessionId,
      deviceId: prepared.session.deviceId,
      eventType: "session.created",
      authSource: "local_session",
      assuranceLevel: "primary",
      metadata: {
        authMethod: "email_otp",
        deviceName: prepared.displayName,
      },
      createdAt: prepared.createdAt,
    },
    () => statements,
    {
      selectSql: "SELECT 1 FROM auth_sessions WHERE id=? AND user_id=?",
      bindings: [prepared.session.sessionId, input.userId],
    },
  );
  return Number(results[1]?.meta?.changes ?? 0) === 1
    ? prepared.session
    : null;
}

export async function localSessionFromCookie(
  db: D1Database,
  cookie: string | null,
  options: {
    now?: Date;
    touch?: boolean;
    identity?: IdentityProtectionContext;
  } = {},
): Promise<LocalSession | null> {
  const token = sessionTokenFromCookie(cookie);
  if (!token) return null;
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const session = await db.prepare(
    `SELECT
       s.id AS sessionId,s.user_id AS userId,u.id,
       ${userIdentitySelect("u")},
       u.full_name AS fullName,s.device_id AS deviceId,
       d.display_name AS deviceName,s.auth_method AS authMethod,
       s.assurance_level AS assuranceLevel,
       s.authenticated_at AS authenticatedAt,s.created_at AS createdAt,
       s.mfa_verified_at AS mfaVerifiedAt,
       s.last_seen_at AS lastSeenAt,s.expires_at AS expiresAt,
       s.idle_expires_at AS idleExpiresAt
     FROM auth_sessions s
     JOIN user_profiles u ON u.id=s.user_id
     LEFT JOIN auth_devices d ON d.id=s.device_id
     WHERE s.token_hash=?
       AND s.revoked_at IS NULL
       AND s.expires_at>?
       AND coalesce(s.idle_expires_at,s.expires_at)>?
       AND (s.device_id IS NULL OR d.revoked_at IS NULL)
     LIMIT 1`,
  ).bind(await sha256(token), nowIso, nowIso).first<
    Omit<LocalSession, "assuranceLevel"> & UserIdentityRow & {
      assuranceLevel: string;
    }
  >();
  if (!session) return null;
  if (
    session.assuranceLevel !== "primary"
    && session.assuranceLevel !== "mfa"
  ) return null;
  const identity = await resolveUserIdentity(
    options.identity ?? createIdentityProtectionContext("legacy", null),
    session,
  );
  session.email = identity.email;

  if (
    options.touch !== false
    && now.getTime() - new Date(session.lastSeenAt).getTime()
      >= TOUCH_INTERVAL_MS
  ) {
    const idleExpiresAt = cappedIdleExpiry(now.getTime(), session.expiresAt);
    const statements = [
      db.prepare(
        `UPDATE auth_sessions
         SET last_seen_at=?,idle_expires_at=?
         WHERE id=? AND user_id=? AND revoked_at IS NULL`,
      ).bind(nowIso, idleExpiresAt, session.sessionId, session.userId),
    ];
    if (session.deviceId) {
      statements.push(
        db.prepare(
          `UPDATE auth_devices
           SET last_seen_at=?
           WHERE id=? AND user_id=? AND revoked_at IS NULL`,
        ).bind(nowIso, session.deviceId, session.userId),
      );
    }
    await db.batch(statements);
    session.lastSeenAt = nowIso;
    session.idleExpiresAt = idleExpiresAt;
  }
  return {
    sessionId: session.sessionId,
    userId: session.userId,
    email: identity.email,
    fullName: session.fullName,
    deviceId: session.deviceId,
    deviceName: session.deviceName,
    authMethod: session.authMethod,
    assuranceLevel: session.assuranceLevel,
    authenticatedAt: session.authenticatedAt,
    mfaVerifiedAt: session.mfaVerifiedAt,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    expiresAt: session.expiresAt,
    idleExpiresAt: session.idleExpiresAt,
  };
}

function eventMetadata(scope: "all" | "others" | "single") {
  return { scope };
}

export async function revokeSessions(
  db: D1Database,
  input: {
    userId: string;
    currentSessionId: string | null;
    scope: "all" | "others";
    now?: Date;
  },
): Promise<number> {
  if (input.scope === "others" && !input.currentSessionId) {
    throw new Error("CURRENT_LOCAL_SESSION_REQUIRED");
  }
  const now = (input.now ?? new Date()).toISOString();
  const sessionPredicate = input.scope === "others"
    ? "user_id=? AND id<>? AND revoked_at IS NULL"
    : "user_id=? AND revoked_at IS NULL";
  const sessionBindings = input.scope === "others"
    ? [input.userId, input.currentSessionId]
    : [input.userId];
  const devicePredicate = input.scope === "others"
    ? `user_id=? AND id IN (
         SELECT device_id FROM auth_sessions
         WHERE user_id=? AND id<>? AND revoked_at=?
       )`
    : "user_id=? AND revoked_at IS NULL";
  const deviceBindings = input.scope === "others"
    ? [input.userId, input.userId, input.currentSessionId, now]
    : [input.userId];

  const results = await batchWithSecurityEvent(
    db,
    {
      userId: input.userId,
      sessionId: input.currentSessionId,
      eventType: input.scope === "all"
        ? "session.revoked_all"
        : "session.revoked_others",
      severity: "warning",
      authSource: input.currentSessionId ? "local_session" : "platform_header",
      metadata: eventMetadata(input.scope),
      createdAt: now,
    },
    () => [
      db.prepare(
        `UPDATE auth_sessions SET revoked_at=?
         WHERE ${sessionPredicate}`,
      ).bind(now, ...sessionBindings),
      db.prepare(
        `UPDATE auth_devices SET revoked_at=?
         WHERE ${devicePredicate}`,
      ).bind(now, ...deviceBindings),
    ],
  );
  return Number(results[0]?.meta?.changes ?? 0);
}

export async function revokeOneSession(
  db: D1Database,
  input: {
    userId: string;
    sessionId: string;
    currentSessionId: string | null;
    now?: Date;
  },
): Promise<{ revoked: boolean; revokedCurrent: boolean }> {
  const owned = await db.prepare(
    `SELECT id,device_id AS deviceId,revoked_at AS revokedAt
     FROM auth_sessions
     WHERE id=? AND user_id=?
     LIMIT 1`,
  ).bind(input.sessionId, input.userId).first<{
    id: string;
    deviceId: string | null;
    revokedAt: string | null;
  }>();
  if (!owned) throw new Error("SESSION_NOT_FOUND");
  if (owned.revokedAt) {
    return {
      revoked: false,
      revokedCurrent: input.sessionId === input.currentSessionId,
    };
  }
  const now = (input.now ?? new Date()).toISOString();
  const results = await batchWithSecurityEvent(
    db,
    {
      userId: input.userId,
      sessionId: input.sessionId,
      deviceId: owned.deviceId,
      eventType: "session.revoked",
      severity: "warning",
      authSource: input.currentSessionId ? "local_session" : "platform_header",
      metadata: eventMetadata("single"),
      createdAt: now,
    },
    () => [
      db.prepare(
        `UPDATE auth_sessions SET revoked_at=?
         WHERE id=? AND user_id=? AND revoked_at IS NULL`,
      ).bind(now, input.sessionId, input.userId),
      db.prepare(
        `UPDATE auth_devices SET revoked_at=?
         WHERE id=? AND user_id=? AND revoked_at IS NULL`,
      ).bind(now, owned.deviceId, input.userId),
    ],
  );
  return {
    revoked: Number(results[0]?.meta?.changes ?? 0) === 1,
    revokedCurrent: input.sessionId === input.currentSessionId,
  };
}
