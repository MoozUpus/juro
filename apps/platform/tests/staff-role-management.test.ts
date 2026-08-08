import assert from "node:assert/strict";
import test from "node:test";
import {
  PlatformStaffAccessError,
  type PlatformStaffRole,
} from "../lib/auth/staff-access";
import {
  grantPlatformStaffRole,
  MAX_STAFF_ROLE_TTL_MS,
  PlatformStaffRoleManagementError,
  revokePlatformStaffRole,
} from "../lib/auth/staff-role-management";
import {
  verifyPlatformStaffRoleEventChain,
  type PlatformStaffRoleEventInput,
  type PlatformStaffRoleEventRecord,
} from "../lib/auth/staff-role-events";
import type { LocalSession } from "../lib/auth/session-management";
import {
  batchBarrier,
  sqliteD1Fixture,
} from "./helpers/sqlite-d1";

const ACTOR_ID = "staff-admin";
const SUBJECT_ID = "staff-subject";
const SECOND_SUBJECT_ID = "staff-subject-two";
const ACTOR_SESSION_ID = "staff-admin-session";
const ACTOR_DEVICE_ID = "staff-admin-device";
const ACTOR_ASSIGNMENT_ID = "staff-admin-assignment";
const NOW = new Date("2026-07-26T12:30:00.000Z");
const MFA_AT = "2026-07-26T12:28:00.000Z";

function insertUser(
  sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"],
  userId: string,
  email: string,
) {
  sqlite.prepare(
    `INSERT INTO user_profiles (
       id,email,locale,account_type,timezone,created_at,updated_at
     ) VALUES (?,?,'ru','individual','Asia/Tashkent',?,?)`,
  ).run(userId, email, MFA_AT, MFA_AT);
}

function insertTotp(
  sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"],
  userId: string,
  options: {
    id?: string;
    verifiedAt?: string;
    status?: "active" | "disabled";
  } = {},
) {
  const status = options.status ?? "active";
  sqlite.prepare(
    `INSERT INTO auth_totp_credentials (
       id,user_id,status,secret_ciphertext,secret_iv,key_version,
       enrollment_expires_at,created_at,updated_at,verified_at,disabled_at
     ) VALUES (?,?,?,'ciphertext','abcdefghijklmnop','v1',?,?,?,?,?)`,
  ).run(
    options.id ?? `totp-${userId}`,
    userId,
    status,
    "2026-07-27T12:00:00.000Z",
    MFA_AT,
    MFA_AT,
    options.verifiedAt ?? MFA_AT,
    status === "disabled" ? MFA_AT : null,
  );
}

function insertAssignment(
  sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"],
  input: {
    id: string;
    userId: string;
    role: PlatformStaffRole;
    grantSource?: "operator_bootstrap" | "administrator";
    grantedByUserId?: string | null;
    expiresAt?: string;
  },
) {
  const grantSource = input.grantSource ?? "operator_bootstrap";
  sqlite.prepare(
    `INSERT INTO platform_staff_assignments (
       id,user_id,role,grant_source,granted_by_user_id,grant_reason,
       granted_at,expires_at,created_at,updated_at
     ) VALUES (?,?,?,?,?,'Approved test role',?,?,?,?)`,
  ).run(
    input.id,
    input.userId,
    input.role,
    grantSource,
    input.grantedByUserId ?? null,
    "2026-07-26T12:00:00.000Z",
    input.expiresAt ?? "2026-08-26T12:00:00.000Z",
    "2026-07-26T12:00:00.000Z",
    "2026-07-26T12:00:00.000Z",
  );
}

