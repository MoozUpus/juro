import assert from "node:assert/strict";
import test from "node:test";
import {
  activeEmailChangeStatus,
  confirmEmailChange,
  markEmailChangeCodesQueued,
  reserveEmailChangeChallenge,
} from "../lib/auth/email-change";
import { sha256 } from "../lib/auth/crypto";
import {
  createIdentityProtectionContext,
  IdentityProtectionError,
  prepareUserIdentityWrite,
  userIdentityWriteBindings,
} from "../lib/auth/identity-protection";
import {
  createEmailOtpSession,
  localSessionFromCookie,
} from "../lib/auth/session-management";
import {
  batchBarrier,
  sqliteD1Fixture,
} from "./helpers/sqlite-d1";

const USER_ID = "email-change-user";
const WORKSPACE_ID = "email-change-workspace";
const CURRENT_EMAIL = "current@example.test";
const NEW_EMAIL = "new@example.test";
const CURRENT_CODE = "123456";
const NEW_CODE = "654321";
const CURRENT_SALT = "current-email-change-salt";
const NEW_SALT = "new-email-change-salt";
const CHALLENGE_ID = "11111111-1111-4111-8111-111111111111";
const sessionTokens = new Map<string, string>();

function encodedKey(seed: number): string {
  const bytes = Uint8Array.from(
    { length: 32 },
    (_, index) => (seed + index) % 256,
  );
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

const dualContext = createIdentityProtectionContext(
  "dual_write",
  JSON.stringify({
    active: "v2",
    versions: {
      v1: { aead: encodedKey(1), hmac: encodedKey(33) },
      v2: { aead: encodedKey(65), hmac: encodedKey(97) },
    },
  }),
);

const legacyContext = createIdentityProtectionContext("legacy", null);

async function fixture(options: {
  identityContext?: typeof dualContext;
  activeMfa?: boolean;
} = {}) {
  const identityContext = options.identityContext ?? dualContext;
  const value = sqliteD1Fixture();
  const authenticatedAt = "2026-07-26T12:00:00.000Z";
  const identity = await prepareUserIdentityWrite(identityContext, {
    userId: USER_ID,
    email: CURRENT_EMAIL,
    phone: "+998 90 123 45 67",
  });
  value.sqlite.prepare(
    `INSERT INTO user_profiles (
       id,email,email_ciphertext,email_iv,email_key_version,
       email_lookup_hash,email_lookup_key_version,
       phone,phone_ciphertext,phone_iv,phone_key_version,
       phone_lookup_hash,phone_lookup_key_version,
       locale,created_at,updated_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'ru',?,?)`,
  ).run(
    USER_ID,
    ...userIdentityWriteBindings(identity),
    authenticatedAt,
    authenticatedAt,
  );
  value.sqlite.prepare(
    `INSERT INTO workspaces (
       id,type,name,locale,created_at,updated_at
     ) VALUES (?,'individual','Email change workspace','ru',?,?)`,
  ).run(WORKSPACE_ID, authenticatedAt, authenticatedAt);
  value.sqlite.prepare(
    `INSERT INTO workspace_members (
       id,workspace_id,user_id,role,status,joined_at,created_at,updated_at
     ) VALUES (?,?,?,'owner','active',?,?,?)`,
  ).run(
    "email-change-membership",
    WORKSPACE_ID,
    USER_ID,
    authenticatedAt,
    authenticatedAt,
    authenticatedAt,
  );
  value.sqlite.prepare(
    "UPDATE user_profiles SET default_workspace_id=? WHERE id=?",
  ).run(WORKSPACE_ID, USER_ID);
  const currentSession = await createEmailOtpSession(value.d1, {
    userId: USER_ID,
    userAgent: "Current browser/1.0",
    now: new Date(authenticatedAt),
  });
  const otherSession = await createEmailOtpSession(value.d1, {
    userId: USER_ID,
    userAgent: "Other browser/1.0",
    now: new Date("2026-07-26T12:00:30.000Z"),
  });
  sessionTokens.set(currentSession.sessionId, currentSession.token);
  sessionTokens.set(otherSession.sessionId, otherSession.token);
  if (options.activeMfa) {
    value.sqlite.prepare(
      `INSERT INTO auth_totp_credentials (
         id,user_id,status,secret_ciphertext,secret_iv,key_version,
         enrollment_expires_at,created_at,updated_at,verified_at
       ) VALUES (?,?, 'active',?,?,?,?,?,?,?)`,
    ).run(
      "email-change-mfa",
      USER_ID,
      "ciphertext",
      "abcdefghijklmnop",
      "v2",
      "2026-07-27T12:00:00.000Z",
      authenticatedAt,
      authenticatedAt,
      authenticatedAt,
    );
    value.sqlite.prepare(
      `UPDATE auth_sessions
       SET auth_method='email_otp+totp',assurance_level='mfa',
           mfa_verified_at=?
       WHERE id=?`,
    ).run(authenticatedAt, currentSession.sessionId);
  }
  return {
    ...value,
    identityContext,
    currentSession,
    otherSession,
    assuranceLevel: options.activeMfa
      ? "mfa" as const
      : "primary" as const,
  };
}

async function reserve(
  db: D1Database,
  sessionId: string,
  identityContext = dualContext,
  options: {
    id?: string;
    now?: string;
    newEmail?: string;
  } = {},
) {
  const now = options.now ?? "2026-07-26T12:01:00.000Z";
  const nowMs = Date.parse(now);
  return reserveEmailChangeChallenge(db, {
    identityContext,
    id: options.id ?? CHALLENGE_ID,
    userId: USER_ID,
    sessionId,
    currentEmail: CURRENT_EMAIL,
    newEmail: options.newEmail ?? NEW_EMAIL,
    currentCodeSalt: CURRENT_SALT,
    currentCode: CURRENT_CODE,
    newCodeSalt: NEW_SALT,
    newCode: NEW_CODE,
    locale: "ru",
    expiresAt: new Date(nowMs + 10 * 60 * 1_000).toISOString(),
    now,
    recentSince: new Date(nowMs - 10 * 60 * 1_000).toISOString(),
    cooldownSince: new Date(nowMs - 60 * 1_000).toISOString(),
    hourlySince: new Date(nowMs - 60 * 60 * 1_000).toISOString(),
  });
}

async function queue(
  db: D1Database,
  sessionId: string,
  challengeId = CHALLENGE_ID,
) {
  assert.equal(
    await markEmailChangeCodesQueued(db, {
      challengeId,
      userId: USER_ID,
      sessionId,
      queuedAt: "2026-07-26T12:01:01.000Z",
    }),
    true,
  );
}

function confirm(
  db: D1Database,
  sessionId: string,
  identityContext = dualContext,
  options: {
    challengeId?: string;
    currentCode?: string;
    newCode?: string;
    now?: string;
    assuranceLevel?: "primary" | "mfa";
    currentToken?: string;
  } = {},
) {
  const now = options.now ?? "2026-07-26T12:02:00.000Z";
  const currentToken = options.currentToken ?? sessionTokens.get(sessionId);
  if (!currentToken) throw new Error("TEST_SESSION_TOKEN_NOT_FOUND");
  return confirmEmailChange(db, {
    identityContext,
    challengeId: options.challengeId ?? CHALLENGE_ID,
    userId: USER_ID,
    sessionId,
    currentToken,
    currentEmail: CURRENT_EMAIL,
    workspaceId: WORKSPACE_ID,
    currentCode: options.currentCode ?? CURRENT_CODE,
    newCode: options.newCode ?? NEW_CODE,
    assuranceLevel: options.assuranceLevel ?? "primary",
    locale: "ru",
    securityEmailKeyring: dualContext.keyring!,
    now,
    recentSince: new Date(
      Date.parse(now) - 10 * 60 * 1_000,
    ).toISOString(),
  });
}

test("email-change challenge stores complete dual evidence and requires provider acceptance", async () => {
  const { sqlite, d1, currentSession } = await fixture();
  try {
    assert.deepEqual(await reserve(d1, currentSession.sessionId), {
      status: "reserved",
    });
    assert.equal(
      await activeEmailChangeStatus(d1, {
        identityContext: dualContext,
        userId: USER_ID,
        sessionId: currentSession.sessionId,
        currentEmail: CURRENT_EMAIL,
        now: "2026-07-26T12:01:00.500Z",
      }),
      null,
    );
    const row = sqlite.prepare(
      `SELECT
         new_email AS newEmail,new_email_ciphertext AS ciphertext,
         new_email_iv AS iv,new_email_key_version AS keyVersion,
         current_email_lookup_hash AS currentEmailLookupHash,
         current_email_lookup_key_version AS currentEmailLookupKeyVersion,
         new_email_lookup_hash AS newEmailLookupHash,
         new_email_lookup_key_version AS newEmailLookupKeyVersion,
         current_code_hmac AS currentCodeHmac,
         current_code_key_version AS currentCodeKeyVersion,
         new_code_hmac AS newCodeHmac,
         new_code_key_version AS newCodeKeyVersion
       FROM email_change_challenges WHERE id=?`,
    ).get(CHALLENGE_ID) as Record<string, string>;
    assert.equal(row.newEmail, NEW_EMAIL);
    assert.notEqual(row.ciphertext, NEW_EMAIL);
    assert.match(row.iv, /^[A-Za-z0-9_-]{16}$/);
    for (const field of [
      "currentEmailLookupHash",
      "newEmailLookupHash",
      "currentCodeHmac",
      "newCodeHmac",
    ]) {
      assert.match(row[field], /^[A-Za-z0-9_-]{43}$/);
    }
    for (const field of [
      "keyVersion",
      "currentEmailLookupKeyVersion",
      "newEmailLookupKeyVersion",
      "currentCodeKeyVersion",
      "newCodeKeyVersion",
    ]) {
      assert.equal(row[field], "v2");
    }
    await queue(d1, currentSession.sessionId);
    const status = await activeEmailChangeStatus(d1, {
      identityContext: dualContext,
      userId: USER_ID,
      sessionId: currentSession.sessionId,
      currentEmail: CURRENT_EMAIL,
      now: "2026-07-26T12:01:02.000Z",
    });
    assert.equal(status?.newEmail, NEW_EMAIL);
  } finally {
    sqlite.close();
  }
});

test("verified email change rotates canonical identity and revokes only other sessions", async () => {
  const {
    sqlite,
    d1,
    currentSession,
    otherSession,
  } = await fixture({ activeMfa: true });
  try {
    await reserve(d1, currentSession.sessionId);
    await queue(d1, currentSession.sessionId);
    const now = "2026-07-26T12:01:30.000Z";
    sqlite.prepare(
      `INSERT INTO auth_otp_challenges (
         id,email,email_hash,purpose,locale,account_type,code_salt,code_hash,
         attempt_count,max_attempts,expires_at,created_at
       ) VALUES (?,?,?,?,?,'individual',?,?,0,5,?,?)`,
    ).run(
      "old-email-otp",
      CURRENT_EMAIL,
      "old-email-hash",
      "login",
      "ru",
      "salt",
      "code-hash",
      "2026-07-26T12:10:00.000Z",
      now,
    );
    sqlite.prepare(
      `INSERT INTO auth_otp_challenges (
         id,email,email_hash,purpose,locale,account_type,code_salt,code_hash,
         attempt_count,max_attempts,expires_at,created_at
       ) VALUES (?,?,?,?,?,'individual',?,?,0,5,?,?)`,
    ).run(
      "new-email-otp",
      NEW_EMAIL,
      "new-email-hash",
      "login",
      "ru",
      "salt",
      "code-hash",
      "2026-07-26T12:10:00.000Z",
      now,
    );
    sqlite.prepare(
      `INSERT INTO auth_mfa_challenges (
         id,token_hash,user_id,credential_id,email_otp_challenge_id,
         purpose,attempt_count,max_attempts,expires_at,created_at
       ) VALUES (?,?,?,?,?,'login',0,5,?,?)`,
    ).run(
      "email-change-login-mfa",
      "email-change-login-token",
      USER_ID,
      "email-change-mfa",
      "old-email-otp",
      "2026-07-26T12:10:00.000Z",
      now,
    );
    sqlite.prepare(
      `INSERT INTO account_deletion_challenges (
         id,user_id,session_id,email_hash,locale,code_salt,code_hash,
         attempt_count,max_attempts,expires_at,created_at
       ) VALUES (?,?,?,?,'ru',?,?,0,5,?,?)`,
    ).run(
      "email-change-deletion",
      USER_ID,
      currentSession.sessionId,
      "deletion-email-hash",
      "salt",
      "deletion-code-hash",
      "2026-07-26T12:10:00.000Z",
      now,
    );

    const result = await confirm(
      d1,
      currentSession.sessionId,
      dualContext,
      { assuranceLevel: "mfa" },
    );
    assert.equal(result.status, "confirmed");
    if (result.status !== "confirmed") assert.fail("email change not confirmed");
    assert.equal(result.newEmail, NEW_EMAIL);
    assert.equal(result.revokedSessions, 1);
    assert.notEqual(result.session.token, currentSession.token);
    assert.equal(result.session.expiresAt, currentSession.expiresAt);
    const current = sqlite.prepare(
      `SELECT
         email,email_ciphertext AS ciphertext,
         email_lookup_hash AS lookupHash,
         email_lookup_key_version AS lookupKeyVersion
       FROM user_profiles WHERE id=?`,
    ).get(USER_ID) as Record<string, string>;
    assert.equal(current.email, NEW_EMAIL);
    assert.notEqual(current.ciphertext, NEW_EMAIL);
    assert.match(current.lookupHash, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(current.lookupKeyVersion, "v2");
    assert.equal(
      (
        sqlite.prepare(
          "SELECT revoked_at AS revokedAt FROM auth_sessions WHERE id=?",
        ).get(currentSession.sessionId) as { revokedAt: string | null }
      ).revokedAt,
      null,
    );
    assert.equal(
      (
        sqlite.prepare(
          "SELECT revoked_at AS revokedAt FROM auth_sessions WHERE id=?",
        ).get(otherSession.sessionId) as { revokedAt: string | null }
      ).revokedAt,
      "2026-07-26T12:02:00.000Z",
    );
    const resolvedSession = await localSessionFromCookie(
      d1,
      `juro_session=${result.session.token}`,
      {
        touch: false,
        now: new Date("2026-07-26T12:02:01.000Z"),
        identity: dualContext,
      },
    );
    assert.equal(resolvedSession?.email, NEW_EMAIL);
    assert.equal(
      (
        sqlite.prepare(
          `SELECT count(*) AS total FROM auth_otp_challenges
           WHERE invalidated_at=?`,
        ).get("2026-07-26T12:02:00.000Z") as { total: number }
      ).total,
      2,
    );
    assert.equal(
      (
        sqlite.prepare(
          `SELECT invalidated_at AS invalidatedAt
           FROM account_deletion_challenges WHERE id=?`,
        ).get("email-change-deletion") as { invalidatedAt: string | null }
      ).invalidatedAt,
      "2026-07-26T12:02:00.000Z",
    );
    assert.equal(
      (
        sqlite.prepare(
          `SELECT invalidated_at AS invalidatedAt
           FROM auth_mfa_challenges WHERE id=?`,
        ).get("email-change-login-mfa") as {
          invalidatedAt: string | null;
        }
      ).invalidatedAt,
      "2026-07-26T12:02:00.000Z",
    );
    assert.equal(
      (
        sqlite.prepare(
          `SELECT count(*) AS total FROM workspace_audit_events
           WHERE actor_user_id=? AND action='account_email_changed'`,
        ).get(USER_ID) as { total: number }
      ).total,
      1,
    );
    assert.equal(
      (
        sqlite.prepare(
          `SELECT count(*) AS total FROM security_events
           WHERE user_id=? AND event_type='account.email_changed'`,
        ).get(USER_ID) as { total: number }
      ).total,
      1,
    );
    const changedEvent = sqlite.prepare(
      `SELECT device_id AS deviceId,metadata_json AS metadataJson
       FROM security_events
       WHERE user_id=? AND event_type='account.email_changed'`,
    ).get(USER_ID) as { deviceId: string; metadataJson: string };
    assert.equal(changedEvent.deviceId, currentSession.deviceId);
    const changedMetadata = JSON.parse(changedEvent.metadataJson) as {
      sessionTokenRotated: boolean;
      tokenHistoryId: string;
      securityEmailJobId: string;
    };
    assert.equal(changedMetadata.sessionTokenRotated, true);
    const tokenHistory = sqlite.prepare(
      `SELECT token_hash AS tokenHash,rotation_reason AS rotationReason,
         expires_at AS expiresAt FROM auth_session_token_history WHERE id=?`,
    ).get(changedMetadata.tokenHistoryId) as {
      tokenHash: string;
      rotationReason: string;
      expiresAt: string;
    };
    assert.equal(tokenHistory.tokenHash, await sha256(currentSession.token));
    assert.equal(tokenHistory.rotationReason, "email_change");
    assert.equal(tokenHistory.expiresAt, currentSession.expiresAt);
    assert.equal(changedMetadata.securityEmailJobId, result.securityEmailJobId);
    const securityEmail = sqlite.prepare(
      `SELECT recipient_ciphertext AS recipientCiphertext,
         recipient_iv AS recipientIv,recipient_key_version AS recipientKeyVersion,
         status,attempt_count AS attemptCount
       FROM security_email_jobs WHERE id=?`,
    ).get(result.securityEmailJobId) as {
      recipientCiphertext: string;
      recipientIv: string;
      recipientKeyVersion: string;
      status: string;
      attemptCount: number;
    };
    assert.notEqual(securityEmail.recipientCiphertext, CURRENT_EMAIL);
    assert.equal(securityEmail.recipientIv.length, 16);
    assert.equal(securityEmail.recipientKeyVersion, "v2");
    assert.equal(securityEmail.status, "pending");
    assert.equal(securityEmail.attemptCount, 0);
    const outbox = sqlite.prepare(
      `SELECT queue_binding AS queueBinding,job_type AS jobType,
         subject_id AS subjectId,status
       FROM job_outbox WHERE subject_id=?`,
    ).get(result.securityEmailJobId) as {
      queueBinding: string;
      jobType: string;
      subjectId: string;
      status: string;
    };
    assert.equal(outbox.queueBinding, "EMAIL_NOTIFICATIONS_QUEUE");
    assert.equal(outbox.jobType, "email.send");
    assert.equal(outbox.subjectId, result.securityEmailJobId);
    assert.equal(outbox.status, "pending");
  } finally {
    sqlite.close();
  }
});

test("retired pre-change token replay revokes the replacement session and device", async () => {
  const { sqlite, d1, currentSession } = await fixture();
  try {
    await reserve(d1, currentSession.sessionId);
    await queue(d1, currentSession.sessionId);
    const result = await confirm(d1, currentSession.sessionId);
    assert.equal(result.status, "confirmed");
    if (result.status !== "confirmed") assert.fail("email change not confirmed");
    assert.ok(await localSessionFromCookie(
      d1,
      `juro_session=${result.session.token}`,
      {
        touch: false,
        now: new Date("2026-07-26T12:02:01.000Z"),
        identity: dualContext,
      },
    ));
    for (let replay = 0; replay < 2; replay += 1) {
      assert.equal(await localSessionFromCookie(
        d1,
        `juro_session=${currentSession.token}`,
        {
          touch: false,
          now: new Date("2026-07-26T12:02:02.000Z"),
          identity: dualContext,
        },
      ), null);
    }
    const sessionState = sqlite.prepare(
      "SELECT revoked_at AS revokedAt FROM auth_sessions WHERE id=?",
    ).get(currentSession.sessionId) as { revokedAt: string | null };
    assert.equal(sessionState.revokedAt, "2026-07-26T12:02:02.000Z");
    const deviceState = sqlite.prepare(
      "SELECT revoked_at AS revokedAt FROM auth_devices WHERE id=?",
    ).get(currentSession.deviceId) as { revokedAt: string | null };
    assert.equal(deviceState.revokedAt, "2026-07-26T12:02:02.000Z");
    const replayEvidence = sqlite.prepare(
      `SELECT count(*) AS total
       FROM auth_session_token_replays replay
       JOIN auth_session_token_history history
         ON history.id=replay.token_history_id
       WHERE history.session_id=? AND history.rotation_reason='email_change'`,
    ).get(currentSession.sessionId) as { total: number };
    assert.equal(replayEvidence.total, 1);
    const replayEvents = sqlite.prepare(
      `SELECT count(*) AS total FROM security_events
       WHERE user_id=? AND event_type='session.token_replayed'`,
    ).get(USER_ID) as { total: number };
    assert.equal(replayEvents.total, 1);
    assert.equal(await localSessionFromCookie(
      d1,
      `juro_session=${result.session.token}`,
      {
        touch: false,
        now: new Date("2026-07-26T12:02:03.000Z"),
        identity: dualContext,
      },
    ), null);
  } finally {
    sqlite.close();
  }
});

test("parallel email confirmations have exactly one winner", async () => {
  const { sqlite, d1, currentSession } = await fixture();
  try {
    await reserve(d1, currentSession.sessionId);
    await queue(d1, currentSession.sessionId);
    const synchronized = batchBarrier(d1);
    const results = await Promise.all([
      confirm(synchronized, currentSession.sessionId),
      confirm(synchronized, currentSession.sessionId),
    ]);
    assert.equal(
      results.filter(result => result.status === "confirmed").length,
      1,
    );
    assert.equal(
      results.filter(result => result.status === "used").length,
      1,
    );
    assert.equal(
      (
        sqlite.prepare(
          `SELECT count(*) AS total FROM security_events
           WHERE user_id=? AND event_type='account.email_changed'`,
        ).get(USER_ID) as { total: number }
      ).total,
      1,
    );
    const historyCount = sqlite.prepare(
      `SELECT count(*) AS total FROM auth_session_token_history
       WHERE session_id=? AND rotation_reason='email_change'`,
    ).get(currentSession.sessionId) as { total: number };
    assert.equal(historyCount.total, 1);
    assert.equal(
      (sqlite.prepare(
        "SELECT count(*) AS total FROM security_email_jobs",
      ).get() as { total: number }).total,
      1,
    );
    assert.equal(
      (sqlite.prepare(
        "SELECT count(*) AS total FROM job_outbox WHERE job_type='email.send'",
      ).get() as { total: number }).total,
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("incorrect dual codes share one attempt budget and never rotate identity", async () => {
  const { sqlite, d1, currentSession } = await fixture();
  try {
    await reserve(d1, currentSession.sessionId);
    await queue(d1, currentSession.sessionId);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const result = await confirm(
        d1,
        currentSession.sessionId,
        dualContext,
        {
          currentCode: attempt % 2 ? "000000" : CURRENT_CODE,
          newCode: attempt % 2 ? NEW_CODE : "000000",
        },
      );
      assert.equal(
        result.status,
        attempt === 5 ? "attempts_exceeded" : "incorrect",
      );
    }
    assert.equal(
      (await confirm(d1, currentSession.sessionId)).status,
      "attempts_exceeded",
    );
    assert.equal(
      (
        sqlite.prepare(
          "SELECT email FROM user_profiles WHERE id=?",
        ).get(USER_ID) as { email: string }
      ).email,
      CURRENT_EMAIL,
    );
  } finally {
    sqlite.close();
  }
});

test("challenge is session-bound and active MFA rejects a primary reservation", async () => {
  const primary = await fixture({ activeMfa: true });
  try {
    primary.sqlite.prepare(
      `UPDATE auth_sessions
       SET auth_method='email_otp',assurance_level='primary',
           mfa_verified_at=NULL
       WHERE id=?`,
    ).run(primary.currentSession.sessionId);
    const blocked = await reserve(
      primary.d1,
      primary.currentSession.sessionId,
    );
    assert.equal(blocked.status, "blocked");
    if (blocked.status === "blocked") {
      assert.equal(blocked.reason, "state_changed");
    }
  } finally {
    primary.sqlite.close();
  }

  const foreign = await fixture();
  try {
    await reserve(foreign.d1, foreign.currentSession.sessionId);
    await queue(foreign.d1, foreign.currentSession.sessionId);
    assert.equal(
      (
        await confirm(
          foreign.d1,
          foreign.otherSession.sessionId,
        )
      ).status,
      "invalid",
    );
    foreign.sqlite.prepare(
      "UPDATE auth_sessions SET revoked_at=? WHERE id=?",
    ).run(
      "2026-07-26T12:01:30.000Z",
      foreign.currentSession.sessionId,
    );
    assert.equal(
      (
        await confirm(
          foreign.d1,
          foreign.currentSession.sessionId,
          dualContext,
          { currentCode: "000000", newCode: "000000" },
        )
      ).status,
      "state_conflict",
    );
    assert.equal(
      (
        foreign.sqlite.prepare(
          "SELECT attempt_count AS attemptCount FROM email_change_challenges WHERE id=?",
        ).get(CHALLENGE_ID) as { attemptCount: number }
      ).attemptCount,
      0,
    );
    assert.equal(
      (
        await confirm(
          foreign.d1,
          foreign.currentSession.sessionId,
        )
      ).status,
      "state_conflict",
    );
    assert.equal(
      (
        foreign.sqlite.prepare(
          "SELECT consumed_at AS consumedAt FROM email_change_challenges WHERE id=?",
        ).get(CHALLENGE_ID) as { consumedAt: string | null }
      ).consumedAt,
      null,
    );
  } finally {
    foreign.sqlite.close();
  }
});

test("target ownership race invalidates an otherwise correct challenge", async () => {
  const { sqlite, d1, currentSession } = await fixture();
  try {
    await reserve(d1, currentSession.sessionId);
    await queue(d1, currentSession.sessionId);
    sqlite.prepare(
      `INSERT INTO user_profiles (id,email,created_at,updated_at)
       VALUES (?,?,?,?)`,
    ).run(
      "target-owner",
      NEW_EMAIL,
      "2026-07-26T12:01:30.000Z",
      "2026-07-26T12:01:30.000Z",
    );
    assert.equal(
      (await confirm(d1, currentSession.sessionId)).status,
      "target_unavailable",
    );
    assert.equal(
      (
        sqlite.prepare(
          `SELECT invalidated_at AS invalidatedAt
           FROM email_change_challenges WHERE id=?`,
        ).get(CHALLENGE_ID) as { invalidatedAt: string | null }
      ).invalidatedAt,
      "2026-07-26T12:02:00.000Z",
    );
  } finally {
    sqlite.close();
  }
});

test("email-change audit failure rolls back identity, claim, and revocation", async () => {
  const {
    sqlite,
    d1,
    currentSession,
    otherSession,
  } = await fixture();
  try {
    await reserve(d1, currentSession.sessionId);
    await queue(d1, currentSession.sessionId);
    sqlite.exec(`
      CREATE TRIGGER reject_email_change_audit
      BEFORE INSERT ON workspace_audit_events
      WHEN NEW.action='account_email_changed'
      BEGIN
        SELECT RAISE(ABORT, 'forced email change audit failure');
      END
    `);
    await assert.rejects(
      () => confirm(d1, currentSession.sessionId),
      /forced email change audit failure/,
    );
    assert.equal(
      (
        sqlite.prepare(
          "SELECT email FROM user_profiles WHERE id=?",
        ).get(USER_ID) as { email: string }
      ).email,
      CURRENT_EMAIL,
    );
    assert.equal(
      (
        sqlite.prepare(
          "SELECT consumed_at AS consumedAt FROM email_change_challenges WHERE id=?",
        ).get(CHALLENGE_ID) as { consumedAt: string | null }
      ).consumedAt,
      null,
    );
    assert.equal(
      (
        sqlite.prepare(
          "SELECT revoked_at AS revokedAt FROM auth_sessions WHERE id=?",
        ).get(otherSession.sessionId) as { revokedAt: string | null }
      ).revokedAt,
      null,
    );
    const historyCount = sqlite.prepare(
      `SELECT count(*) AS total FROM auth_session_token_history
       WHERE session_id=? AND rotation_reason='email_change'`,
    ).get(currentSession.sessionId) as { total: number };
    assert.equal(historyCount.total, 0);
    assert.equal(
      (sqlite.prepare(
        "SELECT count(*) AS total FROM security_email_jobs",
      ).get() as { total: number }).total,
      0,
    );
    assert.equal(
      (sqlite.prepare(
        "SELECT count(*) AS total FROM job_outbox WHERE job_type='email.send'",
      ).get() as { total: number }).total,
      0,
    );
    assert.ok(await localSessionFromCookie(
      d1,
      `juro_session=${currentSession.token}`,
      {
        touch: false,
        now: new Date("2026-07-26T12:02:01.000Z"),
        identity: dualContext,
      },
    ));
  } finally {
    sqlite.close();
  }
});

test("legacy mode works while keyed mode rejects divergent retained evidence", async () => {
  const legacy = await fixture({ identityContext: legacyContext });
  try {
    await reserve(
      legacy.d1,
      legacy.currentSession.sessionId,
      legacyContext,
    );
    await queue(legacy.d1, legacy.currentSession.sessionId);
    const evidence = legacy.sqlite.prepare(
      `SELECT
         new_email_ciphertext AS ciphertext,
         current_code_hmac AS currentCodeHmac,
         new_code_hmac AS newCodeHmac
       FROM email_change_challenges WHERE id=?`,
    ).get(CHALLENGE_ID) as Record<string, string | null>;
    assert.deepEqual({ ...evidence }, {
      ciphertext: null,
      currentCodeHmac: null,
      newCodeHmac: null,
    });
    assert.equal(
      (
        await confirm(
          legacy.d1,
          legacy.currentSession.sessionId,
          legacyContext,
        )
      ).status,
      "confirmed",
    );
  } finally {
    legacy.sqlite.close();
  }

  const keyed = await fixture();
  try {
    await reserve(keyed.d1, keyed.currentSession.sessionId);
    await queue(keyed.d1, keyed.currentSession.sessionId);
    keyed.sqlite.prepare(
      `UPDATE email_change_challenges
       SET current_code_hash='divergent' WHERE id=?`,
    ).run(CHALLENGE_ID);
    await assert.rejects(
      confirm(keyed.d1, keyed.currentSession.sessionId),
      (error: unknown) => error instanceof IdentityProtectionError
        && error.code === "IDENTITY_VALUE_DIVERGED",
    );
    assert.equal(
      (
        keyed.sqlite.prepare(
          "SELECT email FROM user_profiles WHERE id=?",
        ).get(USER_ID) as { email: string }
      ).email,
      CURRENT_EMAIL,
    );
  } finally {
    keyed.sqlite.close();
  }
});
