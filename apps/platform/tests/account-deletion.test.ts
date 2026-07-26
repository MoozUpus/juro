import assert from "node:assert/strict";
import test from "node:test";
import {
  confirmAccountDeletion,
  reserveAccountDeletionChallenge,
} from "../lib/auth/account-deletion";
import { sha256 } from "../lib/auth/crypto";
import { createEmailOtpSession } from "../lib/auth/session-management";
import {
  batchBarrier,
  sqliteD1Fixture,
} from "./helpers/sqlite-d1";

const USER_ID = "deletion-user";
const WORKSPACE_ID = "deletion-workspace";
const CODE = "123456";
const SALT = "deletion-test-salt";

async function fixture() {
  const value = sqliteD1Fixture();
  const authenticatedAt = "2026-07-26T12:00:00.000Z";
  value.sqlite.prepare(
    `INSERT INTO user_profiles (
       id,email,locale,created_at,updated_at
     ) VALUES (?,?,?,?,?)`,
  ).run(
    USER_ID,
    "deletion@example.test",
    "ru",
    authenticatedAt,
    authenticatedAt,
  );
  value.sqlite.prepare(
    `INSERT INTO workspaces (
       id,type,name,locale,created_at,updated_at
     ) VALUES (?,'individual','Deletion workspace','ru',?,?)`,
  ).run(WORKSPACE_ID, authenticatedAt, authenticatedAt);
  value.sqlite.prepare(
    `INSERT INTO workspace_members (
       id,workspace_id,user_id,role,status,joined_at,created_at,updated_at
     ) VALUES (?,?,?,'owner','active',?,?,?)`,
  ).run(
    "deletion-membership",
    WORKSPACE_ID,
    USER_ID,
    authenticatedAt,
    authenticatedAt,
    authenticatedAt,
  );
  value.sqlite.prepare(
    "UPDATE user_profiles SET default_workspace_id=? WHERE id=?",
  ).run(WORKSPACE_ID, USER_ID);
  const session = await createEmailOtpSession(value.d1, {
    userId: USER_ID,
    userAgent: "Deletion browser/1.0",
    now: new Date(authenticatedAt),
  });
  return { ...value, session };
}

async function reserve(
  d1: D1Database,
  sessionId: string,
  options: {
    id?: string;
    now?: string;
    code?: string;
  } = {},
) {
  const now = options.now ?? "2026-07-26T12:01:00.000Z";
  const nowMs = Date.parse(now);
  return reserveAccountDeletionChallenge(d1, {
    id: options.id ?? crypto.randomUUID(),
    userId: USER_ID,
    sessionId,
    emailHash: await sha256("deletion@example.test"),
    locale: "ru",
    codeSalt: SALT,
    codeHash: await sha256(`${SALT}:${options.code ?? CODE}`),
    expiresAt: new Date(nowMs + 10 * 60 * 1_000).toISOString(),
    now,
    recentSince: new Date(nowMs - 10 * 60 * 1_000).toISOString(),
    cooldownSince: new Date(nowMs - 60 * 1_000).toISOString(),
    hourlySince: new Date(nowMs - 60 * 60 * 1_000).toISOString(),
  });
}

function activeChallengeId(
  sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"],
): string {
  return (
    sqlite.prepare(
      `SELECT id FROM account_deletion_challenges
       WHERE user_id=? AND consumed_at IS NULL AND invalidated_at IS NULL`,
    ).get(USER_ID) as { id: string }
  ).id;
}

function confirm(
  d1: D1Database,
  sessionId: string,
  challengeId: string,
  options: {
    code?: string;
    now?: string;
  } = {},
) {
  const now = options.now ?? "2026-07-26T12:02:00.000Z";
  return confirmAccountDeletion(d1, {
    challengeId,
    userId: USER_ID,
    sessionId,
    workspaceId: WORKSPACE_ID,
    code: options.code ?? CODE,
    reason: null,
    assuranceLevel: "primary",
    now,
    recentSince: new Date(
      Date.parse(now) - 10 * 60 * 1_000,
    ).toISOString(),
  });
}

