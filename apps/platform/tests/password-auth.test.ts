import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { env } from "cloudflare:workers";
import { POST as resetPassword } from "../app/api/auth/reset-password/route";
import {
  passwordLoginInputSchema,
  requestOtpInputSchema,
  resetPasswordInputSchema,
} from "../lib/auth/input";
import {
  clearPasswordLoginFailures,
  clearMfaVerificationFailures,
  completePasswordLoginAttempt,
  failPasswordLoginAttempt,
  hashPassword,
  mfaVerificationRateLimit,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordCredentialForUser,
  passwordCredentialWriteStatement,
  passwordLoginFailureClearStatement,
  passwordLoginRateLimit,
  preparePasswordCredential,
  recordPasswordLoginFailure,
  reservePasswordLoginAttempt,
  recordMfaVerificationFailure,
  validatePassword,
  verifyPassword,
} from "../lib/auth/password";
import { renderJuroAuthEmail } from "../lib/auth/transactional-email";
import {
  createIdentityProtectionContext,
  prepareUserIdentityWrite,
} from "../lib/auth/identity-protection";
import { reserveOtpChallenge } from "../lib/auth/otp-request";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

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

const PASSWORD_RESET_KEYRING = JSON.stringify({
  active: "v1",
  versions: {
    v1: { aead: encodedKey(7), hmac: encodedKey(39) },
  },
});

test("password credentials use a salted slow hash and never store plaintext", async () => {
  const password = "correct horse battery staple";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.equal(first.algorithm, "PBKDF2-SHA256");
  assert.equal(first.iterations, 600_000);
  assert.notEqual(first.saltBase64url, second.saltBase64url);
  assert.notEqual(first.hashBase64url, second.hashBase64url);
  assert.equal(first.hashBase64url.includes(password), false);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("wrong password", first), false);
  assert.equal(await verifyPassword(password, null), false);
});

test("password policy supports passphrases without silent truncation", () => {
  assert.deepEqual(validatePassword("a".repeat(PASSWORD_MIN_LENGTH - 1)), {
    ok: false,
    code: "PASSWORD_TOO_SHORT",
  });
  assert.deepEqual(validatePassword("a".repeat(PASSWORD_MIN_LENGTH)), {
    ok: true,
  });
  assert.deepEqual(validatePassword("a".repeat(PASSWORD_MAX_LENGTH + 1)), {
    ok: false,
    code: "PASSWORD_TOO_LONG",
  });
});

test("registration is one payload and password login/reset have strict contracts", () => {
  const registration = requestOtpInputSchema.safeParse({
    purpose: "register",
    email: " person@example.com ",
    locale: "en",
    accountType: "individual",
    password: "long passphrase",
    firstName: "Alex",
    lastName: "",
    acceptTerms: true,
    acceptPrivacy: true,
    acceptPersonalData: true,
    marketing: false,
    turnstileToken: "verified-token",
  });
  assert.equal(registration.success, true);
  assert.equal(requestOtpInputSchema.safeParse({
    purpose: "register",
    email: "person@example.com",
    locale: "ru",
    accountType: "individual",
    firstName: "Alex",
    acceptTerms: true,
    acceptPrivacy: true,
    acceptPersonalData: true,
    turnstileToken: "verified-token",
  }).success, false);
  assert.equal(passwordLoginInputSchema.safeParse({
    email: "person@example.com",
    password: "long passphrase",
    locale: "uz",
    rememberMe: true,
    turnstileToken: "verified-token",
  }).success, true);
  assert.equal(resetPasswordInputSchema.safeParse({
    challengeId: "04f0c00f-1b99-4c6f-8c3c-707ea6526f22",
    email: "person@example.com",
    code: "123456",
    password: "a new long passphrase",
    locale: "en",
  }).success, true);
  assert.equal(requestOtpInputSchema.safeParse({
    purpose: "login",
    email: "person@example.com",
    locale: "ru",
    accountType: "individual",
    turnstileToken: "verified-token",
  }).success, false, "ordinary login codes must not remain a public auth path");
});

test("registration persists its password only after OTP reservation succeeds", () => {
  const route = readFileSync(
    new URL("../app/api/auth/request-otp/route.ts", import.meta.url),
    "utf8",
  );
  const reservation = route.indexOf(
    "const reservation = await reserveOtpChallenge",
  );
  const credentialWrite = route.indexOf(
    "statements.push(passwordCredentialWriteStatement",
    reservation,
  );
  assert.ok(reservation >= 0);
  assert.ok(credentialWrite > reservation);
  assert.match(route, /if \(reservation\.status === "blocked"\)/u);
});

