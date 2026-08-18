import assert from "node:assert/strict";
import test from "node:test";

import { scheduleLegalCorpusMaintenance } from "../lib/legal-corpus/maintenance";
import { seedLexCatalogDiscoveryCheckpoints } from "../lib/legal-corpus/lex-catalog-discovery";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

function env(db: D1Database) {
  return {
    APP_ENV: "staging" as const,
    DB: db,
    LEGAL_CORPUS_ENABLED: "true",
    LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
  };
}

function insertVariant(
  sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"],
  input: { id: string; title: string; type: string; verifiedAt: string },
) {
  sqlite.prepare(`INSERT INTO legal_corpus_documents
    (id,provider,jurisdiction,source_class,scope,visibility,canonical_url,title,
     document_type,availability_status,trusted,verification_status,approval_required,created_at,updated_at)
    VALUES (?,'lex_uz','UZ','OFFICIAL_LEGISLATION','global','global',?,?,?,
      'ready',1,'official_source',0,?,?)`).run(
    input.id, `https://lex.uz/ru/docs/${input.id}`, input.title, input.type,
    input.verifiedAt, input.verifiedAt,
  );
  sqlite.prepare(`INSERT INTO legal_corpus_variants
    (id,document_id,language,is_official_language_version,translation_type,source_url,
     last_verified_at,current_version_id,created_at,updated_at,title)
    VALUES (?,?, 'ru',1,NULL,?,?,NULL,?,?,?)`).run(
    `variant:${input.id}`, input.id, `https://lex.uz/ru/docs/${input.id}`,
    input.verifiedAt, input.verifiedAt, input.verifiedAt, input.title,
  );
}

test("daily refresh queues only stale priority legislation and is idempotent", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    insertVariant(sqlite, { id: "1001", title: "Гражданский кодекс", type: "Кодекс", verifiedAt: "2026-08-01T00:00:00.000Z" });
    insertVariant(sqlite, { id: "1002", title: "Обычное постановление", type: "Постановление", verifiedAt: "2026-08-01T00:00:00.000Z" });
    const now = new Date("2026-08-18T19:05:00.000Z");
    const first = await scheduleLegalCorpusMaintenance(env(d1), { now });
    const second = await scheduleLegalCorpusMaintenance(env(d1), { now });
    assert.equal(first.dailyQueued, 1);
    assert.equal(first.weeklyQueued, 0);
    assert.equal(first.monthlyQueued, 0);
    assert.equal(second.dailyQueued, 0);
    const jobs = sqlite.prepare("SELECT source_url AS sourceUrl FROM legal_corpus_ingestion_jobs").all() as Array<{ sourceUrl: string }>;
    assert.deepEqual(jobs.map((job) => job.sourceUrl), ["https://lex.uz/ru/docs/1001"]);
  } finally {
    sqlite.close();
  }
});

test("weekly maintenance queues stale variants and reopens catalog checkpoints after the bootstrap drains", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    insertVariant(sqlite, { id: "2001", title: "Постановление", type: "Постановление", verifiedAt: "2026-08-01T00:00:00.000Z" });
    const now = new Date("2026-08-16T19:05:00.000Z"); // 2026-08-17, Monday in Tashkent.
    await seedLexCatalogDiscoveryCheckpoints(env(d1), new Date("2026-08-01T00:00:00.000Z"));
    const checkpoint = sqlite.prepare("SELECT id FROM legal_corpus_discovery_checkpoints LIMIT 1").get() as { id: string };
    sqlite.prepare(`UPDATE legal_corpus_discovery_checkpoints
      SET status='completed',completed_at='2026-08-17T01:00:00.000Z',updated_at='2026-08-17T01:00:00.000Z'`).run();
    sqlite.prepare(`UPDATE legal_corpus_discovery_checkpoints
      SET status='completed',completed_at='2026-08-01T01:00:00.000Z',updated_at='2026-08-01T01:00:00.000Z'
      WHERE id=?`).run(checkpoint.id);
    sqlite.prepare(`INSERT INTO legal_corpus_discovery_documents
      (checkpoint_id,source_url,provider_source_id,language,discovered_at)
      SELECT id,'https://lex.uz/ru/docs/2001','2001',language,'2026-08-01T01:00:00.000Z'
      FROM legal_corpus_discovery_checkpoints WHERE id=?`).run(checkpoint.id);
    const result = await scheduleLegalCorpusMaintenance(env(d1), { now });
    assert.equal(result.weeklyQueued, 1);
    assert.equal(result.catalogCheckpointsReset, 1);
    const reset = sqlite.prepare(`SELECT status,page_number AS pageNumber,completed_at AS completedAt
      FROM legal_corpus_discovery_checkpoints WHERE id=?`).get(checkpoint.id) as {
      status: string; pageNumber: number; completedAt: string | null;
    };
    assert.equal(reset.status, "queued");
    assert.equal(reset.pageNumber, 0);
    assert.equal(reset.completedAt, null);
    assert.equal(Number((sqlite.prepare("SELECT count(*) AS count FROM legal_corpus_discovery_documents WHERE checkpoint_id=?").get(checkpoint.id) as { count: number }).count), 0);
  } finally {
    sqlite.close();
  }
});

