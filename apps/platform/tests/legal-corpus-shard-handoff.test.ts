import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isLongRunningImportError,
  nextLegalCorpusShardName,
  parseWranglerImportJson,
} from "../scripts/rollover-staging-legal-corpus-shard";
import {
  handleLegalCorpusScheduled,
  LEGAL_CORPUS_STAGING_PROCESS_CRON,
} from "../worker/legal-corpus-worker";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const handoffId = "3e5609ac-fd45-44fc-ae8f-62602c6f9df0";
const createdAt = "2026-08-25T14:00:00.000Z";
const rolloverSource = readFileSync(
  new URL("../scripts/rollover-staging-legal-corpus-shard.ts", import.meta.url),
  "utf8",
);

test("rollover naming accepts only the exact next staging shard", () => {
  assert.equal(
    nextLegalCorpusShardName("juro-staging-corpus-shard-1"),
    "juro-staging-corpus-shard-2",
  );
  assert.equal(
    nextLegalCorpusShardName("juro-staging-corpus-shard-19"),
    "juro-staging-corpus-shard-20",
  );
  assert.throws(
    () => nextLegalCorpusShardName("juro-staging-corpus-v2"),
    /LEGAL_CORPUS_SHARD_ROLLOVER_SOURCE_INVALID/u,
  );
  assert.throws(
    () => nextLegalCorpusShardName("juro-production-corpus-shard-1"),
    /LEGAL_CORPUS_SHARD_ROLLOVER_SOURCE_INVALID/u,
  );
});

test("rollover import parser accepts Wrangler progress before the JSON result", () => {
  const parsed = parseWranglerImportJson(`├ Checking if file needs uploading\r\n│\r\n[\r\n  {"success":true,"results":[]}\r\n]\r\n`, "test");
  assert.deepEqual(parsed, [{ success: true, results: [] }]);
  assert.throws(
    () => parseWranglerImportJson("upload complete without result", "test"),
    /LEGAL_CORPUS_SHARD_ROLLOVER_IMPORT_JSON_INVALID:test/u,
  );
});

test("rollover retries only the D1 long-running import contention error", () => {
  assert.equal(
    isLongRunningImportError(new Error("Currently processing a long-running import. Cannot start another import until that completes or times out.")),
    true,
  );
  assert.equal(isLongRunningImportError(new Error("permission denied")), false);
  assert.equal(isLongRunningImportError("long-running import"), false);
});

test("rollover CLI is staging-only and activation requires handoff plus deployed target binding", () => {
  assert.match(rolloverSource, /const STAGING_ENVIRONMENT = "staging"/u);
  assert.match(rolloverSource, /required\(args, "confirm-handoff-id"\)/u);
  assert.match(rolloverSource, /deployedDatabaseBinding\(config, source\)/u);
  assert.match(rolloverSource, /deployedDatabaseBinding\(config, target\)/u);
  assert.match(rolloverSource, /LEGAL_CORPUS_SHARD_ROLLOVER_DEPLOYED_BINDING_MISMATCH/u);
  assert.match(rolloverSource, /LEGAL_CORPUS_SHARD_DOCUMENT_AFFINITY_PENDING/u);
  assert.doesNotMatch(rolloverSource, /juro-production|STAGING_ENVIRONMENT\s*=\s*"production"/u);
});

