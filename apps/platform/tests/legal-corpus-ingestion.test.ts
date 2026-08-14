import assert from "node:assert/strict";
import test from "node:test";
import {
  enqueueOfficialLexCorpusDocument,
  ingestOfficialLexDocument,
  runNextLegalCorpusIngestionJob,
} from "../lib/legal-corpus/ingestion";
import { QdrantCorpusError } from "../lib/legal-corpus/qdrant";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

class MemoryBucket {
  readonly objects = new Map<string, string | Uint8Array>();

  async put(key: string, value: string | Uint8Array) {
    this.objects.set(key, value);
    return { key } as R2Object;
  }
}

const now = new Date("2026-08-14T12:00:00.000Z");

function lexHtml(articleTwo = true): string {
  const paragraph = "Правило применяется при наличии установленных законом обстоятельств. ".repeat(8);
  return `<!doctype html><html><body><main id="divCont">
    <div>Дата вступления в силу</div><div>01.01.2020</div>
    <div class="lx_elem ACT_TITLE">Тестовый закон</div>
    <div class="lx_elem ARTICLE">Статья 1. Первое правило</div>
    <div class="lx_elem">${paragraph}</div>
    ${articleTwo ? `<div class="lx_elem ARTICLE">Статья 2. Второе правило</div><div class="lx_elem">${paragraph}</div>` : ""}
  </main></body></html>`;
}

function fetchFor(html: string) {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.endsWith("/robots.txt")) {
      return new Response("User-agent: *\nAllow: /\n", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  };
}

function envFor(d1: D1Database, bucket: MemoryBucket) {
  return {
    APP_ENV: "staging" as const,
    DB: d1,
    BUCKET: bucket as unknown as R2Bucket,
    LEGAL_CORPUS_ENABLED: "true",
    LEGAL_CORPUS_AUTO_INGEST_ENABLED: "true",
  };
}

test("official Lex ingestion is article-first, immutable and idempotent", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  try {
    const first = await ingestOfficialLexDocument(envFor(d1, bucket), {
      sourceUrl: "https://lex.uz/ru/docs/12345",
      now,
      fetchImpl: fetchFor(lexHtml()),
    });
    assert.equal(first.status, "indexed");
    assert.equal(first.provisionCount, 2);
    assert.equal(first.chunkCount, 2);
    assert.equal(bucket.objects.size, 2);
    assert.equal(
      Number((sqlite.prepare("SELECT count(*) AS count FROM legal_corpus_provisions").get() as { count: number }).count),
      2,
    );
    assert.throws(
      () => sqlite.prepare("UPDATE legal_corpus_versions SET status='historical'").run(),
      /LEGAL_CORPUS_VERSION_IMMUTABLE/,
    );

    const unchanged = await ingestOfficialLexDocument(envFor(d1, bucket), {
      sourceUrl: "https://lex.uz/ru/docs/12345",
      now,
      fetchImpl: fetchFor(lexHtml()),
    });
    assert.equal(unchanged.status, "unchanged");
    assert.equal(
      Number((sqlite.prepare("SELECT count(*) AS count FROM legal_corpus_versions").get() as { count: number }).count),
      1,
    );

    const suspicious = await ingestOfficialLexDocument(envFor(d1, bucket), {
      sourceUrl: "https://lex.uz/ru/docs/12345",
      now,
      fetchImpl: fetchFor(lexHtml(false)),
    });
    assert.equal(suspicious.status, "halted_suspicious_change");
    assert.equal(
      Number((sqlite.prepare("SELECT count(*) AS count FROM legal_corpus_versions").get() as { count: number }).count),
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("queued corpus jobs claim once and do not leak text into the queue", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  try {
    const env = envFor(d1, bucket);
    const queued = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/docs/67890",
      now,
      correlationId: "test-correlation",
    });
    assert.equal(queued.created, true);
    const duplicate = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/docs/67890",
      now,
      correlationId: "test-correlation-2",
    });
    assert.equal(duplicate.created, false);
    const run = await runNextLegalCorpusIngestionJob(env, {
      now,
      fetchImpl: fetchFor(lexHtml()),
    });
    assert.deepEqual(run, {
      claimed: true,
      status: "completed",
      jobId: queued.jobId,
      safeErrorCode: null,
    });
    const job = sqlite.prepare("SELECT status,source_url AS sourceUrl FROM legal_corpus_ingestion_jobs").get() as { status: string; sourceUrl: string };
    assert.equal(job.status, "completed");
    assert.equal(job.sourceUrl, "https://lex.uz/docs/67890");
    assert.equal(
      (sqlite.prepare("SELECT language FROM legal_corpus_variants").get() as { language: string }).language,
      "uz-Cyrl",
    );
  } finally {
    sqlite.close();
  }
});

test("a retryable Qdrant post-ingest failure keeps the corpus job retryable", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  try {
    const env = envFor(d1, bucket);
    const queued = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/docs/67891",
      now,
      correlationId: "qdrant-retry-test",
    });
    const run = await runNextLegalCorpusIngestionJob(env, {
      now,
      fetchImpl: fetchFor(lexHtml()),
      afterIngest: async () => {
        throw new QdrantCorpusError("QDRANT_REQUEST_FAILED", true);
      },
    });
    assert.deepEqual(run, {
      claimed: true,
      status: "retrying",
      jobId: queued.jobId,
      safeErrorCode: "QDRANT_REQUEST_FAILED",
    });
    const job = sqlite.prepare(`SELECT status,last_error_code AS errorCode,next_attempt_at AS nextAttemptAt
      FROM legal_corpus_ingestion_jobs WHERE id=?`).get(queued.jobId) as {
      status: string; errorCode: string; nextAttemptAt: string | null;
    };
    assert.equal(job.status, "retrying");
    assert.equal(job.errorCode, "QDRANT_REQUEST_FAILED");
    assert.ok(job.nextAttemptAt);
  } finally {
    sqlite.close();
  }
});

