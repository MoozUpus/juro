import assert from "node:assert/strict";
import test from "node:test";
import {
  isPlatformStaffRole,
  platformStaffCapabilities,
  platformStaffRoleAllows,
  PlatformStaffAccessError,
  requirePlatformStaffAccess,
  type PlatformStaffRole,
} from "../lib/auth/staff-access";
import type { LocalSession } from "../lib/auth/session-management";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const USER_ID = "staff-user";
const SESSION_ID = "staff-session";
const DEVICE_ID = "staff-device";
const NOW = "2026-07-26T12:30:00.000Z";
const MFA_AT = "2026-07-26T12:20:00.000Z";

function insertUserAndMfaSession(options: {
  assuranceLevel?: "primary" | "mfa";
  mfaVerifiedAt?: string | null;
  credentialStatus?: "active" | "disabled";
  deviceRevokedAt?: string | null;
} = {}) {
  const value = sqliteD1Fixture();
  const assuranceLevel = options.assuranceLevel ?? "mfa";
  const mfaVerifiedAt = options.mfaVerifiedAt === undefined
    ? MFA_AT
    : options.mfaVerifiedAt;
  const credentialStatus = options.credentialStatus ?? "active";
  value.sqlite.prepare(
    `INSERT INTO user_profiles (
       id,email,locale,account_type,timezone,created_at,updated_at
     ) VALUES (?,'staff@example.test','ru','individual','Asia/Tashkent',?,?)`,
  ).run(USER_ID, MFA_AT, MFA_AT);
  value.sqlite.prepare(
    `INSERT INTO auth_devices (
       id,user_id,display_name,first_seen_at,last_seen_at,revoked_at
     ) VALUES (?,?,'Staff test device',?,?,?)`,
  ).run(
    DEVICE_ID,
    USER_ID,
    MFA_AT,
    MFA_AT,
    options.deviceRevokedAt ?? null,
  );
  value.sqlite.prepare(
    `INSERT INTO auth_sessions (
       id,user_id,device_id,token_hash,auth_method,assurance_level,authenticated_at,
       mfa_verified_at,expires_at,idle_expires_at,created_at,last_seen_at
     ) VALUES (?,?,?,?,'email_otp+totp',?,?,?,?,?,?,?)`,
  ).run(
    SESSION_ID,
    USER_ID,
    DEVICE_ID,
    "staff-session-token-hash",
    assuranceLevel,
    MFA_AT,
    mfaVerifiedAt,
    "2026-07-27T12:30:00.000Z",
    "2026-07-27T12:30:00.000Z",
    MFA_AT,
    MFA_AT,
  );
  value.sqlite.prepare(
    `INSERT INTO auth_totp_credentials (
       id,user_id,status,secret_ciphertext,secret_iv,key_version,
       enrollment_expires_at,created_at,updated_at,verified_at,disabled_at
     ) VALUES (?,?,?,'ciphertext','abcdefghijklmnop','v1',?,?,?,?,?)`,
  ).run(
    "staff-totp",
    USER_ID,
    credentialStatus,
    "2026-07-27T12:00:00.000Z",
    MFA_AT,
    MFA_AT,
    credentialStatus === "active" ? MFA_AT : null,
    credentialStatus === "disabled" ? MFA_AT : null,
  );
  return value;
}

function insertAssignment(
  sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"],
  role: PlatformStaffRole,
  options: {
    id?: string;
    grantedAt?: string;
    expiresAt?: string;
    revokedAt?: string | null;
  } = {},
) {
  const revokedAt = options.revokedAt ?? null;
  sqlite.prepare(
    `INSERT INTO platform_staff_assignments (
       id,user_id,role,grant_source,granted_by_user_id,grant_reason,
       granted_at,expires_at,revoked_at,revocation_source,
       revoked_by_user_id,revocation_reason,created_at,updated_at
     ) VALUES (?, ?, ?, 'operator_bootstrap', NULL, 'Approved test role',
       ?, ?, ?, ?, NULL, ?, ?, ?)`,
  ).run(
    options.id ?? `assignment-${role}`,
    USER_ID,
    role,
    options.grantedAt ?? "2026-07-26T12:00:00.000Z",
    options.expiresAt ?? "2026-07-27T12:00:00.000Z",
    revokedAt,
    revokedAt ? "operator" : null,
    revokedAt ? "Test revocation" : null,
    "2026-07-26T12:00:00.000Z",
    revokedAt ?? "2026-07-26T12:00:00.000Z",
  );
}

function session(
  overrides: Partial<
    Pick<LocalSession, "assuranceLevel" | "mfaVerifiedAt">
  > = {},
) {
  return {
    sessionId: SESSION_ID,
    userId: USER_ID,
    assuranceLevel: overrides.assuranceLevel ?? "mfa",
    mfaVerifiedAt: overrides.mfaVerifiedAt === undefined
      ? MFA_AT
      : overrides.mfaVerifiedAt,
  };
}

async function denied(promise: Promise<unknown>) {
  await assert.rejects(
    promise,
    (error) => error instanceof PlatformStaffAccessError
      && error.message === "PLATFORM_STAFF_ACCESS_DENIED",
  );
}

