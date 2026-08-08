import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  platformAuditRequestSchema,
  platformAuditRowsCsv,
  PlatformAuditError,
  queryPlatformAuditLog,
  verifyPlatformAuditAccessHistory,
} from "../lib/operations/platform-audit-log";
import type { PlatformStaffAccess } from "../lib/auth/staff-access";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const USER_ID = "audit-admin";
const SESSION_ID = "audit-session";
const ASSIGNMENT_ID = "audit-assignment";
const NOW = "2026-08-05T13:00:00.000Z";
const MFA_AT = "2026-08-05T12:55:00.000Z";

function seed(role: "administrator" | "support" = "administrator") {
  const value = sqliteD1Fixture();
  value.sqlite.prepare(
    "INSERT INTO user_profiles(id,email,full_name,locale,account_type,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
  ).run(USER_ID, "audit@example.test", "Audit Admin", "ru", "individual", MFA_AT, MFA_AT);
  value.sqlite.prepare(
    "INSERT INTO auth_devices(id,user_id,display_name,first_seen_at,last_seen_at) VALUES ('audit-device',?,'Audit device',?,?)",
  ).run(USER_ID, MFA_AT, MFA_AT);
  value.sqlite.prepare(
    `INSERT INTO auth_sessions
     (id,user_id,device_id,token_hash,auth_method,assurance_level,authenticated_at,
      mfa_verified_at,expires_at,idle_expires_at,created_at,last_seen_at)
     VALUES (?,?,'audit-device','audit-session-hash','email_otp+totp','mfa',?,?,
      '2026-08-06T13:00:00.000Z','2026-08-06T13:00:00.000Z',?,?)`,
  ).run(SESSION_ID, USER_ID, MFA_AT, MFA_AT, MFA_AT, MFA_AT);
  value.sqlite.prepare(
    `INSERT INTO auth_totp_credentials
     (id,user_id,status,secret_ciphertext,secret_iv,key_version,enrollment_expires_at,
      created_at,updated_at,verified_at)
     VALUES ('audit-totp',?,'active','ciphertext','abcdefghijklmnop','v1',
      '2026-08-06T13:00:00.000Z',?,?,?)`,
  ).run(USER_ID, MFA_AT, MFA_AT, MFA_AT);
  value.sqlite.prepare(
    `INSERT INTO platform_staff_assignments
     (id,user_id,role,grant_source,grant_reason,granted_at,expires_at,
      created_at,updated_at)
     VALUES (?,?,?,'operator_bootstrap','Approved audit access',
      '2026-08-05T12:00:00.000Z','2026-08-06T13:00:00.000Z',?,?)`,
  ).run(ASSIGNMENT_ID, USER_ID, role, MFA_AT, MFA_AT);
  value.sqlite.prepare(
    "INSERT INTO workspaces(id,type,name,created_at,updated_at) VALUES ('audit-workspace','individual','Audit',?,?)",
  ).run(MFA_AT, MFA_AT);
  value.sqlite.prepare(
    `INSERT INTO workspace_audit_events
     (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,ip_hash,created_at)
     VALUES ('workspace-event','audit-workspace',?,'document','doc-safe','document_viewed',
      '{"secret":"never-return-this"}','private-ip-hash','2026-08-05T12:58:00.000Z')`,
  ).run(USER_ID);
  value.sqlite.prepare(
    `INSERT INTO ai_cost_control_events
     (id,environment,provider,transition,reason,observed_value,threshold_value,actor_user_id,created_at)
     VALUES ('cost-event','staging','openai','opened','manual',NULL,NULL,?,'2026-08-05T12:59:00.000Z')`,
  ).run(USER_ID);
  return value;
}

function staff(role: "administrator" | "support" = "administrator"): PlatformStaffAccess {
  return {
    userId: USER_ID,
    sessionId: SESSION_ID,
    capability: "staff.security.audit",
    roles: [role],
    assignmentIds: [ASSIGNMENT_ID],
    mfaVerifiedAt: MFA_AT,
  };
}

