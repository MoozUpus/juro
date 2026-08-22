import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import PizZip from "pizzip";
import {
  enqueueOfficialLexCorpusDocument,
  enqueueOfficialLexCorpusRevision,
  ingestOfficialLexDocument,
  reconcileLegalCorpusTitleUiNoise,
  runNextLegalCorpusIngestionJob,
} from "../lib/legal-corpus/ingestion";
import { seedLexCatalogDiscoveryCheckpoints } from "../lib/legal-corpus/lex-catalog-discovery";
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

function manyArticleLexHtml(articleCount = 450): string {
  const articles = Array.from({ length: articleCount }, (_, index) => {
    const number = index + 1;
    return `<div class="lx_elem ARTICLE">Статья ${number}. Правило ${number}</div>`
      + `<div class="lx_elem">Норма ${number} применяется в установленном законом порядке.</div>`;
  }).join("");
  return `<!doctype html><html><body><main id="divCont">
    <div class="lx_elem ACT_TITLE">Большой тестовый закон</div>
    ${articles}
  </main></body></html>`;
}

function fetchFor(html: string, declaredContentLength?: number) {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.endsWith("/robots.txt")) {
      return new Response("User-agent: *\nAllow: /\n", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        ...(declaredContentLength === undefined ? {} : { "content-length": String(declaredContentLength) }),
      },
    });
  };
}

function fetchForStatus(status: number) {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.endsWith("/robots.txt")) {
      return new Response("User-agent: *\nAllow: /\n", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    return new Response(null, { status });
  };
}

async function pdfBytes(lines: string[]): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const page = document.addPage([595, 842]);
  let y = 780;
  for (const line of lines) {
    page.drawText(line, { x: 48, y, size: 10, font });
    y -= 20;
  }
  return document.save();
}

function zipPdf(bytes: Uint8Array): Uint8Array {
  const zip = new PizZip();
  zip.file("official.pdf", bytes);
  return zip.generate({ type: "uint8array", compression: "DEFLATE" });
}

function archiveBackedHtml(archiveId: string, localePrefix = ""): string {
  const prefix = localePrefix ? `/${localePrefix}` : "";
  return `<!doctype html><html><body><main id="divCont">
    <div id="divBody">
      <div class="lx_elem ACT_TITLE">Судебный акт</div>
      <div class="lx_elem ACT_TEXT">Текст документа приведён в PDF.</div>
      <a href="${prefix}/files/${archiveId}.zip">Ҳужжат матни PDF шаклда берилган.</a>
    </div>
  </main></body></html>`;
}

function parseComplexArchiveBackedHtml(archiveId: string): string {
  // This deliberately trips the parser's node budget while retaining only a
  // synthetic archive link; no official legal corpus fixture is stored in Git.
  return `<!doctype html><html><body><main id="divCont">
    <a href="/files/${archiveId}.zip">Official PDF</a>
    ${"<span>bounded parser fixture</span>".repeat(50_100)}
  </main></body></html>`;
}

function fetchForArchive(html: string, archive: Uint8Array) {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.endsWith("/robots.txt")) {
      return new Response("User-agent: *\nAllow: /\n", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    if (/\/files\/\d+\.zip$/u.test(url)) {
      return new Response(new Uint8Array(archive).buffer, {
        headers: { "content-type": "application/zip" },
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

test("large version writes renew the scheduler lease between D1 batches", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  let heartbeatCalls = 0;
  try {
    const result = await ingestOfficialLexDocument(envFor(d1, bucket), {
      sourceUrl: "https://lex.uz/ru/docs/12346",
      now,
      fetchImpl: fetchFor(manyArticleLexHtml()),
      heartbeat: async () => { heartbeatCalls += 1; },
    });
    assert.equal(result.status, "indexed");
    assert.equal(result.provisionCount, 450);
    assert.ok(heartbeatCalls >= 2, `expected batch heartbeats, got ${heartbeatCalls}`);
    assert.equal(
      Number((sqlite.prepare("SELECT count(*) AS count FROM legal_corpus_provisions").get() as { count: number }).count),
      450,
    );
  } finally {
    sqlite.close();
  }
});

test("known Lex reader controls are repaired from stored corpus titles without touching legal text", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const storedAt = now.toISOString();
  const noisyTitle = "Suggestion to the documentListen to audioGet a link from a document elementOn introducing amendments";
  try {
    sqlite.prepare(`INSERT INTO legal_corpus_documents
      (id,provider,jurisdiction,source_class,scope,visibility,canonical_url,title,short_title,availability_status,trusted,verification_status,approval_required,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      "lexuz-family:title-repair", "lex_uz", "UZ", "OFFICIAL_LEGISLATION", "global", "global",
      "https://lex.uz/en/docs/8288360", noisyTitle, noisyTitle.slice(0, 240), "ready", 1,
      "official_source", 0, storedAt, storedAt,
    );
    sqlite.prepare(`INSERT INTO legal_corpus_variants
      (id,document_id,language,is_official_language_version,translation_type,source_url,last_verified_at,current_version_id,created_at,updated_at,title,short_title)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      "lexuz-family:title-repair:en", "lexuz-family:title-repair", "en", 1, null,
      "https://lex.uz/en/docs/8288360", storedAt, null, storedAt, storedAt,
      noisyTitle, noisyTitle.slice(0, 240),
    );

    const repaired = await reconcileLegalCorpusTitleUiNoise(d1, { now, limit: 4 });
    assert.deepEqual(repaired, { documents: 1, variants: 1 });
    const document = sqlite.prepare(`SELECT title,short_title AS shortTitle
      FROM legal_corpus_documents WHERE id='lexuz-family:title-repair'`).get() as {
        title: string; shortTitle: string;
      };
    const variant = sqlite.prepare(`SELECT title,short_title AS shortTitle
      FROM legal_corpus_variants WHERE id='lexuz-family:title-repair:en'`).get() as {
        title: string; shortTitle: string;
      };
    assert.equal(document.title, "On introducing amendments");
    assert.equal(document.shortTitle, "On introducing amendments");
    assert.equal(variant.title, "On introducing amendments");
    assert.equal(variant.shortTitle, "On introducing amendments");
  } finally {
    sqlite.close();
  }
});

test("a short Lex page indexes its single safe ZIP-backed official PDF", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  const legalText = [
    "OFFICIAL LEGAL ACT",
    "Article 1 establishes the rights and duties of the parties under applicable law.",
    "The authorized court reviews the evidence and records a reasoned decision.",
    "Each party may submit documents, state objections, and use the appeal procedure.",
    "The decision must identify the facts, applicable provisions, and procedural result.",
    "This official text remains linked to the canonical Lex document and its source date.",
  ];
  try {
    const archive = zipPdf(await pdfBytes(legalText));
    const result = await ingestOfficialLexDocument(envFor(d1, bucket), {
      sourceUrl: "https://lex.uz/docs/6783170",
      now,
      fetchImpl: fetchForArchive(archiveBackedHtml("6783200"), archive),
    });
    assert.equal(result.status, "indexed");
    assert.equal(result.provisionCount > 0, true);
    assert.equal(
      [...bucket.objects.keys()].some((key) => key.endsWith(".zip")),
      true,
    );
    assert.equal(
      [...bucket.objects.keys()].some((key) => key.endsWith(".pdf")),
      true,
    );
    const stored = sqlite.prepare(`SELECT raw_object_key AS rawObjectKey,
      normalized_object_key AS normalizedObjectKey FROM legal_corpus_versions LIMIT 1`).get() as {
        rawObjectKey: string; normalizedObjectKey: string;
      };
    assert.match(stored.rawObjectKey, /\/raw\.html$/u);
    const normalized = JSON.parse(String(bucket.objects.get(stored.normalizedObjectKey))) as {
      parser: { name: string }; plainText: string;
    };
    assert.equal(normalized.parser.name, "unpdf");
    assert.match(normalized.plainText, /OFFICIAL LEGAL ACT/u);
  } finally {
    sqlite.close();
  }
});

test("a maxed short-page dead letter is re-read once and anti-copy-only PDF becomes unavailable", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  const watermark = "Protected by PDF Anti-Copy Free (Upgrade to Pro Version to Remove the Watermark)";
  try {
    const env = envFor(d1, bucket);
    const queued = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/docs/6783216",
      now,
      correlationId: "legacy-short-page-redrive",
    });
    sqlite.prepare(`UPDATE legal_corpus_ingestion_jobs
      SET status='dead_letter',attempt_count=5,max_attempts=5,
        last_error_code='LEGAL_SOURCE_CONTENT_INSUFFICIENT'
      WHERE id=?`).run(queued.jobId);
    sqlite.prepare(`INSERT INTO legal_corpus_failures
      (id,job_id,canonical_document_id,source_url,language,attempted_at,http_status,error_code,
        safe_message,retryable,retry_count,retry_state)
      VALUES (?,?,?,?,?,?,NULL,?,?,0,5,'terminal')`).run(
      "legacy-short-page", queued.jobId, "lexuz:6783216",
      "https://lex.uz/docs/6783216", "uz-Cyrl", now.toISOString(),
      "LEGAL_SOURCE_CONTENT_INSUFFICIENT", "LEGAL_SOURCE_CONTENT_INSUFFICIENT",
    );
    const archive = zipPdf(await pdfBytes([watermark, watermark, watermark]));
    const run = await runNextLegalCorpusIngestionJob(env, {
      now: new Date(now.getTime() + 60_000),
      fetchImpl: fetchForArchive(archiveBackedHtml("6783246"), archive),
    });
    assert.deepEqual(run, {
      claimed: true,
      status: "completed",
      jobId: queued.jobId,
      safeErrorCode: "LEGAL_CORPUS_ATTACHMENT_TEXT_UNAVAILABLE",
    });
    const job = sqlite.prepare(`SELECT status,attempt_count AS attemptCount,
      max_attempts AS maxAttempts,last_error_code AS errorCode
      FROM legal_corpus_ingestion_jobs WHERE id=?`).get(queued.jobId) as {
        status: string; attemptCount: number; maxAttempts: number; errorCode: string;
      };
    assert.deepEqual({ ...job }, {
      status: "completed",
      attemptCount: 6,
      maxAttempts: 6,
      errorCode: "LEGAL_CORPUS_ATTACHMENT_TEXT_UNAVAILABLE",
    });
    const failures = sqlite.prepare(`SELECT error_code AS errorCode,retry_state AS retryState
      FROM legal_corpus_failures WHERE job_id=? ORDER BY attempted_at,id`).all(queued.jobId) as Array<{
        errorCode: string; retryState: string;
      }>;
    assert.equal(failures.length, 2);
    assert.equal(failures.every((failure) => failure.retryState === "technically_unavailable"), true);
  } finally {
    sqlite.close();
  }
});

