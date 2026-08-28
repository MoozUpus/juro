import assert from "node:assert/strict";
import test from "node:test";

import {
  executeMonitoringEmail,
  monitoringEmailJobId,
  MonitoringEmailError,
} from "../lib/notifications/monitoring-email";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const USER_ID = "monitoring-email-user";
const WORKSPACE_ID = "monitoring-email-workspace";
const PREFERENCE_ID = "monitoring-email-preference";
const NOTIFICATION_ID = `lex_monitor_${"a".repeat(64)}`;
const CURSOR_FROM = "2026-08-20T11:00:00.000Z";
const CURSOR_THROUGH = "2026-08-20T12:04:00.000Z";

function fixture(locale: "ru" | "uz" = "ru") {
  const value = sqliteD1Fixture();
  const now = "2026-08-20T12:05:00.000Z";
  value.sqlite.prepare(
    `INSERT INTO user_profiles (id,email,locale,created_at,updated_at)
     VALUES (?,?,?,?,?)`,
  ).run(USER_ID, "recipient@example.test", locale, now, now);
  value.sqlite.prepare(
    `INSERT INTO workspaces (id,type,name,locale,created_at,updated_at)
     VALUES (?,'individual','Monitoring email',?,?,?)`,
  ).run(WORKSPACE_ID, locale, now, now);
  value.sqlite.prepare(
    `INSERT INTO workspace_members
      (id,workspace_id,user_id,role,status,joined_at,created_at,updated_at)
     VALUES ('monitoring-email-member',?,?,'owner','active',?,?,?)`,
  ).run(WORKSPACE_ID, USER_ID, now, now, now);
  value.sqlite.prepare(
    `INSERT INTO monitoring_preferences
      (id,workspace_id,user_id,audience,topics_json,channels_json,frequency,locale,
       document_impact_consent,last_delivered_at,created_at,updated_at)
     VALUES (?,?,?,'individual','["civil"]','["in_app","email"]','daily',?,0,?,?,?)`,
  ).run(PREFERENCE_ID, WORKSPACE_ID, USER_ID, locale, CURSOR_FROM, now, now);
  value.sqlite.prepare(
    `INSERT INTO notifications
      (id,workspace_id,user_id,document_id,type,title,body,read_at,created_at)
     VALUES (?,?,?,NULL,'legislation_monitor',?,?,NULL,?)`,
  ).run(
    NOTIFICATION_ID,
    WORKSPACE_ID,
    USER_ID,
    locale === "uz" ? "Lex.uz’da qonunchilik yangilanishi" : "Обновление законодательства в Lex.uz",
    locale === "uz"
      ? `Yangilangan hujjat <script>alert("x")</script> · https://lex.uz/uz/docs/-42`
      : `Обновлённый документ <script>alert("x")</script> · https://lex.uz/ru/docs/42`,
    now,
  );
  const jobId = monitoringEmailJobId(NOTIFICATION_ID);
  value.sqlite.prepare(
    `INSERT INTO monitoring_email_jobs
      (id,preference_id,notification_id,workspace_id,user_id,frequency,locale,
       cursor_from,cursor_through,event_count,official_url,status,attempt_count,
       provider_message_id,error_code,sent_at,created_at,updated_at)
     VALUES (?,?,?,?,?,'daily',?,?,?,?,?,'pending',0,NULL,NULL,NULL,?,?)`,
  ).run(
    jobId,
    PREFERENCE_ID,
    NOTIFICATION_ID,
    WORKSPACE_ID,
    USER_ID,
    locale,
    CURSOR_FROM,
    CURSOR_THROUGH,
    1,
    locale === "uz" ? "https://lex.uz/uz/docs/-42" : "https://lex.uz/ru/docs/42",
    now,
    now,
  );
  value.sqlite.prepare(
    "UPDATE monitoring_preferences SET last_delivered_at=?,updated_at=? WHERE id=?",
  ).run(CURSOR_THROUGH, now, PREFERENCE_ID);
  return { ...value, jobId };
}

function env(db: D1Database) {
  return {
    DB: db,
    RESEND_API_KEY: "synthetic-resend-key",
    EMAIL_FROM: "JURO <no-reply@juro.uz>",
    IDENTITY_PROTECTION_MODE: "legacy",
  };
}

