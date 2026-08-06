import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { issueAdminDomainHandoff } from "../lib/auth/admin-domain-handoff";
import {
  consumeAdminDomainHandoff,
  revokeAdminDomainSession,
  requireAdminDomainSession,
} from "../lib/auth/admin-domain-session";
import { sha256 } from "../lib/auth/crypto";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const NOW = new Date("2026-08-07T08:00:00.000Z");
const USER_ID = "10000000-0000-4000-8000-000000000001";
const SESSION_ID = "20000000-0000-4000-8000-000000000001";

function seed() {
  const value = sqliteD1Fixture();
  const now = NOW.toISOString();
  value.sqlite.prepare(
    `INSERT INTO user_profiles (id,email,locale,account_type,timezone,created_at,updated_at)
     VALUES (?,'admin-fixture@example.test','ru','individual','Asia/Tashkent',?,?)`,
  ).run(USER_ID, now, now);
  value.sqlite.prepare(
    `INSERT INTO auth_sessions (
       id,user_id,token_hash,auth_method,assurance_level,authenticated_at,
       mfa_verified_at,expires_at,idle_expires_at,created_at,last_seen_at
     ) VALUES (?,?,?,'email_otp+totp','mfa',?,?,?,?,?,?)`,
  ).run(
    SESSION_ID,
    USER_ID,
    "a".repeat(64),
    now,
    now,
    "2026-08-08T08:00:00.000Z",
    "2026-08-08T08:00:00.000Z",
    now,
    now,
  );
  value.sqlite.prepare(
    `INSERT INTO auth_totp_credentials (
       id,user_id,status,secret_ciphertext,secret_iv,key_version,
       enrollment_expires_at,created_at,updated_at,verified_at
     ) VALUES ('30000000-0000-4000-8000-000000000001',?,'active','fixture','abcdefghijklmnop','v1',?,?,?,?)`,
  ).run(USER_ID, "2026-08-08T08:00:00.000Z", now, now, now);
  value.sqlite.prepare(
    `INSERT INTO platform_staff_assignments (
       id,user_id,role,grant_source,grant_reason,granted_at,expires_at,created_at,updated_at
     ) VALUES ('40000000-0000-4000-8000-000000000001',?,'administrator','operator_bootstrap','Synthetic admin handoff test',?,?,?,?)`,
  ).run(USER_ID, "2026-08-07T07:00:00.000Z", "2026-08-08T08:00:00.000Z", now, now);
  return value;
}

function staff() {
  return {
    userId: USER_ID,
    sessionId: SESSION_ID,
    capability: "staff.console.view" as const,
    roles: ["administrator" as const],
    assignmentIds: ["assignment"],
    mfaVerifiedAt: NOW.toISOString(),
  };
}

test("admin-domain ticket persists only a hash and creates an append-only audit event", async () => {
  const { sqlite, d1 } = seed();
  try {
    const result = await issueAdminDomainHandoff(d1, {
      staff: staff(),
      appEnvironment: "staging",
      destinationOrigin: "https://admin.staging.juro.uz",
      now: NOW,
    });
    assert.match(result.ticket, /^[A-Za-z0-9_-]{43}$/u);
    assert.equal(result.expiresAt, "2026-08-07T08:02:00.000Z");
    const ticket = sqlite.prepare(
      "SELECT environment,token_hash,staff_user_id,source_session_id,destination_origin,expires_at FROM admin_handoff_tickets",
    ).get() as { environment: string; token_hash: string; staff_user_id: string; source_session_id: string; destination_origin: string; expires_at: string };
    assert.deepEqual({ ...ticket }, {
      environment: "staging",
      token_hash: await sha256(result.ticket),
      staff_user_id: USER_ID,
      source_session_id: SESSION_ID,
      destination_origin: "https://admin.staging.juro.uz",
      expires_at: result.expiresAt,
    });
    const event = sqlite.prepare("SELECT action,metadata_json FROM admin_domain_audit_events").get() as { action: string; metadata_json: string };
    assert.equal(event.action, "handoff_issued");
    assert.doesNotMatch(event.metadata_json, /[A-Za-z0-9_-]{43}/u);
    assert.throws(() => sqlite.prepare("UPDATE admin_domain_audit_events SET action='tampered'").run(), /append-only/u);
    assert.throws(() => sqlite.prepare("DELETE FROM admin_domain_audit_events").run(), /append-only/u);
  } finally {
    sqlite.close();
  }
});