test("a legacy first-attempt Lex 4xx dead letter is re-read with HTTP evidence and resolved unavailable", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  try {
    const env = envFor(d1, bucket);
    const queued = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/docs/2842473",
      now,
      correlationId: "legacy-upstream-redrive",
    });
    sqlite.prepare(`UPDATE legal_corpus_ingestion_jobs
      SET status='dead_letter',attempt_count=1,max_attempts=5,
        last_error_code='LEGAL_SOURCE_UPSTREAM_UNAVAILABLE'
      WHERE id=?`).run(queued.jobId);
    sqlite.prepare(`INSERT INTO legal_corpus_failures
      (id,job_id,canonical_document_id,source_url,language,attempted_at,http_status,error_code,
        safe_message,retryable,retry_count,retry_state)
      VALUES (?,?,?,?,?,?,NULL,?,?,0,1,'terminal')`).run(
      "legacy-upstream", queued.jobId, "lexuz:2842473",
      "https://lex.uz/docs/2842473", "uz-Cyrl", now.toISOString(),
      "LEGAL_SOURCE_UPSTREAM_UNAVAILABLE", "LEGAL_SOURCE_UPSTREAM_UNAVAILABLE",
    );

    const run = await runNextLegalCorpusIngestionJob(env, {
      now: new Date(now.getTime() + 60_000),
      fetchImpl: fetchForStatus(404),
    });
    assert.deepEqual(run, {
      claimed: true,
      status: "completed",
      jobId: queued.jobId,
      safeErrorCode: "LEGAL_SOURCE_UPSTREAM_UNAVAILABLE",
    });
    const job = sqlite.prepare(`SELECT status,attempt_count AS attemptCount,
      last_error_code AS errorCode FROM legal_corpus_ingestion_jobs WHERE id=?`).get(queued.jobId) as {
        status: string; attemptCount: number; errorCode: string;
      };
    assert.deepEqual({ ...job }, {
      status: "completed",
      attemptCount: 2,
      errorCode: "LEGAL_SOURCE_UPSTREAM_UNAVAILABLE",
    });
    const failures = sqlite.prepare(`SELECT http_status AS httpStatus,
      retryable,retry_state AS retryState FROM legal_corpus_failures
      WHERE job_id=? ORDER BY attempted_at,id`).all(queued.jobId) as Array<{
        httpStatus: number | null; retryable: number; retryState: string;
      }>;
    assert.deepEqual(failures.map((failure) => ({ ...failure })), [
      { httpStatus: null, retryable: 0, retryState: "technically_unavailable" },
      { httpStatus: 404, retryable: 0, retryState: "technically_unavailable" },
    ]);
  } finally {
    sqlite.close();
  }
});

test("a retryable Lex 5xx preserves its HTTP status and remains bounded retrying", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  try {
    const env = envFor(d1, bucket);
    const queued = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/docs/2842474",
      now,
      correlationId: "retryable-upstream",
    });
    const run = await runNextLegalCorpusIngestionJob(env, {
      now,
      fetchImpl: fetchForStatus(503),
    });
    assert.deepEqual(run, {
      claimed: true,
      status: "retrying",
      jobId: queued.jobId,
      safeErrorCode: "LEGAL_SOURCE_UPSTREAM_UNAVAILABLE",
    });
    const failure = sqlite.prepare(`SELECT http_status AS httpStatus,retryable,
      retry_state AS retryState FROM legal_corpus_failures WHERE job_id=?`).get(queued.jobId) as {
        httpStatus: number; retryable: number; retryState: string;
      };
    assert.deepEqual({ ...failure }, {
      httpStatus: 503,
      retryable: 1,
      retryState: "retrying",
    });
  } finally {
    sqlite.close();
  }
});

test("a stale running ingestion is recovered and completed idempotently", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  try {
    const env = envFor(d1, bucket);
    const queued = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/34567",
      now,
      correlationId: "stale-running-redrive",
    });
    sqlite.prepare(`UPDATE legal_corpus_ingestion_jobs
      SET status='running',attempt_count=1,updated_at=? WHERE id=?`).run(
      now.toISOString(), queued.jobId,
    );
    const workerNow = new Date(now.getTime() + 60 * 60_000);
    const run = await runNextLegalCorpusIngestionJob(env, {
      now: workerNow,
      fetchImpl: fetchFor(lexHtml()),
    });
    assert.deepEqual(run, {
      claimed: true,
      status: "completed",
      jobId: queued.jobId,
      safeErrorCode: null,
    });
    const job = sqlite.prepare(`SELECT status,attempt_count AS attemptCount,
      last_error_code AS errorCode FROM legal_corpus_ingestion_jobs WHERE id=?`).get(queued.jobId) as {
        status: string; attemptCount: number; errorCode: string | null;
      };
    assert.deepEqual({ ...job }, {
      status: "completed",
      attemptCount: 2,
      errorCode: null,
    });
    const failure = sqlite.prepare(`SELECT error_code AS errorCode,retryable,
      retry_count AS retryCount,retry_state AS retryState
      FROM legal_corpus_failures WHERE job_id=?`).get(queued.jobId) as {
        errorCode: string; retryable: number; retryCount: number; retryState: string;
      };
    assert.deepEqual({ ...failure }, {
      errorCode: "LEGAL_CORPUS_STALE_RUNNING_TIMEOUT",
      retryable: 1,
      retryCount: 1,
      retryState: "retrying",
    });
  } finally {
    sqlite.close();
  }
});