test("monitoring email resolves identity at delivery, escapes metadata, and sends once", async () => {
  const { sqlite, d1, jobId } = fixture("ru");
  const calls: Array<{ url: string; headers: Headers; body: Record<string, unknown> }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return new Response(JSON.stringify({ id: "resend_monitoring_1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const first = await executeMonitoringEmail(env(d1), jobId);
    assert.deepEqual(first, {
      providerMessageId: "resend_monitoring_1",
      alreadySent: false,
      cancelled: false,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "https://api.resend.com/emails");
    assert.equal(calls[0]?.headers.get("idempotency-key"), `juro_monitoring_${jobId}`);
    assert.deepEqual(calls[0]?.body.to, ["recipient@example.test"]);
    assert.match(String(calls[0]?.body.html), /https:\/\/lex\.uz\/ru\/docs\/42/u);
    assert.match(String(calls[0]?.body.html), /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/u);
    assert.doesNotMatch(String(calls[0]?.body.html), /<script>/u);
    assert.deepEqual(
      { ...sqlite.prepare(
        `SELECT status,attempt_count AS attemptCount,
           provider_message_id AS providerMessageId,sent_at AS sentAt
         FROM monitoring_email_jobs WHERE id=?`,
      ).get(jobId) },
      {
        status: "sent",
        attemptCount: 1,
        providerMessageId: "resend_monitoring_1",
        sentAt: (sqlite.prepare("SELECT sent_at AS value FROM monitoring_email_jobs WHERE id=?").get(jobId) as { value: string }).value,
      },
    );
    assert.deepEqual(await executeMonitoringEmail(env(d1), jobId), {
      providerMessageId: "resend_monitoring_1",
      alreadySent: true,
      cancelled: false,
    });
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
});

test("monitoring email retries provider outages with the same idempotency key", async () => {
  const { sqlite, d1, jobId } = fixture("uz");
  const keys: string[] = [];
  let attempt = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    keys.push(new Headers(init?.headers).get("idempotency-key") || "");
    attempt += 1;
    return attempt === 1
      ? new Response(null, { status: 503 })
      : new Response(JSON.stringify({ id: "resend_monitoring_retry" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
  };
  try {
    await assert.rejects(
      () => executeMonitoringEmail(env(d1), jobId),
      (error: unknown) => error instanceof MonitoringEmailError
        && error.code === "EMAIL_PROVIDER_UNAVAILABLE"
        && error.retryable,
    );
    assert.deepEqual(
      { ...sqlite.prepare("SELECT status,attempt_count AS attemptCount,error_code AS errorCode FROM monitoring_email_jobs WHERE id=?").get(jobId) },
      { status: "retrying", attemptCount: 1, errorCode: "EMAIL_PROVIDER_UNAVAILABLE" },
    );
    assert.equal((await executeMonitoringEmail(env(d1), jobId)).providerMessageId, "resend_monitoring_retry");
    assert.deepEqual(keys, [
      `juro_monitoring_${jobId}`,
      `juro_monitoring_${jobId}`,
    ]);
    assert.deepEqual(
      { ...sqlite.prepare("SELECT status,attempt_count AS attemptCount FROM monitoring_email_jobs WHERE id=?").get(jobId) },
      { status: "sent", attemptCount: 2 },
    );
  } finally {
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
});

test("monitoring email cancels before provider delivery when the user disables email", async () => {
  const { sqlite, d1, jobId } = fixture("ru");
  sqlite.prepare(
    `UPDATE monitoring_preferences SET channels_json='["in_app"]' WHERE id=?`,
  ).run(PREFERENCE_ID);
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("Provider must not be called");
  };
  try {
    assert.deepEqual(await executeMonitoringEmail(env(d1), jobId), {
      providerMessageId: null,
      alreadySent: false,
      cancelled: true,
    });
    assert.equal(called, false);
    assert.deepEqual(
      { ...sqlite.prepare("SELECT status,error_code AS errorCode FROM monitoring_email_jobs WHERE id=?").get(jobId) },
      { status: "cancelled", errorCode: "SOURCE_STALE" },
    );
  } finally {
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
});
