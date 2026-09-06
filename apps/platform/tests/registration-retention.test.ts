import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  finalizePendingRegistration,
  PENDING_REGISTRATION_TTL_MS,
  pendingRegistrationUpsertStatement,
  purgeExpiredPendingRegistrations,
} from "../lib/auth/registration-retention";
import {
  prepareRegistrationAcceptanceWrite,
} from "../lib/legal/acceptance";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const CREATED_AT = "2026-09-01T00:00:00.000Z";
const UPDATED_AT = "2026-09-02T00:00:00.000Z";
const DUE_AT = "2026-09-03T00:00:00.000Z";
const CLEANUP_AT = "2026-09-05T00:00:00.000Z";

function seedProfile(
  sqlite: DatabaseSync,
  id: string,
  options: {
    email?: string;
    verifiedAt?: string | null;
    onboardingCompletedAt?: string | null;
    defaultWorkspaceId?: string | null;
  } = {},
): void {
  sqlite.prepare(`
    INSERT INTO user_profiles (
      id,email,email_verified_at,onboarding_completed_at,default_workspace_id,
      created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?)
  `).run(
    id,
    options.email ?? `${id}@example.test`,
    options.verifiedAt ?? null,
    options.onboardingCompletedAt ?? null,
    options.defaultWorkspaceId ?? null,
    CREATED_AT,
    UPDATED_AT,
  );
}

function seedCredential(sqlite: DatabaseSync, userId: string): void {
  sqlite.prepare(`
    INSERT INTO user_password_credentials (
      user_id,algorithm,iterations,salt_base64url,hash_base64url,
      password_changed_at,created_at,updated_at
    ) VALUES (?,'PBKDF2-SHA256',600000,?,?,?,?,?)
  `).run(
    userId,
    "s".repeat(22),
    "h".repeat(43),
    UPDATED_AT,
    CREATED_AT,
    UPDATED_AT,
  );
}

function seedMarker(
  sqlite: DatabaseSync,
  userId: string,
  expiresAt = DUE_AT,
): void {
  sqlite.prepare(`
    INSERT INTO auth_pending_registrations (
      user_id,expires_at,created_at,updated_at
    ) VALUES (?,?,?,?)
  `).run(userId, expiresAt, CREATED_AT, UPDATED_AT);
}

function seedPending(
  sqlite: DatabaseSync,
  id: string,
  options: Parameters<typeof seedProfile>[2] & { expiresAt?: string } = {},
): void {
  seedProfile(sqlite, id, options);
  seedCredential(sqlite, id);
  seedMarker(sqlite, id, options.expiresAt);
}

function seedOtp(
  sqlite: DatabaseSync,
  input: {
    id: string;
    email: string;
    purpose?: "register" | "password_reset";
    expiresAt: string;
    createdAt?: string;
    consumedAt?: string | null;
    invalidatedAt?: string | null;
  },
): void {
  sqlite.prepare(`
    INSERT INTO auth_otp_challenges (
      id,email,email_hash,purpose,locale,account_type,code_salt,code_hash,
      attempt_count,max_attempts,expires_at,consumed_at,invalidated_at,created_at
    ) VALUES (?,?,?,?,'ru','individual','otp-salt','otp-hash',0,5,?,?,?,?)
  `).run(
    input.id,
    input.email,
    `hash-${input.id}`,
    input.purpose ?? "register",
    input.expiresAt,
    input.consumedAt ?? null,
    input.invalidatedAt ?? null,
    input.createdAt ?? UPDATED_AT,
  );
}

function rowCount(sqlite: DatabaseSync, table: string, column: string, id: string) {
  return Number((sqlite.prepare(
    `SELECT count(*) AS total FROM ${table} WHERE ${column}=?`,
  ).get(id) as { total: number }).total);
}