test("a fresh running ingestion is never reclaimed by a neighboring invocation", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  try {
    const env = envFor(d1, bucket);
    const queued = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/34568",
      now,
      correlationId: "fresh-running-fence",
    });
    const workerNow = new Date(now.getTime() + 60 * 60_000);
    const freshAt = new Date(workerNow.getTime() - 5 * 60_000).toISOString();
    sqlite.prepare(`UPDATE legal_corpus_ingestion_jobs
      SET status='running',attempt_count=1,updated_at=? WHERE id=?`).run(
      freshAt, queued.jobId,
    );
    const run = await runNextLegalCorpusIngestionJob(env, {
      now: workerNow,
      fetchImpl: fetchFor(lexHtml()),
    });
    assert.deepEqual(run, {
      claimed: false,
      status: "empty",
      jobId: null,
      safeErrorCode: null,
    });
    const job = sqlite.prepare(`SELECT status,attempt_count AS attemptCount,
      updated_at AS updatedAt FROM legal_corpus_ingestion_jobs WHERE id=?`).get(queued.jobId) as {
        status: string; attemptCount: number; updatedAt: string;
      };
    assert.deepEqual({ ...job }, {
      status: "running",
      attemptCount: 1,
      updatedAt: freshAt,
    });
    assert.equal(
      Number((sqlite.prepare("SELECT count(*) AS count FROM legal_corpus_failures").get() as { count: number }).count),
      0,
    );
  } finally {
    sqlite.close();
  }
});

test("an exhausted stale running ingestion is terminalized instead of looping", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  try {
    const env = envFor(d1, bucket);
    const queued = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/34569",
      now,
      correlationId: "stale-running-exhausted",
    });
    sqlite.prepare(`UPDATE legal_corpus_ingestion_jobs
      SET status='running',attempt_count=5,max_attempts=5,updated_at=? WHERE id=?`).run(
      now.toISOString(), queued.jobId,
    );
    const run = await runNextLegalCorpusIngestionJob(env, {
      now: new Date(now.getTime() + 60 * 60_000),
      fetchImpl: fetchFor(lexHtml()),
    });
    assert.deepEqual(run, {
      claimed: false,
      status: "empty",
      jobId: null,
      safeErrorCode: null,
    });
    const job = sqlite.prepare(`SELECT status,attempt_count AS attemptCount,
      last_error_code AS errorCode FROM legal_corpus_ingestion_jobs WHERE id=?`).get(queued.jobId) as {
        status: string; attemptCount: number; errorCode: string;
      };
    assert.deepEqual({ ...job }, {
      status: "dead_letter",
      attemptCount: 5,
      errorCode: "LEGAL_CORPUS_STALE_RUNNING_TIMEOUT",
    });
    const failure = sqlite.prepare(`SELECT error_code AS errorCode,retryable,
      retry_count AS retryCount,retry_state AS retryState
      FROM legal_corpus_failures WHERE job_id=?`).get(queued.jobId) as {
        errorCode: string; retryable: number; retryCount: number; retryState: string;
      };
    assert.deepEqual({ ...failure }, {
      errorCode: "LEGAL_CORPUS_STALE_RUNNING_TIMEOUT",
      retryable: 0,
      retryCount: 5,
      retryState: "terminal",
    });
  } finally {
    sqlite.close();
  }
});

test("a newer current version closes only the prior validity interval", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  try {
    const env = envFor(d1, bucket);
    const first = await ingestOfficialLexDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/12346",
      now,
      fetchImpl: fetchFor(lexHtml()),
    });
    const updatedHtml = lexHtml()
      .replace("01.01.2020", "01.02.2021")
      .replace("Первое правило", "Уточнённое первое правило");
    const second = await ingestOfficialLexDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/12346",
      now: new Date("2026-08-15T12:00:00.000Z"),
      fetchImpl: fetchFor(updatedHtml),
    });

    assert.equal(first.status, "indexed");
    assert.equal(second.status, "indexed");
    const versions = sqlite.prepare(`SELECT id,version_number AS versionNumber,
      valid_from AS validFrom,valid_to AS validTo FROM legal_corpus_versions
      ORDER BY version_number`).all() as Array<{
        id: string; versionNumber: number; validFrom: string; validTo: string | null;
      }>;
    assert.deepEqual(versions.map((version) => ({
      versionNumber: version.versionNumber,
      validFrom: version.validFrom,
      validTo: version.validTo,
    })), [
      { versionNumber: 1, validFrom: "2020-01-01", validTo: "2021-02-01" },
      { versionNumber: 2, validFrom: "2021-02-01", validTo: null },
    ]);
    sqlite.prepare("UPDATE legal_corpus_variants SET current_version_id=?")
      .run(first.versionId);
    const resumed = await ingestOfficialLexDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/12346",
      now: new Date("2026-08-15T12:05:00.000Z"),
      fetchImpl: fetchFor(updatedHtml),
    });
    assert.equal(resumed.status, "unchanged");
    assert.equal(resumed.versionId, second.versionId);
    assert.equal(
      (sqlite.prepare("SELECT current_version_id AS currentVersionId FROM legal_corpus_variants")
        .get() as { currentVersionId: string }).currentVersionId,
      second.versionId,
    );
    assert.throws(
      () => sqlite.prepare("UPDATE legal_corpus_versions SET status='historical' WHERE id=?")
        .run(versions[0]!.id),
      /LEGAL_CORPUS_VERSION_IMMUTABLE/,
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

test("an unknown operational failure is retried within the bounded job budget", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  try {
    const env = envFor(d1, bucket);
    const queued = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/docs/67892",
      now,
      correlationId: "bounded-operational-retry",
    });
    const run = await runNextLegalCorpusIngestionJob(env, {
      now,
      fetchImpl: fetchFor(lexHtml()),
      afterIngest: async () => {
        throw new Error("database temporarily unavailable");
      },
    });
    assert.deepEqual(run, {
      claimed: true,
      status: "retrying",
      jobId: queued.jobId,
      safeErrorCode: "LEGAL_CORPUS_INGESTION_FAILED",
    });
    const job = sqlite.prepare(`SELECT status,attempt_count AS attemptCount,max_attempts AS maxAttempts
      FROM legal_corpus_ingestion_jobs WHERE id=?`).get(queued.jobId) as {
        status: string; attemptCount: number; maxAttempts: number;
      };
    assert.equal(job.status, "retrying");
    assert.equal(job.attemptCount, 1);
    assert.equal(job.maxAttempts, 5);
  } finally {
    sqlite.close();
  }
});

test("a first-attempt generic dead letter is automatically redriven and preserves failure evidence", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  try {
    const env = envFor(d1, bucket);
    const queued = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/docs/67893",
      now,
      correlationId: "automatic-dead-letter-redrive",
    });
    sqlite.prepare(`UPDATE legal_corpus_ingestion_jobs
      SET status='dead_letter',attempt_count=1,last_error_code='LEGAL_CORPUS_INGESTION_FAILED'
      WHERE id=?`).run(queued.jobId);
    sqlite.prepare(`INSERT INTO legal_corpus_failures
      (id,job_id,canonical_document_id,source_url,language,attempted_at,http_status,error_code,
        safe_message,retryable,retry_count,retry_state)
      VALUES (?,?,?,?,?,?,NULL,?,?,0,1,'terminal')`).run(
      "generic-dead-letter", queued.jobId, "lexuz:67893",
      "https://lex.uz/docs/67893", "uz-Cyrl", now.toISOString(),
      "LEGAL_CORPUS_INGESTION_FAILED", "LEGAL_CORPUS_INGESTION_FAILED",
    );
    const run = await runNextLegalCorpusIngestionJob(env, {
      now: new Date(now.getTime() + 60_000),
      fetchImpl: fetchFor(lexHtml()),
    });
    assert.deepEqual(run, {
      claimed: true,
      status: "completed",
      jobId: queued.jobId,
      safeErrorCode: null,
    });
    const failure = sqlite.prepare(`SELECT retryable,retry_state AS retryState
      FROM legal_corpus_failures WHERE id='generic-dead-letter'`).get() as {
        retryable: number; retryState: string;
      };
    assert.deepEqual({ ...failure }, { retryable: 1, retryState: "retrying" });
  } finally {
    sqlite.close();
  }
});