test("weekly maintenance preserves completed checkpoint coverage while bootstrap fetches remain", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    insertVariant(sqlite, { id: "2102", title: "Постановление", type: "Постановление", verifiedAt: "2026-08-01T00:00:00.000Z" });
    const now = new Date("2026-08-16T19:05:00.000Z"); // 2026-08-17, Monday in Tashkent.
    await seedLexCatalogDiscoveryCheckpoints(env(d1), new Date("2026-08-01T00:00:00.000Z"));
    const checkpoint = sqlite.prepare("SELECT id FROM legal_corpus_discovery_checkpoints LIMIT 1").get() as { id: string };
    sqlite.prepare(`UPDATE legal_corpus_discovery_checkpoints
      SET status='completed',completed_at='2026-08-01T01:00:00.000Z',updated_at='2026-08-01T01:00:00.000Z'
      WHERE id=?`).run(checkpoint.id);
    sqlite.prepare(`INSERT INTO legal_corpus_discovery_documents
      (checkpoint_id,source_url,provider_source_id,language,discovered_at)
      SELECT id,'https://lex.uz/ru/docs/2101','2101',language,'2026-08-01T01:00:00.000Z'
      FROM legal_corpus_discovery_checkpoints WHERE id=?`).run(checkpoint.id);
    sqlite.prepare(`INSERT INTO legal_corpus_ingestion_jobs
      (id,job_type,status,provider,canonical_document_id,variant_id,source_url,language,idempotency_key,
       attempt_count,max_attempts,next_attempt_at,last_error_code,correlation_id,created_at,updated_at)
      VALUES ('bootstrap-fetch','fetch','queued','lex_uz','lexuz:2101',NULL,'https://lex.uz/ru/docs/2101','ru',
        'bootstrap-fetch-key',0,5,NULL,NULL,'bootstrap-test','2026-08-01T01:00:00.000Z','2026-08-01T01:00:00.000Z')`).run();

    const result = await scheduleLegalCorpusMaintenance(env(d1), { now });
    assert.equal(result.weeklyQueued, 1);
    assert.equal(result.catalogCheckpointsReset, 0);
    const preserved = sqlite.prepare(`SELECT status,page_number AS pageNumber,completed_at AS completedAt
      FROM legal_corpus_discovery_checkpoints WHERE id=?`).get(checkpoint.id) as {
      status: string; pageNumber: number; completedAt: string | null;
    };
    assert.equal(preserved.status, "completed");
    assert.equal(preserved.completedAt, "2026-08-01T01:00:00.000Z");
    assert.equal(Number((sqlite.prepare("SELECT count(*) AS count FROM legal_corpus_discovery_documents WHERE checkpoint_id=?").get(checkpoint.id) as { count: number }).count), 1);
  } finally {
    sqlite.close();
  }
});

test("monthly maintenance queues a bounded sequential full-hash verification set", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    insertVariant(sqlite, { id: "3001", title: "Свежий документ", type: "Постановление", verifiedAt: "2026-08-31T18:00:00.000Z" });
    const now = new Date("2026-08-31T19:05:00.000Z"); // 2026-09-01 in Tashkent.
    const result = await scheduleLegalCorpusMaintenance(env(d1), { now });
    assert.equal(result.monthlyQueued, 1);
    assert.equal(result.weeklyQueued, 0);
    const job = sqlite.prepare("SELECT job_type AS jobType,status,correlation_id AS correlationId FROM legal_corpus_ingestion_jobs").get() as { jobType: string; status: string; correlationId: string };
    assert.equal(job.jobType, "verify");
    assert.equal(job.status, "queued");
    assert.equal(job.correlationId, "legal-corpus-maintenance:monthly:2026-09");
  } finally {
    sqlite.close();
  }
});
