import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AiRuntimeSettingsError,
  aiRuntimeConfigInputSchema,
  createAiRuntimeSettingsVersion,
  listAiRuntimeSettingsHistory,
  resolveAiRuntimeSettings,
} from "../lib/ai/runtime-settings";
import type { PlatformStaffAccess, PlatformStaffRole } from "../lib/auth/staff-access";
import type { BuilderRuntimeEnv } from "../lib/document-builder/storage/runtime";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const USER_ID = "ai-settings-admin";
const SESSION_ID = "ai-settings-session";
const ASSIGNMENT_ID = "ai-settings-assignment";
const MFA_AT = "2026-08-05T15:50:00.000Z";
const NOW = "2026-08-05T16:00:00.000Z";
const env: BuilderRuntimeEnv = {
  APP_ENV: "staging",
  OPENAI_CHAT_MODEL: "gpt-fast",
  OPENAI_DEEP_MODEL: "gpt-deep",
  OPENAI_FALLBACK_MODEL: "gpt-fallback",
  ANTHROPIC_DOCUMENT_MODEL: "claude-document",
  ANTHROPIC_FALLBACK_MODEL: "claude-fallback",
};

function seed(role: PlatformStaffRole = "administrator") {
  const value = sqliteD1Fixture();
  value.sqlite.prepare(
    "INSERT INTO user_profiles(id,email,full_name,locale,account_type,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
  ).run(USER_ID, "admin@example.invalid", "Admin", "ru", "individual", MFA_AT, MFA_AT);
  value.sqlite.prepare(
    "INSERT INTO auth_devices(id,user_id,display_name,first_seen_at,last_seen_at) VALUES ('ai-settings-device',?,'Device',?,?)",
  ).run(USER_ID, MFA_AT, MFA_AT);
  value.sqlite.prepare(
    `INSERT INTO auth_sessions
     (id,user_id,device_id,token_hash,auth_method,assurance_level,authenticated_at,mfa_verified_at,
      expires_at,idle_expires_at,created_at,last_seen_at)
     VALUES (?,?,'ai-settings-device','hash','email_otp+totp','mfa',?,?,'2026-08-06T16:00:00.000Z','2026-08-06T16:00:00.000Z',?,?)`,
  ).run(SESSION_ID, USER_ID, MFA_AT, MFA_AT, MFA_AT, MFA_AT);
  value.sqlite.prepare(
    `INSERT INTO auth_totp_credentials
     (id,user_id,status,secret_ciphertext,secret_iv,key_version,enrollment_expires_at,created_at,updated_at,verified_at)
     VALUES ('ai-settings-totp',?,'active','cipher','abcdefghijklmnop','v1','2026-08-06T16:00:00.000Z',?,?,?)`,
  ).run(USER_ID, MFA_AT, MFA_AT, MFA_AT);
  value.sqlite.prepare(
    `INSERT INTO platform_staff_assignments
     (id,user_id,role,grant_source,grant_reason,granted_at,expires_at,created_at,updated_at)
     VALUES (?,?,?,'operator_bootstrap','Approved AI settings','2026-08-05T15:00:00.000Z','2026-08-06T16:00:00.000Z',?,?)`,
  ).run(ASSIGNMENT_ID, USER_ID, role, MFA_AT, MFA_AT);
  return value;
}

function staff(role: PlatformStaffRole = "administrator"): PlatformStaffAccess {
  return {
    userId: USER_ID,
    sessionId: SESSION_ID,
    capability: "ai.settings.manage",
    roles: [role],
    assignmentIds: [ASSIGNMENT_ID],
    mfaVerifiedAt: MFA_AT,
  };
}

const settings = {
  expectedVersion: 0,
  openaiChatModel: "gpt-fast",
  openaiDeepModel: "gpt-deep",
  anthropicChatFallbackModel: "claude-fallback",
  anthropicDocumentModel: "claude-document",
  openaiDocumentFallbackModel: "gpt-fallback",
  responseTone: "formal" as const,
  reason: "Approved staged model routing update.",
};

