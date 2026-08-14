import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  handleLegalCorpusScheduled,
  LEGAL_CORPUS_PROCESS_CRON,
  LEGAL_CORPUS_SEED_CRON,
} from "../worker/legal-corpus-worker";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

function controller(cron: string, scheduledTime = Date.UTC(2026, 7, 15, 19, 5)) {
  let noRetryCalls = 0;
  return {
    value: {
      cron,
      scheduledTime,
      noRetry() {
        noRetryCalls += 1;
      },
    } as unknown as ScheduledController,
    noRetryCalls: () => noRetryCalls,
  };
}

test("corpus Worker is inert before both ingestion flags are enabled", async () => {
  let databaseCalls = 0;
  const scheduled = controller(LEGAL_CORPUS_PROCESS_CRON);
  await handleLegalCorpusScheduled(scheduled.value, {
    APP_ENV: "staging",
    LEGAL_CORPUS_ENABLED: "false",
    LEGAL_CORPUS_AUTO_INGEST_ENABLED: "false",
    DB: {
      prepare() {
        databaseCalls += 1;
        throw new Error("DB must remain untouched");
      },
    } as unknown as D1Database,
    BUCKET: {} as R2Bucket,
  });
  assert.equal(databaseCalls, 0);
  assert.equal(scheduled.noRetryCalls(), 1);
});

test("corpus Worker rejects unknown schedules before touching D1", async () => {
  let databaseCalls = 0;
  const scheduled = controller("* * * * *");
  await handleLegalCorpusScheduled(scheduled.value, {
    APP_ENV: "staging",
    LEGAL_CORPUS_ENABLED: "true",
    LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
    DB: {
      prepare() {
        databaseCalls += 1;
        throw new Error("DB must remain untouched");
      },
    } as unknown as D1Database,
    BUCKET: {} as R2Bucket,
  });
  assert.equal(databaseCalls, 0);
  assert.equal(scheduled.noRetryCalls(), 1);
});

test("seed schedule is locked, idempotent, bounded and leaves a completed run", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const scheduled = controller(LEGAL_CORPUS_SEED_CRON);
  const env = {
    APP_ENV: "staging" as const,
    LEGAL_CORPUS_ENABLED: "true",
    LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
    DB: d1,
    BUCKET: {} as R2Bucket,
  };

  await handleLegalCorpusScheduled(scheduled.value, env);
  await handleLegalCorpusScheduled(scheduled.value, env);

  const run = sqlite.prepare(`SELECT status,error_code AS errorCode
    FROM scheduled_runs WHERE schedule_name='legal-corpus-worker'`).get() as {
      status: string;
      errorCode: string | null;
    };
  const checkpointCount = Number((sqlite.prepare(
    "SELECT count(*) AS count FROM legal_corpus_discovery_checkpoints",
  ).get() as { count: number }).count);
  const lockCount = Number((sqlite.prepare(
    "SELECT count(*) AS count FROM scheduled_locks WHERE name='legal-corpus-worker'",
  ).get() as { count: number }).count);
  assert.equal(run.status, "completed");
  assert.equal(run.errorCode, null);
  assert.ok(checkpointCount > 0);
  assert.equal(lockCount, 0);
  assert.equal(scheduled.noRetryCalls(), 2);
});

test("main application scheduler cannot import or invoke heavy corpus work", () => {
  const mainScheduler = readFileSync(new URL("../worker/platform-scheduled.ts", import.meta.url), "utf8");
  const corpusWorker = readFileSync(new URL("../worker/legal-corpus-worker.ts", import.meta.url), "utf8");
  assert.doesNotMatch(mainScheduler, /runNextLegalCorpusIngestionJob|runNextLexCatalogDiscoveryPage|seedLexCatalogDiscoveryCheckpoints/u);
  assert.match(corpusWorker, /runNextLegalCorpusIngestionJob/u);
  assert.match(corpusWorker, /runNextLexCatalogDiscoveryPage/u);
  assert.match(corpusWorker, /scheduled_locks/u);
});

test("dedicated Worker config is route-free and fail-closed in every environment", () => {
  const config = JSON.parse(readFileSync(new URL("../wrangler.legal-corpus.jsonc", import.meta.url), "utf8")) as {
    main: string;
    workers_dev: boolean;
    preview_urls: boolean;
    routes?: unknown[];
    vars: Record<string, string>;
    triggers: { crons: string[] };
    env: Record<string, {
      workers_dev: boolean;
      preview_urls: boolean;
      routes?: unknown[];
      vars: Record<string, string>;
      triggers: { crons: string[] };
    }>;
  };
  assert.equal(config.main, "./worker/legal-corpus-worker.ts");
  for (const environment of [config, config.env.staging, config.env.production]) {
    assert.equal(environment.workers_dev, false);
    assert.equal(environment.preview_urls, false);
    assert.deepEqual(environment.routes ?? [], []);
    assert.equal(environment.vars.LEGAL_CORPUS_ENABLED, "false");
    assert.equal(environment.vars.LEGAL_CORPUS_AUTO_INGEST_ENABLED, "false");
    assert.equal(environment.vars.LEGAL_CORPUS_DENSE_ENABLED, "false");
    assert.deepEqual(environment.triggers.crons, [LEGAL_CORPUS_PROCESS_CRON, LEGAL_CORPUS_SEED_CRON]);
  }
});