test("registration acceptance evidence is durable before email becomes login-eligible", () => {
  const route = readFileSync(
    new URL("../app/api/auth/verify-otp/route.ts", import.meta.url),
    "utf8",
  );
  const acceptance = route.indexOf("await recordRegistrationAcceptances");
  const verification = route.indexOf("SET email_verified_at=?,updated_at=?");
  assert.ok(acceptance >= 0);
  assert.ok(verification > acceptance);
});

test("password reset binds mutation to the unchanged email identity and retires sibling OTPs", () => {
  const route = readFileSync(
    new URL("../app/api/auth/reset-password/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /const unchangedIdentity =/u);
  assert.match(route, /email_ciphertext IS \?/u);
  assert.match(route, /email_lookup_hash IS \?/u);
  assert.match(
    route,
    /UPDATE auth_otp_challenges SET invalidated_at=\?/u,
  );
  assert.match(
    route,
    /passwordCredentialWriteStatement\([\s\S]*unchangedIdentity/u,
  );
  assert.ok(
    route.indexOf("const passwordChangedEmail = await preparePasswordChangedSecurityEmailRetry")
      < route.indexOf("const results = await batchWithSecurityEvent"),
  );
  assert.match(route, /\.\.\.passwordChangedEmail\.statements/u);
  assert.match(route, /await notifyPasswordChangedWithRetry\(db,/u);
  assert.match(route, /authOtpChallengeId: challengeId/u);
  assert.match(route, /catch \{[\s\S]*Notification delivery must not disclose account existence/u);
});

test("a committed password reset keeps an encrypted durable email job when the follow-up D1 write fails", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const workerEnv = env as unknown as Record<string, unknown>;
  const envKeys = [
    "DB",
    "IDENTITY_PROTECTION_MODE",
    "IDENTITY_KEYRING",
    "RESEND_API_KEY",
    "EMAIL_FROM",
  ];
  const previousEnv = new Map(
    envKeys.map(key => [key, workerEnv[key]]),
  );
  const originalFetch = globalThis.fetch;
  const userId = "password-reset-durable-user";
  const email = "durable-reset@example.test";
  const challengeId = "48484848-4848-4484-8484-484848484848";
  const code = "714205";
  const password = "a new durable password phrase";
  const now = new Date();
  const identityContext = createIdentityProtectionContext(
    "dual_write",
    PASSWORD_RESET_KEYRING,
  );
  const identity = await prepareUserIdentityWrite(identityContext, {
    userId,
    email,
    phone: null,
  });
  sqlite.prepare(
    `INSERT INTO user_profiles (
       id,email,email_ciphertext,email_iv,email_key_version,
       email_lookup_hash,email_lookup_key_version,locale,email_verified_at,
       created_at,updated_at
     ) VALUES (?,?,?,?,?,?,?,'en',?,?,?)`,
  ).run(
    userId,
    identity.email,
    identity.emailCiphertext,
    identity.emailIv,
    identity.emailKeyVersion,
    identity.emailLookupHash,
    identity.emailLookupKeyVersion,
    now.toISOString(),
    now.toISOString(),
    now.toISOString(),
  );
  await reserveOtpChallenge(d1, {
    identityContext,
    id: challengeId,
    email,
    requestIp: null,
    purpose: "password_reset",
    locale: "en",
    accountType: "individual",
    codeSalt: "durable-reset-salt",
    code,
    expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
    now: now.toISOString(),
    cooldownSince: new Date(now.getTime() - 90_000).toISOString(),
    hourlySince: new Date(now.getTime() - 60 * 60_000).toISOString(),
  });

  let passwordBatchCommitted = false;
  const failAfterPasswordCommit = {
    prepare(sql: string) {
      if (passwordBatchCommitted) throw new Error("FOLLOWUP_D1_FAILPOINT");
      return d1.prepare(sql);
    },
    async batch(statements: D1PreparedStatement[]) {
      const results = await d1.batch(statements);
      passwordBatchCommitted = true;
      return results;
    },
  } as unknown as D1Database;
  Object.assign(workerEnv, {
    DB: failAfterPasswordCommit,
    IDENTITY_PROTECTION_MODE: "dual_write",
    IDENTITY_KEYRING: PASSWORD_RESET_KEYRING,
    RESEND_API_KEY: "synthetic-resend-key",
    EMAIL_FROM: "JURO <no-reply@juro.uz>",
  });
  const providerCalls: Headers[] = [];
  globalThis.fetch = async (_input, init) => {
    providerCalls.push(new Headers(init?.headers));
    return new Response(JSON.stringify({ id: "resend_durable_reset" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const response = await resetPassword(new Request(
      "https://app.juro.uz/api/auth/reset-password",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://app.juro.uz",
          "sec-fetch-site": "same-origin",
          "x-juro-csrf": "1",
        },
        body: JSON.stringify({ challengeId, email, code, password, locale: "en" }),
      },
    ));
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { ok?: boolean }).ok, true);
    assert.equal(passwordBatchCommitted, true);
    assert.equal(await verifyPassword(
      password,
      await passwordCredentialForUser(d1, userId),
    ), true);
    assert.equal(providerCalls.length, 1);
    assert.equal(
      providerCalls[0]?.get("idempotency-key"),
      `juro_password_changed_${challengeId}`,
    );
    const durable = sqlite.prepare(
      `SELECT job.status,job.event_type AS eventType,
         job.recipient_ciphertext AS recipientCiphertext,
         outbox.status AS outboxStatus
       FROM security_email_jobs job
       JOIN job_outbox outbox ON outbox.subject_id=job.id
       WHERE job.auth_otp_challenge_id=?`,
    ).get(challengeId) as {
      status: string;
      eventType: string;
      recipientCiphertext: string;
      outboxStatus: string;
    };
    assert.deepEqual({
      status: durable.status,
      eventType: durable.eventType,
      outboxStatus: durable.outboxStatus,
    }, {
      status: "pending",
      eventType: "password_changed",
      outboxStatus: "pending",
    });
    assert.notEqual(durable.recipientCiphertext, email);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of envKeys) {
      const previous = previousEnv.get(key);
      if (previous === undefined) delete workerEnv[key];
      else workerEnv[key] = previous;
    }
    sqlite.close();
  }
});

test("auth email renderer produces separate responsive HTML and plain text in every locale", () => {
  for (const locale of ["ru", "uz", "en"] as const) {
    const message = renderJuroAuthEmail({
      locale,
      purpose: "password_reset",
      code: "123456",
    });
    assert.match(message.subject, /JURO/u);
    assert.match(message.html, new RegExp(`<html lang="${locale}"`, "u"));
    assert.match(message.html, /role="presentation"/u);
    assert.match(message.html, /mailto:admin@juro\.uz/u);
    assert.match(message.html, /123456/u);
    assert.match(message.text, /123456/u);
    assert.equal(message.text.includes("<table"), false);
  }
});

test("auth email renderer escapes notification details and preserves plain text", () => {
  const message = renderJuroAuthEmail({
    locale: "en",
    purpose: "new_device",
    details: [
      { label: "Device <name>", value: "Chrome <unsafe>\r\nspoofed" },
      { label: "Region", value: "Tashkent & area" },
    ],
  });
  assert.match(message.html, /Device &lt;name&gt;/u);
  assert.match(message.html, /Chrome &lt;unsafe&gt; spoofed/u);
  assert.equal(message.html.includes("<unsafe>"), false);
  assert.match(message.text, /Device <name>: Chrome <unsafe> spoofed/u);
  assert.equal(message.text.includes("\r"), false);
  assert.equal(message.text.includes("\nspoofed"), false);
});

test("email-change destinations and security notifications retain distinct purposes", () => {
  for (const locale of ["ru", "uz", "en"] as const) {
    const current = renderJuroAuthEmail({
      locale,
      purpose: "email_change_current",
      code: "123456",
    });
    const next = renderJuroAuthEmail({
      locale,
      purpose: "email_change",
      code: "654321",
    });
    const changed = renderJuroAuthEmail({
      locale,
      purpose: "password_changed",
    });
    assert.notEqual(current.subject, next.subject);
    assert.match(current.text, /123456/u);
    assert.match(next.text, /654321/u);
    assert.equal(changed.text.includes("undefined"), false);
    assert.equal(changed.html.includes("undefined"), false);
  }
});

test("email-change API batches branded HTML and plain-text alternatives", () => {
  const route = readFileSync(
    new URL(
      "../app/api/platform/security/email-change/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(route, /purpose: "email_change_current"/u);
  assert.match(route, /purpose: "email_change"/u);
  assert.match(route, /text: current\.text/u);
  assert.match(route, /text: next\.text/u);
});

test("guarded password writes cannot overwrite a newly verified profile", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const userId = "registration-password-race";
  const createdAt = "2026-09-04T10:00:00.000Z";
  try {
    sqlite.prepare(
      `INSERT INTO user_profiles (id,email,locale,created_at,updated_at)
       VALUES (?,?,'ru',?,?)`,
    ).run(userId, "race@example.test", createdAt, createdAt);
    const original = await preparePasswordCredential(
      "original passphrase",
      new Date(createdAt),
    );
    await passwordCredentialWriteStatement(d1, userId, original).run();
    sqlite.prepare(
      "UPDATE user_profiles SET email_verified_at=? WHERE id=?",
    ).run("2026-09-04T10:01:00.000Z", userId);
    const replacement = await preparePasswordCredential(
      "attacker passphrase",
      new Date("2026-09-04T10:02:00.000Z"),
    );
    const guarded = await passwordCredentialWriteStatement(
      d1,
      userId,
      replacement,
      {
        selectSql: `SELECT 1 FROM user_profiles
          WHERE id=? AND email_verified_at IS NULL`,
        bindings: [userId],
      },
    ).run();
    assert.equal(Number(guarded.meta.changes ?? 0), 0);
    const stored = await passwordCredentialForUser(d1, userId);
    assert.equal(await verifyPassword("original passphrase", stored), true);
    assert.equal(await verifyPassword("attacker passphrase", stored), false);
  } finally {
    sqlite.close();
  }
});

test("password lock survives the original counting window", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const email = "locked@example.test";
  const started = new Date("2026-09-04T10:00:00.000Z");
  try {
    for (let count = 0; count < 4; count += 1) {
      await recordPasswordLoginFailure(d1, {
        email,
        requestIp: null,
        now: started,
      });
    }
    await recordPasswordLoginFailure(d1, {
      email,
      requestIp: null,
      now: new Date("2026-09-04T10:14:00.000Z"),
    });
    const limit = await passwordLoginRateLimit(d1, {
      email,
      requestIp: null,
      now: new Date("2026-09-04T10:16:00.000Z"),
    });
    assert.equal(limit.allowed, false);
    if (!limit.allowed) assert.equal(limit.retryAfterSeconds, 13 * 60);
  } finally {
    sqlite.close();
  }
});

test("concurrent password attempts cannot outrun email or shared-IP limits", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const email = "concurrent@example.test";
  const now = new Date("2026-09-04T10:30:00.000Z");
  try {
    const reservations = await Promise.all(
      Array.from({ length: 12 }, () =>
        reservePasswordLoginAttempt(d1, { email, requestIp: null, now })
      ),
    );
    assert.ok(
      reservations.filter(({ allowed }) => allowed).length <= 5,
      "parallel requests must not exceed the hard email budget",
    );
    assert.ok(reservations.some(({ allowed }) => !allowed));

    const requestIp = "203.0.113.77";
    const spray = await Promise.all(
      Array.from({ length: 30 }, (_, index) =>
        reservePasswordLoginAttempt(d1, {
          email: `spray-${index}@example.test`,
          requestIp,
          now: new Date("2026-09-04T10:31:00.000Z"),
        })
      ),
    );
    assert.ok(
      spray.filter(({ allowed }) => allowed).length <= 20,
      "parallel password spray must not exceed the shared-IP budget",
    );
    assert.ok(spray.some(({ allowed }) => !allowed));

    for (const reservation of spray) {
      if (reservation.allowed) {
        await completePasswordLoginAttempt(d1, reservation.reservation);
      }
    }
    const phantomIpFailures = sqlite.prepare(
      `SELECT failure_count AS failureCount
       FROM auth_password_rate_limits
       WHERE scope_key NOT IN (
         SELECT scope_key FROM auth_password_attempt_reservations
       )`,
    ).all() as Array<{ failureCount: number }>;
    assert.ok(phantomIpFailures.every(({ failureCount }) => failureCount === 0));
  } finally {
    sqlite.close();
  }
});

test("successful password login releases only its owned IP reservation", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const email = "reservation-success@example.test";
  const requestIp = "203.0.113.88";
  const now = new Date("2026-09-04T10:40:00.000Z");
  try {
    const attempt = await reservePasswordLoginAttempt(d1, {
      email,
      requestIp,
      now,
    });
    assert.equal(attempt.allowed, true);
    if (!attempt.allowed) return;
    await completePasswordLoginAttempt(d1, attempt.reservation);
    const remaining = sqlite.prepare(
      "SELECT failure_count AS failureCount FROM auth_password_rate_limits",
    ).all() as Array<{ failureCount: number }>;
    assert.ok(remaining.every(({ failureCount }) => failureCount === 0));
  } finally {
    sqlite.close();
  }
});