function insertHandoff(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"]): void {
  sqlite.prepare(`INSERT INTO legal_corpus_shard_handoffs
    (id,source_database_name,target_database_name,manifest_sha256,
      checkpoint_count,discovery_document_count,active_job_count,
      document_affinity_job_count,failure_count,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    handoffId,
    "juro-staging-corpus-shard-1",
    "juro-staging-corpus-shard-2",
    "a".repeat(64),
    44,
    33_000,
    1,
    0,
    0,
    createdAt,
  );
}

function insertJob(
  sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"],
  id = "handoff-job-1",
): void {
  sqlite.prepare(`INSERT INTO legal_corpus_ingestion_jobs
    (id,job_type,status,provider,canonical_document_id,variant_id,source_url,language,
      idempotency_key,attempt_count,max_attempts,next_attempt_at,last_error_code,
      correlation_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id,
    "fetch",
    "queued",
    "lex_uz",
    "lexuz:12345",
    null,
    "https://lex.uz/docs/12345",
    "ru",
    `handoff:${id}`,
    0,
    5,
    createdAt,
    null,
    `handoff-correlation:${id}`,
    createdAt,
    createdAt,
  );
}

function scheduledController() {
  let noRetryCalls = 0;
  return {
    controller: {
      cron: LEGAL_CORPUS_STAGING_PROCESS_CRON,
      scheduledTime: Date.parse(createdAt),
      noRetry() {
        noRetryCalls += 1;
      },
    } as unknown as ScheduledController,
    noRetryCalls: () => noRetryCalls,
  };
}

test("shard control defaults active and a prepared handoff atomically blocks a new Worker lease", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const initial = sqlite.prepare(`SELECT acquisition_state AS state,active_handoff_id AS handoffId
      FROM legal_corpus_shard_control WHERE singleton_id=1`).get() as {
        state: string;
        handoffId: string | null;
      };
    assert.equal(initial.state, "active");
    assert.equal(initial.handoffId, null);
    insertHandoff(sqlite);
    sqlite.prepare(`UPDATE legal_corpus_shard_control
      SET acquisition_state='handoff_prepared',active_handoff_id=?,
        target_database_name='juro-staging-corpus-shard-2',updated_at=?
      WHERE singleton_id=1 AND acquisition_state='active'`).run(handoffId, createdAt);

    const scheduled = scheduledController();
    await handleLegalCorpusScheduled(scheduled.controller, {
      APP_ENV: "staging",
      LEGAL_CORPUS_ENABLED: "true",
      LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
      DB: d1,
      BUCKET: {} as R2Bucket,
    });

    assert.equal(Number((sqlite.prepare(
      "SELECT count(*) AS count FROM scheduled_locks WHERE name='legal-corpus-worker'",
    ).get() as { count: number }).count), 0);
    assert.equal(Number((sqlite.prepare(
      "SELECT count(*) AS count FROM scheduled_runs WHERE schedule_name='legal-corpus-worker'",
    ).get() as { count: number }).count), 0);
    assert.equal(Number((sqlite.prepare(
      "SELECT count(*) AS count FROM legal_corpus_discovery_checkpoints",
    ).get() as { count: number }).count), 0);
    assert.equal(scheduled.noRetryCalls(), 1);
  } finally {
    sqlite.close();
  }
});

test("the D1 fence blocks scheduler acquisition even for a Worker that ignores shard control", () => {
  const { sqlite } = sqliteD1Fixture();
  try {
    insertHandoff(sqlite);
    insertJob(sqlite, "old-worker-job");
    sqlite.prepare(`UPDATE legal_corpus_shard_control
      SET acquisition_state='handoff_prepared',active_handoff_id=?,
        target_database_name='juro-staging-corpus-shard-2',updated_at=?
      WHERE singleton_id=1 AND acquisition_state='active'`).run(handoffId, createdAt);

    assert.throws(
      () => sqlite.prepare(`INSERT INTO scheduled_locks
        (name,holder_id,acquired_at,expires_at,updated_at)
        VALUES ('legal-corpus-worker','old-worker',?,?,?)`).run(
        createdAt,
        "2026-08-25T14:05:00.000Z",
        createdAt,
      ),
      /LEGAL_CORPUS_SHARD_ACQUISITION_FROZEN/u,
    );
    assert.throws(
      () => sqlite.prepare(`INSERT INTO scheduled_runs
        (id,schedule_name,cron,scheduled_for,idempotency_key,holder_id,status,
          error_code,started_at,finished_at,created_at,updated_at)
        VALUES ('old-run','legal-corpus-worker','*/4 * * * *',?,
          'old-worker-run','old-worker','running',NULL,?,NULL,?,?)`).run(
        createdAt,
        createdAt,
        createdAt,
        createdAt,
      ),
      /LEGAL_CORPUS_SHARD_ACQUISITION_FROZEN/u,
    );
    assert.throws(
      () => sqlite.prepare(`UPDATE legal_corpus_ingestion_jobs
        SET status='running',updated_at=? WHERE id='old-worker-job'`).run(createdAt),
      /LEGAL_CORPUS_SHARD_ACQUISITION_FROZEN/u,
    );
  } finally {
    sqlite.close();
  }
});