test("parallel deletion-code reservations leave one active challenge", async () => {
  const { sqlite, d1, session } = await fixture();
  try {
    const synchronized = batchBarrier(d1);
    const results = await Promise.all([
      reserve(synchronized, session.sessionId, {
        id: "11111111-1111-4111-8111-111111111111",
      }),
      reserve(synchronized, session.sessionId, {
        id: "22222222-2222-4222-8222-222222222222",
      }),
    ]);
    assert.equal(
      results.filter(({ status }) => status === "reserved").length,
      1,
    );
    assert.equal(
      results.filter(({ status }) => status === "blocked").length,
      1,
    );
    assert.equal(
      (
        sqlite.prepare(
          `SELECT count(*) AS total FROM account_deletion_challenges
           WHERE user_id=? AND consumed_at IS NULL AND invalidated_at IS NULL`,
        ).get(USER_ID) as { total: number }
      ).total,
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("deletion challenge enforces hourly budget and recent active session", async () => {
  const first = await fixture();
  try {
    for (let minute = 1; minute <= 5; minute += 1) {
      assert.equal(
        (
          await reserve(first.d1, first.session.sessionId, {
            now: `2026-07-26T12:0${minute}:00.000Z`,
          })
        ).status,
        "reserved",
      );
    }
    const limited = await reserve(first.d1, first.session.sessionId, {
      now: "2026-07-26T12:06:00.000Z",
    });
    assert.equal(limited.status, "blocked");
    if (limited.status === "blocked") {
      assert.equal(limited.hourlyCount, 5);
    }
  } finally {
    first.sqlite.close();
  }

  const stale = await fixture();
  try {
    assert.equal(
      (
        await reserve(stale.d1, stale.session.sessionId, {
          now: "2026-07-26T12:11:00.001Z",
        })
      ).status,
      "blocked",
    );
    stale.sqlite.prepare(
      "UPDATE auth_sessions SET revoked_at=? WHERE id=?",
    ).run(
      "2026-07-26T12:01:00.000Z",
      stale.session.sessionId,
    );
    assert.equal(
      (
        await reserve(stale.d1, stale.session.sessionId, {
          now: "2026-07-26T12:01:01.000Z",
        })
      ).status,
      "blocked",
    );
  } finally {
    stale.sqlite.close();
  }
});

test("verified deletion request stores exact evidence and revokes sessions", async () => {
  const { sqlite, d1, session } = await fixture();
  try {
    assert.deepEqual(await reserve(d1, session.sessionId), {
      status: "reserved",
    });
    const challengeId = activeChallengeId(sqlite);
    const result = await confirm(d1, session.sessionId, challengeId);
    assert.equal(result.status, "confirmed");
    if (result.status !== "confirmed") return;
    assert.equal(result.revokedSessions, 1);
    const request = sqlite.prepare(
      `SELECT
         user_id AS userId,verification_challenge_id AS challengeId,
         requested_session_id AS sessionId,status,verification_method AS method,
         verified_at AS verifiedAt,requested_at AS requestedAt
       FROM account_deletion_requests WHERE id=?`,
    ).get(result.requestId) as Record<string, unknown>;
    assert.deepEqual({ ...request }, {
      userId: USER_ID,
      challengeId,
      sessionId: session.sessionId,
      status: "requested",
      method: "email_otp",
      verifiedAt: "2026-07-26T12:02:00.000Z",
      requestedAt: "2026-07-26T12:02:00.000Z",
    });
    const challenge = sqlite.prepare(
      `SELECT
         consumed_at AS consumedAt,
         consumed_by_operation_id AS operationId
       FROM account_deletion_challenges WHERE id=?`,
    ).get(challengeId) as {
      consumedAt: string;
      operationId: string;
    };
    assert.equal(challenge.consumedAt, "2026-07-26T12:02:00.000Z");
    assert.ok(challenge.operationId);
    assert.equal(
      (
        sqlite.prepare(
          `SELECT count(*) AS total FROM auth_sessions
           WHERE user_id=? AND revoked_at IS NULL`,
        ).get(USER_ID) as { total: number }
      ).total,
      0,
    );
    assert.equal(
      (
        sqlite.prepare(
          `SELECT count(*) AS total FROM workspace_audit_events
           WHERE actor_user_id=? AND action='account_deletion_requested'`,
        ).get(USER_ID) as { total: number }
      ).total,
      1,
    );
    assert.equal(
      (
        sqlite.prepare(
          `SELECT count(*) AS total FROM security_events
           WHERE user_id=? AND event_type='account.deletion_requested'`,
        ).get(USER_ID) as { total: number }
      ).total,
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("concurrent correct confirmation has one request winner", async () => {
  const { sqlite, d1, session } = await fixture();
  try {
    await reserve(d1, session.sessionId);
    const challengeId = activeChallengeId(sqlite);
    const synchronized = batchBarrier(d1);
    const results = await Promise.all([
      confirm(synchronized, session.sessionId, challengeId),
      confirm(synchronized, session.sessionId, challengeId),
    ]);
    assert.equal(
      results.filter(({ status }) => status === "confirmed").length,
      1,
    );
    assert.equal(
      results.filter(({ status }) => status === "used").length,
      1,
    );
    assert.equal(
      (
        sqlite.prepare(
          "SELECT count(*) AS total FROM account_deletion_requests WHERE user_id=?",
        ).get(USER_ID) as { total: number }
      ).total,
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("wrong, expired, and foreign-session codes fail closed", async () => {
  const { sqlite, d1, session } = await fixture();
  try {
    await reserve(d1, session.sessionId);
    const challengeId = activeChallengeId(sqlite);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const result = await confirm(d1, session.sessionId, challengeId, {
        code: "000000",
      });
      assert.equal(
        result.status,
        attempt === 5 ? "attempts_exceeded" : "incorrect",
      );
    }
    assert.equal(
      (await confirm(d1, session.sessionId, challengeId)).status,
      "attempts_exceeded",
    );

    const second = await createEmailOtpSession(d1, {
      userId: USER_ID,
      userAgent: "Deletion browser/2.0",
      now: new Date("2026-07-26T12:03:00.000Z"),
    });
    assert.equal(
      (await confirm(d1, second.sessionId, challengeId)).status,
      "invalid",
    );

    sqlite.prepare(
      `UPDATE account_deletion_challenges
       SET attempt_count=0,max_attempts=5,expires_at=?
       WHERE id=?`,
    ).run("2026-07-26T12:01:30.000Z", challengeId);
    assert.equal(
      (
        await confirm(d1, session.sessionId, challengeId, {
          now: "2026-07-26T12:02:00.000Z",
        })
      ).status,
      "expired",
    );
    assert.equal(
      (
        sqlite.prepare(
          "SELECT count(*) AS total FROM account_deletion_requests",
        ).get() as { total: number }
      ).total,
      0,
    );
  } finally {
    sqlite.close();
  }
});

test("audit failure rolls back challenge, request, and revocation", async () => {
  const { sqlite, d1, session } = await fixture();
  try {
    await reserve(d1, session.sessionId);
    const challengeId = activeChallengeId(sqlite);
    sqlite.exec(`
      CREATE TRIGGER reject_deletion_audit
      BEFORE INSERT ON workspace_audit_events
      WHEN NEW.action='account_deletion_requested'
      BEGIN
        SELECT RAISE(ABORT, 'forced deletion audit failure');
      END
    `);
    await assert.rejects(
      () => confirm(d1, session.sessionId, challengeId),
      /forced deletion audit failure/,
    );
    assert.deepEqual({
      ...(sqlite.prepare(
        `SELECT consumed_at AS consumedAt,
          consumed_by_operation_id AS operationId
         FROM account_deletion_challenges WHERE id=?`,
      ).get(challengeId) as Record<string, unknown>),
    }, {
      consumedAt: null,
      operationId: null,
    });
    assert.equal(
      (
        sqlite.prepare(
          "SELECT count(*) AS total FROM account_deletion_requests",
        ).get() as { total: number }
      ).total,
      0,
    );
    assert.equal(
      (
        sqlite.prepare(
          `SELECT count(*) AS total FROM auth_sessions
           WHERE id=? AND revoked_at IS NULL`,
        ).get(session.sessionId) as { total: number }
      ).total,
      1,
    );
    assert.equal(
      (
        sqlite.prepare(
          `SELECT count(*) AS total FROM security_events
           WHERE user_id=? AND event_type='account.deletion_requested'`,
        ).get(USER_ID) as { total: number }
      ).total,
      0,
    );
  } finally {
    sqlite.close();
  }
});
