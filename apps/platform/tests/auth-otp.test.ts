import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { z } from "zod";
import { prepareAuthOtpChallengeEvidence } from "../lib/auth/challenge-evidence";
import { sha256 } from "../lib/auth/crypto";
import {
  createIdentityProtectionContext,
  IdentityProtectionError,
} from "../lib/auth/identity-protection";
import {
  parseJsonRequest,
  requestOtpInputSchema,
  verifyMfaInputSchema,
  verifyOtpInputSchema,
} from "../lib/auth/input";
import { consumeOtpChallenge } from "../lib/auth/otp-challenge";
import { reserveOtpChallenge } from "../lib/auth/otp-request";
import { sessionTokenFromCookie } from "../lib/auth/session-token";

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
const previousKeyContext = createIdentityProtectionContext(
  "dual_write",
  JSON.stringify({
    active: "v1",
    versions: {
      v1: { aead: encodedKey(1), hmac: encodedKey(33) },
      v2: { aead: encodedKey(65), hmac: encodedKey(97) },
    },
  }),
);

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
      email_lookup_hash TEXT,
      email_lookup_key_version TEXT,
      purpose TEXT NOT NULL,
      locale TEXT NOT NULL DEFAULT 'ru',
      code_salt TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      code_hmac TEXT,
      code_key_version TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      invalidated_at TEXT,
      verification_locked_until TEXT,
      account_type TEXT NOT NULL,
      request_ip_hash TEXT,
      request_ip_lookup_hash TEXT,
      request_ip_lookup_key_version TEXT,
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
    email: string;
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
    email: "user@example.test",
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
  const evidence = await prepareAuthOtpChallengeEvidence(dualContext, {
    challengeId: input.id,
    email: input.email,
    requestIp: null,
    purpose: input.purpose,
    codeSalt: salt,
    code: input.code,
  });
  sqlite.prepare(`
    INSERT INTO auth_otp_challenges (
      id,email,email_hash,email_lookup_hash,email_lookup_key_version,
      purpose,code_salt,code_hash,code_hmac,code_key_version,attempt_count,
      max_attempts, expires_at, consumed_at, invalidated_at, account_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'individual')
  `).run(
    input.id,
    evidence.email,
    evidence.emailEvidence.legacyHash,
    evidence.emailEvidence.lookupHash,
    evidence.emailEvidence.lookupKeyVersion,
    input.purpose,
    salt,
    evidence.codeEvidence.legacyHash,
    evidence.codeEvidence.lookupHash,
    evidence.codeEvidence.lookupKeyVersion,
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
      identityContext: dualContext,
      challengeId: challenge.id,
      email: challenge.email,
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
  identityContext: typeof dualContext;
  id: string;
  email: string;
  requestIp: string | null;
  purpose: "login" | "register";
  now: string;
  cooldownSince: string;
  hourlySince: string;
}> = {}) {
  return {
    identityContext: dualContext,
    id: crypto.randomUUID(),
    email: "user@example.test",
    purpose: "login" as const,
    locale: "ru" as const,
    accountType: "individual" as const,
    codeSalt: "salt",
    code: "123456",
    expiresAt: "2026-07-26T12:10:00.000Z",
    requestIp: "203.0.113.8",
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

test("OTP rate limits match retained lookup-key versions", async () => {
  const { sqlite, d1 } = databaseFixture();
  try {
    assert.equal(
      (
        await reserveOtpChallenge(d1, reservationInput({
          identityContext: previousKeyContext,
          id: "previous-key",
        }))
      ).status,
      "reserved",
    );
    assert.equal(
      (
        sqlite.prepare(
          `SELECT email_lookup_key_version AS version
           FROM auth_otp_challenges WHERE id='previous-key'`,
        ).get() as { version: string }
      ).version,
      "v1",
    );
    const blocked = await reserveOtpChallenge(d1, reservationInput({
      id: "active-key",
    }));
    assert.equal(blocked.status, "blocked");
    assert.equal(
      (
        sqlite.prepare(
          "SELECT count(*) AS total FROM auth_otp_challenges",
        ).get() as { total: number }
      ).total,
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("OTP email hourly limit counts invalidated provider failures", async () => {
  const { sqlite, d1 } = databaseFixture();
  try {
    const legacyEmailHash = await sha256("user@example.test");
    const legacyIpHash = await sha256("203.0.113.8");
    const insert = sqlite.prepare(`
      INSERT INTO auth_otp_challenges (
        id, email, email_hash, purpose, locale, account_type, code_salt,
        code_hash, attempt_count, max_attempts, expires_at, consumed_at,
        invalidated_at, request_ip_hash, created_at
      ) VALUES (?, 'user@example.test', ?, 'login', 'ru',
        'individual', 'salt', 'hash', 0, 5,
        '2026-07-26T12:10:00.000Z', NULL,
        '2026-07-26T11:30:00.000Z', ?, ?)
    `);
    for (let index = 0; index < 5; index += 1) {
      insert.run(
        `failed-${index}`,
        legacyEmailHash,
        legacyIpHash,
        `2026-07-26T11:${String(30 + index).padStart(2, "0")}:00.000Z`,
      );
    }
    const result = await reserveOtpChallenge(d1, reservationInput());
    assert.equal(result.status, "blocked");
    if (result.status === "blocked") {
      assert.equal(result.emailHourlyCount, 5);
      assert.equal(result.ipHourlyCount, 5);
      assert.equal(result.hourlyCount, 5);
    }
    assert.equal(
      (
        sqlite.prepare("SELECT count(*) AS total FROM auth_otp_challenges")
          .get() as { total: number }
      ).total,
      5,
    );
  } finally {
    sqlite.close();
  }
});

test("OTP IP hourly limit is independent across email buckets", async () => {
  const { sqlite, d1 } = databaseFixture();
  try {
    const legacyIpHash = await sha256("203.0.113.8");
    const insert = sqlite.prepare(`
      INSERT INTO auth_otp_challenges (
        id, email, email_hash, purpose, locale, account_type, code_salt,
        code_hash, attempt_count, max_attempts, expires_at, consumed_at,
        invalidated_at, request_ip_hash, created_at
      ) VALUES (?, ?, ?, 'login', 'ru',
        'individual', 'salt', 'hash', 0, 5,
        '2026-07-26T12:10:00.000Z', NULL,
        '2026-07-26T11:30:00.000Z', ?, ?)
    `);
    for (let index = 0; index < 20; index += 1) {
      const email = `user-${index}@example.test`;
      insert.run(
        `ip-failed-${index}`,
        email,
        await sha256(email),
        legacyIpHash,
        `2026-07-26T11:${String(30 + index).padStart(2, "0")}:00.000Z`,
      );
    }

    const result = await reserveOtpChallenge(d1, reservationInput({
      email: "fresh@example.test",
    }));
    assert.equal(result.status, "blocked");
    if (result.status === "blocked") {
      assert.equal(result.emailHourlyCount, 0);
      assert.equal(result.ipHourlyCount, 20);
    }
    assert.equal(
      (
        sqlite.prepare("SELECT count(*) AS total FROM auth_otp_challenges")
          .get() as { total: number }
      ).total,
      20,
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
      requestIp: null,
    }));
    const second = await reserveOtpChallenge(d1, reservationInput({
      id: "second",
      email: "second@example.test",
      requestIp: null,
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
        purpose: "password_reset",
        locale: "ru",
        accountType: "individual",
        turnstileToken: "test-turnstile-token",
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
        purpose: "password_reset",
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

test("bounded JSON parsing accepts chunked input and cancels before oversized bodies are consumed", async () => {
  const schema = z.object({ value: z.string() }).strict();
  const body = JSON.stringify({ value: "ўзбек" });
  const encoded = new TextEncoder().encode(body);
  const chunked = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoded.slice(0, 5));
      controller.enqueue(encoded.slice(5, 11));
      controller.enqueue(encoded.slice(11));
      controller.close();
    },
  });
  const exact = await parseJsonRequest(
    new Request("https://app.juro.uz/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: chunked,
      duplex: "half",
    } as RequestInit & { duplex: "half" }),
    schema,
    encoded.byteLength,
  );
  assert.deepEqual(exact, { ok: true, data: { value: "ўзбек" } });

  let pulls = 0;
  let cancelled = false;
  const oversizedStream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(64));
      if (pulls >= 20) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  const oversized = await parseJsonRequest(
    new Request("https://app.juro.uz/api/test", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "1",
      },
      body: oversizedStream,
      duplex: "half",
    } as RequestInit & { duplex: "half" }),
    schema,
    128,
  );
  assert.deepEqual(oversized, { ok: false, error: "payload_too_large" });
  assert.equal(cancelled, true);
  assert.ok(pulls < 20, "the parser must stop consuming the stream after the cap");

  const declaredOversize = await parseJsonRequest(
    new Request("https://app.juro.uz/api/test", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "1024",
      },
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(new Uint8Array([123, 125]));
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit & { duplex: "half" }),
    schema,
    128,
  );
  assert.deepEqual(declaredOversize, { ok: false, error: "payload_too_large" });
});

test("session persistence inputs default safely and reject malformed values", async () => {
  const verifyBody = {
    challengeId: "f4fe0582-f957-42f6-aa89-81a39d184ef8",
    email: "user@example.test",
    code: "123456",
    purpose: "register",
    locale: "ru",
  };
  const standard = await parseJsonRequest(
    new Request("https://app.juro.uz/api/auth/verify-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(verifyBody),
    }),
    verifyOtpInputSchema,
  );
  assert.equal(standard.ok, true);
  if (standard.ok) assert.equal(standard.data.rememberMe, false);

  const remembered = await parseJsonRequest(
    new Request("https://app.juro.uz/api/auth/verify-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...verifyBody, rememberMe: true }),
    }),
    verifyOtpInputSchema,
  );
  assert.equal(remembered.ok, true);
  if (remembered.ok) assert.equal(remembered.data.rememberMe, true);

  for (const rememberMe of ["true", 1, null]) {
    const malformedOtp = await parseJsonRequest(
      new Request("https://app.juro.uz/api/auth/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...verifyBody, rememberMe }),
      }),
      verifyOtpInputSchema,
    );
    assert.deepEqual(malformedOtp, { ok: false, error: "invalid_input" });

    const malformedMfa = await parseJsonRequest(
      new Request("https://app.juro.uz/api/auth/verify-mfa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "123456", locale: "ru", rememberMe }),
      }),
      verifyMfaInputSchema,
    );
    assert.deepEqual(malformedMfa, { ok: false, error: "invalid_input" });
  }
});

