import assert from "node:assert/strict";
import test from "node:test";

import {
  compactLegacySparseJsonBatch,
  loadSparseTermEntriesByChunk,
} from "../lib/legal-corpus/sparse-index";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

function seedSparseChunks(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"]): void {
  const now = "2026-08-16T00:00:00.000Z";
  const hash = "a".repeat(64);
  sqlite.prepare(`INSERT INTO legal_corpus_documents (
    id,provider,jurisdiction,source_class,scope,visibility,title,availability_status,
    trusted,verification_status,approval_required,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    "lexuz:sparse", "lex_uz", "UZ", "OFFICIAL_LEGISLATION", "global", "global",
    "Sparse act", "ready", 1, "official_source", 0, now, now,
  );
  sqlite.prepare(`INSERT INTO legal_corpus_variants (
    id,document_id,language,is_official_language_version,last_verified_at,current_version_id,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?)`).run(
    "lexuz:sparse:ru", "lexuz:sparse", "ru", 1, now, "lexuz:sparse:ru:v1", now, now,
  );
  sqlite.prepare(`INSERT INTO legal_corpus_versions (
    id,variant_id,version_number,status,version_date,content_sha256,normalized_object_key,
    fetched_at,change_type,created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    "lexuz:sparse:ru:v1", "lexuz:sparse:ru", 1, "active", "2026-08-16", hash,
    "legal/sparse/normalized.json", now, "new", now,
  );
  sqlite.prepare(`INSERT INTO legal_corpus_provisions (
    id,document_id,variant_id,version_id,sequence,text,exact_quote_source,language,status,
    content_sha256,created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    "lexuz:sparse:ru:v1:p0", "lexuz:sparse", "lexuz:sparse:ru", "lexuz:sparse:ru:v1",
    0, "Sparse source text", "Sparse source text", "ru", "active", hash, now,
  );
  for (let index = 0; index < 5; index += 1) {
    const legacyEntries = index === 3
      ? [
        { term: "term3", termFrequency: 1, titleFrequency: 0, articleFrequency: 0 },
        { term: "extra3", termFrequency: 1, titleFrequency: 0, articleFrequency: 0 },
      ]
      : [{ term: `term${index}`, termFrequency: 1, titleFrequency: 0, articleFrequency: 0 }];
    sqlite.prepare(`INSERT INTO legal_corpus_chunks (
      id,provision_id,version_id,chunk_index,total_chunks,content_text,content_sha256,
      sparse_terms_json,indexed_at,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      `chunk:${index}`, "lexuz:sparse:ru:v1:p0", "lexuz:sparse:ru:v1", index, 5,
      `Sparse source text ${index}`, hash,
      JSON.stringify(legacyEntries),
      now, now,
    );
  }
  for (let index = 0; index < 2; index += 1) {
    sqlite.prepare(`INSERT INTO legal_corpus_sparse_terms (
      term,chunk_id,document_id,version_id,language,term_frequency,title_frequency,article_frequency
    ) VALUES (?,?,?,?,?,?,?,?)`).run(
      `term${index}`, `chunk:${index}`, "lexuz:sparse", "lexuz:sparse:ru:v1", "ru", 1, 0, 0,
    );
  }
  sqlite.prepare(`INSERT INTO legal_corpus_sparse_terms (
    term,chunk_id,document_id,version_id,language,term_frequency,title_frequency,article_frequency
  ) VALUES (?,?,?,?,?,?,?,?),(?,?,?,?,?,?,?,?)`).run(
    "term3", "chunk:3", "lexuz:sparse", "lexuz:sparse:ru:v1", "ru", 1, 0, 0,
    "term4", "chunk:4", "lexuz:sparse", "lexuz:sparse:ru:v1", "ru", 2, 0, 0,
  );
}

test("normalized sparse rows feed Qdrant and gate bounded legacy JSON compaction", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const sparseIndexes = sqlite.prepare("PRAGMA index_list('legal_corpus_sparse_terms')")
      .all() as Array<{ name: string }>;
    assert.equal(
      sparseIndexes.some((index) => index.name === "legal_corpus_sparse_chunk_idx"),
      true,
    );
    assert.equal(
      sparseIndexes.some((index) => index.name === "legal_corpus_sparse_version_idx"),
      false,
    );
    seedSparseChunks(sqlite);
    const loaded = await loadSparseTermEntriesByChunk(d1, ["chunk:0", "chunk:1"]);
    assert.deepEqual(loaded.get("chunk:0"), [{
      term: "term0", termFrequency: 1, titleFrequency: 0, articleFrequency: 0,
    }]);
    await assert.rejects(
      () => loadSparseTermEntriesByChunk(d1, ["chunk:0", "chunk:2"]),
      /LEGAL_CORPUS_SPARSE_VECTOR_REJECTED/u,
    );

    assert.equal(await compactLegacySparseJsonBatch(d1, 1), 1);
    assert.equal(await compactLegacySparseJsonBatch(d1, 1), 1);
    assert.equal(await compactLegacySparseJsonBatch(d1, 1), 0);
    const rows = sqlite.prepare(`SELECT id,sparse_terms_json AS sparseTermsJson
      FROM legal_corpus_chunks ORDER BY id`).all() as Array<{ id: string; sparseTermsJson: string }>;
    assert.deepEqual(rows.map((row) => [row.id, row.sparseTermsJson === "[]"]), [
      ["chunk:0", true],
      ["chunk:1", true],
      ["chunk:2", false],
      ["chunk:3", false],
      ["chunk:4", false],
    ]);
  } finally {
    sqlite.close();
  }
});