test("handed-off source jobs become immutable completed tombstones for old Worker rollback safety", () => {
  const { sqlite } = sqliteD1Fixture();
  try {
    insertHandoff(sqlite);
    insertJob(sqlite);
    sqlite.prepare(`INSERT INTO legal_corpus_shard_handoff_jobs
      (handoff_id,job_id,source_status,source_attempt_count,source_max_attempts,
        source_next_attempt_at,source_last_error_code,source_updated_at,job_sha256)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(
      handoffId,
      "handoff-job-1",
      "queued",
      0,
      5,
      createdAt,
      null,
      createdAt,
      "b".repeat(64),
    );
    sqlite.prepare(`UPDATE legal_corpus_ingestion_jobs
      SET status='completed',next_attempt_at=NULL,
        last_error_code='LEGAL_CORPUS_SHARD_HANDOFF',handoff_id=?,
        handoff_target_database_name='juro-staging-corpus-shard-2',handed_off_at=?,updated_at=?
      WHERE id='handoff-job-1' AND status='queued' AND handoff_id IS NULL`).run(
      handoffId,
      createdAt,
      createdAt,
    );
    const row = sqlite.prepare(`SELECT status,last_error_code AS errorCode,
      handoff_target_database_name AS target FROM legal_corpus_ingestion_jobs
      WHERE id='handoff-job-1'`).get() as {
        status: string;
        errorCode: string;
        target: string;
      };
    assert.equal(row.status, "completed");
    assert.equal(row.errorCode, "LEGAL_CORPUS_SHARD_HANDOFF");
    assert.equal(row.target, "juro-staging-corpus-shard-2");
    assert.throws(
      () => sqlite.prepare("UPDATE legal_corpus_ingestion_jobs SET status='queued' WHERE id='handoff-job-1'").run(),
      /LEGAL_CORPUS_INGESTION_HANDOFF_IMMUTABLE/u,
    );
    assert.throws(
      () => sqlite.prepare("DELETE FROM legal_corpus_ingestion_jobs WHERE id='handoff-job-1'").run(),
      /LEGAL_CORPUS_INGESTION_HANDOFF_DELETE_FORBIDDEN/u,
    );
  } finally {
    sqlite.close();
  }
});

test("partial job handoff evidence is rejected at the D1 boundary", () => {
  const { sqlite } = sqliteD1Fixture();
  try {
    insertJob(sqlite, "partial-handoff-job");
    assert.throws(
      () => sqlite.prepare(`UPDATE legal_corpus_ingestion_jobs
        SET handoff_id=? WHERE id='partial-handoff-job'`).run(handoffId),
      /LEGAL_CORPUS_INGESTION_HANDOFF_IMMUTABLE/u,
    );
  } finally {
    sqlite.close();
  }
});

test("handoff ledger rejects an active job whose canonical document belongs to the source shard", () => {
  const { sqlite } = sqliteD1Fixture();
  try {
    sqlite.prepare(`INSERT INTO legal_corpus_documents (
      id,provider,jurisdiction,source_class,scope,visibility,title,
      availability_status,trusted,verification_status,approval_required,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      "lexuz:12345", "lex_uz", "UZ", "OFFICIAL_LEGISLATION", "global", "global",
      "Existing source document", "ready", 1, "official_source", 0, createdAt, createdAt,
    );
    insertJob(sqlite, "affinity-job");
    assert.throws(
      () => insertHandoff(sqlite),
      /LEGAL_CORPUS_SHARD_DOCUMENT_AFFINITY_PENDING/u,
    );
  } finally {
    sqlite.close();
  }
});