test("wrong OTP attempts stay capped per challenge without locking the mailbox", async () => {
  const { sqlite, d1 } = databaseFixture();
  try {
    const challenge = await insertChallenge(sqlite);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => consumeOtpChallenge(d1, {
        identityContext: dualContext,
        challengeId: challenge.id,
        email: challenge.email,
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
      results.filter(({ status }) => status === "locked").length,
      4,
    );
    const row = sqlite.prepare(`
      SELECT
        attempt_count AS attemptCount,
        verification_locked_until AS verificationLockedUntil
      FROM auth_otp_challenges
      WHERE id = ?
    `).get(challenge.id) as {
      attemptCount: number;
      verificationLockedUntil: string | null;
    };
    assert.equal(row.attemptCount, 5);
    assert.equal(
      row.verificationLockedUntil,
      "2026-07-26T12:15:00.000Z",
    );

    const freshReservation = await reserveOtpChallenge(
      d1,
      reservationInput({
        id: "replacement-during-lock",
        now: "2026-07-26T12:05:00.000Z",
        cooldownSince: "2026-07-26T12:04:00.000Z",
        hourlySince: "2026-07-26T11:05:00.000Z",
      }),
    );
    assert.equal(freshReservation.status, "reserved");
    assert.equal(
      (
        sqlite.prepare(
          "SELECT count(*) AS total FROM auth_otp_challenges",
        ).get() as { total: number }
      ).total,
      2,
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
        identityContext: dualContext,
        challengeId: challenge.id,
        email: challenge.email,
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
      identityContext: dualContext,
      challengeId: challenge.id,
      email: "another@example.test",
      purpose: challenge.purpose,
      code: challenge.code,
      now: "2026-07-26T12:00:00.000Z",
    });
    assert.equal(result.status, "invalid");
  } finally {
    sqlite.close();
  }
});

