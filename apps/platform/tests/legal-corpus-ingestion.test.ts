import assert from "node:assert/strict";
import test from "node:test";
import {
  enqueueOfficialLexCorpusDocument,
  ingestOfficialLexDocument,
  runNextLegalCorpusIngestionJob,
} from "../lib/legal-corpus/ingestion";
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
