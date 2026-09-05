import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  consumeSessionHandoff,
  issueSessionHandoff,
} from "../lib/auth/session-handoff";
import {
  createEmailOtpSession,
  localSessionFromCookie,
} from "../lib/auth/session-management";
import { POST as consumeHandoffRequest } from "../app/api/auth/session-handoff/route";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const BASE_TIME = new Date("2026-09-04T08:00:00.000Z");

test("handoff rejects and cancels an oversized chunked form before D1", async () => {
  let pulls = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(512));
      if (pulls >= 20) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  const response = await consumeHandoffRequest(new Request(
    "https://lawyer.juro.uz/api/auth/session-handoff",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" },
  ));
  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get("location"),
    "/ru/auth/login?handoff=invalid",
  );
  assert.equal(cancelled, true);
  assert.ok(pulls < 20);
});

test("handoff errors preserve supported locales and reject unknown locale values", async () => {
  for (const [requested, expected] of [
    ["uz", "/uz/auth/login?handoff=invalid"],
    ["en", "/en/auth/login?handoff=invalid"],
    ["de", "/ru/auth/login?handoff=invalid"],
  ] as const) {
    const response = await consumeHandoffRequest(new Request(
      `https://lawyer.juro.uz/api/auth/session-handoff?lang=${requested}`,
      {
        method: "POST",
        headers: {
          "content-type": "text/plain",
          origin: "https://app.juro.uz",
        },
        body: "invalid",
      },
    ));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), expected);
  }
});

function fixture(...userIds: string[]) {
  const value = sqliteD1Fixture();
  const createdAt = BASE_TIME.toISOString();
  for (const userId of userIds) {
    value.sqlite.prepare(
      `INSERT INTO user_profiles (
         id,email,locale,account_type,email_verified_at,created_at,updated_at
       ) VALUES (?,?,?,?,?,?,?)`,
    ).run(
      userId,
      `${userId}@example.test`,
      "ru",
      "individual",
      createdAt,
      createdAt,
      createdAt,
    );
  }
  return value;
}