test("platform staff roles are distinct from workspace roles and grant no content capability", () => {
  for (const role of ["administrator", "support", "legal_reviewer"]) {
    assert.ok(isPlatformStaffRole(role));
  }
  for (const workspaceRole of ["owner", "admin", "lawyer", "employee"]) {
    assert.equal(isPlatformStaffRole(workspaceRole), false);
  }
  assert.equal(
    platformStaffCapabilities.some(
      (capability) => /document|case|workspace|customer|content/.test(
        capability,
      ),
    ),
    false,
  );
  assert.equal(
    platformStaffRoleAllows("support", "staff.security.audit"),
    false,
  );
  assert.equal(
    platformStaffRoleAllows("legal_reviewer", "support.tickets.manage"),
    false,
  );
  assert.equal(
    platformStaffRoleAllows("administrator", "staff.roles.manage"),
    true,
  );
  assert.equal(
    platformStaffRoleAllows("administrator", "support.tickets.manage"),
    false,
  );
  assert.equal(
    platformStaffRoleAllows("administrator", "legal.sources.review"),
    false,
  );
  assert.equal(
    platformStaffRoleAllows("administrator", "legal.sources.publish"),
    false,
  );
  assert.equal(
    platformStaffRoleAllows("legal_reviewer", "legal.sources.publish"),
    true,
  );
  assert.equal(
    platformStaffRoleAllows("legal_reviewer", "lawyer.reviews.moderate"),
    true,
  );
  assert.equal(
    platformStaffRoleAllows("administrator", "knowledge.base.manage"),
    true,
  );
  assert.equal(
    platformStaffRoleAllows("legal_reviewer", "knowledge.base.manage"),
    true,
  );
  assert.equal(
    platformStaffRoleAllows("support", "knowledge.base.manage"),
    false,
  );
});

test("active platform assignment requires a live local MFA session and active TOTP", async () => {
  const value = insertUserAndMfaSession();
  try {
    insertAssignment(value.sqlite, "administrator");
    const access = await requirePlatformStaffAccess(
      value.d1,
      session(),
      "staff.roles.manage",
      { now: new Date(NOW) },
    );
    assert.deepEqual(access.roles, ["administrator"]);
    assert.deepEqual(access.assignmentIds, ["assignment-administrator"]);

    await denied(requirePlatformStaffAccess(
      value.d1,
      session({ assuranceLevel: "primary", mfaVerifiedAt: null }),
      "staff.roles.manage",
      { now: new Date(NOW) },
    ));
    value.sqlite.prepare(
      "UPDATE auth_sessions SET revoked_at=? WHERE id=?",
    ).run(NOW, SESSION_ID);
    await denied(requirePlatformStaffAccess(
      value.d1,
      session(),
      "staff.roles.manage",
      { now: new Date(NOW) },
    ));
  } finally {
    value.sqlite.close();
  }

  const revokedDevice = insertUserAndMfaSession({
    deviceRevokedAt: NOW,
  });
  try {
    insertAssignment(revokedDevice.sqlite, "administrator");
    await denied(requirePlatformStaffAccess(
      revokedDevice.d1,
      session(),
      "staff.roles.manage",
      { now: new Date(NOW) },
    ));
  } finally {
    revokedDevice.sqlite.close();
  }

  const disabled = insertUserAndMfaSession({
    credentialStatus: "disabled",
  });
  try {
    insertAssignment(disabled.sqlite, "administrator");
    await denied(requirePlatformStaffAccess(
      disabled.d1,
      session(),
      "staff.roles.manage",
      { now: new Date(NOW) },
    ));
  } finally {
    disabled.sqlite.close();
  }

  const inconsistent = insertUserAndMfaSession();
  try {
    insertAssignment(inconsistent.sqlite, "administrator");
    inconsistent.sqlite.prepare(
      "UPDATE auth_totp_credentials SET disabled_at=? WHERE id='staff-totp'",
    ).run(NOW);
    await denied(requirePlatformStaffAccess(
      inconsistent.d1,
      session(),
      "staff.roles.manage",
      { now: new Date(NOW) },
    ));
  } finally {
    inconsistent.sqlite.close();
  }
});

test("capabilities, expiry, revocation, and optional fresh-MFA gates fail closed", async () => {
  const support = insertUserAndMfaSession();
  try {
    insertAssignment(support.sqlite, "support");
    await requirePlatformStaffAccess(
      support.d1,
      session(),
      "support.tickets.manage",
      { now: new Date(NOW) },
    );
    await denied(requirePlatformStaffAccess(
      support.d1,
      session(),
      "staff.roles.manage",
      { now: new Date(NOW) },
    ));
    await denied(requirePlatformStaffAccess(
      support.d1,
      session(),
      "support.tickets.manage",
      { now: new Date(NOW), freshMfaWithinMs: 5 * 60 * 1_000 },
    ));
    await requirePlatformStaffAccess(
      support.d1,
      session(),
      "support.tickets.manage",
      { now: new Date(NOW), freshMfaWithinMs: 15 * 60 * 1_000 },
    );
  } finally {
    support.sqlite.close();
  }

  const expired = insertUserAndMfaSession();
  try {
    insertAssignment(expired.sqlite, "support", {
      expiresAt: "2026-07-26T12:29:59.000Z",
    });
    await denied(requirePlatformStaffAccess(
      expired.d1,
      session(),
      "support.tickets.manage",
      { now: new Date(NOW) },
    ));
  } finally {
    expired.sqlite.close();
  }

  const revoked = insertUserAndMfaSession();
  try {
    insertAssignment(revoked.sqlite, "legal_reviewer", {
      revokedAt: "2026-07-26T12:25:00.000Z",
    });
    await denied(requirePlatformStaffAccess(
      revoked.d1,
      session(),
      "legal.sources.review",
      { now: new Date(NOW) },
    ));
  } finally {
    revoked.sqlite.close();
  }
});