test("failed password login converts owned leases into durable failure counters", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const now = new Date("2026-09-04T10:42:00.000Z");
  try {
    const attempt = await reservePasswordLoginAttempt(d1, {
      email: "reservation-failure@example.test",
      requestIp: "203.0.113.89",
      now,
    });
    assert.equal(attempt.allowed, true);
    if (!attempt.allowed) return;
    await failPasswordLoginAttempt(d1, attempt.reservation, now);
    assert.equal(
      (sqlite.prepare(
        "SELECT count(*) AS total FROM auth_password_attempt_reservations",
      ).get() as { total: number }).total,
      0,
    );
    const counters = sqlite.prepare(
      "SELECT failure_count AS failureCount FROM auth_password_rate_limits",
    ).all() as Array<{ failureCount: number }>;
    assert.deepEqual(counters.map(({ failureCount }) => failureCount).sort(), [1, 1]);
  } finally {
    sqlite.close();
  }
});

test("a guarded password reset clears the account lock only while identity is unchanged", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const email = "reset-locked@example.test";
  try {
    await recordPasswordLoginFailure(d1, {
      email,
      requestIp: null,
      now: new Date("2026-09-04T10:45:00.000Z"),
    });
    const clear = await passwordLoginFailureClearStatement(d1, {
      email,
      guard: { selectSql: "SELECT 1 WHERE ? = ?", bindings: ["same", "same"] },
    });
    await clear.run();
    assert.deepEqual(await passwordLoginRateLimit(d1, {
      email,
      requestIp: null,
      now: new Date("2026-09-04T10:45:01.000Z"),
    }), { allowed: true });
  } finally {
    sqlite.close();
  }
});