test("a prior 2 MiB Lex code-page failure is reclaimed under the bounded ingestion cap", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  try {
    const env = envFor(d1, bucket);
    const queued = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/67894",
      now,
      correlationId: "larger-code-page-redrive",
    });
    sqlite.prepare(`UPDATE legal_corpus_ingestion_jobs
      SET status='dead_letter',attempt_count=1,last_error_code='LEGAL_SOURCE_TOO_LARGE'
      WHERE id=?`).run(queued.jobId);
    sqlite.prepare(`INSERT INTO legal_corpus_failures
      (id,job_id,canonical_document_id,source_url,language,attempted_at,http_status,error_code,
        safe_message,retryable,retry_count,retry_state)
      VALUES (?,?,?,?,?,?,NULL,?,?,0,1,'terminal')`).run(
      "larger-code-page-dead-letter", queued.jobId, "lexuz:67894",
      "https://lex.uz/ru/docs/67894", "ru", now.toISOString(),
      "LEGAL_SOURCE_TOO_LARGE", "LEGAL_SOURCE_TOO_LARGE",
    );
    const run = await runNextLegalCorpusIngestionJob(env, {
      now: new Date(now.getTime() + 60_000),
      // A declared 2.5 MiB body was rejected by the former shared 2 MiB
      // limit. The synthetic payload remains short so the test exercises the
      // boundary without storing a legal corpus fixture in Git.
      fetchImpl: fetchFor(lexHtml(), 2_500_000),
    });
    assert.deepEqual(run, {
      claimed: true,
      status: "completed",
      jobId: queued.jobId,
      safeErrorCode: null,
    });
    const failure = sqlite.prepare(`SELECT retryable,retry_state AS retryState
      FROM legal_corpus_failures WHERE id='larger-code-page-dead-letter'`).get() as {
        retryable: number; retryState: string;
      };
    assert.deepEqual({ ...failure }, { retryable: 1, retryState: "retrying" });
  } finally {
    sqlite.close();
  }
});

test("a maxed parser-complex Lex row is re-read once through its official archive", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  try {
    const env = envFor(d1, bucket);
    const queued = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/uz/docs/-7959569",
      now,
      correlationId: "parser-complex-upgrade-redrive",
    });
    sqlite.prepare(`UPDATE legal_corpus_ingestion_jobs
      SET status='dead_letter',attempt_count=5,max_attempts=5,
        last_error_code='LEGAL_SOURCE_PARSE_TOO_COMPLEX'
      WHERE id=?`).run(queued.jobId);
    sqlite.prepare(`INSERT INTO legal_corpus_failures
      (id,job_id,canonical_document_id,source_url,language,attempted_at,http_status,error_code,
        safe_message,retryable,retry_count,retry_state)
      VALUES (?,?,?,?,?,?,NULL,?,?,0,5,'terminal')`).run(
      "parser-complex-dead-letter", queued.jobId, "lexuz:7959569",
      "https://lex.uz/uz/docs/-7959569", "uz-Latn", now.toISOString(),
      "LEGAL_SOURCE_PARSE_TOO_COMPLEX", "LEGAL_SOURCE_PARSE_TOO_COMPLEX",
    );
    const archive = zipPdf(await pdfBytes([
      "OFFICIAL LEGAL ACT",
      "Article 1 establishes the rights and duties of the parties under applicable law.",
      "The authorized court reviews the evidence and records a reasoned decision.",
      "Each party may submit documents, state objections, and use the appeal procedure.",
      "The decision must identify the facts, applicable provisions, and procedural result.",
      "This official text remains linked to the canonical Lex document and its source date.",
    ]));
    const run = await runNextLegalCorpusIngestionJob(env, {
      now: new Date(now.getTime() + 60_000),
      fetchImpl: fetchForArchive(parseComplexArchiveBackedHtml("7959569"), archive),
    });
    assert.deepEqual(run, {
      claimed: true,
      status: "completed",
      jobId: queued.jobId,
      safeErrorCode: null,
    });
    const job = sqlite.prepare(`SELECT status,attempt_count AS attemptCount,
      max_attempts AS maxAttempts,last_error_code AS errorCode
      FROM legal_corpus_ingestion_jobs WHERE id=?`).get(queued.jobId) as {
        status: string; attemptCount: number; maxAttempts: number; errorCode: string | null;
      };
    assert.deepEqual({ ...job }, {
      status: "completed",
      attemptCount: 6,
      maxAttempts: 6,
      errorCode: null,
    });
  } finally {
    sqlite.close();
  }
});

test("a maxed oversized Lex row receives one bounded recheck then records technical unavailability", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  try {
    const env = envFor(d1, bucket);
    const queued = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/docs/7955865",
      now,
      correlationId: "oversized-source-upgrade-redrive",
    });
    sqlite.prepare(`UPDATE legal_corpus_ingestion_jobs
      SET status='dead_letter',attempt_count=5,max_attempts=5,
        last_error_code='LEGAL_SOURCE_TOO_LARGE'
      WHERE id=?`).run(queued.jobId);
    sqlite.prepare(`INSERT INTO legal_corpus_failures
      (id,job_id,canonical_document_id,source_url,language,attempted_at,http_status,error_code,
        safe_message,retryable,retry_count,retry_state)
      VALUES (?,?,?,?,?,?,NULL,?,?,0,5,'terminal')`).run(
      "oversized-source-dead-letter", queued.jobId, "lexuz:7955865",
      "https://lex.uz/docs/7955865", "uz-Cyrl", now.toISOString(),
      "LEGAL_SOURCE_TOO_LARGE", "LEGAL_SOURCE_TOO_LARGE",
    );
    const run = await runNextLegalCorpusIngestionJob(env, {
      now: new Date(now.getTime() + 60_000),
      // Content-Length is rejected before body consumption by the bounded
      // fetcher, preserving the Worker memory guard.
      fetchImpl: fetchFor(lexHtml(), 13 * 1024 * 1024),
    });
    assert.deepEqual(run, {
      claimed: true,
      status: "completed",
      jobId: queued.jobId,
      safeErrorCode: "LEGAL_SOURCE_TOO_LARGE",
    });
    const job = sqlite.prepare(`SELECT status,attempt_count AS attemptCount,
      max_attempts AS maxAttempts,last_error_code AS errorCode
      FROM legal_corpus_ingestion_jobs WHERE id=?`).get(queued.jobId) as {
        status: string; attemptCount: number; maxAttempts: number; errorCode: string;
      };
    assert.deepEqual({ ...job }, {
      status: "completed",
      attemptCount: 6,
      maxAttempts: 6,
      errorCode: "LEGAL_SOURCE_TOO_LARGE",
    });
    const failures = sqlite.prepare(`SELECT retryable,retry_state AS retryState
      FROM legal_corpus_failures WHERE job_id=? ORDER BY attempted_at,id`).all(queued.jobId) as Array<{
        retryable: number; retryState: string;
      }>;
    assert.equal(failures.length, 2);
    assert.equal(failures.every((failure) => failure.retryable === 0
      && failure.retryState === "technically_unavailable"), true);
    const next = await runNextLegalCorpusIngestionJob(env, {
      now: new Date(now.getTime() + 120_000),
      fetchImpl: fetchFor(lexHtml()),
    });
    assert.deepEqual(next, {
      claimed: false,
      status: "empty",
      jobId: null,
      safeErrorCode: null,
    });
  } finally {
    sqlite.close();
  }
});