test("admin-domain handoff fails closed for non-canonical origins and invalid environment", async () => {
  const { sqlite, d1 } = seed();
  try {
    for (const [appEnvironment, destinationOrigin] of [
      ["staging", "http://admin.staging.juro.uz"],
      ["staging", "https://admin.staging.juro.uz/path"],
      ["preview", "https://admin.staging.juro.uz"],
    ] as const) {
      await assert.rejects(
        issueAdminDomainHandoff(d1, { staff: staff(), appEnvironment, destinationOrigin, now: NOW }),
        /ADMIN_HANDOFF_CONFIGURATION_INVALID/u,
      );
    }
    assert.equal(sqlite.prepare("SELECT count(*) AS total FROM admin_handoff_tickets").get()?.total, 0);
  } finally {
    sqlite.close();
  }
});

test("admin-domain handoff is one use and every admin request rechecks source MFA and roles", async () => {
  const { sqlite, d1 } = seed();
  try {
    const issued = await issueAdminDomainHandoff(d1, {
      staff: staff(), appEnvironment: "staging", destinationOrigin: "https://admin.staging.juro.uz", now: NOW,
    });
    const consumed = await consumeAdminDomainHandoff(d1, {
      ticket: issued.ticket, environment: "staging", destinationOrigin: "https://admin.staging.juro.uz", now: NOW,
    });
    assert.match(consumed.token, /^[A-Za-z0-9_-]{43}$/u);
    assert.match(consumed.csrfToken, /^[A-Za-z0-9_-]{43}$/u);
    assert.deepEqual(consumed.roles, ["super_admin"]);
    const principal = await requireAdminDomainSession(d1, {
      token: consumed.token, environment: "staging", now: new Date("2026-08-07T08:01:00.000Z"),
    });
    assert.equal(principal.userId, USER_ID);
    assert.deepEqual(principal.roles, ["super_admin"]);
    await assert.rejects(
      consumeAdminDomainHandoff(d1, {
        ticket: issued.ticket, environment: "staging", destinationOrigin: "https://admin.staging.juro.uz", now: NOW,
      }),
      /TICKET_DENIED/u,
    );
    sqlite.prepare("UPDATE auth_sessions SET revoked_at=? WHERE id=?").run("2026-08-07T08:01:30.000Z", SESSION_ID);
    await assert.rejects(
      requireAdminDomainSession(d1, {
        token: consumed.token, environment: "staging", now: new Date("2026-08-07T08:01:31.000Z"),
      }),
      /SESSION_DENIED/u,
    );
    assert.equal(sqlite.prepare("SELECT count(*) AS total FROM admin_domain_audit_events WHERE action='handoff_consumed'").get()?.total, 1);
  } finally {
    sqlite.close();
  }
});

test("admin-domain logout revokes the server session before its browser cookie expires", async () => {
  const { sqlite, d1 } = seed();
  try {
    const issued = await issueAdminDomainHandoff(d1, {
      staff: staff(), appEnvironment: "staging", destinationOrigin: "https://admin.staging.juro.uz", now: NOW,
    });
    const consumed = await consumeAdminDomainHandoff(d1, {
      ticket: issued.ticket, environment: "staging", destinationOrigin: "https://admin.staging.juro.uz", now: NOW,
    });
    await revokeAdminDomainSession(d1, {
      token: consumed.token, environment: "staging", now: new Date("2026-08-07T08:01:00.000Z"),
    });
    await assert.rejects(
      requireAdminDomainSession(d1, {
        token: consumed.token, environment: "staging", now: new Date("2026-08-07T08:01:01.000Z"),
      }),
      /SESSION_DENIED/u,
    );
    assert.equal(sqlite.prepare("SELECT count(*) AS total FROM admin_domain_audit_events WHERE action='admin_session_revoked'").get()?.total, 1);
  } finally {
    sqlite.close();
  }
});

test("admin handoff route requires same-origin write protection and current MFA", async () => {
  const [route, migration, internal, adminWorker] = await Promise.all([
    readFile(new URL("../app/api/platform/admin/handoff/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0109_admin_domain_handoff_sessions.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/auth/admin-internal-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../../admin/src/worker.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /assertSafeWrite\(request\)/u);
  assert.match(route, /requirePlatformStaffRequest\(request, "staff\.console\.view"/u);
  assert.match(route, /freshMfaWithinMs: 15 \* 60 \* 1_000/u);
  assert.match(route, /ADMIN_CONSOLE_ORIGIN/u);
  assert.match(route, /referrer-policy.*no-referrer/u);
  assert.match(migration, /admin_handoff_tickets/u);
  assert.match(migration, /admin_domain_sessions/u);
  assert.match(migration, /admin_domain_audit_events_no_(?:update|delete)/u);
  assert.doesNotMatch(migration, /DROP\s+TABLE/iu);
  assert.match(internal, /x-juro-admin-internal-token/u);
  assert.match(internal, /session\/logout/u);
  assert.match(adminWorker, /PLATFORM_ADMIN_API\.fetch/u);
  assert.match(adminWorker, /juro_admin_session/u);
  assert.doesNotMatch(adminWorker, /D1Database|d1_databases/u);
});
