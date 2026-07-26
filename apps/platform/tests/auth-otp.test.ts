import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { sha256 } from "../lib/auth/crypto";
import {
  parseJsonRequest,
  requestOtpInputSchema,
  verifyOtpInputSchema,
} from "../lib/auth/input";
import { consumeOtpChallenge } from "../lib/auth/otp-challenge";
import { reserveOtpChallenge } from "../lib/auth/otp-request";
import { sessionTokenFromCookie } from "../lib/auth/session-token";

class SqliteStatement {
  constructor(
    private readonly database: DatabaseSync,
    private readonly sql: string,
    private readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]): SqliteStatement {
    return new SqliteStatement(this.database, this.sql, values);
  }

  private bindings(): Array<null | number | bigint | string> {
    return this.values.map((value) => {
      if (
        value === null ||
        typeof value === "number" ||
        typeof value === "bigint" ||
        typeof value === "string"
      ) {
        return value;
      }
      throw new TypeError("Unsupported test binding.");
    });
  }

  async first<T>(): Promise<T | null> {
    return (
      this.database.prepare(this.sql).get(...this.bindings()) as T | undefined
    ) ?? null;
  }

  execute<T>(): {
    results: T[];
    success: true;
    meta: { changes: number };
  } {
    const statement = this.database.prepare(this.sql);
    if (/^\s*(?:SELECT|PRAGMA|WITH)\b/i.test(this.sql) || /\bRETURNING\b/i.test(this.sql)) {
      const results = statement.all(...this.bindings()) as T[];
      const changes = Number(
        (
          this.database.prepare("SELECT changes() AS value").get() as {
            value: number | bigint;
          }
        ).value,
      );
      return { results, success: true, meta: { changes } };
    }
    const result = statement.run(...this.bindings());
    return {
      results: [],
      success: true,
      meta: { changes: Number(result.changes) },
    };
  }

  async run<T>(): Promise<{
    results: T[];
    success: true;
    meta: { changes: number };
  }> {
    return this.execute<T>();
  }
}