test("a locale-prefixed Lex ZIP dead letter is redriven through the canonical archive URL", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  try {
    const env = envFor(d1, bucket);
    const queued = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/uz/docs/-6783216",
      now,
      correlationId: "localized-archive-redrive",
    });
    sqlite.prepare(`UPDATE legal_corpus_ingestion_jobs
      SET status='dead_letter',attempt_count=1,last_error_code='LEGAL_CORPUS_CONTENT_INSUFFICIENT_V2'
      WHERE id=?`).run(queued.jobId);
    sqlite.prepare(`INSERT INTO legal_corpus_failures
      (id,job_id,canonical_document_id,source_url,language,attempted_at,http_status,error_code,
        safe_message,retryable,retry_count,retry_state)
      VALUES (?,?,?,?,?,?,NULL,?,?,0,1,'terminal')`).run(
      "localized-archive-dead-letter", queued.jobId, "lexuz:6783216",
      "https://lex.uz/uz/docs/-6783216", "uz-Latn", now.toISOString(),
      "LEGAL_CORPUS_CONTENT_INSUFFICIENT_V2", "LEGAL_CORPUS_CONTENT_INSUFFICIENT_V2",
    );
    const archive = zipPdf(await pdfBytes([
      "OFFICIAL COURT ACT",
      "Article 1 establishes the rights and duties of the parties under applicable law.",
      "The court reviews the evidence and records a reasoned procedural decision.",
      "Each party may submit documents, state objections, and use the appeal procedure.",
    ]));
    const run = await runNextLegalCorpusIngestionJob(env, {
      now: new Date(now.getTime() + 60_000),
      fetchImpl: fetchForArchive(archiveBackedHtml("6783246", "uz"), archive),
    });
    assert.deepEqual(run, {
      claimed: true,
      status: "completed",
      jobId: queued.jobId,
      safeErrorCode: null,
    });
    const failure = sqlite.prepare(`SELECT retryable,retry_state AS retryState
      FROM legal_corpus_failures WHERE id='localized-archive-dead-letter'`).get() as {
        retryable: number; retryState: string;
      };
    assert.deepEqual({ ...failure }, { retryable: 1, retryState: "retrying" });
    assert.equal(
      [...bucket.objects.keys()].some((key) => key.endsWith(".zip")),
      true,
    );
  } finally {
    sqlite.close();
  }
});

test("an explicit official alternate-language notice resolves as technically unavailable", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  const unavailableHtml = `<html><body><main id="divCont">
    <div id="divBody">
      <div class="ACT_TITLE lx_elem">Постановление Пленума</div>
      <div class="ACT_TEXT lx_elem">Настоящее постановление утратило силу.</div>
    </div>
    <div class="COMMENT_FOR_WARNING">Текст акта приводится на узбекском языке.</div>
  </main></body></html>`;
  try {
    const env = envFor(d1, bucket);
    const queued = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/2772517",
      now,
      correlationId: "alternate-language-test",
    });
    sqlite.prepare(`INSERT INTO legal_corpus_failures
      (id,job_id,canonical_document_id,source_url,language,attempted_at,http_status,error_code,
        safe_message,retryable,retry_count,retry_state)
      VALUES (?,?,?,?,?,?,NULL,?,?,0,1,'terminal')`).run(
      "prior-short-document-failure", queued.jobId, "lexuz:2772517",
      "https://lex.uz/ru/docs/2772517", "ru", now.toISOString(),
      "LEGAL_SOURCE_CONTENT_INSUFFICIENT", "LEGAL_SOURCE_CONTENT_INSUFFICIENT",
    );
    const run = await runNextLegalCorpusIngestionJob(env, {
      now,
      fetchImpl: fetchFor(unavailableHtml),
    });
    assert.deepEqual(run, {
      claimed: true,
      status: "completed",
      jobId: queued.jobId,
      safeErrorCode: "LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE",
    });
    const job = sqlite.prepare(`SELECT status,last_error_code AS errorCode
      FROM legal_corpus_ingestion_jobs WHERE id=?`).get(queued.jobId) as {
        status: string; errorCode: string;
      };
    assert.deepEqual({ ...job }, {
      status: "completed",
      errorCode: "LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE",
    });
    const failures = sqlite.prepare(`SELECT error_code AS errorCode,retryable,retry_state AS retryState
      FROM legal_corpus_failures WHERE job_id=? ORDER BY attempted_at,id`).all(queued.jobId) as Array<{
        errorCode: string; retryable: number; retryState: string;
      }>;
    assert.equal(failures.length, 2);
    assert.equal(failures.every((failure) => failure.retryable === 0
      && failure.retryState === "technically_unavailable"), true);
  } finally {
    sqlite.close();
  }
});

test("an official page without legal text or a supported representation resolves as technically unavailable", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  try {
    const env = envFor(d1, bucket);
    const queued = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/uz/docs/-8405608",
      now,
      correlationId: "official-text-unavailable-test",
    });
    const unavailableHtml = archiveBackedHtml("8405608", "uz")
      .replace(/<a\b[^>]*>[\s\S]*?<\/a>/u, "");
    const run = await runNextLegalCorpusIngestionJob(env, {
      now,
      fetchImpl: fetchFor(unavailableHtml),
    });
    assert.deepEqual(run, {
      claimed: true,
      status: "completed",
      jobId: queued.jobId,
      safeErrorCode: "LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE",
    });
    const job = sqlite.prepare(`SELECT status,last_error_code AS errorCode
      FROM legal_corpus_ingestion_jobs WHERE id=?`).get(queued.jobId) as {
        status: string; errorCode: string;
      };
    assert.deepEqual({ ...job }, {
      status: "completed",
      errorCode: "LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE",
    });
    const failure = sqlite.prepare(`SELECT retryable,retry_state AS retryState,error_code AS errorCode
      FROM legal_corpus_failures WHERE job_id=?`).get(queued.jobId) as {
        retryable: number; retryState: string; errorCode: string;
      };
    assert.deepEqual({ ...failure }, {
      retryable: 0,
      retryState: "technically_unavailable",
      errorCode: "LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE",
    });
    assert.equal(bucket.objects.size, 0);
  } finally {
    sqlite.close();
  }
});

test("a verified Lex alternate-language link is redriven once through its canonical source", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  const unavailableHtml = `<html><body><main id="divCont">
    <div id="divBody"><div class="ACT_TITLE lx_elem">Акт</div>
      <div class="ACT_TEXT lx_elem">Короткий текст.</div></div>
    <div class="COMMENT_FOR_WARNING"><div>Текст акта приводится на <a href="/ru/docs/8383786">узбекском языке</a>.</div></div>
  </main></body></html>`;
  const availableHtml = `<html><body><main id="divCont"><div id="divBody">
    <div class="ACT_TITLE lx_elem">Риэлторлик фаолияти тўғрисида</div>
    <div class="ACT_TEXT lx_elem">${"Официальная норма. ".repeat(24)}</div>
  </div></main></body></html>`;
  try {
    const env = envFor(d1, bucket);
    const queued = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/8385395", now,
      correlationId: "alternate-language-redrive-test",
    });
    const first = await runNextLegalCorpusIngestionJob(env, {
      now, fetchImpl: fetchFor(unavailableHtml),
    });
    assert.deepEqual(first, { claimed: true, status: "completed", jobId: queued.jobId, safeErrorCode: null });
    const redirected = sqlite.prepare(`SELECT status,attempt_count AS attemptCount,source_url AS sourceUrl,language,last_error_code AS errorCode
      FROM legal_corpus_ingestion_jobs WHERE id=?`).get(queued.jobId) as {
        status: string; attemptCount: number; sourceUrl: string; language: string; errorCode: string;
      };
    assert.deepEqual({ ...redirected }, {
      status: "retrying", attemptCount: 1, sourceUrl: "https://lex.uz/docs/8383786",
      language: "uz-Cyrl", errorCode: "LEGAL_CORPUS_ALTERNATE_LANGUAGE_REDIRECT",
    });
    const second = await runNextLegalCorpusIngestionJob(env, {
      now: new Date(now.getTime() + 60_000), fetchImpl: fetchFor(availableHtml),
    });
    assert.deepEqual(second, { claimed: true, status: "completed", jobId: queued.jobId, safeErrorCode: null });
    const completed = sqlite.prepare(`SELECT status,attempt_count AS attemptCount,last_error_code AS errorCode
      FROM legal_corpus_ingestion_jobs WHERE id=?`).get(queued.jobId) as {
        status: string; attemptCount: number; errorCode: string | null;
      };
    assert.deepEqual({ ...completed }, { status: "completed", attemptCount: 2, errorCode: null });
    assert.equal(
      (sqlite.prepare(`SELECT count(*) AS count FROM legal_corpus_failures WHERE job_id=? AND retry_state='retrying'`)
        .get(queued.jobId) as { count: number }).count,
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("a completed language-unavailable row is recovered before alternate redrive", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  const unavailableHtml = `<html><body><main id="divCont"><div id="divBody">
    <div class="ACT_TITLE lx_elem">Акт</div><div class="ACT_TEXT lx_elem">Короткий текст.</div>
    </div><div class="COMMENT_FOR_WARNING">Текст акта приводится на <a href="/ru/docs/8383786">узбекском языке</a>.</div>
  </main></body></html>`;
  try {
    const env = envFor(d1, bucket);
    const queued = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/8385395", now,
      correlationId: "alternate-language-existing-row-test",
    });
    sqlite.prepare(`UPDATE legal_corpus_ingestion_jobs
      SET status='completed',attempt_count=1,last_error_code=?,updated_at=? WHERE id=?`).run(
      "LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE", now.toISOString(), queued.jobId,
    );
    sqlite.prepare(`INSERT INTO legal_corpus_failures
      (id,job_id,canonical_document_id,source_url,language,attempted_at,http_status,error_code,
        safe_message,retryable,retry_count,retry_state)
      VALUES (?,?,?,?,?,?,NULL,?,?,0,1,'technically_unavailable')`).run(
      "existing-language-unavailable", queued.jobId, "lexuz:8385395",
      "https://lex.uz/ru/docs/8385395", "ru", now.toISOString(),
      "LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE", "LEGAL_SOURCE_LANGUAGE_TEXT_UNAVAILABLE",
    );
    const run = await runNextLegalCorpusIngestionJob(env, {
      now: new Date(now.getTime() + 60_000), fetchImpl: fetchFor(unavailableHtml),
    });
    assert.deepEqual(run, { claimed: true, status: "completed", jobId: queued.jobId, safeErrorCode: null });
    const redirected = sqlite.prepare(`SELECT status,attempt_count AS attemptCount,source_url AS sourceUrl,language
      FROM legal_corpus_ingestion_jobs WHERE id=?`).get(queued.jobId) as {
        status: string; attemptCount: number; sourceUrl: string; language: string;
      };
    assert.deepEqual({ ...redirected }, {
      status: "retrying", attemptCount: 2, sourceUrl: "https://lex.uz/docs/8383786", language: "uz-Cyrl",
    });
    assert.equal(
      (sqlite.prepare(`SELECT count(*) AS count FROM legal_corpus_failures WHERE job_id=? AND retry_state='retrying'`)
        .get(queued.jobId) as { count: number }).count,
      2,
    );
  } finally {
    sqlite.close();
  }
});

