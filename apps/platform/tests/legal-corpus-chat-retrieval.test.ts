import assert from "node:assert/strict";
import test from "node:test";
import { retrieveCorpusAwareLegalSources } from "../lib/legal-corpus/chat-retrieval";
import { ingestOfficialLexDocument } from "../lib/legal-corpus/ingestion";
import { createReadOnlyLegalCorpusDatabase } from "../lib/legal-corpus/read-only-d1";
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

async function seedIndexedSource(d1: D1Database): Promise<void> {
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
}

test("feature-off chat retrieval preserves the existing direct Lex path", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  let calls = 0;
  let liveStarted = 0;
  try {
    const result = await retrieveCorpusAwareLegalSources({
      env: { DB: d1, LEGAL_CORPUS_ENABLED: "false" },
      query: "статья 9",
      locale: "ru",
      liveSearch: async () => { calls += 1; return liveResult(); },
      onLiveSearchStarted: () => { liveStarted += 1; },
    });
    assert.equal(calls, 1);
    assert.equal(liveStarted, 1);
    assert.equal(result.sourceAccessMode, "direct");
    assert.equal(result.sources[0]?.verificationState, "direct_validated");
    assert.equal(result.coverageStatus, "good_coverage");
  } finally {
    sqlite.close();
  }
});

test("indexed corpus is preferred and emits a verified exact-span packet", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  let liveStarted = 0;
  try {
    await seedIndexedSource(d1);
    const result = await retrieveCorpusAwareLegalSources({
      env: { DB: d1, LEGAL_CORPUS_ENABLED: "true", LEGAL_CORPUS_LIVE_LEXUZ_ENABLED: "true" },
      query: "статья 7 право на обращение",
      locale: "ru",
      now,
      liveSearch: async () => { throw new Error("live fallback must not run"); },
      onLiveSearchStarted: () => { liveStarted += 1; },
    });
    assert.equal(liveStarted, 0);
    assert.equal(result.sourceAccessMode, "approved_package");
    assert.equal(result.sourceValidationStatus, "validated");
    assert.equal(result.coverageStatus, "good_coverage");
    assert.equal(result.sources[0]?.verificationState, "verified");
    assert.equal(result.sources[0]?.spans?.[0]?.textSha256, result.sources[0]?.contentSha256);
  } finally {
    sqlite.close();
  }
});

test("development can read the staging index without replacing its local D1 binding", async () => {
  const local = sqliteD1Fixture();
  const staging = sqliteD1Fixture();
  try {
    await seedIndexedSource(staging.d1);
    const result = await retrieveCorpusAwareLegalSources({
      env: {
        APP_ENV: "development",
        DB: local.d1,
        LEGAL_CORPUS_ENABLED: "true",
        LEGAL_CORPUS_LIVE_LEXUZ_ENABLED: "false",
        LEGAL_CORPUS_REMOTE_READ_ENABLED: "true",
        LEGAL_CORPUS_READ_DB: staging.d1,
      },
      query: "статья 7 право на обращение",
      locale: "ru",
      now,
    });
    assert.equal(result.sources[0]?.actTitle, "Закон об обращениях");
    assert.equal(result.sourceAccessMode, "approved_package");
    assert.equal(Number((local.sqlite.prepare(
      "SELECT count(*) AS count FROM legal_corpus_documents",
    ).get() as { count: number }).count), 0);
  } finally {
    local.sqlite.close();
    staging.sqlite.close();
  }
});

test("the staging corpus D1 facade blocks every exposed write path", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const readOnly = createReadOnlyLegalCorpusDatabase(d1);
    const row = await readOnly.prepare("SELECT 7 AS value").first<{ value: number }>();
    assert.equal(row?.value, 7);
    assert.throws(() => readOnly.prepare("INSERT INTO users DEFAULT VALUES"), {
      name: "LegalCorpusReadOnlyDatabaseError",
    });
    assert.throws(() => readOnly.prepare("WITH removed AS (DELETE FROM users RETURNING id) SELECT * FROM removed"), {
      name: "LegalCorpusReadOnlyDatabaseError",
    });
    assert.throws(() => readOnly.prepare("SELECT 1").run(), {
      name: "LegalCorpusReadOnlyDatabaseError",
    });
    assert.throws(() => readOnly.exec("SELECT 1"), {
      name: "LegalCorpusReadOnlyDatabaseError",
    });
    assert.throws(() => readOnly.batch([]), {
      name: "LegalCorpusReadOnlyDatabaseError",
    });
    assert.throws(() => readOnly.withSession(), {
      name: "LegalCorpusReadOnlyDatabaseError",
    });
  } finally {
    sqlite.close();
  }
});

test("stale indexed evidence is retained and merged with validated live evidence", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    await seedIndexedSource(d1);
    const result = await retrieveCorpusAwareLegalSources({
      env: { DB: d1, LEGAL_CORPUS_ENABLED: "true", LEGAL_CORPUS_LIVE_LEXUZ_ENABLED: "true" },
      query: "статья 7 право на обращение",
      locale: "ru",
      now: new Date("2027-08-15T00:00:00.000Z"),
      liveSearch: async () => liveResult(),
    });
    assert.equal(result.sourceAccessMode, "mixed");
    assert.deepEqual(new Set(result.sources.map((item) => item.officialUrl)), new Set([
      "https://lex.uz/ru/docs/11111",
      "https://lex.uz/ru/docs/777",
    ]));
    assert.equal(result.retrievalTelemetry?.fusionOutcome, "mixed");
    assert.equal(result.retrievalTelemetry?.indexedHitCount, 1);
    assert.equal(result.retrievalTelemetry?.liveHitCount, 1);
  } finally {
    sqlite.close();
  }
});

test("live verification failure returns the usable indexed evidence packet", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    await seedIndexedSource(d1);
    const result = await retrieveCorpusAwareLegalSources({
      env: { DB: d1, LEGAL_CORPUS_ENABLED: "true", LEGAL_CORPUS_LIVE_LEXUZ_ENABLED: "true" },
      query: "статья 7 право на обращение",
      locale: "ru",
      now: new Date("2027-08-15T00:00:00.000Z"),
      liveSearch: async () => { throw new Error("live unavailable"); },
    });
    assert.equal(result.sourceAccessMode, "approved_package");
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0]?.officialUrl, "https://lex.uz/ru/docs/11111");
    assert.equal(result.retrievalTelemetry?.fusionOutcome, "indexed");
  } finally {
    sqlite.close();
  }
});

test("historical chat retrieval never substitutes a current live page", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  let liveCalls = 0;
  let liveStarted = 0;
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
      onLiveSearchStarted: () => { liveStarted += 1; },
    });
    assert.equal(liveCalls, 0);
    assert.equal(liveStarted, 0);
    assert.equal(result.sources.length, 0);
    assert.equal(result.sourceAccessMode, "approved_package");
    assert.equal(result.coverageStatus, "no_coverage");
  } finally {
    sqlite.close();
  }
});

test("validated live fallback is used immediately and queued idempotently", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  let liveStarted = 0;
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
        onLiveSearchStarted: () => { liveStarted += 1; },
      });
      assert.equal(result.sourceAccessMode, "direct");
      assert.equal(result.sources.length, 1);
    }
    assert.equal(liveStarted, 2);
    const row = sqlite.prepare("SELECT count(*) AS count FROM legal_corpus_ingestion_jobs").get() as { count: number };
    assert.equal(Number(row.count), 1);
  } finally {
    sqlite.close();
  }
});
