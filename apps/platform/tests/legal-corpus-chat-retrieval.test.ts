import assert from "node:assert/strict";
import test from "node:test";
import {
  configuredFederatedCorpusShards,
  retrieveCorpusAwareLegalSources,
} from "../lib/legal-corpus/chat-retrieval";
import { ingestOfficialLexDocument } from "../lib/legal-corpus/ingestion";
import type { LiveLexRetrievalResult } from "../lib/legal/live-lex-retrieval";
import { legalDatabaseFreshnessFromAsOf } from "../lib/legal/verified-retrieval";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

class MemoryBucket {
  async put() { return { key: "chat-retrieval-test" } as R2Object; }
}

const now = new Date("2026-08-15T00:00:00.000Z");
const checkedAt = "2026-08-14T23:00:00.000Z";
const contentHash = "a".repeat(64);

function liveResult(): LiveLexRetrievalResult {
  return {
    sources: [{
      id: "direct:lex:ru:777:aaaaaaaaaaaa",
      actTitle: "Закон о live-проверке",
      actIdentifier: "777",
      officialUrl: "https://lex.uz/ru/docs/777",
      revisionDate: "2026-08-14",
      lastCheckedAt: checkedAt,
      locale: "ru",
      publishedAt: null,
      sourceType: "lex",
      status: "verified",
      verificationState: "direct_validated",
      verifiedAt: checkedAt,
      contentSha256: contentHash,
      article: "9",
      excerpt: "Правило из проверенного официального источника.",
      applicabilityStatus: "current",
      spans: [{
        id: "direct-span",
        article: "9",
        paragraph: null,
        text: "Правило из проверенного официального источника.",
        textSha256: contentHash,
        quality: "high",
      }],
      sourceQuality: {
        passed: true, title: true, sufficientText: true, clean: true,
        locale: true, canonicalUrl: true, structured: true,
      },
    }],
    freshness: legalDatabaseFreshnessFromAsOf(checkedAt, now),
    legalDatabaseAsOf: checkedAt,
    sourceAccessMode: "direct",
    sourcesRetrievedAt: checkedAt,
    sourceValidationStatus: "validated",
    errors: [],
    evidence: [{
      sourceId: "direct:lex:ru:777:aaaaaaaaaaaa",
      sourceKind: "lex",
      canonicalUrl: "https://lex.uz/ru/docs/777",
      contentSha256: contentHash,
      retrievedAt: checkedAt,
      validatedAt: checkedAt,
      validationStatus: "validated",
    }],
  };
}

test("federated runtime bindings are staging-only, contiguous, and require two shards", () => {
  const first = sqliteD1Fixture();
  const second = sqliteD1Fixture();
  try {
    assert.equal(configuredFederatedCorpusShards({
      DB: first.d1,
      APP_ENV: "staging",
      LEGAL_CORPUS_FEDERATED_ENABLED: "false",
    }), null);
    const valid = {
      DB: first.d1,
      APP_ENV: "staging" as const,
      LEGAL_CORPUS_FEDERATED_ENABLED: "true",
      LEGAL_CORPUS_SHARD_1_DB: first.d1,
      LEGAL_CORPUS_SHARD_2_DB: second.d1,
    };
    assert.deepEqual(configuredFederatedCorpusShards(valid)?.map((shard) => shard.databaseName), [
      "juro-staging-corpus-shard-1",
      "juro-staging-corpus-shard-2",
    ]);
    const gap = {
      ...valid,
      LEGAL_CORPUS_SHARD_2_DB: undefined,
      LEGAL_CORPUS_SHARD_3_DB: second.d1,
    };
    assert.throws(
      () => configuredFederatedCorpusShards(gap),
      /LEGAL_CORPUS_FEDERATION_BINDING_INVALID:2/u,
    );
    assert.throws(
      () => configuredFederatedCorpusShards({ ...valid, APP_ENV: "production" }),
      /LEGAL_CORPUS_FEDERATION_ENVIRONMENT_INVALID/u,
    );
  } finally {
    first.sqlite.close();
    second.sqlite.close();
  }
});

test("feature-off chat retrieval preserves the existing direct Lex path", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  let calls = 0;
  try {
    const result = await retrieveCorpusAwareLegalSources({
      env: { DB: d1, LEGAL_CORPUS_ENABLED: "false" },
      query: "статья 9",
      locale: "ru",
      liveSearch: async () => { calls += 1; return liveResult(); },
    });
    assert.equal(calls, 1);
    assert.equal(result.sourceAccessMode, "direct");
    assert.equal(result.sources[0]?.verificationState, "direct_validated");
    assert.equal(result.coverageStatus, "good_coverage");
  } finally {
    sqlite.close();
  }
});