test("a signed Lex PDF unavailable result is redriven once after the parser fix", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  try {
    const env = envFor(d1, bucket);
    const queued = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/uz/docs/-8405608",
      now,
      correlationId: "signed-pdf-redrive-test",
    });
    const unavailableHtml = archiveBackedHtml("8405608", "uz")
      .replace(/<a\b[^>]*>[\s\S]*?<\/a>/u, "");
    const first = await runNextLegalCorpusIngestionJob(env, {
      now,
      fetchImpl: fetchFor(unavailableHtml),
    });
    assert.equal(first.status, "completed");
    assert.equal(first.safeErrorCode, "LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE");

    const signedHtml = '<!doctype html><html><body><main id="divCont">'
      + '<div class="lx_elem ACT_TITLE">Подтверждённый акт</div>'
      + '<script>PDFObject.embed("/pdffile/-8405608", "#pdfBody");</script>'
      + "</main></body></html>";
    const pdf = await pdfBytes([
      "OFFICIAL LEGAL ACT",
      "Article 1 establishes the rights and duties of the parties under applicable law.",
      "The authorized court reviews the evidence and records a reasoned decision.",
      "Each party may submit documents, state objections, and use the appeal procedure.",
      "The decision must identify the facts, applicable provisions, and procedural result.",
      "This official text remains linked to the canonical Lex document and its source date.",
    ]);
    const second = await runNextLegalCorpusIngestionJob(env, {
      now: new Date(now.getTime() + 60_000),
      fetchImpl: async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/robots.txt")) {
          return new Response("User-agent: *\nAllow: /\n", {
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }
        if (url.endsWith("/pdffile/-8405608")) {
          return new Response(new Uint8Array(pdf).buffer, {
            headers: { "content-type": "application/pdf" },
          });
        }
        return new Response(signedHtml, { headers: { "content-type": "text/html; charset=utf-8" } });
      },
    });
    assert.deepEqual(second, {
      claimed: true,
      status: "completed",
      jobId: queued.jobId,
      safeErrorCode: null,
    });
    const job = sqlite.prepare(`SELECT status,attempt_count AS attemptCount,
      last_error_code AS errorCode FROM legal_corpus_ingestion_jobs WHERE id=?`).get(queued.jobId) as {
        status: string; attemptCount: number; errorCode: string | null;
      };
    assert.deepEqual({ ...job }, { status: "completed", attemptCount: 2, errorCode: null });
    const failure = sqlite.prepare(`SELECT retryable,retry_state AS retryState
      FROM legal_corpus_failures WHERE job_id=?`).get(queued.jobId) as {
        retryable: number; retryState: string;
      };
    assert.deepEqual({ ...failure }, { retryable: 1, retryState: "retrying" });
  } finally {
    sqlite.close();
  }
});

test("a corrupted official Lex ZIP representation resolves as technically unavailable", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  try {
    const env = envFor(d1, bucket);
    const queued = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/docs/7533457",
      now,
      correlationId: "corrupt-archive-test",
    });
    const run = await runNextLegalCorpusIngestionJob(env, {
      now,
      fetchImpl: fetchForArchive(
        archiveBackedHtml("7533457"),
        // Pass the source transport's ZIP magic check, then fail structural
        // archive validation exactly as a corrupted official attachment does.
        Uint8Array.from([0x50, 0x4b, 0x03, 0x04]),
      ),
    });
    assert.deepEqual(run, {
      claimed: true,
      status: "completed",
      jobId: queued.jobId,
      safeErrorCode: "LEGAL_CORPUS_ATTACHMENT_INVALID",
    });
    const job = sqlite.prepare(`SELECT status,last_error_code AS errorCode
      FROM legal_corpus_ingestion_jobs WHERE id=?`).get(queued.jobId) as {
        status: string; errorCode: string;
      };
    assert.deepEqual({ ...job }, {
      status: "completed",
      errorCode: "LEGAL_CORPUS_ATTACHMENT_INVALID",
    });
    const failure = sqlite.prepare(`SELECT retryable,retry_state AS retryState,error_code AS errorCode
      FROM legal_corpus_failures WHERE job_id=?`).get(queued.jobId) as {
        retryable: number; retryState: string; errorCode: string;
      };
    assert.deepEqual({ ...failure }, {
      retryable: 0,
      retryState: "technically_unavailable",
      errorCode: "LEGAL_CORPUS_ATTACHMENT_INVALID",
    });
  } finally {
    sqlite.close();
  }
});

test("a legacy corrupt Lex ZIP dead letter is reclassified without extending its retry loop", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  try {
    const env = envFor(d1, bucket);
    const queued = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/docs/7533457",
      now,
      correlationId: "legacy-corrupt-archive-test",
    });
    sqlite.prepare(`UPDATE legal_corpus_ingestion_jobs
      SET status='dead_letter',attempt_count=1,last_error_code='LEGAL_CORPUS_ATTACHMENT_INVALID'
      WHERE id=?`).run(queued.jobId);
    sqlite.prepare(`INSERT INTO legal_corpus_failures
      (id,job_id,canonical_document_id,source_url,language,attempted_at,http_status,error_code,
        safe_message,retryable,retry_count,retry_state)
      VALUES (?,?,?,?,?,?,NULL,?,?,0,1,'terminal')`).run(
      "legacy-corrupt-archive-dead-letter", queued.jobId, "lexuz:7533457",
      "https://lex.uz/docs/7533457", "uz-Cyrl", now.toISOString(),
      "LEGAL_CORPUS_ATTACHMENT_INVALID", "LEGAL_CORPUS_ATTACHMENT_INVALID",
    );
    const run = await runNextLegalCorpusIngestionJob(env, {
      now: new Date(now.getTime() + 60_000),
      fetchImpl: fetchForArchive(
        archiveBackedHtml("7533457"),
        Uint8Array.from([0x50, 0x4b, 0x03, 0x04]),
      ),
    });
    assert.deepEqual(run, {
      claimed: true,
      status: "completed",
      jobId: queued.jobId,
      safeErrorCode: "LEGAL_CORPUS_ATTACHMENT_INVALID",
    });
    const job = sqlite.prepare(`SELECT status,attempt_count AS attemptCount,max_attempts AS maxAttempts,
      last_error_code AS errorCode FROM legal_corpus_ingestion_jobs WHERE id=?`).get(queued.jobId) as {
        status: string; attemptCount: number; maxAttempts: number; errorCode: string;
      };
    assert.deepEqual({ ...job }, {
      status: "completed",
      attemptCount: 2,
      maxAttempts: 5,
      errorCode: "LEGAL_CORPUS_ATTACHMENT_INVALID",
    });
    const terminalFailures = sqlite.prepare(`SELECT count(*) AS count FROM legal_corpus_failures
      WHERE job_id=? AND retry_state='terminal'`).get(queued.jobId) as { count: number };
    assert.equal(terminalFailures.count, 0);
  } finally {
    sqlite.close();
  }
});

