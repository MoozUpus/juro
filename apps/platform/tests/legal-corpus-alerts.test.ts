import assert from "node:assert/strict";
import test from "node:test";
import { evaluateLegalCorpusAlerts } from "../lib/legal/corpus-alerts";
import { executeOperationalAlertEmail } from "../lib/operations/alert-email";
import { startScheduledCorpusSync } from "../lib/legal/scheduled-corpus-sync";
import type { LegalSourceAcquisitionEnv } from "../lib/legal/source-acquisition";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const now = new Date("2026-08-05T19:05:00.000Z");

test("0089 creates one content-free failed and stale alert per corpus epoch", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const originalFetch = globalThis.fetch;
  let deliveries = 0;
  try {
    const env = { APP_ENV: "staging", DB: d1 } as unknown as LegalSourceAcquisitionEnv;
    assert.deepEqual(
      await startScheduledCorpusSync(env, { now: new Date("2026-08-05T19:00:00.000Z") }),
      { started: 0, busy: 0, empty: 2 },
    );
    assert.deepEqual(await evaluateLegalCorpusAlerts({ APP_ENV: "staging", DB: d1 }, { now }), {
      created: 4,
      failedRuns: 2,
      staleSources: 2,
    });
    assert.deepEqual(await evaluateLegalCorpusAlerts({ APP_ENV: "staging", DB: d1 }, { now }), {
      created: 0,
      failedRuns: 0,
      staleSources: 0,
    });
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM legal_corpus_alert_jobs").get() as { count: number }).count, 4);
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM job_outbox WHERE idempotency_key LIKE 'legal_corpus_alert_%'").get() as { count: number }).count, 4);
    const columns = (sqlite.prepare("PRAGMA table_info(legal_corpus_alert_jobs)").all() as Array<{ name: string }>).map((row) => row.name);
    for (const forbidden of ["content", "title", "url", "email", "recipient", "document", "question", "answer"]) {
      assert.equal(columns.some((column) => column.includes(forbidden)), false);
    }

    const alert = sqlite.prepare(`
      SELECT id FROM legal_corpus_alert_jobs
      WHERE alert_type='legal_corpus_sync_failed' AND source_kind='lex'
    `).get() as { id: string };
    globalThis.fetch = async (_input, init) => {
      deliveries += 1;
      const body = JSON.parse(String(init?.body)) as { to: string[]; subject: string; html: string };
      assert.deepEqual(body.to, ["muzaffarbekmurodoff@gmail.com"]);
      assert.match(body.subject, /staging.*Lex\.uz/i);
      assert.match(body.html, /синхронизац/i);
      assert.doesNotMatch(body.html, /lex\.uz\/.*docs|document|question|answer/i);
      return Response.json({ id: "resend_legal_corpus_1" });
    };
    const emailEnv = {
      DB: d1,
      RESEND_API_KEY: "synthetic-resend-key",
      EMAIL_FROM: "JURO <no-reply@juro.uz>",
      OPERATIONS_ALERT_EMAIL: "muzaffarbekmurodoff@gmail.com",
    };
    assert.deepEqual(await executeOperationalAlertEmail(emailEnv, alert.id), {
      providerMessageId: "resend_legal_corpus_1",
      alreadySent: false,
    });
    assert.deepEqual(await executeOperationalAlertEmail(emailEnv, alert.id), {
      providerMessageId: "resend_legal_corpus_1",
      alreadySent: true,
    });
    assert.equal(deliveries, 1);
  } finally {
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
});

test("0089 records a stale-success epoch and protects alert identity", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const finishedAt = "2026-07-28T19:00:00.000Z";
    sqlite.prepare(`
      INSERT INTO source_sync_runs
      (id,environment,source_kind,run_type,status,lock_key,discovered_count,fetched_count,
       changed_count,verified_count,error_count,started_at,finished_at,error_summary,created_at,updated_at)
      VALUES ('old-success','staging','lex','scheduled_corpus','success','staging:lex:old',1,1,0,1,0,
              '2026-07-28T18:59:00.000Z',?,NULL,?,?)
    `).run(finishedAt, finishedAt, finishedAt);
    const summary = await evaluateLegalCorpusAlerts({ APP_ENV: "staging", DB: d1 }, { now });
    assert.deepEqual(summary, { created: 2, failedRuns: 0, staleSources: 2 });
    const stale = sqlite.prepare(`
      SELECT reason,observed_value AS observedValue,threshold_value AS thresholdValue
      FROM legal_corpus_alert_jobs WHERE source_kind='lex'
    `).get() as Record<string, unknown>;
    assert.deepEqual({ ...stale }, {
      reason: "stale_success",
      observedValue: 192,
      thresholdValue: 168,
    });
    assert.throws(
      () => sqlite.prepare("UPDATE legal_corpus_alert_jobs SET alert_key='changed' WHERE source_kind='lex'").run(),
      /LEGAL_CORPUS_ALERT_IDENTITY_IMMUTABLE/,
    );
    assert.throws(
      () => sqlite.prepare("DELETE FROM legal_corpus_alert_jobs WHERE source_kind='lex'").run(),
      /LEGAL_CORPUS_ALERT_IMMUTABLE/,
    );
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    sqlite.close();
  }
});

test("0089 recovers every bounded unalerted failed run after scheduler downtime", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const fresh = "2026-08-05T18:00:00.000Z";
    for (const sourceKind of ["lex", "advice"] as const) {
      sqlite.prepare(`
        INSERT INTO source_sync_runs
        (id,environment,source_kind,run_type,status,lock_key,discovered_count,fetched_count,
         changed_count,verified_count,error_count,started_at,finished_at,error_summary,created_at,updated_at)
        VALUES (?,?,?,?,? ,?,1,1,0,1,0,?,?,NULL,?,?)
      `).run(`fresh-${sourceKind}`, "staging", sourceKind, "scheduled_corpus", "success", `fresh:${sourceKind}`, fresh, fresh, fresh, fresh);
    }
    for (const [id, startedAt] of [["failed-lex-1", "2026-08-05T18:10:00.000Z"], ["failed-lex-2", "2026-08-05T18:20:00.000Z"]]) {
      sqlite.prepare(`
        INSERT INTO source_sync_runs
        (id,environment,source_kind,run_type,status,lock_key,discovered_count,fetched_count,
         changed_count,verified_count,error_count,started_at,finished_at,error_summary,created_at,updated_at)
        VALUES (?,'staging','lex','manual_corpus','failed',?,1,0,0,0,1,?,?,
                'LEGAL_SOURCE_CORPUS_INCOMPLETE',?,?)
      `).run(id, `failed:${id}`, startedAt, startedAt, startedAt, startedAt);
    }
    assert.deepEqual(await evaluateLegalCorpusAlerts({ APP_ENV: "staging", DB: d1 }, { now }), {
      created: 2,
      failedRuns: 2,
      staleSources: 0,
    });
    assert.deepEqual(await evaluateLegalCorpusAlerts({ APP_ENV: "staging", DB: d1 }, { now }), {
      created: 0,
      failedRuns: 0,
      staleSources: 0,
    });
  } finally {
    sqlite.close();
  }
});