test("pending registration marker is atomic with the profile batch and refreshes to an exact 24-hour TTL", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seedProfile(sqlite, "retention-upsert");
    const firstNow = new Date("2026-09-04T08:15:00.000Z");
    await d1.batch([
      pendingRegistrationUpsertStatement(d1, {
        userId: "retention-upsert",
        now: firstNow,
      }),
    ]);
    assert.equal(PENDING_REGISTRATION_TTL_MS, 86_400_000);
    assert.deepEqual({ ...sqlite.prepare(`
      SELECT expires_at AS expiresAt,created_at AS createdAt,
        updated_at AS updatedAt
      FROM auth_pending_registrations WHERE user_id='retention-upsert'
    `).get() }, {
      expiresAt: "2026-09-05T08:15:00.000Z",
      createdAt: firstNow.toISOString(),
      updatedAt: firstNow.toISOString(),
    });

    const resendNow = new Date("2026-09-04T09:15:00.000Z");
    await d1.batch([
      pendingRegistrationUpsertStatement(d1, {
        userId: "retention-upsert",
        now: resendNow,
      }),
    ]);
    assert.deepEqual({ ...sqlite.prepare(`
      SELECT expires_at AS expiresAt,created_at AS createdAt,
        updated_at AS updatedAt
      FROM auth_pending_registrations WHERE user_id='retention-upsert'
    `).get() }, {
      expiresAt: "2026-09-05T09:15:00.000Z",
      createdAt: firstNow.toISOString(),
      updatedAt: resendNow.toISOString(),
    });
  } finally {
    sqlite.close();
  }
});

test("only a reserved registration refreshes retention and provider failure keeps the cleanup marker", () => {
  const route = readFileSync(
    new URL("../app/api/auth/request-otp/route.ts", import.meta.url),
    "utf8",
  );
  const blockedGate = route.indexOf('if (reservation.status === "blocked")');
  const marker = route.indexOf(
    "statements.push(pendingRegistrationUpsertStatement",
  );
  const atomicWrite = route.indexOf("await db.batch(statements)", marker);
  const send = route.indexOf("const sent = await sendJuroAuthEmail", atomicWrite);
  const providerFailure = route.indexOf("if (!sent)", send);
  assert.ok(blockedGate >= 0);
  assert.ok(marker > blockedGate);
  assert.ok(atomicWrite > marker);
  assert.ok(send > atomicWrite);
  assert.ok(providerFailure > send);
  const providerFailureBody = route.slice(providerFailure);
  assert.match(
    providerFailureBody,
    /UPDATE auth_otp_challenges SET invalidated_at = \?/u,
  );
  assert.doesNotMatch(providerFailureBody, /auth_pending_registrations/u);
});