function fixture(actorRole: PlatformStaffRole = "administrator") {
  const value = sqliteD1Fixture();
  insertUser(value.sqlite, ACTOR_ID, "admin@example.test");
  insertUser(value.sqlite, SUBJECT_ID, "subject@example.test");
  insertUser(value.sqlite, SECOND_SUBJECT_ID, "subject-two@example.test");
  insertTotp(value.sqlite, ACTOR_ID);
  insertTotp(value.sqlite, SUBJECT_ID);
  insertTotp(value.sqlite, SECOND_SUBJECT_ID);
  value.sqlite.prepare(
    `INSERT INTO auth_devices (
       id,user_id,display_name,first_seen_at,last_seen_at
     ) VALUES (?,?,'Admin device',?,?)`,
  ).run(ACTOR_DEVICE_ID, ACTOR_ID, MFA_AT, MFA_AT);
  value.sqlite.prepare(
    `INSERT INTO auth_sessions (
       id,user_id,device_id,token_hash,auth_method,assurance_level,
       authenticated_at,mfa_verified_at,expires_at,idle_expires_at,
       created_at,last_seen_at
     ) VALUES (?,?,?,'staff-admin-token','email_otp+totp','mfa',
       ?,?,'2026-07-27T12:30:00.000Z','2026-07-27T12:30:00.000Z',?,?)`,
  ).run(
    ACTOR_SESSION_ID,
    ACTOR_ID,
    ACTOR_DEVICE_ID,
    MFA_AT,
    MFA_AT,
    MFA_AT,
    MFA_AT,
  );
  insertAssignment(value.sqlite, {
    id: ACTOR_ASSIGNMENT_ID,
    userId: ACTOR_ID,
    role: actorRole,
  });
  return value;
}

function actorSession(
  overrides: Partial<
    Pick<LocalSession, "assuranceLevel" | "mfaVerifiedAt">
  > = {},
) {
  return {
    sessionId: ACTOR_SESSION_ID,
    userId: ACTOR_ID,
    assuranceLevel: overrides.assuranceLevel ?? "mfa",
    mfaVerifiedAt: overrides.mfaVerifiedAt === undefined
      ? MFA_AT
      : overrides.mfaVerifiedAt,
  };
}

function managementError(
  code: PlatformStaffRoleManagementError["code"],
) {
  return (error: unknown) =>
    error instanceof PlatformStaffRoleManagementError
      && error.code === code;
}

type StoredRoleEvent =
  PlatformStaffRoleEventInput
  & PlatformStaffRoleEventRecord;

function roleEvents(
  sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"],
): StoredRoleEvent[] {
  return sqlite.prepare(
    `SELECT
       id,actor_user_id AS actorUserId,
       actor_session_id AS actorSessionId,
       actor_assignment_id AS actorAssignmentId,
       subject_user_id AS subjectUserId,
       subject_assignment_id AS subjectAssignmentId,
       event_type AS eventType,role,reason,
       actor_mfa_verified_at AS actorMfaVerifiedAt,
       previous_hash AS previousHash,event_hash AS eventHash,
       created_at AS createdAt
     FROM platform_staff_role_events
     ORDER BY rowid`,
  ).all() as unknown as StoredRoleEvent[];
}

test("administrator grant/revoke is fresh-MFA-gated, atomic, and append-only", async () => {
  const { sqlite, d1 } = fixture();
  try {
    const grant = await grantPlatformStaffRole(
      d1,
      actorSession(),
      {
        subjectUserId: SUBJECT_ID,
        role: "support",
        reason: "Temporary customer-support duty",
        expiresAt: new Date("2026-07-27T12:30:00.000Z"),
        now: NOW,
      },
    );
    assert.deepEqual(
      {
        ...sqlite.prepare(
        `SELECT
           user_id AS userId,role,grant_source AS grantSource,
           granted_by_user_id AS grantedByUserId,grant_reason AS grantReason,
           revoked_at AS revokedAt
         FROM platform_staff_assignments WHERE id=?`,
        ).get(grant.assignmentId),
      },
      {
        userId: SUBJECT_ID,
        role: "support",
        grantSource: "administrator",
        grantedByUserId: ACTOR_ID,
        grantReason: "Temporary customer-support duty",
        revokedAt: null,
      },
    );

    const revoke = await revokePlatformStaffRole(
      d1,
      actorSession(),
      {
        assignmentId: grant.assignmentId,
        reason: "Support rotation ended",
        now: new Date("2026-07-26T12:31:00.000Z"),
      },
    );
    assert.equal(revoke.assignmentId, grant.assignmentId);
    assert.deepEqual(
      {
        ...sqlite.prepare(
        `SELECT
           revoked_at AS revokedAt,
           revocation_source AS revocationSource,
           revoked_by_user_id AS revokedByUserId,
           revocation_reason AS revocationReason
         FROM platform_staff_assignments WHERE id=?`,
        ).get(grant.assignmentId),
      },
      {
        revokedAt: "2026-07-26T12:31:00.000Z",
        revocationSource: "administrator",
        revokedByUserId: ACTOR_ID,
        revocationReason: "Support rotation ended",
      },
    );

    await revokePlatformStaffRole(
      d1,
      actorSession(),
      {
        assignmentId: ACTOR_ASSIGNMENT_ID,
        reason: "Administrator self-deprovisioned",
        now: new Date("2026-07-26T12:32:00.000Z"),
      },
    );
    const events = roleEvents(sqlite);
    assert.equal(events.length, 3);
    assert.deepEqual(
      events.map(({ eventType }) => eventType),
      [
        "staff.role.granted",
        "staff.role.revoked",
        "staff.role.revoked",
      ],
    );
    assert.equal(await verifyPlatformStaffRoleEventChain(events), true);
    assert.throws(
      () => sqlite.prepare(
        `UPDATE platform_staff_role_events
         SET reason='rewritten' WHERE id=?`,
      ).run(grant.eventId),
      /append-only/,
    );
    assert.throws(
      () => sqlite.prepare(
        "DELETE FROM platform_staff_role_events WHERE id=?",
      ).run(grant.eventId),
      /append-only/,
    );
  } finally {
    sqlite.close();
  }
});

