import assert from "node:assert/strict";
import test from "node:test";

import {
  reconcileLegalSearchIndexBuildBatch,
  runNextLegalSearchIndexBuildBatch,
} from "../lib/legal-corpus/qdrant-indexing";
import {
  activateLegalSearchIndex,
  finalizeLegalSearchIndexBuild,
  resolveActiveLegalSearchIndex,
  startLegalSearchIndexBuild,
} from "../lib/legal-corpus/search-index-manifest";
import type { QdrantCorpusPoint } from "../lib/legal-corpus/qdrant";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

function seedCurrentVersion(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"]): void {
  const now = "2026-08-30T00:00:00.000Z";
  const hash = "a".repeat(64);
  sqlite.prepare(`INSERT INTO legal_corpus_documents (
    id,provider,jurisdiction,source_class,scope,visibility,canonical_url,title,document_type,
    availability_status,trusted,verification_status,approval_required,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    "lexuz:build", "lex_uz", "UZ", "OFFICIAL_LEGISLATION", "global", "global",
    "https://lex.uz/ru/docs/408", "Трудовой кодекс", "code", "ready", 1,
    "official_source", 0, now, now,
  );
  sqlite.prepare(`INSERT INTO legal_corpus_variants (
    id,document_id,language,is_official_language_version,source_url,last_verified_at,
    current_version_id,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?)`).run(
    "lexuz:build:ru", "lexuz:build", "ru", 1, "https://lex.uz/ru/docs/408", now,
    "lexuz:build:ru:v1", now, now,
  );
  sqlite.prepare(`INSERT INTO legal_corpus_versions (
    id,variant_id,version_number,status,valid_from,version_date,content_sha256,
    normalized_object_key,source_url,fetched_at,change_type,created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    "lexuz:build:ru:v1", "lexuz:build:ru", 1, "active", "2026-01-01", "2026-01-01",
    hash, "legal/build.json", "https://lex.uz/ru/docs/408", now, "new", now,
  );
  for (const [index, article] of ["408", "409"].entries()) {
    const provisionId = `lexuz:build:ru:v1:p${index}`;
    const chunkId = `${provisionId}:c0`;
    const text = `Статья ${article}. Гарантия работнику ${index}`;
    sqlite.prepare(`INSERT INTO legal_corpus_provisions (
      id,document_id,variant_id,version_id,article_number,article_number_normalized,
      article_title,sequence,text,exact_quote_source,language,status,valid_from,source_url,
      content_sha256,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      provisionId, "lexuz:build", "lexuz:build:ru", "lexuz:build:ru:v1", article,
      article, `Статья ${article}`, index, text, text, "ru", "active", "2026-01-01",
      "https://lex.uz/ru/docs/408", hash, now,
    );
    sqlite.prepare(`INSERT INTO legal_corpus_chunks (
      id,provision_id,version_id,chunk_index,total_chunks,content_text,content_sha256,
      sparse_terms_json,dense_vector_id,indexed_at,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      chunkId, provisionId, "lexuz:build:ru:v1", 0, 1, text, hash, "[]",
      `legacy-vector-${index}`, now, now,
    );
    sqlite.prepare(`INSERT INTO legal_corpus_sparse_terms (
      term,chunk_id,document_id,version_id,language,term_frequency,title_frequency,
      article_frequency
    ) VALUES (?,?,?,?,?,?,?,?)`).run(
      article, chunkId, "lexuz:build", "lexuz:build:ru:v1", "ru", 1, 1, 1,
    );
  }
}

test("a frozen search build advances independently and activates only after exact completion", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const points: QdrantCorpusPoint[] = [];
  try {
    seedCurrentVersion(sqlite);
    const build = await startLegalSearchIndexBuild({
      db: d1,
      environment: "staging",
      manifestId: "staging-provision-v1",
      qdrantCollection: "juro_legal_staging_provision_v1",
      sparseSchemaVersion: "compressed-v1",
      embeddingModel: "text-embedding-3-large",
      embeddingSchemaVersion: "provision-metadata-v1",
      rerankerModel: "text-embedding-3-large",
      rerankerVersion: "provision-set-v1",
      now: new Date("2026-08-30T01:00:00.000Z"),
    });
    assert.equal(build.variantCount, 1);
    assert.equal(build.chunkCount, 2);
    assert.equal(build.indexedChunkCount, 0);

    const dependencies = {
      maxChunks: 1,
      now: new Date("2026-08-30T01:05:00.000Z"),
      client: {
        ensureCompatible: async () => "existing" as const,
        ensureSearchPayloadIndexes: async () => undefined,
        upsert: async (batch: QdrantCorpusPoint[]) => { points.push(...batch); },
      },
      embeddings: {
        embed: async (inputs: readonly string[]) => inputs.map(() =>
          Array.from({ length: 1536 }, () => 0.01)),
      },
    };
    assert.deepEqual(await runNextLegalSearchIndexBuildBatch({
      APP_ENV: "staging", DB: d1, LEGAL_CORPUS_ENABLED: "true",
      LEGAL_CORPUS_DENSE_ENABLED: "true", QDRANT_URL: "https://qdrant.internal.example",
      QDRANT_API_KEY: "secret", QDRANT_COLLECTION: "ignored",
    }, "staging-provision-v1", dependencies), {
      status: "indexed", manifestId: "staging-provision-v1", chunkCount: 1,
      indexedChunkCount: 1, remainingChunkCount: 1,
    });
    const second = await runNextLegalSearchIndexBuildBatch({
      APP_ENV: "staging", DB: d1, LEGAL_CORPUS_ENABLED: "true",
      LEGAL_CORPUS_DENSE_ENABLED: "true", QDRANT_URL: "https://qdrant.internal.example",
      QDRANT_API_KEY: "secret", QDRANT_COLLECTION: "ignored",
    }, "staging-provision-v1", dependencies);
    assert.equal(second.status, "complete");
    assert.equal(second.remainingChunkCount, 0);
    assert.equal(points.length, 2);
    assert.equal(points[0]?.provisionId, "lexuz:build:ru:v1:p0");

    const legacy = sqlite.prepare(
      "SELECT group_concat(dense_vector_id, ',') AS ids FROM legal_corpus_chunks ORDER BY id",
    ).get() as { ids: string };
    assert.equal(legacy.ids, "legacy-vector-0,legacy-vector-1");

    await assert.rejects(() => finalizeLegalSearchIndexBuild({
      db: d1, environment: "staging", manifestId: "staging-provision-v1",
      densePointCount: 1,
    }), /LEGAL_SEARCH_BUILD_COUNT_MISMATCH/u);
    const manifest = await finalizeLegalSearchIndexBuild({
      db: d1, environment: "staging", manifestId: "staging-provision-v1",
      densePointCount: 2,
    });
    assert.equal(manifest.densePointCount, 2);
    assert.deepEqual(await finalizeLegalSearchIndexBuild({
      db: d1, environment: "staging", manifestId: "staging-provision-v1",
      densePointCount: 2,
    }), manifest);
    points.length = 0;
    const reconciled = await reconcileLegalSearchIndexBuildBatch(
      {
        APP_ENV: "staging", DB: d1, LEGAL_CORPUS_ENABLED: "true",
        LEGAL_CORPUS_DENSE_ENABLED: "true", QDRANT_URL: "https://qdrant.internal.example",
        QDRANT_API_KEY: "secret", QDRANT_COLLECTION: "ignored",
      },
      "staging-provision-v1",
      "",
      256,
      {
        client: {
          ensureCompatible: async () => "created" as const,
          existingPointIds: async () => new Set<string>(),
          upsert: async (batch: QdrantCorpusPoint[]) => { points.push(...batch); },
        },
        embeddings: dependencies.embeddings,
      },
    );
    assert.equal(reconciled.status, "complete");
    assert.equal(reconciled.repairedChunkCount, 2);
    assert.equal(points.length, 2);
    await activateLegalSearchIndex({
      db: d1, environment: "staging", manifestId: manifest.manifestId,
      actor: "test", reason: "reviewed local canaries passed", canaryPassed: true,
      now: new Date("2026-08-30T01:10:00.000Z"),
    });
    assert.equal((await resolveActiveLegalSearchIndex(d1, "staging"))?.manifestId,
      "staging-provision-v1");
  } finally {
    sqlite.close();
  }
});
