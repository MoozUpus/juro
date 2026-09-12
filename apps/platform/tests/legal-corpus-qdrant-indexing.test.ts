import assert from "node:assert/strict";
import test from "node:test";

import {
  runNextLegalCorpusQdrantBackfillBatch,
  syncLegalCorpusVersionToQdrant,
} from "../lib/legal-corpus/qdrant-indexing";
import type { QdrantCorpusPoint } from "../lib/legal-corpus/qdrant";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

function seedVersion(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"]): void {
  const now = "2026-08-15T00:00:00.000Z";
  const hash = "c".repeat(64);
  sqlite.prepare(`INSERT INTO legal_corpus_documents (
    id,provider,jurisdiction,source_class,scope,visibility,canonical_url,title,document_type,
    availability_status,trusted,verification_status,approval_required,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    "lexuz:42", "lex_uz", "UZ", "OFFICIAL_LEGISLATION", "global", "global",
    "https://lex.uz/ru/docs/42", "Test act", "legal_act", "ready", 1, "official_source", 0, now, now,
  );
  sqlite.prepare(`INSERT INTO legal_corpus_variants (
    id,document_id,language,is_official_language_version,translation_type,source_url,last_verified_at,current_version_id,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    "lexuz:42:ru", "lexuz:42", "ru", 1, null, "https://lex.uz/ru/docs/42", now, "lexuz:42:ru:v2", now, now,
  );
  sqlite.prepare(`INSERT INTO legal_corpus_versions (
    id,variant_id,previous_version_id,version_number,status,valid_from,valid_to,version_date,content_sha256,
    raw_object_key,normalized_object_key,source_url,fetched_at,change_type,created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    "lexuz:42:ru:v1", "lexuz:42:ru", null, 1, "historical", "2025-01-01", "2026-01-01", "2025-01-01", "d".repeat(64),
    "legal/raw-v1", "legal/normalized-v1", "https://lex.uz/ru/docs/42", now, "new", now,
  );
  sqlite.prepare(`INSERT INTO legal_corpus_versions (
    id,variant_id,previous_version_id,version_number,status,valid_from,valid_to,version_date,content_sha256,
    raw_object_key,normalized_object_key,source_url,fetched_at,change_type,created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    "lexuz:42:ru:v2", "lexuz:42:ru", "lexuz:42:ru:v1", 2, "active", "2026-01-01", null, "2026-01-01", hash,
    "legal/raw", "legal/normalized", "https://lex.uz/ru/docs/42", now, "modified", now,
  );
  sqlite.prepare(`INSERT INTO legal_corpus_provisions (
    id,document_id,variant_id,version_id,article_number,article_number_normalized,article_title,sequence,text,
    exact_quote_source,language,status,valid_from,valid_to,source_url,content_sha256,created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    "lexuz:42:ru:v2:p0", "lexuz:42", "lexuz:42:ru", "lexuz:42:ru:v2", "12", "12", "Article 12", 0,
    "Official provision content", "Official provision content", "ru", "active", "2026-01-01", null,
    "https://lex.uz/ru/docs/42", hash, now,
  );
  sqlite.prepare(`INSERT INTO legal_corpus_chunks (
    id,provision_id,version_id,chunk_index,total_chunks,content_text,content_sha256,sparse_terms_json,indexed_at,created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    "lexuz:42:ru:v2:p0:c0", "lexuz:42:ru:v2:p0", "lexuz:42:ru:v2", 0, 1,
    "Official provision content", hash, "[]", now, now,
  );
  sqlite.prepare(`INSERT INTO legal_corpus_sparse_terms (
    term,chunk_id,document_id,version_id,language,term_frequency,title_frequency,article_frequency
  ) VALUES (?,?,?,?,?,?,?,?)`).run(
    "article", "lexuz:42:ru:v2:p0:c0", "lexuz:42", "lexuz:42:ru:v2", "ru", 1, 2, 3,
  );
}

function seedSecondChunk(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"]): void {
  const now = "2026-08-15T00:00:00.000Z";
  const hash = "e".repeat(64);
  sqlite.prepare(`INSERT INTO legal_corpus_provisions (
    id,document_id,variant_id,version_id,article_number,article_number_normalized,article_title,sequence,text,
    exact_quote_source,language,status,valid_from,valid_to,source_url,content_sha256,created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    "lexuz:42:ru:v2:p1", "lexuz:42", "lexuz:42:ru", "lexuz:42:ru:v2", "13", "13", "Article 13", 1,
    "Second official provision", "Second official provision", "ru", "active", "2026-01-01", null,
    "https://lex.uz/ru/docs/42", hash, now,
  );
  sqlite.prepare(`INSERT INTO legal_corpus_chunks (
    id,provision_id,version_id,chunk_index,total_chunks,content_text,content_sha256,sparse_terms_json,indexed_at,created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    "lexuz:42:ru:v2:p1:c0", "lexuz:42:ru:v2:p1", "lexuz:42:ru:v2", 0, 1,
    "Second official provision", hash, "[]", now, now,
  );
  sqlite.prepare(`INSERT INTO legal_corpus_sparse_terms (
    term,chunk_id,document_id,version_id,language,term_frequency,title_frequency,article_frequency
  ) VALUES (?,?,?,?,?,?,?,?)`).run(
    "second", "lexuz:42:ru:v2:p1:c0", "lexuz:42", "lexuz:42:ru:v2", "ru", 1, 1, 1,
  );
}

function markVersionAsNpaWithOneCanonicalChunk(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"]): void {
  const now = "2026-08-15T00:00:00.000Z";
  const hash = "d".repeat(64);
  // This fixture exercises the NPA-specific filter only; seedVersion supplies
  // the legal-corpus foreign rows and no target declaration is needed here.
  sqlite.prepare("PRAGMA foreign_keys=OFF").run();
  sqlite.prepare(`INSERT INTO npa_master_registry
    (document_key,lexuz_doc_id,legal_corpus_document_id,short_title,act_type,status,source,source_reference,
     content_checksum,last_checked_at,article_count,chunk_count,rag_enabled,created_at,updated_at)
    VALUES (?,?,?,?,?,'active','LexUZ',?,?,?,?,?,?,?,?)`).run(
    "test_npa", "42", "lexuz:42", "Test NPA", "law", "https://lex.uz/ru/docs/42",
    hash, now, 2, 1, 1, now, now,
  );
  sqlite.prepare(`INSERT INTO npa_document_versions
    (id,document_key,language,legal_corpus_variant_id,legal_corpus_version_id,
     version_effective_from,version_effective_to,version_as_of,status,normative_checksum,
     editorial_metadata_object_key,amendment_history_object_key,source_metadata_object_key,
     last_checked_at,rag_enabled,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,?,?,?)`).run(
    "npa:test_npa:ru:v2", "test_npa", "ru", "lexuz:42:ru", "lexuz:42:ru:v2",
    "2026-01-01", null, "2026-08-15", "active", hash, now, 1, now,
  );
  sqlite.prepare(`INSERT INTO npa_chunk_metadata
    (chunk_id,npa_document_version_id,structural_path,parent_context,article,part,chapter,section,content_checksum,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    "lexuz:42:ru:v2:p0:c0", "npa:test_npa:ru:v2", "Test NPA > Статья 12", "Test NPA > Статья 12",
    "12", null, null, null, hash, now,
  );
}

test("Qdrant sync is inert while the dense feature flag is false", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const result = await syncLegalCorpusVersionToQdrant({
      APP_ENV: "staging", DB: d1, LEGAL_CORPUS_DENSE_ENABLED: "false",
    }, "missing-version");
    assert.deepEqual(result, { status: "disabled", versionId: "missing-version", chunkCount: 0 });
  } finally {
    sqlite.close();
  }
});

test("Qdrant sync embeds only global official chunks, demotes the previous version and persists vector ids", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  seedVersion(sqlite);
  const points: QdrantCorpusPoint[] = [];
  const demoted: Array<{ versionId: string; isCurrent: boolean }> = [];
  let compatibilityChecks = 0;
  try {
    const result = await syncLegalCorpusVersionToQdrant({
      APP_ENV: "staging", DB: d1, LEGAL_CORPUS_DENSE_ENABLED: "true",
      QDRANT_URL: "https://qdrant.internal.example", QDRANT_API_KEY: "secret", QDRANT_COLLECTION: "legal",
    }, "lexuz:42:ru:v2", {
      now: new Date("2026-08-15T01:00:00.000Z"),
      client: {
        ensureCompatible: async () => { compatibilityChecks += 1; return "existing" as const; },
        setVersionCurrent: async (versionId, isCurrent) => { demoted.push({ versionId, isCurrent }); },
        upsert: async (batch) => { points.push(...batch); },
      },
      embeddings: {
        embed: async (inputs) => inputs.map(() => Array.from({ length: 1536 }, () => 0.01)),
      },
    });
    assert.deepEqual(result, { status: "indexed", versionId: "lexuz:42:ru:v2", chunkCount: 1 });
    assert.equal(compatibilityChecks, 1);
    assert.deepEqual(demoted, [{ versionId: "lexuz:42:ru:v1", isCurrent: false }]);
    assert.equal(points.length, 1);
    assert.equal(points[0]?.chunkId, "lexuz:42:ru:v2:p0:c0");
    assert.equal(points[0]?.isCurrent, true);
    assert.equal(points[0]?.sparse.indices.length, 1);
    assert.equal(points[0]?.sparse.values[0], 33);
    const stored = sqlite.prepare(
      "SELECT dense_vector_id AS denseVectorId,indexed_at AS indexedAt FROM legal_corpus_chunks",
    ).get() as { denseVectorId: string; indexedAt: string };
    assert.match(stored.denseVectorId, /^[0-9a-f-]{36}$/u);
    assert.equal(stored.indexedAt, "2026-08-15T01:00:00.000Z");
  } finally {
    sqlite.close();
  }
});

test("Qdrant sync excludes noncanonical physical NPA fragments", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  seedVersion(sqlite);
  seedSecondChunk(sqlite);
  markVersionAsNpaWithOneCanonicalChunk(sqlite);
  const points: QdrantCorpusPoint[] = [];
  try {
    const result = await syncLegalCorpusVersionToQdrant({
      APP_ENV: "staging", DB: d1, LEGAL_CORPUS_DENSE_ENABLED: "true",
      QDRANT_URL: "https://qdrant.internal.example", QDRANT_API_KEY: "secret", QDRANT_COLLECTION: "legal",
    }, "lexuz:42:ru:v2", {
      client: {
        ensureCompatible: async () => "existing" as const,
        setVersionCurrent: async () => undefined,
        upsert: async (batch) => { points.push(...batch); },
      },
      embeddings: {
        embed: async (inputs) => inputs.map(() => Array.from({ length: 1536 }, () => 0.01)),
      },
    });
    assert.deepEqual(result, { status: "indexed", versionId: "lexuz:42:ru:v2", chunkCount: 1 });
    assert.deepEqual(points.map((point) => point.chunkId), ["lexuz:42:ru:v2:p0:c0"]);
    const chunks = sqlite.prepare(`SELECT id,dense_vector_id AS denseVectorId
      FROM legal_corpus_chunks ORDER BY id`).all() as Array<{ id: string; denseVectorId: string | null }>;
    assert.equal(chunks.find((chunk) => chunk.id === "lexuz:42:ru:v2:p0:c0")?.denseVectorId === null, false);
    assert.equal(chunks.find((chunk) => chunk.id === "lexuz:42:ru:v2:p1:c0")?.denseVectorId, null);
  } finally {
    sqlite.close();
  }
});

test("Qdrant backfill resumes from persisted chunk ids and stops when current global corpus is complete", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  seedVersion(sqlite);
  seedSecondChunk(sqlite);
  const points: QdrantCorpusPoint[] = [];
  const env = {
    APP_ENV: "staging" as const,
    DB: d1,
    LEGAL_CORPUS_DENSE_ENABLED: "true",
    QDRANT_URL: "https://qdrant.internal.example",
    QDRANT_API_KEY: "secret",
    QDRANT_COLLECTION: "legal",
  };
  const dependencies = {
    maxChunks: 1,
    now: new Date("2026-08-15T01:00:00.000Z"),
    client: {
      ensureCompatible: async () => "existing" as const,
      setVersionCurrent: async () => undefined,
      upsert: async (batch: QdrantCorpusPoint[]) => { points.push(...batch); },
    },
    embeddings: {
      embed: async (inputs: readonly string[]) => inputs.map(() => Array.from({ length: 1536 }, () => 0.01)),
    },
  };
  try {
    const first = await runNextLegalCorpusQdrantBackfillBatch(env, dependencies);
    assert.deepEqual(first, {
      status: "indexed",
      versionId: "lexuz:42:ru:v2",
      chunkCount: 1,
      remainingChunkCount: 1,
    });
    const second = await runNextLegalCorpusQdrantBackfillBatch(env, dependencies);
    assert.deepEqual(second, {
      status: "indexed",
      versionId: "lexuz:42:ru:v2",
      chunkCount: 1,
      remainingChunkCount: 0,
    });
    assert.deepEqual(await runNextLegalCorpusQdrantBackfillBatch(env, dependencies), {
      status: "empty",
      versionId: null,
      chunkCount: 0,
      remainingChunkCount: 0,
    });
    assert.equal(points.length, 2);
    assert.equal(new Set(points.map((point) => point.id)).size, 2);
    const stored = sqlite.prepare(
      "SELECT count(*) AS count FROM legal_corpus_chunks WHERE dense_vector_id IS NOT NULL",
    ).get() as { count: number };
    assert.equal(Number(stored.count), 2);
  } finally {
    sqlite.close();
  }
});

test("Qdrant backfill is D1-inert while dense retrieval is disabled", async () => {
  let databaseCalls = 0;
  const result = await runNextLegalCorpusQdrantBackfillBatch({
    APP_ENV: "staging",
    LEGAL_CORPUS_DENSE_ENABLED: "false",
    DB: {
      prepare() {
        databaseCalls += 1;
        throw new Error("DB must remain untouched");
      },
    } as unknown as D1Database,
  });
  assert.deepEqual(result, {
    status: "disabled",
    versionId: null,
    chunkCount: 0,
    remainingChunkCount: 0,
  });
  assert.equal(databaseCalls, 0);
});
