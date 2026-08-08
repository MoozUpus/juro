import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const migration = readFileSync(
  new URL("../drizzle/0098_task_reminder_email_delivery.sql", import.meta.url),
  "utf8",
);
const journal = JSON.parse(
  readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
) as { entries: Array<{ idx: number; version: string; when: number; tag: string; breakpoints: boolean }> };
const now = "2026-08-06T00:00:00.000Z";
const reminderAt = "2026-08-06T00:01:00.000Z";
const jobId = "task-reminder-email:reminder-email-a:ms";

test("migration 0098 is additive, content-free and journaled", () => {
  const entry = journal.entries.find((item) => item.tag === "0098_task_reminder_email_delivery");
  assert.deepEqual(entry, {
    idx: 98,
    version: "6",
    when: entry?.when,
    tag: "0098_task_reminder_email_delivery",
    breakpoints: true,
  });
  assert.match(migration, /CREATE TABLE `task_reminder_email_jobs`/u);
  assert.match(migration, /task_reminder_email_jobs_insert_guard/u);
  assert.match(migration, /task_reminder_email_jobs_transition_guard/u);
  assert.doesNotMatch(migration, /`(?:email|recipient|task_title|case_title|body|html)`/u);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM|UPDATE `task_reminders`/u);
});

test("0098 enforces tenant-bound immutable email delivery evidence", () => {
  const { sqlite } = sqliteD1Fixture();
  try {
    seed(sqlite);
    sqlite.prepare(
      `INSERT INTO task_reminder_email_jobs
       (id,reminder_id,workspace_id,user_id,reminder_updated_at,status,attempt_count,
        provider_message_id,error_code,sent_at,created_at,updated_at)
       VALUES (?,?,?,?,?,'pending',0,NULL,NULL,NULL,?,?)`,
    ).run(jobId, "reminder-email-a", "workspace-a", "user-a", now, now, now);

    assert.throws(
      () => sqlite.prepare("UPDATE task_reminder_email_jobs SET workspace_id='workspace-b' WHERE id=?").run(jobId),
      /TASK_REMINDER_EMAIL_(?:IDENTITY_IMMUTABLE|TRANSITION_INVALID)/u,
    );
    assert.throws(
      () => sqlite.prepare(
        `INSERT INTO task_reminder_email_jobs
         (id,reminder_id,workspace_id,user_id,reminder_updated_at,status,attempt_count,created_at,updated_at)
         VALUES ('task-reminder-email:cross-tenant:ms','reminder-email-a','workspace-b','user-b',?,'pending',0,?,?)`,
      ).run(now, now, now),
      /TASK_REMINDER_EMAIL_SOURCE_INVALID/u,
    );

    sqlite.prepare(
      "UPDATE task_reminder_email_jobs SET status='sending',attempt_count=1,updated_at=? WHERE id=?",
    ).run(now, jobId);
    sqlite.prepare(
      `UPDATE task_reminder_email_jobs
       SET status='sent',provider_message_id='resend_message_a',sent_at=?,updated_at=?
       WHERE id=?`,
    ).run(now, now, jobId);
    assert.deepEqual(
      { ...(sqlite.prepare(
        "SELECT status,attempt_count AS attempts,provider_message_id AS providerMessageId FROM task_reminder_email_jobs WHERE id=?",
      ).get(jobId) as object) },
      { status: "sent", attempts: 1, providerMessageId: "resend_message_a" },
    );
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    sqlite.close();
  }
});

function seed(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"]): void {
  sqlite.prepare("INSERT INTO user_profiles(id,email,created_at,updated_at) VALUES ('user-a','a@example.invalid',?,?)").run(now, now);
  sqlite.prepare("INSERT INTO user_profiles(id,email,created_at,updated_at) VALUES ('user-b','b@example.invalid',?,?)").run(now, now);
  sqlite.prepare("INSERT INTO workspaces(id,type,name,created_at,updated_at) VALUES ('workspace-a','individual','A',?,?)").run(now, now);
  sqlite.prepare("INSERT INTO workspaces(id,type,name,created_at,updated_at) VALUES ('workspace-b','individual','B',?,?)").run(now, now);
  sqlite.prepare("INSERT INTO workspace_members(id,workspace_id,user_id,role,status,joined_at,created_at,updated_at) VALUES ('member-a','workspace-a','user-a','owner','active',?,?,?)").run(now, now, now);
  sqlite.prepare("INSERT INTO workspace_members(id,workspace_id,user_id,role,status,joined_at,created_at,updated_at) VALUES ('member-b','workspace-b','user-b','owner','active',?,?,?)").run(now, now, now);
  sqlite.prepare(`INSERT INTO cases
    (id,workspace_id,owner_user_id,account_type,locale,title,legal_area,status,current_revision,created_at,updated_at)
    VALUES ('case-a','workspace-a','user-a','individual','ru','Case A','contracts','open',1,?,?)`).run(now, now);
  sqlite.prepare(`INSERT INTO tasks
    (id,workspace_id,case_id,owner_user_id,title,due_at,status,created_at,updated_at)
    VALUES ('task-a','workspace-a','case-a','user-a','Task A','2026-08-07T00:00:00.000Z','planned',?,?)`).run(now, now);
  sqlite.prepare(`INSERT INTO task_reminders
    (id,task_id,channel,reminder_at,status,idempotency_key,sent_at,created_at,updated_at)
    VALUES ('reminder-email-a','task-a','email',?,'pending','task-a:email:initial',NULL,?,?)`).run(reminderAt, now, now);
}