test("successful account login clears only its email failures, not shared IP failures", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const email = "success@example.test";
  const requestIp = "203.0.113.9";
  const now = new Date("2026-09-04T11:00:00.000Z");
  try {
    for (let count = 0; count < 20; count += 1) {
      await recordPasswordLoginFailure(d1, { email, requestIp, now });
    }
    await clearPasswordLoginFailures(d1, { email });
    assert.deepEqual(await passwordLoginRateLimit(d1, {
      email,
      requestIp: null,
      now: new Date("2026-09-04T11:00:01.000Z"),
    }), { allowed: true });
    const sharedIp = await passwordLoginRateLimit(d1, {
      email,
      requestIp,
      now: new Date("2026-09-04T11:00:01.000Z"),
    });
    assert.equal(sharedIp.allowed, false);
  } finally {
    sqlite.close();
  }
});

test("MFA failures persist across replacement challenges while a success clears only the account scope", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const userId = "mfa-rate-user";
  const requestIp = "203.0.113.19";
  const now = new Date("2026-09-04T11:30:00.000Z");
  try {
    for (let count = 0; count < 5; count += 1) {
      await recordMfaVerificationFailure(d1, { userId, requestIp, now });
    }
    const accountLock = await mfaVerificationRateLimit(d1, {
      userId,
      requestIp: null,
      now: new Date("2026-09-04T11:30:01.000Z"),
    });
    assert.equal(accountLock.allowed, false);
    await clearMfaVerificationFailures(d1, { userId });
    assert.deepEqual(await mfaVerificationRateLimit(d1, {
      userId,
      requestIp: null,
      now: new Date("2026-09-04T11:30:02.000Z"),
    }), { allowed: true });
    const sharedIp = await mfaVerificationRateLimit(d1, {
      userId,
      requestIp,
      now: new Date("2026-09-04T11:30:02.000Z"),
    });
    assert.equal(sharedIp.allowed, true, "five attempts stay below the shared-IP cap");
  } finally {
    sqlite.close();
  }
});

test("migration 0150 preserves existing accounts and adds password/MFA controls", () => {
  const migration = readFileSync(
    new URL("../drizzle/0150_password_authentication.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /user_password_credentials/u);
  assert.match(migration, /PBKDF2-SHA256/u);
  assert.match(migration, /auth_password_rate_limits/u);
  assert.match(migration, /auth_password_attempt_reservations/u);
  assert.match(migration, /auth_mfa_attempt_reservations/u);
  assert.match(migration, /failure_claim_nonce/u);
  assert.match(migration, /primary_auth_method/u);
  assert.match(migration, /email_verified_at/u);
  assert.match(migration, /UPDATE `user_profiles`/u);
  assert.doesNotMatch(
    migration,
    /INSERT\s+INTO\s+`?user_password_credentials`?\s+SELECT/iu,
  );
});