test("verification and marker removal roll back together and succeed idempotently", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seedPending(sqlite, "retention-finalize", {
      expiresAt: "2026-09-06T00:00:00.000Z",
    });
    sqlite.exec(`
      CREATE TRIGGER retention_test_marker_delete_failure
      BEFORE DELETE ON auth_pending_registrations
      BEGIN
        SELECT RAISE(ABORT, 'RETENTION_TEST_MARKER_DELETE_FAILURE');
      END;
    `);
    const failedAcceptanceWrite = await prepareRegistrationAcceptanceWrite(
      d1,
      {
        userId: "retention-finalize",
        locale: "ru",
        otpChallengeId: "11111111-1111-4111-8111-111111111111",
        acceptedMarketing: false,
        acceptedAt: "2026-09-04T12:00:00.000Z",
      },
    );
    await assert.rejects(
      () => finalizePendingRegistration(d1, {
        userId: "retention-finalize",
        verifiedAt: "2026-09-04T12:00:00.000Z",
        acceptanceWrite: {
          ...failedAcceptanceWrite,
          locale: "ru",
        },
      }),
      /RETENTION_TEST_MARKER_DELETE_FAILURE/u,
    );
    assert.equal(
      sqlite.prepare(
        "SELECT email_verified_at FROM user_profiles WHERE id='retention-finalize'",
      ).get()?.email_verified_at,
      null,
    );
    assert.equal(
      rowCount(
        sqlite,
        "auth_pending_registrations",
        "user_id",
        "retention-finalize",
      ),
      1,
    );
    assert.equal(
      rowCount(
        sqlite,
        "user_acceptances",
        "user_id",
        "retention-finalize",
      ),
      0,
    );

    sqlite.exec("DROP TRIGGER retention_test_marker_delete_failure");
    const acceptedWrite = await prepareRegistrationAcceptanceWrite(d1, {
      userId: "retention-finalize",
      locale: "ru",
      otpChallengeId: "11111111-1111-4111-8111-111111111111",
      acceptedMarketing: false,
      acceptedAt: "2026-09-04T12:00:00.000Z",
    });
    assert.equal(await finalizePendingRegistration(d1, {
      userId: "retention-finalize",
      verifiedAt: "2026-09-04T12:00:00.000Z",
      acceptanceWrite: {
        ...acceptedWrite,
        locale: "ru",
      },
    }), true);
    assert.equal(
      sqlite.prepare(
        "SELECT email_verified_at FROM user_profiles WHERE id='retention-finalize'",
      ).get()?.email_verified_at,
      "2026-09-04T12:00:00.000Z",
    );
    assert.equal(
      rowCount(
        sqlite,
        "auth_pending_registrations",
        "user_id",
        "retention-finalize",
      ),
      0,
    );
    assert.equal(
      rowCount(
        sqlite,
        "user_acceptances",
        "user_id",
        "retention-finalize",
      ),
      acceptedWrite.mandatoryPolicyIds.length,
    );
    assert.equal(await finalizePendingRegistration(d1, {
      userId: "retention-finalize",
      verifiedAt: "2026-09-04T12:01:00.000Z",
    }), false);
  } finally {
    sqlite.close();
  }
});

test("missing mandatory acceptance evidence aborts the whole finalization batch", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seedPending(sqlite, "retention-acceptance-fence", {
      expiresAt: "2026-09-06T00:00:00.000Z",
    });
    const acceptanceWrite = await prepareRegistrationAcceptanceWrite(d1, {
      userId: "retention-acceptance-fence",
      locale: "ru",
      otpChallengeId: "22222222-2222-4222-8222-222222222222",
      acceptedMarketing: false,
      acceptedAt: "2026-09-04T12:00:00.000Z",
    });
    await assert.rejects(
      () => finalizePendingRegistration(d1, {
        userId: "retention-acceptance-fence",
        verifiedAt: "2026-09-04T12:00:00.000Z",
        acceptanceWrite: {
          ...acceptanceWrite,
          mandatoryPolicyIds: ["missing-mandatory-policy"],
          locale: "ru",
        },
      }),
      /auth_pending_registrations_expiry_check/u,
    );
    assert.equal(
      sqlite.prepare(`
        SELECT email_verified_at FROM user_profiles
        WHERE id='retention-acceptance-fence'
      `).get()?.email_verified_at,
      null,
    );
    assert.equal(
      rowCount(
        sqlite,
        "user_acceptances",
        "user_id",
        "retention-acceptance-fence",
      ),
      0,
    );
    assert.equal(
      rowCount(
        sqlite,
        "auth_pending_registrations",
        "user_id",
        "retention-acceptance-fence",
      ),
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("cleanup deletes only due registration-shaped profiles and remains bounded and idempotent", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seedPending(sqlite, "retention-a-due");
    seedPending(sqlite, "retention-b-due");
    seedPending(sqlite, "retention-future", {
      expiresAt: "2026-09-06T00:00:00.000Z",
    });
    seedPending(sqlite, "retention-verified", {
      verifiedAt: "2026-09-04T00:00:00.000Z",
    });

    const first = await purgeExpiredPendingRegistrations({
      db: d1,
      now: CLEANUP_AT,
      limit: 1,
    });
    assert.deepEqual(first, {
      eligible: 1,
      purged: 1,
      staleMarkersPurged: 1,
      remainingDue: 1,
      registrationOtpEligible: 0,
      registrationOtpPurged: 0,
    });
    assert.equal(rowCount(sqlite, "user_profiles", "id", "retention-a-due"), 0);
    assert.equal(rowCount(sqlite, "user_password_credentials", "user_id", "retention-a-due"), 0);
    assert.equal(rowCount(sqlite, "auth_pending_registrations", "user_id", "retention-a-due"), 0);
    assert.equal(rowCount(sqlite, "user_profiles", "id", "retention-b-due"), 1);
    assert.equal(rowCount(sqlite, "user_profiles", "id", "retention-future"), 1);
    assert.equal(rowCount(sqlite, "user_profiles", "id", "retention-verified"), 1);
    assert.equal(rowCount(sqlite, "auth_pending_registrations", "user_id", "retention-verified"), 0);

    const second = await purgeExpiredPendingRegistrations({
      db: d1,
      now: CLEANUP_AT,
      limit: 1,
    });
    assert.equal(second.eligible, 1);
    assert.equal(second.purged, 1);
    assert.equal(second.remainingDue, 0);
    const third = await purgeExpiredPendingRegistrations({
      db: d1,
      now: CLEANUP_AT,
      limit: 1,
    });
    assert.equal(third.eligible, 0);
    assert.equal(third.purged, 0);
    assert.equal(third.remainingDue, 0);
  } finally {
    sqlite.close();
  }
});

