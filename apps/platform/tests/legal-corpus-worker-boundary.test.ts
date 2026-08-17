import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  handleLegalCorpusScheduled,
  legalCorpusIngestionJobBudget,
  legalCorpusIngestionStartAllowed,
  LEGAL_CORPUS_PROCESS_CRON,
  LEGAL_CORPUS_SEED_CRON,
  LEGAL_CORPUS_STAGING_PROCESS_CRON,
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
  const scheduled = controller(LEGAL_CORPUS_STAGING_PROCESS_CRON);
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

test("staging cadence is not accepted by a production environment", async () => {
  let databaseCalls = 0;
  const scheduled = controller(LEGAL_CORPUS_STAGING_PROCESS_CRON);
  await handleLegalCorpusScheduled(scheduled.value, {
    APP_ENV: "production",
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

test("expired lease rows are recorded as failed before a later corpus schedule claims its lock", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const scheduled = controller(LEGAL_CORPUS_SEED_CRON);
  const staleAt = "2020-01-01T00:00:00.000Z";
  sqlite.prepare(`INSERT INTO scheduled_runs
    (id,schedule_name,cron,scheduled_for,idempotency_key,holder_id,status,error_code,
      started_at,finished_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?, 'running',NULL,?,NULL,?,?)`).run(
    "stale-legal-corpus-run", "legal-corpus-worker", LEGAL_CORPUS_STAGING_PROCESS_CRON,
    staleAt, "legal-corpus-worker:stale", "stale-holder", staleAt, staleAt, staleAt,
  );
  try {
    await handleLegalCorpusScheduled(scheduled.value, {
      APP_ENV: "staging",
      LEGAL_CORPUS_ENABLED: "true",
      LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
      DB: d1,
      BUCKET: {} as R2Bucket,
    });
    const stale = sqlite.prepare(`SELECT status,error_code AS errorCode,finished_at AS finishedAt
      FROM scheduled_runs WHERE id='stale-legal-corpus-run'`).get() as {
        status: string; errorCode: string; finishedAt: string | null;
      };
    assert.equal(stale.status, "failed");
    assert.equal(stale.errorCode, "LEGAL_CORPUS_SCHEDULE_LEASE_EXPIRED");
    assert.match(stale.finishedAt ?? "", /^\d{4}-\d{2}-\d{2}T/u);
  } finally {
    sqlite.close();
  }
});

test("the bounded acquisition phase prioritizes discovery and reuses only empty page capacity", () => {
  assert.equal(legalCorpusIngestionJobBudget([]), 5);
  assert.equal(legalCorpusIngestionJobBudget([
    { claimed: true, status: "completed" },
  ]), 5);
  assert.equal(legalCorpusIngestionJobBudget([
    { claimed: false, status: "empty" },
  ]), 8);
  assert.equal(legalCorpusIngestionJobBudget([
    { claimed: true, status: "completed" },
    { claimed: false, status: "empty" },
  ]), 7);
  assert.equal(legalCorpusIngestionJobBudget([
    { claimed: true, status: "completed" },
    { claimed: true, status: "completed" },
    { claimed: false, status: "empty" },
  ]), 6);
  assert.equal(legalCorpusIngestionJobBudget([
    { claimed: true, status: "completed" },
    { claimed: true, status: "completed" },
    { claimed: true, status: "completed" },
  ]), 5);
  assert.equal(legalCorpusIngestionJobBudget([{ claimed: false, status: "failed" }]), 5);
  assert.equal(legalCorpusIngestionJobBudget([{ claimed: false, status: "disabled" }]), 5);
});

test("ingestion start fence leaves a bounded representation-fetch window", () => {
  const scheduledTime = Date.UTC(2026, 7, 16, 19, 10, 28);
  assert.equal(legalCorpusIngestionStartAllowed(scheduledTime, scheduledTime), true);
  assert.equal(legalCorpusIngestionStartAllowed(scheduledTime, scheduledTime + 194_999), true);
  assert.equal(legalCorpusIngestionStartAllowed(scheduledTime, scheduledTime + 195_000), false);
  assert.equal(legalCorpusIngestionStartAllowed(Number.NaN, scheduledTime), false);
  assert.equal(legalCorpusIngestionStartAllowed(scheduledTime, Number.POSITIVE_INFINITY), false);
});

test("private dense services stay behind service bindings and staging-only flags", () => {
  const platformWorker = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
  const privateServices = readFileSync(
    new URL("../worker/legal-corpus-private-services.ts", import.meta.url),
    "utf8",
  );
  const corpusConfig = readFileSync(new URL("../wrangler.legal-corpus.jsonc", import.meta.url), "utf8");
  assert.match(platformWorker, /url\.hostname === "qdrant\.internal"/u);
  assert.match(platformWorker, /url\.hostname === "embeddings\.internal"/u);
  assert.match(privateServices, /secretMatches\(providedApiKey, expectedApiKey\)/u);
  assert.match(privateServices, /crypto\.subtle\.digest\("SHA-256"/u);
  assert.doesNotMatch(privateServices, /providedApiKey\s*!==\s*expectedApiKey/u);
  assert.match(privateServices, /enableInternet = false/u);
  assert.match(privateServices, /QDRANT__SERVICE__API_KEY/u);
  assert.match(corpusConfig, /"binding": "QDRANT_SERVICE"/u);
  assert.match(corpusConfig, /"binding": "LEGAL_CORPUS_EMBEDDING_SERVICE"/u);
  assert.match(corpusConfig, /"binding": "BACKUP_BUCKET"/u);
  const production = corpusConfig.slice(corpusConfig.indexOf('"production"'));
  assert.doesNotMatch(production, /"binding": "QDRANT_SERVICE"/u);
  assert.match(production, /"LEGAL_CORPUS_DENSE_ENABLED": "false"/u);
});

test("process schedule self-seeds a fresh corpus and begins the code-first phase without an admin action", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const scheduled = controller(LEGAL_CORPUS_STAGING_PROCESS_CRON, Date.now());
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://lex.uz/robots.txt") {
      return new Response("User-agent: *\nAllow: /\nCrawl-delay: 0\n", {
        headers: { "content-type": "text/plain" },
      });
    }
    return new Response("<html><body><p>No documents in this bounded fixture.</p></body></html>", {
      headers: { "content-type": "text/html" },
    });
  };
  try {
    await handleLegalCorpusScheduled(scheduled.value, {
      APP_ENV: "staging",
      LEGAL_CORPUS_ENABLED: "true",
      LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
      DB: d1,
      BUCKET: {} as R2Bucket,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  const checkpointCount = Number((sqlite.prepare(
    "SELECT count(*) AS count FROM legal_corpus_discovery_checkpoints",
  ).get() as { count: number }).count);
  const codeSeedCount = Number((sqlite.prepare(
    "SELECT count(*) AS count FROM legal_corpus_ingestion_jobs WHERE canonical_document_id IN ('lexuz:104723','lexuz:111189','lexuz:4674902','lexuz:6257291')",
  ).get() as { count: number }).count);
  const adminEventCount = Number((sqlite.prepare(
    "SELECT count(*) AS count FROM legal_corpus_admin_events",
  ).get() as { count: number }).count);
  assert.equal(checkpointCount, 44);
  assert.equal(codeSeedCount, 4);
  assert.equal(adminEventCount, 0);
  assert.equal(scheduled.noRetryCalls(), 1);
});

test("frozen corpus keeps resumable dense backfill alive without restarting Lex ingestion", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const scheduled = controller(LEGAL_CORPUS_STAGING_PROCESS_CRON, Date.UTC(2026, 7, 15, 19, 15));
  try {
    await handleLegalCorpusScheduled(scheduled.value, {
      APP_ENV: "staging",
      LEGAL_CORPUS_ENABLED: "true",
      LEGAL_CORPUS_AUTO_INGEST_ENABLED: "false",
      LEGAL_CORPUS_DENSE_ENABLED: "true",
      DB: d1,
      BUCKET: {} as R2Bucket,
    });
    const run = sqlite.prepare(`SELECT status,error_code AS errorCode
      FROM scheduled_runs WHERE schedule_name='legal-corpus-worker'`).get() as {
        status: string;
        errorCode: string | null;
      };
    const checkpoints = Number((sqlite.prepare(
      "SELECT count(*) AS count FROM legal_corpus_discovery_checkpoints",
    ).get() as { count: number }).count);
    assert.equal(run.status, "completed");
    assert.equal(run.errorCode, null);
    assert.equal(checkpoints, 0);
    assert.equal(scheduled.noRetryCalls(), 1);
  } finally {
    sqlite.close();
  }
});

test("main application scheduler cannot import or invoke heavy corpus work", () => {
  const mainScheduler = readFileSync(new URL("../worker/platform-scheduled.ts", import.meta.url), "utf8");
  const corpusWorker = readFileSync(new URL("../worker/legal-corpus-worker.ts", import.meta.url), "utf8");
  assert.doesNotMatch(mainScheduler, /runNextLegalCorpusIngestionJob|runNextLexCatalogDiscoveryPage|seedLexCatalogDiscoveryCheckpoints/u);
  assert.match(corpusWorker, /runNextLegalCorpusIngestionJob/u);
  assert.match(corpusWorker, /runNextLexCatalogDiscoveryPage/u);
  assert.match(corpusWorker, /runNextLegalCorpusQdrantBackfillBatch/u);
  assert.match(corpusWorker, /createPacedLexFetch/u);
  assert.match(corpusWorker, /scheduled_locks/u);
  assert.match(corpusWorker, /const DISCOVERY_PAGES_PER_RUN = 3;/u);
  assert.match(corpusWorker, /const INGESTION_JOBS_PER_RUN = 5;/u);
  assert.match(corpusWorker, /const PREFERRED_INGESTION_SLOTS_PER_RUN = 4;/u);
  assert.match(corpusWorker, /const VERSION_INGESTION_SLOT_INDEX = 4;/u);
  assert.match(corpusWorker, /const INGESTION_START_CUTOFF_MS = 195_000;/u);
  assert.match(corpusWorker, /const QDRANT_BACKFILL_BATCHES_PER_IDLE_RUN = 4;/u);
  assert.doesNotMatch(corpusWorker, /afterIngest:/u);
});

test("dedicated Worker is route-free, production-fail-closed and staging-bounded", () => {
  const config = JSON.parse(readFileSync(new URL("../wrangler.legal-corpus.jsonc", import.meta.url), "utf8")) as {
    main: string;
    workers_dev: boolean;
    preview_urls: boolean;
    routes?: unknown[];
    vars: Record<string, string>;
    triggers: { crons: string[] };
    r2_buckets: Array<{ binding: string; bucket_name: string }>;
    env: Record<string, {
      workers_dev: boolean;
      preview_urls: boolean;
      routes?: unknown[];
      vars: Record<string, string>;
      triggers: { crons: string[] };
      r2_buckets: Array<{ binding: string; bucket_name: string }>;
    }>;
  };
  assert.equal(config.main, "./worker/legal-corpus-worker.ts");
  for (const environment of [config, config.env.staging, config.env.production]) {
    assert.equal(environment.workers_dev, false);
    assert.equal(environment.preview_urls, false);
    assert.deepEqual(environment.routes ?? [], []);
    assert.equal(environment.vars.LEGAL_CORPUS_DENSE_ENABLED, "false");
    assert.equal(environment.r2_buckets.some(({ binding }) => binding === "BACKUP_BUCKET"), true);
  }
  assert.deepEqual(config.triggers.crons, [LEGAL_CORPUS_PROCESS_CRON, LEGAL_CORPUS_SEED_CRON]);
  assert.deepEqual(config.env.production.triggers.crons, [
    LEGAL_CORPUS_PROCESS_CRON,
    LEGAL_CORPUS_SEED_CRON,
  ]);
  assert.deepEqual(config.env.staging.triggers.crons, [
    LEGAL_CORPUS_STAGING_PROCESS_CRON,
    LEGAL_CORPUS_SEED_CRON,
  ]);
  for (const environment of [config, config.env.production]) {
    assert.equal(environment.vars.LEGAL_CORPUS_ENABLED, "false");
    assert.equal(environment.vars.LEGAL_CORPUS_AUTO_INGEST_ENABLED, "false");
    assert.equal(environment.vars.LEGAL_CORPUS_SHADOW_MODE, "false");
  }
  assert.equal(config.env.staging.vars.LEGAL_CORPUS_ENABLED, "true");
  assert.equal(config.env.staging.vars.LEGAL_CORPUS_AUTO_INGEST_ENABLED, "true");
  assert.equal(config.env.staging.vars.LEGAL_CORPUS_LIVE_LEXUZ_ENABLED, "true");
  assert.equal(config.env.staging.vars.LEGAL_CORPUS_MULTILINGUAL_ENABLED, "true");
  assert.equal(config.env.staging.vars.LEGAL_CORPUS_HISTORICAL_ENABLED, "true");
  assert.equal(config.env.staging.vars.LEGAL_CORPUS_SHADOW_MODE, "true");
  assert.equal(config.env.staging.vars.LEGAL_CORPUS_OWNER_UPLOAD_AUTO_TRUST, "true");
  assert.equal(config.env.staging.vars.LEGAL_CORPUS_USER_UPLOAD_AUTO_TRUST, "true");
});