test("keyed OTP keeps email divergence checks without storing an offline code verifier", async () => {
  const emailFixture = databaseFixture();
  try {
    const challenge = await insertChallenge(emailFixture.sqlite);
    emailFixture.sqlite.prepare(
      "UPDATE auth_otp_challenges SET email_hash='divergent' WHERE id=?",
    ).run(challenge.id);
    await assert.rejects(
      consumeOtpChallenge(emailFixture.d1, {
        identityContext: dualContext,
        challengeId: challenge.id,
        email: challenge.email,
        purpose: challenge.purpose,
        code: challenge.code,
        now: "2026-07-26T12:00:00.000Z",
      }),
      (error: unknown) => error instanceof IdentityProtectionError
        && error.code === "IDENTITY_VALUE_DIVERGED",
    );
  } finally {
    emailFixture.sqlite.close();
  }

  const codeFixture = databaseFixture();
  try {
    const challenge = await insertChallenge(codeFixture.sqlite);
    const row = codeFixture.sqlite.prepare(
      "SELECT code_salt AS salt,code_hash AS hash,code_hmac AS hmac FROM auth_otp_challenges WHERE id=?",
    ).get(challenge.id) as { salt: string; hash: string; hmac: string };
    assert.notEqual(row.hash, await sha256(`${row.salt}:${challenge.code}`));
    assert.ok(row.hmac);
    codeFixture.sqlite.prepare(
      "UPDATE auth_otp_challenges SET code_hash='compatibility-sentinel' WHERE id=?",
    ).run(challenge.id);
    assert.equal((await consumeOtpChallenge(codeFixture.d1, {
      identityContext: dualContext,
      challengeId: challenge.id,
      email: challenge.email,
      purpose: challenge.purpose,
      code: challenge.code,
      now: "2026-07-26T12:00:00.000Z",
    })).status, "verified");
  } finally {
    codeFixture.sqlite.close();
  }
});