test("session handoff is single-use and revokes its source session", async () => {
  const { sqlite, d1 } = fixture("handoff-user");
  try {
    const source = await createEmailOtpSession(d1, {
      userId: "handoff-user",
      userAgent: "Browser/1.0",
      rememberMe: true,
      now: BASE_TIME,
    });
    const issuedAt = new Date(BASE_TIME.getTime() + 1_000);
    const handoff = await issueSessionHandoff(d1, {
      userId: "handoff-user",
      sourceSessionId: source.sessionId,
      sourceHost: "app.juro.uz",
      destinationUrl: "https://lawyer.juro.uz/en/lawyer/dashboard?from=login",
      rememberMe: true,
      now: issuedAt,
    });
    assert.ok(handoff);
    assert.equal(
      handoff.action,
      "https://lawyer.juro.uz/api/auth/session-handoff?lang=en",
    );
    assert.match(handoff.ticket, /^[A-Za-z0-9_-]{43}$/u);
    const stored = sqlite.prepare(
      `SELECT token_hash AS tokenHash,consumed_at AS consumedAt
       FROM auth_session_handoffs WHERE source_session_id=?`,
    ).get(source.sessionId) as {
      tokenHash: string;
      consumedAt: string | null;
    };
    assert.match(stored.tokenHash, /^[0-9a-f]{64}$/u);
    assert.notEqual(stored.tokenHash, handoff.ticket);
    assert.equal(stored.consumedAt, null);

    const consumedAt = new Date(BASE_TIME.getTime() + 2_000);
    const consumed = await consumeSessionHandoff(d1, {
      ticket: handoff.ticket,
      destinationHost: "lawyer.juro.uz",
      origin: "https://app.juro.uz",
      userAgent: "Browser/2.0",
      now: consumedAt,
    });
    assert.ok(consumed);
    assert.equal(consumed.rememberMe, true);
    assert.equal(consumed.redirectPath, "/en/lawyer/dashboard?from=login");
    const destination = await localSessionFromCookie(
      d1,
      `juro_session=${consumed.token}`,
      {
        now: new Date(BASE_TIME.getTime() + 3_000),
        touch: false,
      },
    );
    assert.ok(destination);
    assert.equal(destination.authMethod, "session_handoff:email_otp");
    assert.equal(destination.assuranceLevel, "primary");
    assert.equal(
      (
        sqlite.prepare(
          "SELECT revoked_at AS revokedAt FROM auth_sessions WHERE id=?",
        ).get(source.sessionId) as { revokedAt: string | null }
      ).revokedAt,
      consumedAt.toISOString(),
    );

    assert.equal(await consumeSessionHandoff(d1, {
      ticket: handoff.ticket,
      destinationHost: "lawyer.juro.uz",
      origin: "https://app.juro.uz",
      userAgent: "Replay/1.0",
      now: new Date(BASE_TIME.getTime() + 4_000),
    }), null);
    assert.equal(
      (
        sqlite.prepare(
          `SELECT count(*) AS total FROM auth_sessions
           WHERE auth_method LIKE 'session_handoff:%'`,
        ).get() as { total: number }
      ).total,
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("handoff rejects invalid origins, audiences, destinations, and expiry without spending a valid ticket", async () => {
  const { sqlite, d1 } = fixture("boundary-user", "expiry-user");
  try {
    const source = await createEmailOtpSession(d1, {
      userId: "boundary-user",
      userAgent: "Browser/1.0",
      now: BASE_TIME,
    });
    for (const destinationUrl of [
      "http://lawyer.juro.uz/ru/lawyer/dashboard",
      "https://lawyer.juro.uz:444/ru/lawyer/dashboard",
      "https://lawyer.juro.uz/ru/lawyer/dashboard#fragment",
      "https://app.juro.uz/ru/individual/dashboard",
      "https://attacker.example/ru/lawyer/dashboard",
    ]) {
      assert.equal(await issueSessionHandoff(d1, {
        userId: "boundary-user",
        sourceSessionId: source.sessionId,
        sourceHost: "app.juro.uz",
        destinationUrl,
        rememberMe: false,
        now: BASE_TIME,
      }), null);
    }
    const handoff = await issueSessionHandoff(d1, {
      userId: "boundary-user",
      sourceSessionId: source.sessionId,
      sourceHost: "app.juro.uz",
      destinationUrl: "https://lawyer.juro.uz/ru/lawyer/dashboard",
      rememberMe: false,
      now: BASE_TIME,
    });
    assert.ok(handoff);
    assert.equal(
      handoff.action,
      "https://lawyer.juro.uz/api/auth/session-handoff?lang=ru",
    );

    assert.equal(await consumeSessionHandoff(d1, {
      ticket: handoff.ticket,
      destinationHost: "app.juro.uz",
      origin: "https://app.juro.uz",
      userAgent: null,
      now: new Date(BASE_TIME.getTime() + 1_000),
    }), null);
    assert.equal(await consumeSessionHandoff(d1, {
      ticket: handoff.ticket,
      destinationHost: "lawyer.juro.uz:444",
      origin: "https://app.juro.uz",
      userAgent: null,
      now: new Date(BASE_TIME.getTime() + 1_000),
    }), null);
    assert.equal(await consumeSessionHandoff(d1, {
      ticket: handoff.ticket,
      destinationHost: "lawyer.juro.uz",
      origin: "https://lawyer.juro.uz",
      userAgent: null,
      now: new Date(BASE_TIME.getTime() + 1_000),
    }), null);
    assert.equal(
      (
        sqlite.prepare(
          "SELECT consumed_at AS consumedAt FROM auth_session_handoffs WHERE source_session_id=?",
        ).get(source.sessionId) as { consumedAt: string | null }
      ).consumedAt,
      null,
    );
    assert.ok(await consumeSessionHandoff(d1, {
      ticket: handoff.ticket,
      destinationHost: "lawyer.juro.uz",
      origin: "https://app.juro.uz",
      userAgent: null,
      now: new Date(BASE_TIME.getTime() + 2_000),
    }));

    const expirySource = await createEmailOtpSession(d1, {
      userId: "expiry-user",
      userAgent: "Browser/1.0",
      now: BASE_TIME,
    });
    const expiring = await issueSessionHandoff(d1, {
      userId: "expiry-user",
      sourceSessionId: expirySource.sessionId,
      sourceHost: "app.juro.uz",
      destinationUrl: "https://lawyer.juro.uz/ru/lawyer/dashboard",
      rememberMe: false,
      now: BASE_TIME,
    });
    assert.ok(expiring);
    assert.equal(await consumeSessionHandoff(d1, {
      ticket: expiring.ticket,
      destinationHost: "lawyer.juro.uz",
      origin: "https://app.juro.uz",
      userAgent: null,
      now: new Date(BASE_TIME.getTime() + 90_000),
    }), null);
    assert.equal(
      (
        sqlite.prepare(
          "SELECT revoked_at AS revokedAt FROM auth_sessions WHERE id=?",
        ).get(expirySource.sessionId) as { revokedAt: string | null }
      ).revokedAt,
      null,
    );
  } finally {
    sqlite.close();
  }
});

test("handoff rechecks source ownership and active state inside the consuming transaction", async () => {
  const { sqlite, d1 } = fixture(
    "source-user",
    "foreign-user",
    "expired-source-user",
  );
  try {
    const source = await createEmailOtpSession(d1, {
      userId: "source-user",
      userAgent: "Browser/1.0",
      now: BASE_TIME,
    });
    await assert.rejects(
      issueSessionHandoff(d1, {
        userId: "foreign-user",
        sourceSessionId: source.sessionId,
        sourceHost: "app.juro.uz",
        destinationUrl: "https://lawyer.juro.uz/ru/lawyer/dashboard",
        rememberMe: false,
        now: BASE_TIME,
      }),
      /SESSION_HANDOFF_SOURCE_INVALID/u,
    );
    const expiredSource = await createEmailOtpSession(d1, {
      userId: "expired-source-user",
      userAgent: "Browser/1.0",
      now: BASE_TIME,
    });
    sqlite.prepare(
      "UPDATE auth_sessions SET expires_at=?,idle_expires_at=? WHERE id=?",
    ).run(BASE_TIME.toISOString(), BASE_TIME.toISOString(), expiredSource.sessionId);
    await assert.rejects(
      issueSessionHandoff(d1, {
        userId: "expired-source-user",
        sourceSessionId: expiredSource.sessionId,
        sourceHost: "app.juro.uz",
        destinationUrl: "https://lawyer.juro.uz/ru/lawyer/dashboard",
        rememberMe: false,
        now: new Date(BASE_TIME.getTime() + 1_000),
      }),
      /SESSION_HANDOFF_SOURCE_INVALID/u,
    );
    const handoff = await issueSessionHandoff(d1, {
      userId: "source-user",
      sourceSessionId: source.sessionId,
      sourceHost: "app.juro.uz",
      destinationUrl: "https://lawyer.juro.uz/ru/lawyer/dashboard",
      rememberMe: false,
      now: BASE_TIME,
    });
    assert.ok(handoff);

    const revokedAt = new Date(BASE_TIME.getTime() + 1_000).toISOString();
    let injectedRevocation = false;
    const revokingDb = {
      prepare: d1.prepare.bind(d1),
      async batch(statements: D1PreparedStatement[]) {
        if (!injectedRevocation) {
          injectedRevocation = true;
          sqlite.prepare(
            "UPDATE auth_sessions SET revoked_at=? WHERE id=?",
          ).run(revokedAt, source.sessionId);
        }
        return d1.batch(statements);
      },
    } as unknown as D1Database;
    assert.equal(await consumeSessionHandoff(revokingDb, {
      ticket: handoff.ticket,
      destinationHost: "lawyer.juro.uz",
      origin: "https://app.juro.uz",
      userAgent: "Browser/2.0",
      now: new Date(revokedAt),
    }), null);
    const row = sqlite.prepare(
      `SELECT consumed_at AS consumedAt,consumed_by_session_id AS consumedBy
       FROM auth_session_handoffs WHERE source_session_id=?`,
    ).get(source.sessionId) as {
      consumedAt: string | null;
      consumedBy: string | null;
    };
    assert.deepEqual({ ...row }, { consumedAt: null, consumedBy: null });
    assert.equal(
      (
        sqlite.prepare(
          "SELECT count(*) AS total FROM auth_sessions WHERE user_id=?",
        ).get("source-user") as { total: number }
      ).total,
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("migration 0150 installs the constrained handoff schema and journal entry", async () => {
  const { sqlite, d1 } = fixture("schema-user");
  try {
    const columns = sqlite.prepare(
      "PRAGMA table_info(auth_session_handoffs)",
    ).all() as Array<{ name: string }>;
    assert.deepEqual(columns.map(({ name }) => name), [
      "id",
      "token_hash",
      "user_id",
      "source_session_id",
      "source_host",
      "destination_host",
      "redirect_path",
      "remember_me",
      "expires_at",
      "consumed_at",
      "consumed_by_session_id",
      "created_at",
    ]);
    const foreignKeys = sqlite.prepare(
      "PRAGMA foreign_key_list(auth_session_handoffs)",
    ).all() as Array<{ from: string; table: string; to: string }>;
    assert.ok(foreignKeys.some((key) =>
      key.from === "user_id"
      && key.table === "user_profiles"
      && key.to === "id"
    ));
    assert.ok(foreignKeys.some((key) =>
      key.from === "source_session_id"
      && key.table === "auth_sessions"
      && key.to === "id"
    ));
    const indexes = sqlite.prepare(
      "PRAGMA index_list(auth_session_handoffs)",
    ).all() as Array<{ name: string; unique: number }>;
    assert.ok(indexes.some((index) =>
      index.name === "auth_session_handoffs_token_uidx"
      && index.unique === 1
    ));

    const source = await createEmailOtpSession(d1, {
      userId: "schema-user",
      userAgent: null,
      now: BASE_TIME,
    });
    assert.throws(() => sqlite.prepare(
      `INSERT INTO auth_session_handoffs (
         id,token_hash,user_id,source_session_id,source_host,destination_host,
         redirect_path,remember_me,expires_at,created_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      "invalid-host-row",
      "a".repeat(64),
      "schema-user",
      source.sessionId,
      "app.juro.uz",
      "app.juro.uz",
      "/ru/dashboard",
      0,
      new Date(BASE_TIME.getTime() + 90_000).toISOString(),
      BASE_TIME.toISOString(),
    ), /auth_session_handoffs_hosts_check/u);
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);

    const journal = JSON.parse(readFileSync(
      new URL("../drizzle/meta/_journal.json", import.meta.url),
      "utf8",
    )) as { entries: Array<{ idx: number; tag: string }> };
    assert.deepEqual(
      journal.entries.find(({ tag }) => tag === "0150_password_authentication"),
      { idx: 150, version: "7", when: 1788507000000, tag: "0150_password_authentication", breakpoints: true },
    );
  } finally {
    sqlite.close();
  }
});

test("every bearer issuer is host-only while the theme cookie remains shared", () => {
  const bearerRoutes = new Map([
    ["app/api/auth/password-login/route.ts", "replacementSessionCookies"],
    ["app/api/auth/verify-otp/route.ts", "replacementSessionCookies"],
    ["app/api/auth/verify-mfa/route.ts", "replacementSessionCookies"],
    ["app/api/auth/session-handoff/route.ts", "replacementSessionCookies"],
    ["app/api/auth/dev-login/route.ts", "sessionCookie"],
    ["app/api/platform/security/sessions/refresh/route.ts", "replacementSessionCookiesUntil"],
    ["app/api/platform/security/mfa/route.ts", "replacementSessionCookiesUntil"],
    ["app/api/platform/security/mfa/confirm/route.ts", "replacementSessionCookiesUntil"],
    ["app/api/platform/security/email-change/route.ts", "replacementSessionCookiesUntil"],
  ]);
  for (const [path, issuer] of bearerRoutes) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(source, new RegExp(`\\b${issuer}\\b`, "u"), path);
    assert.doesNotMatch(source, /sharedAuthCookieDomain/u, path);
    if (issuer === "sessionCookie") {
      assert.match(source, /clearLogoutPendingCookie/u, path);
    }
  }
  const sessionSource = readFileSync(
    new URL("../lib/auth/session.ts", import.meta.url),
    "utf8",
  );
  assert.match(sessionSource, /clearLogoutPendingCookie\(\)/u);
  const persistence = readFileSync(
    new URL("../lib/auth/session-persistence.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(persistence, /sessionCookie\([^)]*domain/u);
  assert.doesNotMatch(persistence, /sessionCookieUntil\([^)]*domain/u);

  const themeRoute = readFileSync(
    new URL("../app/api/platform/theme/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(themeRoute, /themePreferenceCookie\(theme, requestUrl\)/u);
  const themePreference = readFileSync(
    new URL("../lib/platform/theme-preference.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    themePreference,
    /sharedAuthCookieDomain\(requestUrl\.hostname\)/u,
  );
  assert.match(themePreference, /Domain=\$\{domain\}/u);
});