function databaseFixture(): {
  sqlite: DatabaseSync;
  d1: D1Database;
} {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE auth_otp_challenges (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL DEFAULT 'user@example.test',
      email_hash TEXT NOT NULL,
      purpose TEXT NOT NULL,
      locale TEXT NOT NULL DEFAULT 'ru',
      code_salt TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      invalidated_at TEXT,
      account_type TEXT NOT NULL,
      request_ip_hash TEXT,
      created_at TEXT NOT NULL DEFAULT '2026-07-26T00:00:00.000Z'
    );
  `);
  const d1 = {
    prepare(sql: string) {
      return new SqliteStatement(sqlite, sql);
    },
    async batch(statements: D1PreparedStatement[]) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((statement) =>
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

async function insertChallenge(
  sqlite: DatabaseSync,
  overrides: Partial<{
    id: string;
    emailHash: string;
    purpose: "login" | "register";
    code: string;
    attempts: number;
    maxAttempts: number;
    expiresAt: string;
    consumedAt: string | null;
    invalidatedAt: string | null;
  }> = {},
) {
  const input = {
    id: "challenge-1",
    emailHash: "email-hash",
    purpose: "login" as const,
    code: "123456",
    attempts: 0,
    maxAttempts: 5,
    expiresAt: "2999-01-01T00:00:00.000Z",
    consumedAt: null,
    invalidatedAt: null,
    ...overrides,
  };
  const salt = "salt";
  sqlite.prepare(`
    INSERT INTO auth_otp_challenges (
      id, email_hash, purpose, code_salt, code_hash, attempt_count,
      max_attempts, expires_at, consumed_at, invalidated_at, account_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'individual')
  `).run(
    input.id,
    input.emailHash,
    input.purpose,
    salt,
    await sha256(`${salt}:${input.code}`),
    input.attempts,
    input.maxAttempts,
    input.expiresAt,
    input.consumedAt,
    input.invalidatedAt,
  );
  return input;
}

test("concurrent correct OTP requests create exactly one atomic claim", async () => {
  const { sqlite, d1 } = databaseFixture();
  try {
    const challenge = await insertChallenge(sqlite);
    const input = {
      challengeId: challenge.id,
      emailHash: challenge.emailHash,
      purpose: challenge.purpose,
      code: challenge.code,
      now: "2026-07-26T12:00:00.000Z",
    };
    const results = await Promise.all([
      consumeOtpChallenge(d1, input),
      consumeOtpChallenge(d1, input),
    ]);
    assert.deepEqual(
      results.map(({ status }) => status).sort(),
      ["used", "verified"],
    );
    const row = sqlite.prepare(`
      SELECT attempt_count AS attemptCount, consumed_at AS consumedAt
      FROM auth_otp_challenges
      WHERE id = ?
    `).get(challenge.id) as {
      attemptCount: number;
      consumedAt: string | null;
    };
    assert.equal(row.attemptCount, 1);
    assert.equal(row.consumedAt, input.now);
  } finally {
    sqlite.close();
  }
});

function reservationInput(overrides: Partial<{
  id: string;
  email: string;
  emailHash: string;
  ipHash: string | null;
  purpose: "login" | "register";
  now: string;
  cooldownSince: string;
  hourlySince: string;
}> = {}) {
  return {
    id: crypto.randomUUID(),
    email: "user@example.test",
    emailHash: "email-hash",
    purpose: "login" as const,
    locale: "ru" as const,
    accountType: "individual" as const,
    codeSalt: "salt",
    codeHash: "code-hash",
    expiresAt: "2026-07-26T12:10:00.000Z",
    ipHash: "ip-hash",
    now: "2026-07-26T12:00:00.000Z",
    cooldownSince: "2026-07-26T11:59:00.000Z",
    hourlySince: "2026-07-26T11:00:00.000Z",
    ...overrides,
  };
}

test("parallel OTP reservations create one active challenge", async () => {
  const { sqlite, d1 } = databaseFixture();
  try {
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        reserveOtpChallenge(d1, reservationInput())
      ),
    );
    assert.equal(
      results.filter(({ status }) => status === "reserved").length,
      1,
    );
    assert.equal(
      (
        sqlite.prepare(`
          SELECT count(*) AS total
          FROM auth_otp_challenges
          WHERE invalidated_at IS NULL
        `).get() as { total: number }
      ).total,
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("OTP hourly limit counts invalidated provider failures", async () => {
  const { sqlite, d1 } = databaseFixture();
  try {
    const insert = sqlite.prepare(`
      INSERT INTO auth_otp_challenges (
        id, email, email_hash, purpose, locale, account_type, code_salt,
        code_hash, attempt_count, max_attempts, expires_at, consumed_at,
        invalidated_at, request_ip_hash, created_at
      ) VALUES (?, 'user@example.test', 'email-hash', 'login', 'ru',
        'individual', 'salt', 'hash', 0, 5,
        '2026-07-26T12:10:00.000Z', NULL,
        '2026-07-26T11:30:00.000Z', 'ip-hash', ?)
    `);
    for (let index = 0; index < 8; index += 1) {
      insert.run(
        `failed-${index}`,
        `2026-07-26T11:${String(30 + index).padStart(2, "0")}:00.000Z`,
      );
    }
    const result = await reserveOtpChallenge(d1, reservationInput());
    assert.equal(result.status, "blocked");
    if (result.status === "blocked") assert.equal(result.hourlyCount, 8);
    assert.equal(
      (
        sqlite.prepare("SELECT count(*) AS total FROM auth_otp_challenges")
          .get() as { total: number }
      ).total,
      8,
    );
  } finally {
    sqlite.close();
  }
});

test("missing IP does not merge unrelated OTP email buckets", async () => {
  const { sqlite, d1 } = databaseFixture();
  try {
    const first = await reserveOtpChallenge(d1, reservationInput({
      id: "first",
      email: "first@example.test",
      emailHash: "first-hash",
      ipHash: null,
    }));
    const second = await reserveOtpChallenge(d1, reservationInput({
      id: "second",
      email: "second@example.test",
      emailHash: "second-hash",
      ipHash: null,
    }));
    assert.equal(first.status, "reserved");
    assert.equal(second.status, "reserved");
  } finally {
    sqlite.close();
  }
});

test("session cookies accept only exact 32-byte base64url tokens", () => {
  const valid = "A".repeat(43);
  assert.equal(
    sessionTokenFromCookie(`other=x; juro_session=${valid}`),
    valid,
  );
  assert.equal(sessionTokenFromCookie("juro_session=short"), null);
  assert.equal(sessionTokenFromCookie(`juro_session=${"A".repeat(44)}`), null);
  assert.equal(sessionTokenFromCookie("juro_session=%E0%A4%A"), null);
});

test("OTP JSON contracts reject type confusion, extra keys, and large bodies", async () => {
  const validRequest = await parseJsonRequest(
    new Request("https://app.juro.uz/api/auth/request-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "user@example.test",
        purpose: "login",
        locale: "ru",
        accountType: "individual",
      }),
    }),
    requestOtpInputSchema,
  );
  assert.equal(validRequest.ok, true);
  const confused = await parseJsonRequest(
    new Request("https://app.juro.uz/api/auth/request-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: 123,
        purpose: "login",
        locale: "ru",
        accountType: "individual",
        unexpected: true,
      }),
    }),
    requestOtpInputSchema,
  );
  assert.deepEqual(confused, { ok: false, error: "invalid_input" });
  const oversized = await parseJsonRequest(
    new Request("https://app.juro.uz/api/auth/verify-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ padding: "x".repeat(5_000) }),
    }),
    verifyOtpInputSchema,
  );
  assert.deepEqual(oversized, { ok: false, error: "payload_too_large" });
});

test("concurrent wrong OTP requests cannot overshoot the attempt budget", async () => {
  const { sqlite, d1 } = databaseFixture();
  try {
    const challenge = await insertChallenge(sqlite);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => consumeOtpChallenge(d1, {
        challengeId: challenge.id,
        emailHash: challenge.emailHash,
        purpose: challenge.purpose,
        code: "000000",
        now: "2026-07-26T12:00:00.000Z",
      })),
    );
    assert.equal(
      results.filter(({ status }) => status === "incorrect").length,
      4,
    );
    assert.equal(
      results.filter(({ status }) => status === "attempts_exceeded").length,
      4,
    );
    assert.equal(
      (
        sqlite.prepare(`
          SELECT attempt_count AS attemptCount
          FROM auth_otp_challenges
          WHERE id = ?
        `).get(challenge.id) as { attemptCount: number }
      ).attemptCount,
      5,
    );
  } finally {
    sqlite.close();
  }
});

test("expired, replaced, used, and mismatched OTP states remain distinct", async () => {
  for (const fixture of [
    {
      id: "expired",
      expiresAt: "2026-01-01T00:00:00.000Z",
      expected: "expired",
    },
    {
      id: "replaced",
      invalidatedAt: "2026-07-26T11:00:00.000Z",
      expected: "replaced",
    },
    {
      id: "used",
      consumedAt: "2026-07-26T11:00:00.000Z",
      expected: "used",
    },
  ] as const) {
    const { sqlite, d1 } = databaseFixture();
    try {
      const challenge = await insertChallenge(sqlite, fixture);
      const result = await consumeOtpChallenge(d1, {
        challengeId: challenge.id,
        emailHash: challenge.emailHash,
        purpose: challenge.purpose,
        code: challenge.code,
        now: "2026-07-26T12:00:00.000Z",
      });
      assert.equal(result.status, fixture.expected);
    } finally {
      sqlite.close();
    }
  }

  const { sqlite, d1 } = databaseFixture();
  try {
    const challenge = await insertChallenge(sqlite);
    const result = await consumeOtpChallenge(d1, {
      challengeId: challenge.id,
      emailHash: "another-email-hash",
      purpose: challenge.purpose,
      code: challenge.code,
      now: "2026-07-26T12:00:00.000Z",
    });
    assert.equal(result.status, "invalid");
  } finally {
    sqlite.close();
  }
});