test("an exhausted legacy no-text dead letter is reclassified once without extending its retry loop", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  try {
    const env = envFor(d1, bucket);
    const queued = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/uz/docs/-8405608",
      now,
      correlationId: "legacy-no-text-redrive-test",
    });
    sqlite.prepare(`UPDATE legal_corpus_ingestion_jobs
      SET status='dead_letter',attempt_count=5,max_attempts=5,
        last_error_code='LEGAL_CORPUS_CONTENT_INSUFFICIENT_V2'
      WHERE id=?`).run(queued.jobId);
    sqlite.prepare(`INSERT INTO legal_corpus_failures
      (id,job_id,canonical_document_id,source_url,language,attempted_at,http_status,error_code,
        safe_message,retryable,retry_count,retry_state)
      VALUES (?,?,?,?,?,?,NULL,?,?,0,5,'terminal')`).run(
      "legacy-no-text-dead-letter", queued.jobId, "lexuz:8405608",
      "https://lex.uz/uz/docs/-8405608", "uz-Latn", now.toISOString(),
      "LEGAL_CORPUS_CONTENT_INSUFFICIENT_V2", "LEGAL_CORPUS_CONTENT_INSUFFICIENT_V2",
    );
    const unavailableHtml = archiveBackedHtml("8405608", "uz")
      .replace(/<a\b[^>]*>[\s\S]*?<\/a>/u, "");
    const run = await runNextLegalCorpusIngestionJob(env, {
      now: new Date(now.getTime() + 60_000),
      fetchImpl: fetchFor(unavailableHtml),
    });
    assert.deepEqual(run, {
      claimed: true,
      status: "completed",
      jobId: queued.jobId,
      safeErrorCode: "LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE",
    });
    const job = sqlite.prepare(`SELECT status,attempt_count AS attemptCount,max_attempts AS maxAttempts,
      last_error_code AS errorCode FROM legal_corpus_ingestion_jobs WHERE id=?`).get(queued.jobId) as {
        status: string; attemptCount: number; maxAttempts: number; errorCode: string;
      };
    assert.deepEqual({ ...job }, {
      status: "completed",
      attemptCount: 6,
      maxAttempts: 6,
      errorCode: "LEGAL_CORPUS_OFFICIAL_TEXT_UNAVAILABLE",
    });
    const terminalFailures = sqlite.prepare(`SELECT count(*) AS count FROM legal_corpus_failures
      WHERE job_id=? AND retry_state='terminal'`).get(queued.jobId) as { count: number };
    assert.equal(terminalFailures.count, 0);
  } finally {
    sqlite.close();
  }
});

test("a due retry is claimed before the ordinary ingestion backlog", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  try {
    const env = envFor(d1, bucket);
    const queued = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/10001",
      now,
      correlationId: "ordinary-backlog",
    });
    const retry = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/10002",
      now: new Date(now.getTime() + 1_000),
      correlationId: "due-retry",
    });
    sqlite.prepare(`UPDATE legal_corpus_ingestion_jobs
      SET status='retrying',next_attempt_at=? WHERE id=?`).run(now.toISOString(), retry.jobId);
    const run = await runNextLegalCorpusIngestionJob(env, {
      now: new Date(now.getTime() + 2_000),
      fetchImpl: fetchFor(lexHtml()),
    });
    assert.equal(run.jobId, retry.jobId);
    assert.equal(run.status, "completed");
    const untouched = sqlite.prepare("SELECT status FROM legal_corpus_ingestion_jobs WHERE id=?")
      .get(queued.jobId) as { status: string };
    assert.equal(untouched.status, "queued");
  } finally {
    sqlite.close();
  }
});

test("a bounded preferred slot advances discovered primary legislation before FIFO backlog", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  try {
    const env = envFor(d1, bucket);
    await seedLexCatalogDiscoveryCheckpoints(env, now);
    const backlog = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/10003",
      now,
      correlationId: "ordinary-fifo-backlog",
    });
    const preferred = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/10004",
      now: new Date(now.getTime() + 1_000),
      correlationId: "preferred-laws",
    });
    sqlite.prepare(`INSERT INTO legal_corpus_discovery_documents
      (checkpoint_id,source_url,provider_source_id,language,discovered_at)
      VALUES ('lex-catalog:laws:ru',?,'lexuz:10004','ru',?)`).run(
      "https://lex.uz/ru/docs/10004", now.toISOString(),
    );

    const run = await runNextLegalCorpusIngestionJob(env, {
      now: new Date(now.getTime() + 2_000),
      fetchImpl: fetchFor(lexHtml()),
      preferredCatalogCategories: ["laws"],
    });
    assert.equal(run.jobId, preferred.jobId);
    assert.equal(run.status, "completed");
    const untouched = sqlite.prepare("SELECT status FROM legal_corpus_ingestion_jobs WHERE id=?")
      .get(backlog.jobId) as { status: string };
    assert.equal(untouched.status, "queued");
  } finally {
    sqlite.close();
  }
});

test("a preferred slot expands an unlinked official family before a known language alias", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  try {
    const env = envFor(d1, bucket);
    await seedLexCatalogDiscoveryCheckpoints(env, now);
    await ingestOfficialLexDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/10004",
      now,
      fetchImpl: fetchFor(lexHtml()),
    });
    const knownAlias = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/10004",
      now: new Date(now.getTime() + 1_000),
      correlationId: "known-laws-alias",
    });
    const unlinkedFamily = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/10005",
      now: new Date(now.getTime() + 2_000),
      correlationId: "unlinked-laws-family",
    });
    sqlite.prepare(`INSERT INTO legal_corpus_discovery_documents
      (checkpoint_id,source_url,provider_source_id,language,discovered_at)
      VALUES
        ('lex-catalog:laws:ru',?,'lexuz:10004','ru',?),
        ('lex-catalog:laws:ru',?,'lexuz:10005','ru',?)`).run(
      "https://lex.uz/ru/docs/10004", now.toISOString(),
      "https://lex.uz/ru/docs/10005", now.toISOString(),
    );

    const run = await runNextLegalCorpusIngestionJob(env, {
      now: new Date(now.getTime() + 3_000),
      fetchImpl: fetchFor(lexHtml()),
      preferredCatalogCategories: ["laws"],
      preferredCatalogLanguages: ["ru"],
    });
    assert.equal(run.jobId, unlinkedFamily.jobId);
    const known = sqlite.prepare("SELECT status FROM legal_corpus_ingestion_jobs WHERE id=?")
      .get(knownAlias.jobId) as { status: string };
    assert.equal(known.status, "queued");
  } finally {
    sqlite.close();
  }
});

