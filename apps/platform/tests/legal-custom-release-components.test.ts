import assert from "node:assert/strict";
import test from "node:test";

import { sqliteD1FixtureFromDirectory } from "./helpers/sqlite-d1";

const RELEASE_ID = "release:staging:current:custom-v1:2026-09-03";
const HASH = "a".repeat(64);

function fixture() {
  const { sqlite } = sqliteD1FixtureFromDirectory(new URL("../legal-drizzle/", import.meta.url));
  sqlite.prepare(`INSERT INTO legal_corpus_snapshots
    (id,environment,corpus_hash,member_count,status,frozen_at,created_at)
    VALUES (?,?,?,?,?,?,?)`).run(
      "snapshot:staging:current:source-snapshot-v1",
      "staging",
      HASH,
      1,
      "frozen",
      "2026-09-03T00:00:00.000Z",
      "2026-09-03T00:00:00.000Z",
    );
  sqlite.prepare(`INSERT INTO legal_search_releases
    (id,environment,capability,corpus_snapshot_id,status,item_count,
      retrieval_policy_version,configuration_identity,sealed_at,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      RELEASE_ID,
      "staging",
      "current",
      "snapshot:staging:current:source-snapshot-v1",
      "draft",
      1,
      "custom-hybrid-v1",
      "configuration:custom-hybrid-v1",
      null,
      "2026-09-03T00:00:00.000Z",
    );
  return sqlite;
}

function componentValues(overrides: Record<string, unknown> = {}) {
  return {
    search_release_id: RELEASE_ID,
    schema_version: "custom-search-release-v1",
    source_root_sha256: HASH,
    chunk_policy_version: "retrieval-chunk-v1",
    chunk_inventory_r2_key: "search-releases/release/chunks/manifest.json",
    chunk_inventory_sha256: HASH,
    chunk_count: 1,
    sparse_analyzer: "word-v1",
    sparse_partition_count: 16,
    sparse_manifest_r2_key: "search-releases/release/sparse/manifest.json",
    sparse_manifest_sha256: HASH,
    embedding_input_version: "legal-embedding-input-v1",
    embedding_model: "text-embedding-3-large",
    embedding_dimensions: 1536,
    embedding_transform_version: "float32-l2-v1",
    embedding_inventory_r2_key: "search-releases/release/dense/manifest.json",
    embedding_inventory_sha256: HASH,
    vectorize_index_name: "juro-legal-current-custom-20260903",
    vectorize_final_mutation_id: "mutation-1",
    vectorize_inventory_r2_key: "search-releases/release/vectorize/manifest.json",
    vectorize_inventory_sha256: HASH,
    vector_count: 1,
    metadata_indexes_json: "[\"document_type\",\"language\",\"valid_from_epoch\",\"valid_to_epoch\"]",
    metadata_indexes_sha256: HASH,
    fusion_policy_version: "equal-rrf-k60-v1",
    provider_input_tokens: 0,
    provider_cost_usd_micros: 0,
    configuration_sha256: HASH,
    privacy_attestation_sha256: HASH,
    restore_preflight_sha256: HASH,
    sealed_at: "2026-09-03T00:00:01.000Z",
    ...overrides,
  };
}

const columns = [
  "search_release_id", "schema_version", "source_root_sha256", "chunk_policy_version",
  "chunk_inventory_r2_key", "chunk_inventory_sha256", "chunk_count", "sparse_analyzer",
  "sparse_partition_count", "sparse_manifest_r2_key", "sparse_manifest_sha256",
  "embedding_input_version", "embedding_model", "embedding_dimensions",
  "embedding_transform_version", "embedding_inventory_r2_key", "embedding_inventory_sha256",
  "vectorize_index_name", "vectorize_final_mutation_id", "vectorize_inventory_r2_key",
  "vectorize_inventory_sha256", "vector_count", "metadata_indexes_json",
  "metadata_indexes_sha256", "fusion_policy_version", "provider_input_tokens",
  "provider_cost_usd_micros", "configuration_sha256", "privacy_attestation_sha256",
  "restore_preflight_sha256", "sealed_at",
] as const;

function insertComponent(sqlite: ReturnType<typeof fixture>, overrides: Record<string, unknown> = {}) {
  const values = componentValues(overrides);
  sqlite.prepare(`INSERT INTO legal_custom_search_release_components
    (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`)
    .run(...columns.map((column) => values[column]));
}

test("custom component receipt pins both lanes and is immutable", () => {
  const sqlite = fixture();
  insertComponent(sqlite);

  const row = sqlite.prepare(`SELECT sparse_analyzer,sparse_partition_count,
    embedding_model,embedding_dimensions,fusion_policy_version,vector_count,chunk_count
    FROM legal_custom_search_release_components WHERE search_release_id=?`).get(RELEASE_ID);
  assert.deepEqual({ ...row as Record<string, unknown> }, {
    sparse_analyzer: "word-v1",
    sparse_partition_count: 16,
    embedding_model: "text-embedding-3-large",
    embedding_dimensions: 1536,
    fusion_policy_version: "equal-rrf-k60-v1",
    vector_count: 1,
    chunk_count: 1,
  });
  assert.throws(() => sqlite.prepare(`UPDATE legal_custom_search_release_components
    SET provider_input_tokens=1 WHERE search_release_id=?`).run(RELEASE_ID),
  /LEGAL_CUSTOM_SEARCH_RELEASE_IMMUTABLE/u);
  assert.throws(() => sqlite.prepare(`DELETE FROM legal_custom_search_release_components
    WHERE search_release_id=?`).run(RELEASE_ID), /LEGAL_CUSTOM_SEARCH_RELEASE_IMMUTABLE/u);
});

test("custom component receipt rejects incomplete metadata and lane parity", () => {
  const sqlite = fixture();
  assert.throws(() => insertComponent(sqlite, {
    metadata_indexes_json: "[\"language\"]",
  }), /CHECK constraint failed/u);
  assert.throws(() => insertComponent(sqlite, { vector_count: 0 }), /CHECK constraint failed/u);
});

test("custom component receipt stores roots and counters but no index internals", () => {
  const sqlite = fixture();
  const columns = sqlite.prepare("PRAGMA table_info(legal_custom_search_release_components)")
    .all().map((row) => String((row as { name: string }).name));
  assert.equal(columns.some((column) => /(?:term|posting|position|vector_bytes|body|text)/iu.test(column)), false);
});

test("custom source planning has a release-and-rendition lookup index", () => {
  const sqlite = fixture();
  const indexes = sqlite.prepare("PRAGMA index_list('legal_search_release_items')").all();
  const indexedColumns = indexes.map((row) => {
    const name = String((row as { name: string }).name);
    return sqlite.prepare(`PRAGMA index_info('${name.replaceAll("'", "''")}')`).all()
      .map((column) => String((column as { name: string }).name));
  });

  assert.ok(indexedColumns.some((columns) => (
    columns[0] === "search_release_id" && columns[1] === "provision_rendition_id"
  )));
});
