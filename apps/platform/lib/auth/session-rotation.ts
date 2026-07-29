import { randomToken, sha256 } from "./crypto";
import {
  batchWithSecurityEvent,
  type SecurityEventGuard,
} from "./security-events";

export type SessionTokenRotationReason =
  | "mfa_elevation"
  | "email_change"
  | "mfa_disabled"
  | "manual"
  | "periodic";

export type PreparedSessionTokenRotation = {
  token: string;
  tokenHash: string;
  previousTokenHash: string;
  historyId: string;
  sessionId: string;
  userId: string;
  deviceId: string | null;
  assuranceLevel: "primary" | "mfa";
  expiresAt: string;
  rotatedAt: string;
  historyStatement: D1PreparedStatement;
  rotationStatement: D1PreparedStatement;
  eventGuard: {
    selectSql: string;
    bindings: Array<string>;
  };
};

type RotationSourceSession = {
  deviceId: string | null;
  assuranceLevel: string;
  expiresAt: string;
  idleExpiresAt: string | null;
};

type ReplayedToken = {
  historyId: string;
  sessionId: string;
  userId: string;
  deviceId: string | null;
  assuranceLevel: string;
  rotationReason: string;
  rotatedAt: string;
};

export async function prepareSessionTokenRotation(
  db: D1Database,
  input: {
    userId: string;
    sessionId: string;
    currentToken: string;
    reason: SessionTokenRotationReason;
    requiredGuard?: SecurityEventGuard;
    now?: Date;
  },
): Promise<PreparedSessionTokenRotation | null> {
  const now = input.now ?? new Date();
  const rotatedAt = now.toISOString();
  const previousTokenHash = await sha256(input.currentToken);
  const source = await db.prepare(
    `SELECT device_id AS deviceId,assurance_level AS assuranceLevel,
       expires_at AS expiresAt,idle_expires_at AS idleExpiresAt
     FROM auth_sessions
     WHERE id=? AND user_id=? AND token_hash=? AND revoked_at IS NULL
       AND expires_at>? AND coalesce(idle_expires_at,expires_at)>?
     LIMIT 1`,
  ).bind(
    input.sessionId,
    input.userId,
    previousTokenHash,
    rotatedAt,
    rotatedAt,
  ).first<RotationSourceSession>();
  if (
    !source
    || (source.assuranceLevel !== "primary" && source.assuranceLevel !== "mfa")
  ) return null;

  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const historyId = crypto.randomUUID();
  const activeGuard = `SELECT 1 FROM auth_sessions
    WHERE id=? AND user_id=? AND token_hash=? AND revoked_at IS NULL
      AND expires_at>? AND coalesce(idle_expires_at,expires_at)>?`;
  const activeBindings = [
    input.sessionId,
    input.userId,
    previousTokenHash,
    rotatedAt,
    rotatedAt,
  ];
  if (
    input.requiredGuard
    && (
      !/^\s*SELECT\b/i.test(input.requiredGuard.selectSql)
      || input.requiredGuard.selectSql.includes(";")
    )
  ) {
    throw new Error("INVALID_SESSION_ROTATION_GUARD");
  }
  const requiredGuardSql = input.requiredGuard
    ? ` AND EXISTS (${input.requiredGuard.selectSql})`
    : "";
  const requiredGuardBindings = input.requiredGuard?.bindings ?? [];

  return {
    token,
    tokenHash,
    previousTokenHash,
    historyId,
    sessionId: input.sessionId,
    userId: input.userId,
    deviceId: source.deviceId,
    assuranceLevel: source.assuranceLevel,
    expiresAt: source.expiresAt,
    rotatedAt,
    historyStatement: db.prepare(
      `INSERT INTO auth_session_token_history (
         id,session_id,user_id,token_hash,rotation_reason,rotated_at,expires_at
       )
       SELECT ?,id,user_id,token_hash,?,?,expires_at
       FROM auth_sessions
       WHERE EXISTS (${activeGuard})${requiredGuardSql} AND id=?`,
    ).bind(
      historyId,
      input.reason,
      rotatedAt,
      ...activeBindings,
      ...requiredGuardBindings,
      input.sessionId,
    ),
    rotationStatement: db.prepare(
      `UPDATE auth_sessions SET token_hash=?
       WHERE id=? AND user_id=? AND token_hash=? AND revoked_at IS NULL
         AND expires_at>? AND coalesce(idle_expires_at,expires_at)>?${requiredGuardSql}`,
    ).bind(
      tokenHash,
      input.sessionId,
      input.userId,
      previousTokenHash,
      rotatedAt,
      rotatedAt,
      ...requiredGuardBindings,
    ),
    eventGuard: {
      selectSql: `SELECT 1 FROM auth_sessions
        WHERE id=? AND user_id=? AND token_hash=? AND revoked_at IS NULL`,
      bindings: [input.sessionId, input.userId, tokenHash],
    },
  };
}

function isReplayClaimConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("auth_session_token_replays_history_uidx")
    || message.includes("UNIQUE constraint failed: auth_session_token_replays.token_history_id");
}

export async function revokeReplayedSessionToken(
  db: D1Database,
  tokenHash: string,
  options: { now?: Date } = {},
): Promise<boolean> {
  const detectedAt = (options.now ?? new Date()).toISOString();
  const replayed = await db.prepare(
    `SELECT h.id AS historyId,h.session_id AS sessionId,
       h.user_id AS userId,s.device_id AS deviceId,
       s.assurance_level AS assuranceLevel,
       h.rotation_reason AS rotationReason,h.rotated_at AS rotatedAt
     FROM auth_session_token_history h
     JOIN auth_sessions s ON s.id=h.session_id AND s.user_id=h.user_id
     WHERE h.token_hash=? AND h.expires_at>?
       AND s.revoked_at IS NULL AND s.expires_at>?
       AND coalesce(s.idle_expires_at,s.expires_at)>?
     LIMIT 1`,
  ).bind(tokenHash, detectedAt, detectedAt, detectedAt).first<ReplayedToken>();
  if (!replayed) return false;
  if (
    replayed.assuranceLevel !== "primary"
    && replayed.assuranceLevel !== "mfa"
  ) return false;

  const replayId = crypto.randomUUID();
  let results: D1Result[];
  try {
    results = await batchWithSecurityEvent(
      db,
      {
        userId: replayed.userId,
        sessionId: replayed.sessionId,
        deviceId: replayed.deviceId,
        eventType: "session.token_replayed",
        severity: "critical",
        authSource: "local_session",
        assuranceLevel: replayed.assuranceLevel,
        metadata: {
          replayId,
          tokenHistoryId: replayed.historyId,
          rotationReason: replayed.rotationReason,
          rotatedAt: replayed.rotatedAt,
          action: "session_and_device_revoked",
        },
        createdAt: detectedAt,
      },
      () => [
        db.prepare(
          `INSERT INTO auth_session_token_replays (
             id,token_history_id,session_id,user_id,detected_at,action
           )
           SELECT ?,h.id,h.session_id,h.user_id,?,'session_and_device_revoked'
           FROM auth_session_token_history h
           JOIN auth_sessions s ON s.id=h.session_id AND s.user_id=h.user_id
           WHERE h.id=? AND h.token_hash=? AND h.expires_at>?
             AND s.revoked_at IS NULL AND s.expires_at>?
             AND coalesce(s.idle_expires_at,s.expires_at)>?`,
        ).bind(
          replayId,
          detectedAt,
          replayed.historyId,
          tokenHash,
          detectedAt,
          detectedAt,
          detectedAt,
        ),
        db.prepare(
          `UPDATE auth_sessions SET revoked_at=?
           WHERE id=? AND user_id=? AND revoked_at IS NULL
             AND EXISTS (
               SELECT 1 FROM auth_session_token_replays
               WHERE id=? AND token_history_id=?
             )`,
        ).bind(
          detectedAt,
          replayed.sessionId,
          replayed.userId,
          replayId,
          replayed.historyId,
        ),
        db.prepare(
          `UPDATE auth_devices SET revoked_at=?
           WHERE id=? AND user_id=? AND revoked_at IS NULL
             AND EXISTS (
               SELECT 1 FROM auth_session_token_replays replay
               JOIN auth_sessions session ON session.id=replay.session_id
               WHERE replay.id=? AND session.revoked_at=?
             )`,
        ).bind(
          detectedAt,
          replayed.deviceId,
          replayed.userId,
          replayId,
          detectedAt,
        ),
      ],
      {
        selectSql: `SELECT 1 FROM auth_session_token_replays
          WHERE id=? AND token_history_id=?`,
        bindings: [replayId, replayed.historyId],
      },
    );
  } catch (error) {
    if (isReplayClaimConflict(error)) return false;
    throw error;
  }
  return Number(results[0]?.meta?.changes ?? 0) === 1
    && Number(results[1]?.meta?.changes ?? 0) === 1;
}