test("ingestion links official RU UZ Cyrillic UZ Latin and EN variants into one family", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  try {
    const paragraph = "Правило официального документа применяется в установленных законом случаях. ".repeat(6);
    const html = `<!doctype html><main id="divCont">
      <div class="docContentHeader__item-link active" title="На русском">Рус</div>
      <div class="docContentHeader__item-link" onclick="openUrl('/ru/docs/8385445')" title="In english">Eng</div>
      <div class="docContentHeader__item-link" onclick="openUrl('/ru/docs/8383786')" title="Ўзбекча">Ўзб</div>
      <div class="docContentHeader__item-link" onclick="openUrl('/ru/docs/-8383786')" title="O'zbekcha">O’zb</div>
      <div class="lx_elem ACT_TITLE">Закон о проверке языков</div>
      <div class="lx_elem ARTICLE">Статья 1. Общее правило</div>
      <div class="lx_elem">${paragraph}</div>
    </main>`;
    const result = await ingestOfficialLexDocument(envFor(d1, bucket), {
      sourceUrl: "https://lex.uz/ru/docs/8385395",
      now,
      fetchImpl: fetchFor(html),
    });
    assert.equal(result.documentId, "lexuz-family:8383786");
    const aliases = sqlite.prepare("SELECT source_url AS sourceUrl,language FROM legal_corpus_source_aliases ORDER BY language")
      .all() as Array<{ sourceUrl: string; language: string }>;
    assert.equal(aliases.length, 4);
    assert.ok(aliases.some((alias) => alias.sourceUrl === "https://lex.uz/docs/8383786" && alias.language === "uz-Cyrl"));
    assert.ok(aliases.some((alias) => alias.sourceUrl === "https://lex.uz/en/docs/8385445" && alias.language === "en"));
    const jobs = sqlite.prepare("SELECT count(*) AS count FROM legal_corpus_ingestion_jobs").get() as { count: number };
    assert.equal(Number(jobs.count), 3);
  } finally {
    sqlite.close();
  }
});

test("historical Lex revisions are queued newest-first and keep non-overlapping validity", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  const revisionHtml = (selected: string, body: string, includeHistory = false) => `<!doctype html><main id="divCont">
    <div>Дата вступления в силу</div><div>01.04.1996</div>
    <div class="dropdown-menu__item lx_date_selected stopProp">${selected}</div>
    ${includeHistory ? `
      <div class="dropdown-menu__item lx_date_link" onclick="lxOpenUrl('/ru/docs/145261?ONDATE=18.05.2022')">18.05.2022</div>
      <div class="dropdown-menu__item lx_date_link" onclick="lxOpenUrl('/ru/docs/145261?ONDATE=10.01.2018 04')">10.01.2018 04</div>
    ` : ""}
    <div class="lx_elem ACT_TITLE">Трудовой кодекс</div>
    <div class="lx_elem ARTICLE">Статья 1. Основное правило</div>
    <div class="lx_elem">${body.repeat(12)}</div>
  </main>`;
  try {
    const env = { ...envFor(d1, bucket), LEGAL_CORPUS_HISTORICAL_ENABLED: "true" };
    const fetchImpl = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) {
        return new Response("User-agent: *\nAllow: /\n", { headers: { "content-type": "text/plain" } });
      }
      const html = url.includes("ONDATE=18.05.2022")
        ? revisionHtml("18.05.2022", "Редакция 2022 года. ")
        : url.includes("ONDATE=10.01.2018%2004")
          ? revisionHtml("10.01.2018 04", "Редакция 2018 года. ")
          : revisionHtml("30.04.2023", "Текущая редакция. ", true);
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    };

    const current = await ingestOfficialLexDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/145261", now, fetchImpl,
    });
    assert.equal(current.status, "indexed");
    const queued = sqlite.prepare("SELECT job_type AS jobType,source_url AS sourceUrl FROM legal_corpus_ingestion_jobs ORDER BY created_at")
      .all() as Array<{ jobType: string; sourceUrl: string }>;
    assert.equal(queued.length, 2);
    assert.equal(queued[0]?.jobType, "version");
    assert.equal(queued[0]?.sourceUrl, "https://lex.uz/ru/docs/145261?ONDATE=18.05.2022");
    assert.equal(queued[1]?.jobType, "version");
    assert.equal(queued[1]?.sourceUrl, "https://lex.uz/ru/docs/145261?ONDATE=10.01.2018%2004");

    const workerNow = new Date(now.getTime() + 1_000);
    assert.equal((await runNextLegalCorpusIngestionJob(env, { now: workerNow, fetchImpl })).status, "completed");
    assert.equal((await runNextLegalCorpusIngestionJob(env, { now: workerNow, fetchImpl })).status, "completed");
    const versions = sqlite.prepare(`SELECT status,valid_from AS validFrom,valid_to AS validTo
      FROM legal_corpus_versions ORDER BY valid_from DESC`).all() as Array<{
        status: string; validFrom: string; validTo: string | null;
      }>;
    assert.deepEqual(versions.map((version) => ({ ...version })), [
      { status: "active", validFrom: "2023-04-30", validTo: null },
      { status: "historical", validFrom: "2022-05-18", validTo: "2023-04-30" },
      { status: "historical", validFrom: "2018-01-10", validTo: "2022-05-18" },
    ]);
    const pointer = sqlite.prepare(`SELECT current_version_id AS currentVersionId
      FROM legal_corpus_variants`).get() as { currentVersionId: string };
    assert.equal(pointer.currentVersionId, current.versionId);
  } finally {
    sqlite.close();
  }
});