test("cleanup clamps each profile batch to 100 rows", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    for (let index = 0; index < 101; index += 1) {
      seedPending(sqlite, `retention-ceiling-${String(index).padStart(3, "0")}`);
    }
    const result = await purgeExpiredPendingRegistrations({
      db: d1,
      now: CLEANUP_AT,
      limit: 1_000,
    });
    assert.equal(result.eligible, 100);
    assert.equal(result.purged, 100);
    assert.equal(result.remainingDue, 1);
    assert.equal(
      Number((sqlite.prepare(
        "SELECT count(*) AS total FROM user_profiles WHERE id LIKE 'retention-ceiling-%'",
      ).get() as { total: number }).total),
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("an exact-expiry boundary is due but a concurrent marker refresh wins", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seedPending(sqlite, "retention-boundary", { expiresAt: CLEANUP_AT });
    const boundary = await purgeExpiredPendingRegistrations({
      db: d1,
      now: CLEANUP_AT,
    });
    assert.equal(boundary.purged, 1);

    seedPending(sqlite, "retention-refresh-race");
    let refreshed = false;
    const racingDb = {
      prepare: d1.prepare.bind(d1),
      async batch(statements: D1PreparedStatement[]) {
        if (!refreshed) {
          refreshed = true;
          sqlite.prepare(`
            UPDATE auth_pending_registrations
            SET expires_at='2026-09-06T01:00:00.000Z',
              updated_at='2026-09-05T01:00:00.000Z'
            WHERE user_id='retention-refresh-race'
          `).run();
        }
        return d1.batch(statements);
      },
    } as unknown as D1Database;
    const raced = await purgeExpiredPendingRegistrations({
      db: racingDb,
      now: CLEANUP_AT,
    });
    assert.equal(raced.eligible, 1);
    assert.equal(raced.purged, 0);
    assert.equal(raced.remainingDue, 0);
    assert.equal(
      rowCount(sqlite, "user_profiles", "id", "retention-refresh-race"),
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("an unexpected referential dependency fails closed without partial deletion", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seedPending(sqlite, "retention-unknown-reference");
    sqlite.exec(`
      CREATE TABLE retention_unknown_reference (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT
      );
      INSERT INTO retention_unknown_reference (id,user_id)
      VALUES ('retention-unknown-reference-id','retention-unknown-reference');
    `);
    await assert.rejects(
      () => purgeExpiredPendingRegistrations({
        db: d1,
        now: CLEANUP_AT,
      }),
      /FOREIGN KEY constraint failed/u,
    );
    assert.equal(
      rowCount(sqlite, "user_profiles", "id", "retention-unknown-reference"),
      1,
    );
    assert.equal(
      rowCount(
        sqlite,
        "auth_pending_registrations",
        "user_id",
        "retention-unknown-reference",
      ),
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("cleanup preserves every established-account signal and reports due rows that remain", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const protectedIds = [
    "retention-session",
    "retention-member",
    "retention-default-workspace",
    "retention-workspace-creator",
    "retention-onboarding",
    "retention-acceptance",
    "retention-consent",
    "retention-security-email",
    "retention-lawyer",
  ];
  try {
    for (const id of protectedIds) seedPending(sqlite, id);
    sqlite.prepare(`
      INSERT INTO auth_sessions (
        id,user_id,token_hash,auth_method,assurance_level,authenticated_at,
        expires_at,created_at,last_seen_at
      ) VALUES ('retention-session-id','retention-session',?,'email_otp',
        'primary',?,'2026-09-06T00:00:00.000Z',?,?)
    `).run("1".repeat(64), UPDATED_AT, CREATED_AT, UPDATED_AT);

    sqlite.prepare(`
      INSERT INTO workspaces (
        id,type,name,created_by_user_id,locale,created_at,updated_at
      ) VALUES (
        'retention-workspace','individual','Retention',
        'retention-workspace-creator','ru',?,?
      )
    `).run(CREATED_AT, UPDATED_AT);
    sqlite.prepare(`
      INSERT INTO workspace_members (
        id,workspace_id,user_id,role,status,joined_at,created_at,updated_at
      ) VALUES ('retention-member-id','retention-workspace','retention-member',
        'owner','active',?,?,?)
    `).run(CREATED_AT, CREATED_AT, UPDATED_AT);
    sqlite.prepare(`
      UPDATE user_profiles SET default_workspace_id=?
      WHERE id='retention-default-workspace'
    `).run("retention-workspace");
    sqlite.prepare(`
      UPDATE user_profiles SET onboarding_completed_at=?
      WHERE id='retention-onboarding'
    `).run(UPDATED_AT);
    sqlite.prepare(`
      INSERT INTO user_acceptances (
        id,user_id,document_key,document_version,evidence_json,accepted_at
      ) VALUES ('retention-acceptance-id','retention-acceptance','terms','v1',?,?)
    `).run(JSON.stringify({ source: "registration" }), UPDATED_AT);
    sqlite.prepare(`
      INSERT INTO consents (
        id,user_id,workspace_id,type,version,scope_json,granted_at,revoked_at
      ) VALUES ('retention-consent-id','retention-consent',NULL,
        'marketing_email','v1','{}',?,NULL)
    `).run(UPDATED_AT);
    seedOtp(sqlite, {
      id: "retention-security-email-otp",
      email: "retention-security-email@example.test",
      purpose: "password_reset",
      expiresAt: "2026-09-04T00:00:00.000Z",
    });
    sqlite.prepare(`
      INSERT INTO security_email_jobs (
        id,user_id,workspace_id,challenge_id,auth_otp_challenge_id,event_type,
        locale,recipient_ciphertext,recipient_iv,recipient_key_version,status,
        attempt_count,created_at,updated_at
      ) VALUES ('retention-security-email-job','retention-security-email',
        NULL,NULL,'retention-security-email-otp','password_changed','ru',
        ?,?,?,'pending',0,?,?)
    `).run("c".repeat(22), "i".repeat(16), "v1", CREATED_AT, UPDATED_AT);
    sqlite.prepare(`
      INSERT INTO lawyer_profiles (
        id,user_id,display_name,created_at,updated_at
      ) VALUES ('retention-lawyer-id','retention-lawyer','Pending lawyer',?,?)
    `).run(CREATED_AT, UPDATED_AT);

    const result = await purgeExpiredPendingRegistrations({
      db: d1,
      now: CLEANUP_AT,
    });
    assert.equal(result.eligible, 0);
    assert.equal(result.purged, 0);
    assert.equal(result.remainingDue, protectedIds.length);
    for (const id of protectedIds) {
      assert.equal(rowCount(sqlite, "user_profiles", "id", id), 1, id);
      assert.equal(
        rowCount(sqlite, "auth_pending_registrations", "user_id", id),
        1,
        id,
      );
    }
  } finally {
    sqlite.close();
  }
});

test("an active registration OTP closes the resend race until it expires", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const userId = "retention-active-code";
  const email = `${userId}@example.test`;
  try {
    seedPending(sqlite, userId, { email });
    seedOtp(sqlite, {
      id: "retention-active-code-otp",
      email,
      expiresAt: "2026-09-05T00:10:00.000Z",
    });
    const protectedResult = await purgeExpiredPendingRegistrations({
      db: d1,
      now: CLEANUP_AT,
    });
    assert.equal(protectedResult.purged, 0);
    assert.equal(protectedResult.remainingDue, 1);
    assert.equal(rowCount(sqlite, "user_profiles", "id", userId), 1);

    sqlite.prepare(`
      UPDATE auth_otp_challenges SET expires_at='2026-09-04T23:59:59.000Z'
      WHERE id='retention-active-code-otp'
    `).run();
    const expiredResult = await purgeExpiredPendingRegistrations({
      db: d1,
      now: CLEANUP_AT,
    });
    assert.equal(expiredResult.purged, 1);
    assert.equal(expiredResult.registrationOtpPurged, 1);
    assert.equal(rowCount(sqlite, "user_profiles", "id", userId), 0);
    assert.equal(
      rowCount(
        sqlite,
        "auth_otp_challenges",
        "id",
        "retention-active-code-otp",
      ),
      0,
    );
  } finally {
    sqlite.close();
  }
});

test("OTP cleanup is registration-only and preserves policy, MFA, and 0152 security-email evidence", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seedProfile(sqlite, "retention-otp-evidence-user", {
      verifiedAt: UPDATED_AT,
    });
    for (const otp of [
      {
        id: "retention-otp-delete",
        email: "delete@example.test",
        expiresAt: DUE_AT,
      },
      {
        id: "retention-otp-policy",
        email: "policy@example.test",
        expiresAt: DUE_AT,
      },
      {
        id: "retention-otp-security",
        email: "security@example.test",
        expiresAt: DUE_AT,
      },
      {
        id: "retention-otp-mfa",
        email: "mfa@example.test",
        expiresAt: DUE_AT,
      },
      {
        id: "retention-otp-active",
        email: "active@example.test",
        expiresAt: "2026-09-06T00:00:00.000Z",
      },
      {
        id: "retention-otp-hourly-rate-evidence",
        email: "rate-evidence@example.test",
        expiresAt: "2026-09-04T23:40:00.000Z",
        createdAt: "2026-09-04T23:30:00.000Z",
      },
    ]) seedOtp(sqlite, otp);
    seedOtp(sqlite, {
      id: "retention-otp-password-reset",
      email: "reset@example.test",
      purpose: "password_reset",
      expiresAt: DUE_AT,
    });
    sqlite.prepare(`
      INSERT INTO user_acceptances (
        id,user_id,document_key,document_version,evidence_json,accepted_at
      ) VALUES ('retention-otp-policy-evidence','retention-otp-evidence-user',
        'terms','v1',?,?)
    `).run(JSON.stringify({
      otpChallengeId: "retention-otp-policy",
      source: "registration",
    }), UPDATED_AT);
    sqlite.prepare(`
      INSERT INTO security_email_jobs (
        id,user_id,workspace_id,challenge_id,auth_otp_challenge_id,event_type,
        locale,recipient_ciphertext,recipient_iv,recipient_key_version,status,
        attempt_count,created_at,updated_at
      ) VALUES ('retention-otp-security-job','retention-otp-evidence-user',
        NULL,NULL,'retention-otp-security','password_changed','ru',
        ?,?,?,'pending',0,?,?)
    `).run("c".repeat(22), "i".repeat(16), "v1", CREATED_AT, UPDATED_AT);
    sqlite.prepare(`
      INSERT INTO auth_totp_credentials (
        id,user_id,status,secret_ciphertext,secret_iv,key_version,
        enrollment_expires_at,created_at,updated_at,verified_at
      ) VALUES ('retention-otp-mfa-credential','retention-otp-evidence-user',
        'active',?,?,?,'2026-09-06T00:00:00.000Z',?,?,?)
    `).run(
      "t".repeat(22),
      "v".repeat(16),
      "v1",
      CREATED_AT,
      UPDATED_AT,
      UPDATED_AT,
    );
    sqlite.prepare(`
      INSERT INTO auth_mfa_challenges (
        id,token_hash,user_id,credential_id,email_otp_challenge_id,
        primary_auth_method,purpose,attempt_count,max_attempts,expires_at,
        created_at
      ) VALUES ('retention-otp-mfa-challenge',?,'retention-otp-evidence-user',
        'retention-otp-mfa-credential','retention-otp-mfa','email_otp','login',
        0,5,'2026-09-06T00:00:00.000Z',?)
    `).run("m".repeat(64), CREATED_AT);

    const result = await purgeExpiredPendingRegistrations({
      db: d1,
      now: CLEANUP_AT,
    });
    assert.equal(result.registrationOtpEligible, 1);
    assert.equal(result.registrationOtpPurged, 1);
    assert.equal(rowCount(sqlite, "auth_otp_challenges", "id", "retention-otp-delete"), 0);
    for (const id of [
      "retention-otp-policy",
      "retention-otp-security",
      "retention-otp-mfa",
      "retention-otp-active",
      "retention-otp-hourly-rate-evidence",
      "retention-otp-password-reset",
    ]) {
      assert.equal(rowCount(sqlite, "auth_otp_challenges", "id", id), 1, id);
    }
  } finally {
    sqlite.close();
  }
});

test("cleanup is fail-closed and inert before migration 0153 exists", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    sqlite.exec("DROP TABLE auth_pending_registrations");
    assert.deepEqual(await purgeExpiredPendingRegistrations({
      db: d1,
      now: CLEANUP_AT,
    }), {
      eligible: 0,
      purged: 0,
      staleMarkersPurged: 0,
      remainingDue: 0,
      registrationOtpEligible: 0,
      registrationOtpPurged: 0,
    });
  } finally {
    sqlite.close();
  }
});

test("the existing locked scheduler runs retention and emits count-only telemetry", () => {
  const worker = readFileSync(
    new URL("../worker/platform-scheduled.ts", import.meta.url),
    "utf8",
  );
  const scheduledHandler = worker.indexOf("export async function handleScheduled");
  const scheduleLock = worker.indexOf(
    "const run = await claimSchedule(env, controller)",
    scheduledHandler,
  );
  const cleanup = worker.indexOf(
    "await purgeExpiredPendingRegistrations",
    scheduleLock,
  );
  const nextRetentionJob = worker.indexOf(
    "await purgeDueDeletedUserMemories",
    cleanup,
  );
  assert.ok(scheduledHandler >= 0);
  assert.ok(scheduleLock > scheduledHandler);
  assert.ok(cleanup > scheduleLock);
  assert.ok(nextRetentionJob > cleanup);
  assert.match(
    worker,
    /PENDING_REGISTRATION_RETENTION_CLEANUP_FAILED/u,
  );
  assert.match(worker, /pendingRegistrationRetentionRemainingDue/u);
  assert.doesNotMatch(
    worker,
    /pendingRegistrationRetention(?:Email|Password|Hash)/u,
  );
});