test("role management denies stale/non-admin/self grants and ineligible subjects", async () => {
  const value = fixture();
  try {
    value.sqlite.prepare(
      `UPDATE auth_sessions SET mfa_verified_at=?
       WHERE id=?`,
    ).run("2026-07-26T12:20:00.000Z", ACTOR_SESSION_ID);
    await assert.rejects(
      grantPlatformStaffRole(
        value.d1,
        actorSession({ mfaVerifiedAt: "2026-07-26T12:20:00.000Z" }),
        {
          subjectUserId: SUBJECT_ID,
          role: "support",
          reason: "Stale MFA must fail",
          expiresAt: new Date("2026-07-27T12:30:00.000Z"),
          now: NOW,
        },
      ),
      PlatformStaffAccessError,
    );
    value.sqlite.prepare(
      `UPDATE auth_sessions SET mfa_verified_at=?
       WHERE id=?`,
    ).run(MFA_AT, ACTOR_SESSION_ID);
    await assert.rejects(
      grantPlatformStaffRole(
        value.d1,
        actorSession(),
        {
          subjectUserId: ACTOR_ID,
          role: "support",
          reason: "Self grant must fail",
          expiresAt: new Date("2026-07-27T12:30:00.000Z"),
          now: NOW,
        },
      ),
      managementError("PLATFORM_STAFF_ROLE_SELF_GRANT_FORBIDDEN"),
    );
    value.sqlite.prepare(
      `UPDATE auth_totp_credentials
       SET status='disabled',disabled_at=?
       WHERE user_id=?`,
    ).run(NOW.toISOString(), SUBJECT_ID);
    await assert.rejects(
      grantPlatformStaffRole(
        value.d1,
        actorSession(),
        {
          subjectUserId: SUBJECT_ID,
          role: "support",
          reason: "Subject without MFA must fail",
          expiresAt: new Date("2026-07-27T12:30:00.000Z"),
          now: NOW,
        },
      ),
      managementError("PLATFORM_STAFF_ROLE_SUBJECT_MFA_REQUIRED"),
    );
    await assert.rejects(
      grantPlatformStaffRole(
        value.d1,
        actorSession(),
        {
          subjectUserId: SECOND_SUBJECT_ID,
          role: "support",
          reason: "Excessive role lifetime must fail",
          expiresAt: new Date(
            NOW.getTime() + MAX_STAFF_ROLE_TTL_MS + 1,
          ),
          now: NOW,
        },
      ),
      managementError("PLATFORM_STAFF_ROLE_INPUT_INVALID"),
    );
    insertAssignment(value.sqlite, {
      id: "expired-support-assignment",
      userId: SECOND_SUBJECT_ID,
      role: "support",
      grantSource: "administrator",
      grantedByUserId: ACTOR_ID,
      expiresAt: "2026-07-26T12:29:00.000Z",
    });
    await assert.rejects(
      revokePlatformStaffRole(
        value.d1,
        actorSession(),
        {
          assignmentId: "expired-support-assignment",
          reason: "Expired roles are not active",
          now: NOW,
        },
      ),
      managementError("PLATFORM_STAFF_ROLE_NOT_ACTIVE"),
    );
  } finally {
    value.sqlite.close();
  }

  const support = fixture("support");
  try {
    await assert.rejects(
      grantPlatformStaffRole(
        support.d1,
        actorSession(),
        {
          subjectUserId: SUBJECT_ID,
          role: "legal_reviewer",
          reason: "Support cannot manage roles",
          expiresAt: new Date("2026-07-27T12:30:00.000Z"),
          now: NOW,
        },
      ),
      PlatformStaffAccessError,
    );
  } finally {
    support.sqlite.close();
  }
});

