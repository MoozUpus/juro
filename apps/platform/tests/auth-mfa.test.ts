import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { sha256 } from "../lib/auth/crypto";
import { parseIdentityKeyring } from "../lib/auth/keyring";
import {
  beginTotpEnrollment,
  confirmTotpEnrollment,
  createLoginMfaChallenge,
  disableMfa,
  MfaError,
  mfaStatus,
  regenerateBackupCodes,
  verifyLoginMfa,
} from "../lib/auth/mfa-service";
import { createEmailOtpSession } from "../lib/auth/session-management";
import { totpCode } from "../lib/auth/totp";

type SqliteBinding = null | number | bigint | string;

class SqliteStatement {
  constructor(
    private readonly database: DatabaseSync,
    private readonly sql: string,
    private readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]): SqliteStatement {
    return new SqliteStatement(this.database, this.sql, values);
  }

  private bindings(): SqliteBinding[] {
    return this.values.map(value => {
      if (
        value === null
        || typeof value === "number"
        || typeof value === "bigint"
        || typeof value === "string"
      ) return value;
      throw new TypeError("Unsupported test binding.");
    });
  }

  execute<T>() {
    const statement = this.database.prepare(this.sql);
    if (
      /^\s*(?:SELECT|PRAGMA|WITH)\b/i.test(this.sql)
      || /\bRETURNING\b/i.test(this.sql)
    ) {
      const results = statement.all(...this.bindings()) as T[];
      const changes = Number((
        this.database.prepare("SELECT changes() AS value").get() as {
          value: number | bigint;
        }
      ).value);
      return { results, success: true as const, meta: { changes } };
    }
    const result = statement.run(...this.bindings());
    return {
      results: [] as T[],
      success: true as const,
      meta: { changes: Number(result.changes) },
    };
  }

  async first<T>(): Promise<T | null> {
    return (
      this.database.prepare(this.sql).get(...this.bindings()) as T | undefined
    ) ?? null;
  }

  async all<T>() {
    return this.execute<T>();
  }

  async run<T>() {
    return this.execute<T>();
  }
}

const drizzleRoot = new URL("../drizzle/", import.meta.url);
const journal = JSON.parse(
  readFileSync(new URL("meta/_journal.json", drizzleRoot), "utf8"),
) as { entries: Array<{ tag: string }> };

function migrationStatements(sql: string): string[] {
  return sql.split("--> statement-breakpoint")
    .map(statement => statement.trim())
    .filter(Boolean);
}

function fixture(): { sqlite: DatabaseSync; d1: D1Database } {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const entry of journal.entries) {
    const sql = readFileSync(
      new URL(`${entry.tag}.sql`, drizzleRoot),
      "utf8",
    );
    for (const statement of migrationStatements(sql)) sqlite.exec(statement);
  }
  const d1 = {
    prepare(sql: string) {
      return new SqliteStatement(sqlite, sql);
    },
    async batch(statements: D1PreparedStatement[]) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map(statement =>
          (statement as unknown as SqliteStatement).execute()
        );
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;
  return { sqlite, d1 };
}

function batchBarrier(db: D1Database, participants = 2): D1Database {
  let arrived = 0;
  let release: (() => void) | null = null;
  const ready = new Promise<void>(resolve => {
    release = resolve;
  });
  return {
    prepare: db.prepare.bind(db),
    async batch(statements: D1PreparedStatement[]) {
      arrived += 1;
      if (arrived >= participants) release?.();
      else await ready;
      return db.batch(statements);
    },
  } as unknown as D1Database;
}

