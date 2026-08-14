import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  aiQualityReviewRequestSchema,
  AiQualityReviewError,
  executeAiQualityReview,
  verifyAiQualityReviewHistory,
} from "../lib/ai/quality-review";
import type { PlatformStaffAccess, PlatformStaffRole } from "../lib/auth/staff-access";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const REVIEWER_ID = "quality-reviewer";
const SESSION_ID = "quality-session";
const ASSIGNMENT_ID = "quality-assignment";
const USER_ID = "quality-user";
const WORKSPACE_ID = "quality-workspace";
const CONVERSATION_ID = "quality-conversation";
const QUESTION_ID = "0fd5c28e-a74c-4655-944c-042f4080995e";
const ANSWER_ID = "91de4866-52a8-407d-bfa0-8ef9f640ecf3";
const FEEDBACK_ID = "540959b0-1c15-4d69-8918-40bf24829769";
const RUN_ID = "quality-run";
const MFA_AT = "2026-08-05T13:50:00.000Z";
const NOW = "2026-08-05T14:00:00.000Z";
const QUESTION = "Можно ли расторгнуть договор?";
const ANSWER = "Да, без проверки условий договора.";
const COMMENT = "Ответ не учитывает статью договора.";

function source(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function seed(role: PlatformStaffRole = "legal_reviewer") {
  const value = sqliteD1Fixture();
  value.sqlite.prepare(
    "INSERT INTO workspaces(id,type,name,full_name,short_name,locale,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
  ).run(WORKSPACE_ID, "individual", "Quality", null, null, "ru", MFA_AT, MFA_AT);
  value.sqlite.prepare(
    "INSERT INTO user_profiles(id,email,full_name,locale,account_type,default_workspace_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
  ).run(USER_ID, "quality-user@example.invalid", "Quality User", "ru", "individual", WORKSPACE_ID, MFA_AT, MFA_AT);
  value.sqlite.prepare(
    "INSERT INTO user_profiles(id,email,full_name,locale,account_type,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
  ).run(REVIEWER_ID, "reviewer@example.invalid", "Legal Reviewer", "ru", "individual", MFA_AT, MFA_AT);
  value.sqlite.prepare(
    "INSERT INTO auth_devices(id,user_id,display_name,first_seen_at,last_seen_at) VALUES ('quality-device',?,'Quality device',?,?)",
  ).run(REVIEWER_ID, MFA_AT, MFA_AT);
  value.sqlite.prepare(
    `INSERT INTO auth_sessions
     (id,user_id,device_id,token_hash,auth_method,assurance_level,authenticated_at,
      mfa_verified_at,expires_at,idle_expires_at,created_at,last_seen_at)
     VALUES (?,?,'quality-device','quality-session-hash','email_otp+totp','mfa',?,?,'2026-08-06T14:00:00.000Z','2026-08-06T14:00:00.000Z',?,?)`,
  ).run(SESSION_ID, REVIEWER_ID, MFA_AT, MFA_AT, MFA_AT, MFA_AT);
  value.sqlite.prepare(
    `INSERT INTO auth_totp_credentials
     (id,user_id,status,secret_ciphertext,secret_iv,key_version,enrollment_expires_at,
      created_at,updated_at,verified_at)
     VALUES ('quality-totp',?,'active','ciphertext','abcdefghijklmnop','v1','2026-08-06T14:00:00.000Z',?,?,?)`,
  ).run(REVIEWER_ID, MFA_AT, MFA_AT, MFA_AT);
  value.sqlite.prepare(
    `INSERT INTO platform_staff_assignments
     (id,user_id,role,grant_source,grant_reason,granted_at,expires_at,created_at,updated_at)
     VALUES (?,?,?,'operator_bootstrap','Approved quality review','2026-08-05T13:00:00.000Z','2026-08-06T14:00:00.000Z',?,?)`,
  ).run(ASSIGNMENT_ID, REVIEWER_ID, role, MFA_AT, MFA_AT);
  value.sqlite.prepare(
    "INSERT INTO conversations(id,workspace_id,owner_user_id,case_id,title,locale,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
  ).run(CONVERSATION_ID, WORKSPACE_ID, USER_ID, null, "Contract", "ru", "active", MFA_AT, MFA_AT);
  value.sqlite.prepare(
    "INSERT INTO conversation_messages(id,conversation_id,author_type,content,structured_json,created_at) VALUES (?,?,?,?,?,?)",
  ).run(QUESTION_ID, CONVERSATION_ID, "user", QUESTION, null, MFA_AT);
  value.sqlite.prepare(
    "INSERT INTO conversation_messages(id,conversation_id,author_type,content,structured_json,created_at) VALUES (?,?,?,?,?,?)",
  ).run(ANSWER_ID, CONVERSATION_ID, "assistant", ANSWER, '{"urgency":"normal"}', MFA_AT);
  value.sqlite.prepare(
    `INSERT INTO ai_runs
     (id,workspace_id,user_id,conversation_id,request_message_id,response_message_id,idempotency_key,
      correlation_id,provider,model,answer_mode,reasoning_mode,status,legal_database_as_of,
      instruction_hash,source_version_hash,started_at,completed_at,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(RUN_ID, WORKSPACE_ID, USER_ID, CONVERSATION_ID, QUESTION_ID, ANSWER_ID, "quality-key", "quality-correlation", "openai", "gpt-quality", "detailed", "deep", "completed", MFA_AT, "instruction-hash", "source-hash", MFA_AT, MFA_AT, MFA_AT, MFA_AT);
  value.sqlite.prepare(
    `INSERT INTO ai_feedback
     (id,workspace_id,user_id,conversation_id,assistant_message_id,ai_run_id,feedback_type,comment,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(FEEDBACK_ID, WORKSPACE_ID, USER_ID, CONVERSATION_ID, ANSWER_ID, RUN_ID, "wrong_norm", COMMENT, MFA_AT, MFA_AT);
  return value;
}

function staff(role: PlatformStaffRole = "legal_reviewer"): PlatformStaffAccess {
  return {
    userId: REVIEWER_ID,
    sessionId: SESSION_ID,
    capability: "ai.quality.review",
    roles: [role],
    assignmentIds: [ASSIGNMENT_ID],
    mfaVerifiedAt: MFA_AT,
  };
}

test("0087 keeps the queue metadata-only and separately audits full-content view", async () => {
  const { sqlite, d1 } = seed();
  try {
    const eventTable = sqlite.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='ai_quality_review_events'",
    ).get() as { sql: string };
    assert.doesNotMatch(eventTable.sql, /replace\(hex\(zeroblob\(32\)\)/);
    assert.match(eventTable.sql, /NOT GLOB '\*\[\^A-F0-9\]\*'/);
    const queue = await executeAiQualityReview({
      db: d1, staff: staff(), now: new Date(NOW),
      request: { action: "query", filters: { reviewStatus: "pending", limit: 100 } },
    });
    assert.equal(queue.action, "query");
    assert.equal(queue.rows.length, 1);
    assert.equal(queue.rows[0].commentPresent, true);
    assert.equal(queue.rows[0].latestReviewVersion, null);
    assert.doesNotMatch(JSON.stringify(queue), new RegExp(`${QUESTION}|${ANSWER}|${COMMENT}`));

    const viewed = await executeAiQualityReview({
      db: d1, staff: staff(), now: new Date("2026-08-05T14:01:00.000Z"),
      request: { action: "view", feedbackId: FEEDBACK_ID },
    });
    assert.equal(viewed.action, "view");
    assert.equal(viewed.detail.question, QUESTION);
    assert.equal(viewed.detail.answer, ANSWER);
    assert.equal(viewed.detail.feedbackComment, COMMENT);
    assert.deepEqual(viewed.detail.structuredOutput, { urgency: "normal" });
    assert.deepEqual(await verifyAiQualityReviewHistory(d1, REVIEWER_ID), { valid: true, checked: 2 });
    assert.deepEqual(
      (sqlite.prepare("SELECT request_action AS action FROM ai_quality_review_events ORDER BY created_at").all() as Array<{ action: string }>).map((row) => row.action),
      ["query", "view"],
    );
  } finally { sqlite.close(); }
});

test("0087 versions immutable legal decisions, detects stale feedback and retains metadata after deletion", async () => {
  const { sqlite, d1 } = seed();
  try {
    const first = await executeAiQualityReview({
      db: d1, staff: staff(), now: new Date(NOW),
      request: { action: "resolve", feedbackId: FEEDBACK_ID, classification: "incorrect", notes: "Вывод не подтверждён.", correctedAnswer: "Нужно проверить договор и применимую норму.", goldenAnswer: "Сначала изучите условие о расторжении и действующую норму." },
    });
    assert.equal(first.action, "resolve");
    assert.equal(first.reviewVersion, 1);
    const second = await executeAiQualityReview({
      db: d1, staff: staff(), now: new Date("2026-08-05T14:01:00.000Z"),
      request: { action: "resolve", feedbackId: FEEDBACK_ID, classification: "partially_incorrect", notes: "Повторная проверка источника.", correctedAnswer: null, goldenAnswer: null },
    });
    assert.equal(second.reviewVersion, 2);
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM ai_quality_review_contents").get() as { count: number }).count, 2);
    assert.throws(
      () => sqlite.prepare("UPDATE ai_quality_review_contents SET reviewer_notes='changed' WHERE feedback_id=?").run(FEEDBACK_ID),
      /AI_QUALITY_REVIEW_CONTENT_IMMUTABLE/,
    );
    assert.throws(
      () => sqlite.prepare("UPDATE ai_quality_review_events SET classification='correct' WHERE feedback_id=?").run(FEEDBACK_ID),
      /AI_QUALITY_REVIEW_EVENT_IMMUTABLE/,
    );

    sqlite.prepare("UPDATE ai_feedback SET comment=?,updated_at=? WHERE id=?")
      .run("Новый комментарий", "2026-08-05T14:02:00.000Z", FEEDBACK_ID);
    const queue = await executeAiQualityReview({
      db: d1, staff: staff(), now: new Date("2026-08-05T14:03:00.000Z"),
      request: { action: "query", filters: { reviewStatus: "pending", limit: 100 } },
    });
    if (queue.action !== "query") throw new Error("Expected query result");
    assert.equal(queue.rows[0].stale, true);
    const third = await executeAiQualityReview({
      db: d1, staff: staff(), now: new Date("2026-08-05T14:04:00.000Z"),
      request: { action: "resolve", feedbackId: FEEDBACK_ID, classification: "broken_citation", notes: "Проверена обновлённая жалоба.", correctedAnswer: null, goldenAnswer: null },
    });
    assert.equal(third.reviewVersion, 3);
    assert.deepEqual(await verifyAiQualityReviewHistory(d1, REVIEWER_ID), { valid: true, checked: 4 });

    sqlite.prepare("DELETE FROM ai_feedback WHERE id=?").run(FEEDBACK_ID);
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM ai_quality_review_contents").get() as { count: number }).count, 0);
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM ai_quality_review_events").get() as { count: number }).count, 4);
    assert.deepEqual(await verifyAiQualityReviewHistory(d1, REVIEWER_ID), { valid: true, checked: 4 });
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { sqlite.close(); }
});

test("0087 D1 guards reject forged roles and corrupted history fails closed", async () => {
  const forged = seed("support");
  try {
    await assert.rejects(
      executeAiQualityReview({ db: forged.d1, staff: staff("support"), now: new Date(NOW), request: { action: "query", filters: { reviewStatus: "pending", limit: 10 } } }),
      (error: unknown) => error instanceof AiQualityReviewError && error.code === "AI_QUALITY_REVIEW_ACCESS_DENIED",
    );
    assert.equal((forged.sqlite.prepare("SELECT count(*) AS count FROM ai_quality_review_events").get() as { count: number }).count, 0);
  } finally { forged.sqlite.close(); }

  const corrupted = seed();
  try {
    await executeAiQualityReview({ db: corrupted.d1, staff: staff(), now: new Date(NOW), request: { action: "query", filters: { reviewStatus: "pending", limit: 10 } } });
    corrupted.sqlite.exec("DROP TRIGGER ai_quality_review_events_no_update");
    corrupted.sqlite.prepare("UPDATE ai_quality_review_events SET result_count=0").run();
    assert.deepEqual(await verifyAiQualityReviewHistory(corrupted.d1, REVIEWER_ID), { valid: false, checked: 1 });
    await assert.rejects(
      executeAiQualityReview({ db: corrupted.d1, staff: staff(), now: new Date("2026-08-05T14:01:00.000Z"), request: { action: "query", filters: { reviewStatus: "pending", limit: 10 } } }),
      (error: unknown) => error instanceof AiQualityReviewError && error.code === "AI_QUALITY_REVIEW_ACCESS_INTEGRITY_FAILED",
    );
  } finally { corrupted.sqlite.close(); }
});

test("AI quality request and route boundaries are strict, POST-only and fresh-MFA protected", () => {
  assert.equal(aiQualityReviewRequestSchema.safeParse({ action: "query", filters: { reviewStatus: "pending", limit: 201 } }).success, false);
  assert.equal(aiQualityReviewRequestSchema.safeParse({ action: "resolve", feedbackId: FEEDBACK_ID, classification: "invented", notes: "x" }).success, false);
  assert.equal(aiQualityReviewRequestSchema.safeParse({ action: "resolve", feedbackId: FEEDBACK_ID, classification: "correct", notes: "" }).success, false);
  const route = source("app/api/platform/admin/ai-quality/route.ts");
  const page = source("app/[locale]/admin/ai-quality/page.tsx");
  const client = source("app/_staff/AiQualityConsole.tsx");
  const styles = source("app/_staff/legal-source-reviews.css");
  assert.match(route, /assertSafeWrite\(request\)/);
  assert.match(route, /ai\.quality\.review/);
  assert.match(route, /freshMfaWithinMs:\s*15 \* 60 \* 1_000/);
  assert.match(route, /private, no-store/);
  assert.doesNotMatch(route, /export async function GET/);
  assert.match(page, /index: false/);
  assert.match(page, /ai\.quality\.review/);
  assert.match(client, /x-juro-csrf/);
  assert.match(client, /aria-live="polite"/);
  assert.match(client, /staff-skip/);
  assert.match(client, /AI_QUALITY_REVIEW_ACCESS_DENIED/);
  assert.match(client, /AI_QUALITY_REVIEW_ACCESS_WRITE_FAILED/);
  assert.match(styles, /\.staff-console,\.staff-console \*,/);
  assert.doesNotMatch(client, /dangerouslySetInnerHTML/);
});
