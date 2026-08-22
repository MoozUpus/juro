import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const seed = readFileSync(
  new URL("../scripts/investor-demo-seed.sql", import.meta.url),
  "utf8",
);

function count(
  sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"],
  sql: string,
) {
  return Number((sqlite.prepare(sql).get() as { count: number }).count);
}

test("investor seed is explicit, synthetic and cannot mint authentication state", () => {
  assert.match(seed, /Every person, matter, document, conversation and payment below is synthetic/);
  assert.match(seed, /investor-client@juro\.uz/);
  assert.match(seed, /investor-lawyer@juro\.uz/);
  assert.match(seed, /investor-admin@juro\.uz/);
  assert.doesNotMatch(seed, /INSERT(?:\s+OR\s+IGNORE)?\s+INTO\s+`?auth_(?:sessions|otp|devices|totp)/i);
  assert.doesNotMatch(seed, /INSERT(?:\s+OR\s+IGNORE)?\s+INTO\s+`?legislation_updates/i);
  assert.doesNotMatch(seed, /INSERT(?:\s+OR\s+IGNORE)?\s+INTO\s+`?document_files/i);
  assert.match(seed, /'demo',1/);
  assert.match(seed, /"containsRealPersonalData":false/);
  assert.match(seed, /"containsFakeLegalSources":false/);
});

test("investor dataset executes twice without duplication and passes relational checks", () => {
  const { sqlite } = sqliteD1Fixture();
  try {
    sqlite.exec(seed);
    sqlite.exec(seed);

    assert.equal(count(sqlite, "SELECT count(*) AS count FROM investor_demo_accounts WHERE status='active'"), 3);
    assert.equal(count(sqlite, "SELECT count(*) AS count FROM investor_demo_dataset_events WHERE event_type='seeded'"), 1);
    assert.equal(count(sqlite, "SELECT count(*) AS count FROM user_profiles WHERE email LIKE 'investor-%@juro.uz'"), 3);
    assert.equal(count(sqlite, "SELECT count(*) AS count FROM lawyer_profiles WHERE publication_consent_at IS NOT NULL"), 1);
    assert.equal(count(sqlite, "SELECT count(*) AS count FROM lawyer_trials WHERE status='active'"), 1);
    assert.equal(count(sqlite, "SELECT count(*) AS count FROM lawyer_requests WHERE status='accepted'"), 1);
    assert.equal(count(sqlite, "SELECT count(*) AS count FROM lawyer_consultations WHERE status='confirmed' AND format='video'"), 1);
    assert.equal(count(sqlite, "SELECT count(*) AS count FROM lawyer_time_entries WHERE source='manual' AND status='completed' AND billable=1"), 1);
    assert.equal(count(sqlite, "SELECT count(*) AS count FROM lawyer_knowledge_items WHERE archived_at IS NULL"), 2);
    assert.equal(count(sqlite, "SELECT count(*) AS count FROM documents WHERE template_code='1301001' AND template_version='0.1.0' AND participant_mode='configurable'"), 2);
    assert.equal(count(sqlite, "SELECT count(*) AS count FROM document_answers WHERE document_id IN ('51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000002')"), 2);
    assert.equal(count(sqlite, "SELECT count(*) AS count FROM document_current_content WHERE manually_edited=1 AND final_content LIKE 'SYNTHETIC DEMO%'"), 2);
    assert.equal(count(sqlite, "SELECT count(*) AS count FROM document_answers WHERE json_extract(answers_json, '$.\"representative.enabled\"')='no' AND json_extract(answers_json, '$.\"confirmation.accepted\"')=1"), 2);
    assert.equal(count(sqlite, "SELECT count(*) AS count FROM document_current_content WHERE instr(final_content,char(10))>0 AND instr(final_content,char(92)||'n')=0"), 2);
    assert.equal(count(sqlite, "SELECT count(*) AS count FROM demo_payment_runs WHERE provider='demo' AND is_simulation=1"), 3);
    assert.equal(count(sqlite, "SELECT count(*) AS count FROM notifications WHERE target_type IS NOT NULL AND target_id IS NOT NULL"), 3);
    assert.equal(count(sqlite, "SELECT count(*) AS count FROM billing_case_transfer_fee_rules WHERE fee_basis_points IN (200,500)"), 2);
    assert.equal(count(sqlite, "SELECT count(*) AS count FROM platform_staff_assignments WHERE role='administrator' AND revoked_at IS NULL"), 1);
    assert.equal(count(sqlite, "SELECT count(*) AS count FROM auth_sessions"), 0);
    assert.equal(count(sqlite, "SELECT count(*) AS count FROM auth_otp_challenges"), 0);
    assert.equal(count(sqlite, "SELECT count(*) AS count FROM legislation_updates"), 0);
    assert.equal(count(sqlite, "SELECT count(*) AS count FROM document_files"), 0);
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    sqlite.close();
  }
});

test("the workspace shell keeps the synthetic disclosure visible", () => {
  const layout = readFileSync(new URL("../app/_platform/WorkspaceShellLayout.tsx", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../app/_platform/PlatformShell.tsx", import.meta.url), "utf8");
  const notifications = readFileSync(new URL("../app/_document-builder/notifications/NotificationsClient.tsx", import.meta.url), "utf8");
  const notificationsRoute = readFileSync(new URL("../app/api/document-builder/notifications/route.ts", import.meta.url), "utf8");
  assert.match(layout, /FROM investor_demo_accounts/);
  assert.match(shell, /Investor Demo/);
  assert.match(shell, /синтетические данные/);
  assert.match(notifications, /notificationHref/);
  assert.match(notifications, /admin_lawyer_profile_deletion/);
  assert.match(notifications, /consultationId=/);
  assert.match(notificationsRoute, /FROM investor_demo_accounts demo/);
  assert.match(notificationsRoute, /target_type IS NOT NULL AND target_id IS NOT NULL/);
  assert.match(notificationsRoute, /UPDATE notifications SET read_at/);
});