test("0086 returns metadata-free audit projections and records every query/export", async () => {
  const { sqlite, d1 } = seed();
  try {
    const first = await queryPlatformAuditLog({
      db: d1,
      staff: staff(),
      now: new Date(NOW),
      value: { action: "query", filters: { limit: 50 } },
    });
    assert.deepEqual(first.rows.map((row) => row.source), ["operations", "workspace"]);
    assert.equal(first.rows[0].severity, "critical");
    assert.equal(first.accessIntegrity.checked, 1);
    assert.doesNotMatch(JSON.stringify(first), /never-return-this|private-ip-hash|metadataJson|eventHash|previousHash/i);

    const second = await queryPlatformAuditLog({
      db: d1,
      staff: staff(),
      now: new Date("2026-08-05T13:01:00.000Z"),
      value: { action: "export", filters: { source: "workspace", limit: 10 } },
    });
    assert.equal(second.rows.length, 1);
    assert.equal(second.accessIntegrity.checked, 2);
    assert.deepEqual(await verifyPlatformAuditAccessHistory(d1, USER_ID), { valid: true, checked: 2 });
    const evidence = sqlite.prepare(
      "SELECT request_action AS action,event_hash AS eventHash,previous_hash AS previousHash FROM platform_audit_access_events ORDER BY created_at",
    ).all() as Array<{ action: string; eventHash: string; previousHash: string }>;
    assert.deepEqual(evidence.map((event) => event.action), ["query", "export"]);
    assert.match(evidence[0].eventHash, /^[A-F0-9]{64}$/);
    assert.equal(evidence[1].previousHash, evidence[0].eventHash);
    assert.throws(
      () => sqlite.prepare("UPDATE platform_audit_access_events SET result_count=0 WHERE id=?").run(first.accessEventId),
      /PLATFORM_AUDIT_ACCESS_IMMUTABLE/,
    );
    assert.throws(
      () => sqlite.prepare("DELETE FROM platform_audit_access_events WHERE id=?").run(first.accessEventId),
      /PLATFORM_AUDIT_ACCESS_IMMUTABLE/,
    );
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { sqlite.close(); }
});

test("0086 D1 guard rejects a forged non-administrator assignment", async () => {
  const { sqlite, d1 } = seed("support");
  try {
    await assert.rejects(
      queryPlatformAuditLog({
        db: d1,
        staff: staff("support"),
        now: new Date(NOW),
        value: { action: "query", filters: { limit: 10 } },
      }),
      (error: unknown) => error instanceof PlatformAuditError
        && error.code === "PLATFORM_AUDIT_ACCESS_WRITE_FAILED",
    );
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM platform_audit_access_events").get() as { count: number }).count, 0);
  } finally { sqlite.close(); }
});

test("0086 detects tampering and refuses to extend corrupted evidence", async () => {
  const { sqlite, d1 } = seed();
  try {
    const created = await queryPlatformAuditLog({
      db: d1,
      staff: staff(),
      now: new Date(NOW),
      value: { action: "query", filters: { limit: 10 } },
    });
    sqlite.exec("DROP TRIGGER platform_audit_access_no_update");
    sqlite.prepare("UPDATE platform_audit_access_events SET result_count=0 WHERE id=?").run(created.accessEventId);
    assert.deepEqual(await verifyPlatformAuditAccessHistory(d1, USER_ID), { valid: false, checked: 1 });
    await assert.rejects(
      queryPlatformAuditLog({
        db: d1,
        staff: staff(),
        now: new Date("2026-08-05T13:01:00.000Z"),
        value: { action: "query", filters: { limit: 10 } },
      }),
      (error: unknown) => error instanceof PlatformAuditError
        && error.code === "PLATFORM_AUDIT_ACCESS_INTEGRITY_FAILED",
    );
  } finally { sqlite.close(); }
});

test("audit filters are strict and CSV neutralizes spreadsheet formulas", () => {
  assert.equal(platformAuditRequestSchema.safeParse({ action: "query", filters: { action: "*" } }).success, false);
  assert.equal(platformAuditRequestSchema.safeParse({
    action: "query",
    filters: { from: "2026-08-06T00:00:00.000Z", to: "2026-08-05T00:00:00.000Z" },
  }).success, false);
  const csv = platformAuditRowsCsv([{
    id: "=CMD()", source: "workspace", actorUserId: null, scopeId: "scope",
    entityType: "document", entityId: null, action: "document_viewed",
    severity: "info", createdAt: NOW,
  }]);
  assert.match(csv, /"'=CMD\(\)"/);
});

test("audit-log route is POST-only, CSRF/fresh-MFA protected and UI is metadata-safe", () => {
  const route = readFileSync(new URL("../app/api/platform/admin/audit-log/route.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/[locale]/admin/audit-log/page.tsx", import.meta.url), "utf8");
  const client = readFileSync(new URL("../app/_staff/AuditLogConsole.tsx", import.meta.url), "utf8");
  assert.match(route, /assertSafeWrite\(request\)/);
  assert.match(route, /staff\.security\.audit/);
  assert.match(route, /freshMfaWithinMs:\s*15 \* 60 \* 1_000/);
  assert.doesNotMatch(route, /export async function GET/);
  assert.match(page, /index: false/);
  assert.match(page, /staff\.security\.audit/);
  assert.match(client, /x-juro-csrf/);
  assert.match(client, /aria-live="polite"/);
  assert.match(client, /staff-skip/);
  assert.doesNotMatch(client, /dangerouslySetInnerHTML|metadataJson|ipHash|provider_message|message_ru/);
});