function encodedKey(seed: number): string {
  const bytes = Uint8Array.from(
    { length: 32 },
    (_, index) => (seed + index) % 256,
  );
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function keyring() {
  return parseIdentityKeyring(JSON.stringify({
    active: "v1",
    versions: {
      v1: { aead: encodedKey(1), hmac: encodedKey(65) },
    },
  }));
}

function insertUser(sqlite: DatabaseSync) {
  const timestamp = "2026-07-26T12:00:00.000Z";
  sqlite.prepare(`
    INSERT INTO user_profiles (
      id,email,locale,account_type,timezone,onboarding_completed_at,
      created_at,updated_at
    ) VALUES ('user-mfa','mfa@example.test','ru','individual',
      'Asia/Tashkent',?,?,?)
  `).run(timestamp, timestamp, timestamp);
}

async function insertConsumedOtp(
  sqlite: DatabaseSync,
  id: string,
  consumedAt: string,
): Promise<string> {
  const email = "mfa@example.test";
  const emailHash = await sha256(email);
  sqlite.prepare(`
    INSERT INTO auth_otp_challenges (
      id,email,email_hash,purpose,locale,account_type,code_salt,code_hash,
      attempt_count,max_attempts,expires_at,consumed_at,invalidated_at,
      request_ip_hash,created_at
    ) VALUES (?,?,?,'login','ru','individual','salt','hash',1,5,?,
      ?,NULL,NULL,?)
  `).run(
    id,
    email,
    emailHash,
    "2026-07-26T13:00:00.000Z",
    consumedAt,
    consumedAt,
  );
  return emailHash;
}

async function pendingFixture() {
  const { sqlite, d1 } = fixture();
  insertUser(sqlite);
  const first = await createEmailOtpSession(d1, {
    userId: "user-mfa",
    userAgent: "Browser/1.0",
    now: new Date("2026-07-26T12:00:00.000Z"),
  });
  const second = await createEmailOtpSession(d1, {
    userId: "user-mfa",
    userAgent: "Browser/2.0",
    now: new Date("2026-07-26T12:00:10.000Z"),
  });
  const enrollment = await beginTotpEnrollment(d1, keyring(), {
    userId: "user-mfa",
    sessionId: first.sessionId,
    email: "mfa@example.test",
    now: new Date("2026-07-26T12:01:00.000Z"),
  });
  return { sqlite, d1, first, second, enrollment };
}

async function enrolledFixture() {
  const value = await pendingFixture();
  const confirmationAt = new Date("2026-07-26T12:02:00.000Z");
  const code = (await totpCode(value.enrollment.secret, confirmationAt)).code;
  const confirmed = await confirmTotpEnrollment(value.d1, keyring(), {
    userId: "user-mfa",
    sessionId: value.first.sessionId,
    credentialId: value.enrollment.credentialId,
    code,
    now: confirmationAt,
  });
  return { ...value, backupCodes: confirmed.backupCodes };
}

test("concurrent enrollment confirmation has one exact-claim winner", async () => {
  const authSource = readFileSync(
    new URL("../app/chatgpt-auth.ts", import.meta.url),
    "utf8",
  );
  assert.match(authSource, /await hasActiveMfa\(db, localUser\.id\)/);
  assert.match(
    authSource,
    /catch\s*\{[\s\S]*fail closed[\s\S]*return null;/,
  );
  const sessionSource = readFileSync(
    new URL("../lib/auth/session.ts", import.meta.url),
    "utf8",
  );
  assert.equal(
    sessionSource.match(/Path=\/api\/auth\/verify-mfa/g)?.length,
    2,
    "set and clear helpers must use the exact verify-MFA cookie path",
  );
  assert.doesNotMatch(sessionSource, /Path=\/api\/auth;/);
  const value = await pendingFixture();
  const { sqlite, d1, first, second, enrollment } = value;
  try {
    const now = new Date("2026-07-26T12:02:00.000Z");
    const code = (await totpCode(enrollment.secret, now)).code;
    const synchronized = batchBarrier(d1);
    const outcomes = await Promise.allSettled([
      confirmTotpEnrollment(synchronized, keyring(), {
        userId: "user-mfa",
        sessionId: first.sessionId,
        credentialId: enrollment.credentialId,
        code,
        now,
      }),
      confirmTotpEnrollment(synchronized, keyring(), {
        userId: "user-mfa",
        sessionId: second.sessionId,
        credentialId: enrollment.credentialId,
        code,
        now,
      }),
    ]);
    assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(outcomes.filter(result => result.status === "rejected").length, 1);
    assert.deepEqual(await mfaStatus(d1, "user-mfa"), {
      enabled: true,
      verifiedAt: now.toISOString(),
      backupCodesRemaining: 10,
    });
    assert.equal((
      sqlite.prepare(`
        SELECT count(*) AS total FROM auth_mfa_factor_claims
        WHERE operation_id=?
      `).get(`enroll:${enrollment.credentialId}`) as { total: number }
    ).total, 1);
    const active = sqlite.prepare(`
      SELECT assurance_level AS assuranceLevel
      FROM auth_sessions WHERE user_id='user-mfa' AND revoked_at IS NULL
    `).all() as Array<{ assuranceLevel: string }>;
    assert.deepEqual(active.map(row => ({ ...row })), [
      { assuranceLevel: "mfa" },
    ]);
  } finally {
    sqlite.close();
  }
});

test("failed confirmation with a revoked source session has no side effects", async () => {
  const value = await pendingFixture();
  const { sqlite, d1, first, second, enrollment } = value;
  try {
    sqlite.prepare("UPDATE auth_sessions SET revoked_at=? WHERE id=?").run(
      "2026-07-26T12:01:30.000Z",
      first.sessionId,
    );
    const now = new Date("2026-07-26T12:02:00.000Z");
    const code = (await totpCode(enrollment.secret, now)).code;
    await assert.rejects(
      confirmTotpEnrollment(d1, keyring(), {
        userId: "user-mfa",
        sessionId: first.sessionId,
        credentialId: enrollment.credentialId,
        code,
        now,
      }),
      (error: unknown) =>
        error instanceof MfaError && error.code === "MFA_STATE_CONFLICT",
    );
    assert.equal((
      sqlite.prepare(
        "SELECT revoked_at AS revokedAt FROM auth_sessions WHERE id=?",
      ).get(second.sessionId) as { revokedAt: string | null }
    ).revokedAt, null);
    assert.equal((await mfaStatus(d1, "user-mfa")).enabled, false);
  } finally {
    sqlite.close();
  }
});

test("MFA login issues exactly one session and fences replay", async () => {
  const value = await enrolledFixture();
  const { sqlite, d1, enrollment } = value;
  try {
    const emailHash = await insertConsumedOtp(
      sqlite,
      "otp-login",
      "2026-07-26T12:03:00.000Z",
    );
    const challenge = await createLoginMfaChallenge(d1, keyring(), {
      userId: "user-mfa",
      emailHash,
      emailOtpChallengeId: "otp-login",
      userAgent: "Browser/3.0",
      now: new Date("2026-07-26T12:03:00.000Z"),
    });
    const now = new Date("2026-07-26T12:03:30.000Z");
    const code = (await totpCode(enrollment.secret, now)).code;
    const synchronized = batchBarrier(d1);
    const outcomes = await Promise.allSettled([
      verifyLoginMfa(synchronized, keyring(), {
        token: challenge.token,
        code,
        userAgent: "Browser/3.0",
        now,
      }),
      verifyLoginMfa(synchronized, keyring(), {
        token: challenge.token,
        code,
        userAgent: "Browser/3.0",
        now,
      }),
    ]);
    assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(outcomes.filter(result => result.status === "rejected").length, 1);
    assert.equal((
      sqlite.prepare(`
        SELECT count(*) AS total FROM auth_sessions
        WHERE auth_method='email_otp+totp'
      `).get() as { total: number }
    ).total, 2, "enrollment session plus exactly one login session");
  } finally {
    sqlite.close();
  }
});

test("regeneration rotates backup codes and revokes the old batch", async () => {
  const value = await enrolledFixture();
  const { sqlite, d1, first, enrollment, backupCodes } = value;
  try {
    const regenerateAt = new Date("2026-07-26T12:06:00.000Z");
    const regenerated = await regenerateBackupCodes(d1, keyring(), {
      userId: "user-mfa",
      sessionId: first.sessionId,
      code: (await totpCode(enrollment.secret, regenerateAt)).code,
      now: regenerateAt,
    });
    assert.equal(regenerated.backupCodes.length, 10);
    assert.notDeepEqual(regenerated.backupCodes, backupCodes);
    assert.equal((
      sqlite.prepare(`
        SELECT count(*) AS total FROM auth_backup_codes
        WHERE revoked_at IS NOT NULL
      `).get() as { total: number }
    ).total, 10);
    assert.equal((await mfaStatus(d1, "user-mfa")).backupCodesRemaining, 10);
  } finally {
    sqlite.close();
  }
});

test("backup codes are single-use and challenge attempts lock at five", async () => {
  const value = await enrolledFixture();
  const { sqlite, d1, backupCodes } = value;
  try {
    const emailHash = await insertConsumedOtp(
      sqlite,
      "otp-backup",
      "2026-07-26T12:04:00.000Z",
    );
    const challenge = await createLoginMfaChallenge(d1, keyring(), {
      userId: "user-mfa",
      emailHash,
      emailOtpChallengeId: "otp-backup",
      userAgent: "Browser/5.0",
      now: new Date("2026-07-26T12:04:00.000Z"),
    });
    await verifyLoginMfa(d1, keyring(), {
      token: challenge.token,
      code: backupCodes[0],
      userAgent: "Browser/5.0",
      now: new Date("2026-07-26T12:04:10.000Z"),
    });
    assert.equal((
      sqlite.prepare(`
        SELECT count(*) AS total FROM auth_backup_codes
        WHERE used_at IS NOT NULL
      `).get() as { total: number }
    ).total, 1);
    assert.equal((await mfaStatus(d1, "user-mfa")).backupCodesRemaining, 9);

    const lockedHash = await insertConsumedOtp(
      sqlite,
      "otp-lockout",
      "2026-07-26T12:05:00.000Z",
    );
    const locked = await createLoginMfaChallenge(d1, keyring(), {
      userId: "user-mfa",
      emailHash: lockedHash,
      emailOtpChallengeId: "otp-lockout",
      userAgent: "Browser/6.0",
      now: new Date("2026-07-26T12:05:00.000Z"),
    });
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await assert.rejects(
        verifyLoginMfa(d1, keyring(), {
          token: locked.token,
          code: backupCodes[0],
          userAgent: "Browser/6.0",
          now: new Date(`2026-07-26T12:05:0${attempt}.000Z`),
        }),
        (error: unknown) =>
          error instanceof MfaError
          && error.code === (
            attempt === 5
              ? "MFA_ATTEMPTS_EXCEEDED"
              : "MFA_CODE_INCORRECT"
          ),
      );
    }
    const challengeRow = sqlite.prepare(`
      SELECT attempt_count AS attemptCount,invalidated_at AS invalidatedAt
      FROM auth_mfa_challenges WHERE email_otp_challenge_id=?
    `).get("otp-lockout") as {
      attemptCount: number;
      invalidatedAt: string | null;
    };
    assert.equal(challengeRow.attemptCount, 5);
    assert.ok(challengeRow.invalidatedAt);
  } finally {
    sqlite.close();
  }
});

test("losing a concurrent disable cannot revoke the winning session", async () => {
  const value = await enrolledFixture();
  const { sqlite, d1, first, enrollment } = value;
  try {
    const emailHash = await insertConsumedOtp(
      sqlite,
      "otp-disable-race",
      "2026-07-26T12:07:00.000Z",
    );
    const challenge = await createLoginMfaChallenge(d1, keyring(), {
      userId: "user-mfa",
      emailHash,
      emailOtpChallengeId: "otp-disable-race",
      userAgent: "Browser/7.0",
      now: new Date("2026-07-26T12:07:00.000Z"),
    });
    const secondLoginAt = new Date("2026-07-26T12:07:30.000Z");
    const secondLogin = await verifyLoginMfa(d1, keyring(), {
      token: challenge.token,
      code: (await totpCode(enrollment.secret, secondLoginAt)).code,
      userAgent: "Browser/7.0",
      now: secondLoginAt,
    });
    const disableAt = new Date("2026-07-26T12:08:30.000Z");
    const disableCode = (await totpCode(enrollment.secret, disableAt)).code;
    const synchronized = batchBarrier(d1);
    const outcomes = await Promise.allSettled([
      disableMfa(synchronized, keyring(), {
        userId: "user-mfa",
        sessionId: first.sessionId,
        code: disableCode,
        now: disableAt,
      }),
      disableMfa(synchronized, keyring(), {
        userId: "user-mfa",
        sessionId: secondLogin.session.sessionId,
        code: disableCode,
        now: disableAt,
      }),
    ]);
    assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(outcomes.filter(result => result.status === "rejected").length, 1);
    const active = sqlite.prepare(`
      SELECT assurance_level AS assuranceLevel,auth_method AS authMethod
      FROM auth_sessions WHERE user_id='user-mfa' AND revoked_at IS NULL
    `).all() as Array<{ assuranceLevel: string; authMethod: string }>;
    assert.deepEqual(active.map(row => ({ ...row })), [
      { assuranceLevel: "primary", authMethod: "email_otp" },
    ]);
    assert.equal((await mfaStatus(d1, "user-mfa")).enabled, false);
  } finally {
    sqlite.close();
  }
});