test("a preferred slot keeps the configured legal catalogue order ahead of source-family novelty", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  try {
    const env = envFor(d1, bucket);
    await seedLexCatalogDiscoveryCheckpoints(env, now);
    await ingestOfficialLexDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/10005",
      now,
      fetchImpl: fetchFor(lexHtml()),
    });
    const lowerPriority = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/10004",
      now,
      correlationId: "preferred-oliy-majlis",
    });
    const higherPriority = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/10005",
      now: new Date(now.getTime() + 1_000),
      correlationId: "preferred-court-acts",
    });
    sqlite.prepare(`INSERT INTO legal_corpus_discovery_documents
      (checkpoint_id,source_url,provider_source_id,language,discovered_at)
      VALUES
        ('lex-catalog:oliy_majlis:ru',?,'lexuz:10004','ru',?),
        ('lex-catalog:court_acts:ru',?,'lexuz:10005','ru',?)`).run(
      "https://lex.uz/ru/docs/10004", now.toISOString(),
      "https://lex.uz/ru/docs/10005", now.toISOString(),
    );

    const run = await runNextLegalCorpusIngestionJob(env, {
      now: new Date(now.getTime() + 2_000),
      fetchImpl: fetchFor(lexHtml()),
      preferredCatalogCategories: ["court_acts", "oliy_majlis"],
      preferredCatalogLanguages: ["ru"],
    });
    assert.equal(run.jobId, higherPriority.jobId);
    const deferred = sqlite.prepare("SELECT status FROM legal_corpus_ingestion_jobs WHERE id=?")
      .get(lowerPriority.jobId) as { status: string };
    assert.equal(deferred.status, "queued");
  } finally {
    sqlite.close();
  }
});

test("a bounded preferred slot selects its scheduled catalogue language before another official locale", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  try {
    const env = envFor(d1, bucket);
    await seedLexCatalogDiscoveryCheckpoints(env, now);
    const english = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/en/docs/10007",
      now,
      correlationId: "preferred-laws-en",
    });
    const russian = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/10008",
      now: new Date(now.getTime() + 1_000),
      correlationId: "preferred-laws-ru",
    });
    sqlite.prepare(`INSERT INTO legal_corpus_discovery_documents
      (checkpoint_id,source_url,provider_source_id,language,discovered_at)
      VALUES
        ('lex-catalog:laws:en',?,'lexuz:10007','en',?),
        ('lex-catalog:laws:ru',?,'lexuz:10008','ru',?)`).run(
      "https://lex.uz/en/docs/10007", now.toISOString(),
      "https://lex.uz/ru/docs/10008", now.toISOString(),
    );

    const run = await runNextLegalCorpusIngestionJob(env, {
      now: new Date(now.getTime() + 2_000),
      fetchImpl: fetchFor(lexHtml()),
      preferredCatalogCategories: ["laws"],
      preferredCatalogLanguages: ["ru"],
    });
    assert.equal(run.jobId, russian.jobId);
    assert.equal(run.status, "completed");
    const untouched = sqlite.prepare("SELECT status FROM legal_corpus_ingestion_jobs WHERE id=?")
      .get(english.jobId) as { status: string };
    assert.equal(untouched.status, "queued");
  } finally {
    sqlite.close();
  }
});

test("a bounded preferred slot falls back to another official locale before ordinary FIFO work", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  try {
    const env = envFor(d1, bucket);
    await seedLexCatalogDiscoveryCheckpoints(env, now);
    const backlog = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/10009",
      now,
      correlationId: "ordinary-fifo-language-fallback",
    });
    const english = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/en/docs/10010",
      now: new Date(now.getTime() + 1_000),
      correlationId: "preferred-laws-language-fallback",
    });
    sqlite.prepare(`INSERT INTO legal_corpus_discovery_documents
      (checkpoint_id,source_url,provider_source_id,language,discovered_at)
      VALUES ('lex-catalog:laws:en',?,'lexuz:10010','en',?)`).run(
      "https://lex.uz/en/docs/10010", now.toISOString(),
    );

    const run = await runNextLegalCorpusIngestionJob(env, {
      now: new Date(now.getTime() + 2_000),
      fetchImpl: fetchFor(lexHtml()),
      preferredCatalogCategories: ["laws"],
      preferredCatalogLanguages: ["uz-Cyrl"],
    });
    assert.equal(run.jobId, english.jobId);
    assert.equal(run.status, "completed");
    const untouched = sqlite.prepare("SELECT status FROM legal_corpus_ingestion_jobs WHERE id=?")
      .get(backlog.jobId) as { status: string };
    assert.equal(untouched.status, "queued");
  } finally {
    sqlite.close();
  }
});

test("a due retry remains ahead of a preferred catalogue candidate", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  try {
    const env = envFor(d1, bucket);
    await seedLexCatalogDiscoveryCheckpoints(env, now);
    await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/10005",
      now,
      correlationId: "preferred-laws-retry-order",
    });
    sqlite.prepare(`INSERT INTO legal_corpus_discovery_documents
      (checkpoint_id,source_url,provider_source_id,language,discovered_at)
      VALUES ('lex-catalog:laws:ru',?,'lexuz:10005','ru',?)`).run(
      "https://lex.uz/ru/docs/10005", now.toISOString(),
    );
    const retry = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/10006",
      now: new Date(now.getTime() + 1_000),
      correlationId: "global-due-retry",
    });
    sqlite.prepare(`UPDATE legal_corpus_ingestion_jobs
      SET status='retrying',next_attempt_at=? WHERE id=?`).run(now.toISOString(), retry.jobId);

    const run = await runNextLegalCorpusIngestionJob(env, {
      now: new Date(now.getTime() + 2_000),
      fetchImpl: fetchFor(lexHtml()),
      preferredCatalogCategories: ["laws"],
    });
    assert.equal(run.jobId, retry.jobId);
    assert.equal(run.status, "completed");
  } finally {
    sqlite.close();
  }
});

test("a reserved version slot advances history before older ordinary fetch work", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  try {
    const env = { ...envFor(d1, bucket), LEGAL_CORPUS_HISTORICAL_ENABLED: "true" };
    const backlog = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/10005",
      now,
      correlationId: "ordinary-fetch-backlog",
    });
    const revision = await enqueueOfficialLexCorpusRevision(env, {
      sourceUrl: "https://lex.uz/ru/docs/10006?ONDATE=18.05.2022",
      now: new Date(now.getTime() + 1_000),
      correlationId: "reserved-history-slot",
    });

    const run = await runNextLegalCorpusIngestionJob(env, {
      now: new Date(now.getTime() + 2_000),
      fetchImpl: fetchFor(lexHtml()),
      reservedQueuedJobType: "version",
    });
    assert.equal(run.jobId, revision.jobId);
    assert.equal(run.status, "completed");
    const untouched = sqlite.prepare("SELECT status FROM legal_corpus_ingestion_jobs WHERE id=?")
      .get(backlog.jobId) as { status: string };
    assert.equal(untouched.status, "queued");
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
  let heartbeatCalls = 0;
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
      heartbeat: async () => { heartbeatCalls += 1; },
    });
    assert.equal(current.status, "indexed");
    assert.ok(heartbeatCalls >= 4, `expected phase and queue heartbeats, got ${heartbeatCalls}`);
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

test("an exact core-code candidate is claimed before older ordinary FIFO work", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const bucket = new MemoryBucket();
  try {
    const env = envFor(d1, bucket);
    const ordinary = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/900001",
      now,
      correlationId: "ordinary-before-code",
    });
    const coreCode = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: "https://lex.uz/ru/docs/104723",
      now: new Date(now.getTime() + 1_000),
      correlationId: "core-code-priority",
    });
    const coreCodeHistory = await enqueueOfficialLexCorpusRevision(env, {
      sourceUrl: "https://lex.uz/ru/docs/104723?ONDATE=18.05.2022",
      now: new Date(now.getTime() + 1_500),
      correlationId: "core-code-history",
    });
    const run = await runNextLegalCorpusIngestionJob(env, {
      now: new Date(now.getTime() + 2_000),
      fetchImpl: fetchFor(lexHtml()),
      preferredCanonicalDocumentIds: ["lexuz:104723"],
    });
    assert.equal(run.jobId, coreCode.jobId);
    assert.equal((sqlite.prepare("SELECT status FROM legal_corpus_ingestion_jobs WHERE id=?")
      .get(ordinary.jobId) as { status: string }).status, "queued");
    assert.equal((sqlite.prepare("SELECT status FROM legal_corpus_ingestion_jobs WHERE id=?")
      .get(coreCodeHistory.jobId) as { status: string }).status, "queued");
  } finally {
    sqlite.close();
  }
});