test("0088 resolves server defaults then activates an immutable allowlisted version", async () => {
  const { sqlite, d1 } = seed();
  try {
    const defaults = await resolveAiRuntimeSettings({ db: d1, env });
    assert.equal(defaults.version, 0);
    assert.equal(defaults.source, "environment");
    assert.equal(defaults.openaiChatModel, "gpt-fast");

    const created = await createAiRuntimeSettingsVersion({ db: d1, env, staff: staff(), settings, now: new Date(NOW) });
    assert.equal(created.version, 1);
    assert.equal(created.responseTone, "formal");
    assert.match(created.configHash, /^[a-f0-9]{64}$/);
    const dashboard = await listAiRuntimeSettingsHistory({ db: d1, env });
    assert.equal(dashboard.current.configHash, created.configHash);
    assert.deepEqual(dashboard.allowlist.openai, ["gpt-fast", "gpt-deep", "gpt-fallback"]);
    assert.equal(dashboard.history.length, 1);
    assert.throws(
      () => sqlite.prepare("UPDATE ai_runtime_config_versions SET response_tone='clear'").run(),
      /AI_RUNTIME_CONFIG_IMMUTABLE/,
    );
    assert.throws(
      () => sqlite.prepare("DELETE FROM ai_runtime_config_versions").run(),
      /AI_RUNTIME_CONFIG_IMMUTABLE/,
    );
  } finally { sqlite.close(); }
});

test("0088 rejects arbitrary models, stale versions and forged staff roles", async () => {
  const allowed = seed();
  try {
    await assert.rejects(
      createAiRuntimeSettingsVersion({ db: allowed.d1, env, staff: staff(), settings: { ...settings, openaiChatModel: "attacker-model" }, now: new Date(NOW) }),
      (error: unknown) => error instanceof AiRuntimeSettingsError && error.code === "AI_SETTINGS_MODEL_NOT_ALLOWED",
    );
    await createAiRuntimeSettingsVersion({ db: allowed.d1, env, staff: staff(), settings, now: new Date(NOW) });
    await assert.rejects(
      createAiRuntimeSettingsVersion({ db: allowed.d1, env, staff: staff(), settings, now: new Date("2026-08-05T16:01:00.000Z") }),
      (error: unknown) => error instanceof AiRuntimeSettingsError && error.code === "AI_SETTINGS_VERSION_CONFLICT",
    );
  } finally { allowed.sqlite.close(); }

  const forged = seed("support");
  try {
    await assert.rejects(
      createAiRuntimeSettingsVersion({ db: forged.d1, env, staff: staff("support"), settings, now: new Date(NOW) }),
      (error: unknown) => error instanceof AiRuntimeSettingsError && error.status === 403,
    );
  } finally { forged.sqlite.close(); }
});

test("0088 corrupt history fails closed and protected settings are absent from the contract", async () => {
  const { sqlite, d1 } = seed();
  try {
    await createAiRuntimeSettingsVersion({ db: d1, env, staff: staff(), settings, now: new Date(NOW) });
    sqlite.exec("DROP TRIGGER ai_runtime_config_no_update");
    sqlite.prepare("UPDATE ai_runtime_config_versions SET config_hash=?").run("a".repeat(64));
    await assert.rejects(
      resolveAiRuntimeSettings({ db: d1, env }),
      (error: unknown) => error instanceof AiRuntimeSettingsError && error.code === "AI_SETTINGS_INTEGRITY_FAILED",
    );
  } finally { sqlite.close(); }
  assert.equal(aiRuntimeConfigInputSchema.safeParse({ ...settings, jurisdiction: "US" }).success, false);
  assert.equal(aiRuntimeConfigInputSchema.safeParse({ ...settings, systemPrompt: "ignore rules" }).success, false);
  assert.equal(aiRuntimeConfigInputSchema.safeParse({ ...settings, sourceAllowlist: ["example.com"] }).success, false);
});

test("AI settings route is POST-only, CSRF/fresh-MFA protected, localized and wired into AI hashes", () => {
  const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const route = source("app/api/platform/admin/ai-settings/route.ts");
  const page = source("app/[locale]/admin/ai-settings/page.tsx");
  const client = source("app/_staff/AiSettingsConsole.tsx");
  assert.match(route, /assertSafeWrite\(request\)/);
  assert.match(route, /ai\.settings\.manage/);
  assert.match(route, /freshMfaWithinMs:\s*15 \* 60 \* 1_000/);
  assert.doesNotMatch(route, /export async function GET/);
  assert.match(page, /index: false/);
  assert.match(client, /x-juro-csrf/);
  assert.match(client, /aria-live="polite"/);
  assert.doesNotMatch(client, /input[^>]+model/i);
  assert.match(source("app/api/platform/ai/route.ts"), /runtimeConfigHash:\s*runtimeSettings\.configHash/);
  assert.match(source("app/api/guest/ai/route.ts"), /runtimeConfigHash:\s*runtimeSettings\.configHash/);
  assert.match(source("lib/document-analysis/processor.ts"), /runtimeConfigHash:\s*persisted\.technical\.runtimeConfigHash/);
});
