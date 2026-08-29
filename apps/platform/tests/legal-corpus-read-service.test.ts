import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createJuroLegalCorpusReadServiceTools,
  handleJuroLegalCorpusReadToolRequest,
  JURO_LEGAL_CORPUS_TOOL_NAMES,
  JuroLegalCorpusReadServiceError,
} from "../lib/legal-corpus/legal-read-service";
import { buildSparseTermEntries } from "../lib/legal-corpus/sparse-index";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const chunkId = "lexuz:test:ru:v1:p1:c1";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function seedOfficialProvision(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"]): void {
  const now = "2026-08-28T00:00:00.000Z";
  const text = "Статья 10. Трудовой договор прекращается только по основаниям, установленным законом.";
  const hash = sha256(text);
  sqlite.prepare(`INSERT INTO legal_corpus_documents (
    id,provider,jurisdiction,source_class,scope,visibility,canonical_url,title,document_type,
    availability_status,trusted,verification_status,approval_required,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    "lexuz:test", "lex_uz", "UZ", "OFFICIAL_LEGISLATION", "global", "global",
    "https://lex.uz/ru/docs/100", "Трудовой кодекс", "code", "ready", 1,
    "official_source", 0, now, now,
  );
  sqlite.prepare(`INSERT INTO legal_corpus_variants (
    id,document_id,language,is_official_language_version,source_url,last_verified_at,
    current_version_id,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?)`).run(
    "lexuz:test:ru", "lexuz:test", "ru", 1, "https://lex.uz/ru/docs/100", now,
    "lexuz:test:ru:v1", now, now,
  );
  sqlite.prepare(`INSERT INTO legal_corpus_versions (
    id,variant_id,version_number,status,valid_from,valid_to,version_date,content_sha256,
    normalized_object_key,source_url,fetched_at,change_type,created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    "lexuz:test:ru:v1", "lexuz:test:ru", 1, "active", "2026-01-01", null,
    "2026-01-01", hash, "legal/test.json", "https://lex.uz/ru/docs/100", now, "new", now,
  );
  sqlite.prepare(`INSERT INTO legal_corpus_provisions (
    id,document_id,variant_id,version_id,article_number,article_number_normalized,
    article_title,sequence,text,exact_quote_source,language,status,valid_from,valid_to,
    source_url,content_sha256,created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    "lexuz:test:ru:v1:p1", "lexuz:test", "lexuz:test:ru", "lexuz:test:ru:v1",
    "10", "10", "Прекращение трудового договора", 1, text, text, "ru", "active",
    "2026-01-01", null, "https://lex.uz/ru/docs/100", hash, now,
  );
  sqlite.prepare(`INSERT INTO legal_corpus_chunks (
    id,provision_id,version_id,chunk_index,total_chunks,content_text,content_sha256,
    sparse_terms_json,indexed_at,created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    chunkId, "lexuz:test:ru:v1:p1", "lexuz:test:ru:v1", 0, 1, text, hash, "[]", now, now,
  );
  sqlite.prepare("INSERT INTO legal_corpus_sparse_chunk_keys (chunk_id) VALUES (?)").run(chunkId);
  const chunkKeyId = Number((sqlite.prepare(
    "SELECT id FROM legal_corpus_sparse_chunk_keys WHERE chunk_id=?",
  ).get(chunkId) as { id: number }).id);
  for (const entry of buildSparseTermEntries({
    text,
    articleNumber: "10",
    title: "Прекращение трудового договора",
  })) {
    sqlite.prepare(
      "INSERT OR IGNORE INTO legal_corpus_sparse_term_dictionary (term) VALUES (?)",
    ).run(entry.term);
    const termId = Number((sqlite.prepare(
      "SELECT id FROM legal_corpus_sparse_term_dictionary WHERE term=?",
    ).get(entry.term) as { id: number }).id);
    sqlite.prepare(`INSERT INTO legal_corpus_sparse_postings
      (term_id,chunk_key_id,term_frequency,title_frequency,article_frequency)
      VALUES (?,?,?,?,?)`).run(
      termId, chunkKeyId, entry.termFrequency, entry.titleFrequency, entry.articleFrequency,
    );
  }
}

function inProcessService(db: D1Database): Fetcher {
  return {
    fetch(input: RequestInfo | URL, init?: RequestInit) {
      return handleJuroLegalCorpusReadToolRequest(new Request(input, init), { DB: db });
    },
  } as Fetcher;
}

test("renamed JURO tools search, inspect and hydrate through the read-only boundary", async () => {
  assert.deepEqual(JURO_LEGAL_CORPUS_TOOL_NAMES, {
    findLegalSources: "find_juro_legal_sources",
    inspectLegalAct: "inspect_juro_legal_act",
    readLegalProvisions: "read_juro_legal_provisions",
    hydrateLegalSources: "hydrate_juro_legal_sources",
  });
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seedOfficialProvision(sqlite);
    const tools = createJuroLegalCorpusReadServiceTools({ service: inProcessService(d1) });
    const sources = await tools.findLegalSources({
      query: "прекращение трудового договора",
      locale: "ru",
      limit: 8,
    });
    assert.equal(sources[0]?.chunkId, chunkId);
    const [{ act, spans }] = await tools.hydrateLegalSources!({ anchorChunkIds: [chunkId] });
    assert.equal(act?.title, "Трудовой кодекс");
    assert.equal(spans[0]?.id, chunkId);
    assert.equal(spans[0]?.textSha256, sources[0]?.contentHash);
  } finally {
    sqlite.close();
  }
});

test("remote search strips every tenant and user locator before crossing environments", async () => {
  let packet: Record<string, unknown> | undefined;
  const service = {
    async fetch(input: RequestInfo | URL, init?: RequestInit) {
      const request = new Request(input, init);
      packet = await request.json() as Record<string, unknown>;
      return Response.json({ result: [] });
    },
  } as Fetcher;
  const tools = createJuroLegalCorpusReadServiceTools({ service });
  await tools.findLegalSources({
    query: "public law",
    locale: "ru",
    scope: {
      tenantId: "tenant-secret",
      userId: "user-secret",
      matterId: "matter-secret",
      includeHistorical: true,
      asOfDate: "2026-08-01",
    },
  });
  assert.deepEqual(packet?.scope, {
    includeHistorical: true,
    asOfDate: "2026-08-01",
  });
  assert.doesNotMatch(JSON.stringify(packet), /tenant-secret|user-secret|matter-secret/u);
});

test("read service rejects non-JSON, oversized and malformed response packets", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const path = `/internal/legal-corpus/read-tools/${JURO_LEGAL_CORPUS_TOOL_NAMES.findLegalSources}`;
    const method = await handleJuroLegalCorpusReadToolRequest(
      new Request(`http://legal-corpus.internal${path}`),
      { DB: d1 },
    );
    assert.equal(method.status, 405);
    const media = await handleJuroLegalCorpusReadToolRequest(
      new Request(`http://legal-corpus.internal${path}`, { method: "POST", body: "{}" }),
      { DB: d1 },
    );
    assert.equal(media.status, 415);
    const oversized = await handleJuroLegalCorpusReadToolRequest(
      new Request(`http://legal-corpus.internal${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "x".repeat(17_000), locale: "ru" }),
      }),
      { DB: d1 },
    );
    assert.equal(oversized.status, 413);

    const invalidService = {
      async fetch() { return Response.json({ result: [{ untrusted: true }] }); },
    } as unknown as Fetcher;
    await assert.rejects(
      () => createJuroLegalCorpusReadServiceTools({ service: invalidService })
        .findLegalSources({ query: "public law", locale: "ru" }),
      (error: unknown) => error instanceof JuroLegalCorpusReadServiceError
        && error.code === "INVALID_RESPONSE",
    );
  } finally {
    sqlite.close();
  }
});