test("indexed corpus is preferred and emits a verified exact-span packet", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const paragraph = "Право на обращение гарантируется законом Республики Узбекистан. ".repeat(5);
    await ingestOfficialLexDocument({
      APP_ENV: "staging",
      DB: d1,
      BUCKET: new MemoryBucket() as unknown as R2Bucket,
      LEGAL_CORPUS_ENABLED: "true",
      LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
    }, {
      sourceUrl: "https://lex.uz/ru/docs/11111",
      now,
      fetchImpl: async (input) => String(input).endsWith("robots.txt")
        ? new Response("User-agent: *\nAllow: /", { headers: { "content-type": "text/plain" } })
        : new Response(`<!doctype html><main id="divCont">
          <div>Дата вступления в силу</div><div>01.01.2020</div>
          <div class="lx_elem ACT_TITLE">Закон об обращениях</div>
          <div class="lx_elem ARTICLE">Статья 7. Право на обращение</div>
          <div class="lx_elem">${paragraph}</div>
        </main>`, { headers: { "content-type": "text/html" } }),
    });
    const result = await retrieveCorpusAwareLegalSources({
      env: { DB: d1, LEGAL_CORPUS_ENABLED: "true", LEGAL_CORPUS_LIVE_LEXUZ_ENABLED: "true" },
      query: "статья 7 право на обращение",
      locale: "ru",
      now,
      liveSearch: async () => { throw new Error("live fallback must not run"); },
    });
    assert.equal(result.sourceAccessMode, "approved_package");
    assert.equal(result.sourceValidationStatus, "validated");
    assert.equal(result.coverageStatus, "good_coverage");
    assert.equal(result.sources[0]?.verificationState, "verified");
    assert.equal(result.sources[0]?.spans?.[0]?.textSha256, result.sources[0]?.contentSha256);
  } finally {
    sqlite.close();
  }
});

test("historical chat retrieval never substitutes a current live page", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  let liveCalls = 0;
  try {
    const result = await retrieveCorpusAwareLegalSources({
      env: {
        DB: d1,
        LEGAL_CORPUS_ENABLED: "true",
        LEGAL_CORPUS_LIVE_LEXUZ_ENABLED: "true",
      },
      query: "статья 9 на дату",
      locale: "ru",
      scope: { asOfDate: "2020-01-01" },
      liveSearch: async () => { liveCalls += 1; return liveResult(); },
    });
    assert.equal(liveCalls, 0);
    assert.equal(result.sources.length, 0);
    assert.equal(result.sourceAccessMode, "approved_package");
    assert.equal(result.coverageStatus, "no_coverage");
  } finally {
    sqlite.close();
  }
});

test("validated live fallback is used immediately and queued idempotently", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const env = {
      DB: d1,
      LEGAL_CORPUS_ENABLED: "true",
      LEGAL_CORPUS_LIVE_LEXUZ_ENABLED: "true",
      LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
    };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await retrieveCorpusAwareLegalSources({
        env,
        query: "статья 9 live проверка",
        locale: "ru",
        correlationId: `chat-${attempt}`,
        liveSearch: async () => liveResult(),
      });
      assert.equal(result.sourceAccessMode, "direct");
      assert.equal(result.sources.length, 1);
    }
    const row = sqlite.prepare("SELECT count(*) AS count FROM legal_corpus_ingestion_jobs").get() as { count: number };
    assert.equal(Number(row.count), 1);
  } finally {
    sqlite.close();
  }
});

test("an incomplete requested federation falls back live without queuing into the primary app DB", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const result = await retrieveCorpusAwareLegalSources({
      env: {
        APP_ENV: "staging",
        DB: d1,
        LEGAL_CORPUS_ENABLED: "true",
        LEGAL_CORPUS_LIVE_LEXUZ_ENABLED: "true",
        LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
        LEGAL_CORPUS_FEDERATED_ENABLED: "true",
      },
      query: "статья 9 live проверка",
      locale: "ru",
      liveSearch: async () => liveResult(),
    });
    assert.equal(result.sourceAccessMode, "direct");
    assert.equal(result.sources.length, 1);
    const jobs = sqlite.prepare(
      "SELECT count(*) AS count FROM legal_corpus_ingestion_jobs",
    ).get() as { count: number };
    assert.equal(Number(jobs.count), 0);
  } finally {
    sqlite.close();
  }
});

test("federated live fallback queues only when exactly one shard control is active", async () => {
  const first = sqliteD1Fixture();
  const second = sqliteD1Fixture();
  const env = {
    APP_ENV: "staging" as const,
    DB: first.d1,
    LEGAL_CORPUS_ENABLED: "true",
    LEGAL_CORPUS_LIVE_LEXUZ_ENABLED: "true",
    LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
    LEGAL_CORPUS_FEDERATED_ENABLED: "true",
    LEGAL_CORPUS_SHARD_1_DB: first.d1,
    LEGAL_CORPUS_SHARD_2_DB: second.d1,
  };
  const countJobs = (sqlite: typeof first.sqlite) => Number((sqlite.prepare(
    "SELECT count(*) AS count FROM legal_corpus_ingestion_jobs",
  ).get() as { count: number }).count);
  try {
    await retrieveCorpusAwareLegalSources({
      env,
      query: "статья 9 live проверка",
      locale: "ru",
      liveSearch: async () => liveResult(),
    });
    assert.equal(countJobs(first.sqlite), 0);
    assert.equal(countJobs(second.sqlite), 0);

    first.sqlite.prepare(`UPDATE legal_corpus_shard_control
      SET acquisition_state='handoff_prepared',
        active_handoff_id='test-handoff',
        target_database_name='juro-staging-corpus-shard-2',updated_at=?
      WHERE singleton_id=1`).run(now.toISOString());
    await retrieveCorpusAwareLegalSources({
      env,
      query: "статья 9 live проверка",
      locale: "ru",
      liveSearch: async () => liveResult(),
    });
    assert.equal(countJobs(first.sqlite), 0);
    assert.equal(countJobs(second.sqlite), 1);
  } finally {
    first.sqlite.close();
    second.sqlite.close();
  }
});
