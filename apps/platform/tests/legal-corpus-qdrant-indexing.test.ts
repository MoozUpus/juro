import assert from "node:assert/strict";
import test from "node:test";

import {
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
    "Official provision content", hash,
    JSON.stringify([{ term: "article", termFrequency: 1, titleFrequency: 2, articleFrequency: 3 }]), now, now,
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
        assertCompatible: async () => { compatibilityChecks += 1; },
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