test("concurrent grants to distinct subjects serialize one actor event chain", async () => {
  const value = fixture();
  try {
    const synchronized = batchBarrier(value.d1, 2);
    const grants = await Promise.all([
      grantPlatformStaffRole(
        synchronized,
        actorSession(),
        {
          subjectUserId: SUBJECT_ID,
          role: "support",
          reason: "Concurrent support duty",
          expiresAt: new Date("2026-07-27T12:30:00.000Z"),
          now: NOW,
        },
      ),
      grantPlatformStaffRole(
        synchronized,
        actorSession(),
        {
          subjectUserId: SECOND_SUBJECT_ID,
          role: "legal_reviewer",
          reason: "Concurrent legal review duty",
          expiresAt: new Date("2026-07-27T12:30:00.000Z"),
          now: NOW,
        },
      ),
    ]);
    assert.equal(grants.length, 2);
    assert.equal(
      value.sqlite.prepare(
        `SELECT count(*) AS count
         FROM platform_staff_assignments
         WHERE grant_source='administrator'`,
      ).get()?.count,
      2,
    );
    const events = roleEvents(value.sqlite);
    assert.equal(events.length, 2);
    assert.equal(await verifyPlatformStaffRoleEventChain(events), true);
  } finally {
    value.sqlite.close();
  }
});

test("concurrent grants have one winner and event failure rolls back role state", async () => {
  const value = fixture();
  try {
    const synchronized = batchBarrier(value.d1, 2);
    const concurrent = await Promise.allSettled([
      grantPlatformStaffRole(
        synchronized,
        actorSession(),
        {
          subjectUserId: SUBJECT_ID,
          role: "legal_reviewer",
          reason: "Concurrent legal review duty",
          expiresAt: new Date("2026-07-27T12:30:00.000Z"),
          now: NOW,
        },
      ),
      grantPlatformStaffRole(
        synchronized,
        actorSession(),
        {
          subjectUserId: SUBJECT_ID,
          role: "legal_reviewer",
          reason: "Concurrent legal review duty",
          expiresAt: new Date("2026-07-27T12:30:00.000Z"),
          now: NOW,
        },
      ),
    ]);
    assert.equal(
      concurrent.filter(({ status }) => status === "fulfilled").length,
      1,
    );
    assert.equal(
      concurrent.filter(({ status }) => status === "rejected").length,
      1,
    );
    assert.equal(
      value.sqlite.prepare(
        `SELECT count(*) AS count
         FROM platform_staff_assignments
         WHERE user_id=? AND role='legal_reviewer'`,
      ).get(SUBJECT_ID)?.count,
      1,
    );
    assert.equal(roleEvents(value.sqlite).length, 1);

    value.sqlite.exec(`
      CREATE TRIGGER reject_staff_role_event_test
      BEFORE INSERT ON platform_staff_role_events
      BEGIN
        SELECT RAISE(ABORT, 'forced role event failure');
      END
    `);
    await assert.rejects(
      grantPlatformStaffRole(
        value.d1,
        actorSession(),
        {
          subjectUserId: SECOND_SUBJECT_ID,
          role: "support",
          reason: "Must roll back with event failure",
          expiresAt: new Date("2026-07-27T12:30:00.000Z"),
          now: NOW,
        },
      ),
      /forced role event failure/,
    );
    assert.equal(
      value.sqlite.prepare(
        `SELECT count(*) AS count
         FROM platform_staff_assignments
         WHERE user_id=? AND role='support'`,
      ).get(SECOND_SUBJECT_ID)?.count,
      0,
    );
    assert.equal(roleEvents(value.sqlite).length, 1);
  } finally {
    value.sqlite.close();
  }
});
