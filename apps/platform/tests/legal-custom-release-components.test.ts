import assert from "node:assert/strict";
import test from "node:test";

import { recordCustomReleaseGovernance, type CustomReleaseGovernance } from "../lib/legal-corpus/custom-release-governance";
import { createReleaseLifecycle } from "../lib/legal-corpus/target-release";
import { recordReleaseObservation } from "../lib/legal-corpus/target-governance";

import { sqliteD1FixtureFromDirectory } from "./helpers/sqlite-d1";

const RELEASE_ID = "release:staging:current:custom-v1:2026-09-03";
const HASH = "a".repeat(64);

function fixture(sqlite = sqliteD1FixtureFromDirectory(new URL("../legal-drizzle/", import.meta.url)).sqlite) {
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

function boundedGovernance(): CustomReleaseGovernance {
  const ref = { key: "recovery/accepted.json", sha256: HASH };
  return {
    policy: "legal-corpus-verification-20260905", id: "governance-current", releaseId: RELEASE_ID,
    environment: "staging", capability: "current", reconciliationRunId: "build-current",
    recordedAt: "2026-09-06T00:01:00.000Z",
    build: { result: ref, sourceRootSha256: HASH, sparseManifestSha256: HASH,
      vectorInventorySha256: HASH, vectorizeIndexName: "juro-legal-current-custom-20260903",
      finalMutationId: "mutation-1", chunkCount: 1, materializationComplete: true,
      sparseReductionComplete: true, vectorizeFullListReconciled: true },
    configuration: { identity: "configuration:custom-hybrid-v1", sha256: HASH,
      gatewayIdentity: "juro-ai-search-staging", gatewayAuthenticated: true,
      gatewayPayloadLogging: false, gatewayCaching: false, model: "text-embedding-3-large",
      dimensions: 1536, fusionPolicy: "equal-rrf-k60-v1" },
    privacy: { attestationSha256: HASH, deterministicTransformAttested: true,
      contentFreeTelemetryAttested: true, productionDisclosureAccepted: false,
      productionEmbeddingDataControlsApproved: false, stagingQueriesSyntheticOrNonPersonal: true },
    capacity: { databaseId: "10c71209-7cf6-47c3-a74e-9697e32d7c29", projectedBytes: 6_400_000_000 },
    cost: { authorizedCostUsd: 16, reservedCostUsd: 13, migrationBudgetKind: "current",
      completeMigrationCostUsd: 13, monthlyProductionQueryCostUsd: 0, evaluationCostUsd: 0.01,
      unpricedRequests: 0 },
    recovery: ref, rollbackHealthy: true,
    smoke: { result: ref, startedAt: "2026-09-06T00:00:00.000Z",
      completedAt: "2026-09-06T00:01:00.000Z", requestCount: 6,
      checks: ["russian", "uzbek_latin", "uzbek_cyrillic", "english", "exact_citation",
        "general_question", "source_ladder_failure"].map(name => ({
          name: name as CustomReleaseGovernance["smoke"]["checks"][number]["name"], passed: true,
        })) },
  };
}

function customGovernanceFixture() {
  const database = sqliteD1FixtureFromDirectory(new URL("../legal-drizzle/", import.meta.url));
  fixture(database.sqlite);
  insertComponent(database.sqlite);
  database.sqlite.prepare(`INSERT INTO legal_migration_reconciliation_reports
    (run_id,environment,release_id,capability,input_sha256,report_sha256,status,report_json,created_at)
    VALUES (?,?,?,?,?,?,'clean','{}',?)`).run("build-current", "staging", RELEASE_ID, "current",
    HASH, HASH, "2026-09-03T00:00:00.000Z");
  return database;
}

test("custom release seals and activates from accepted build roots and bounded smoke without duplicate proofs", async () => {
  const { sqlite, d1 } = customGovernanceFixture();
  try {
    assert.deepEqual(await recordCustomReleaseGovernance({ db: d1 }, boundedGovernance()), {
      passed: true, failures: [],
    });
    const lifecycle = createReleaseLifecycle({ db: d1 });
    await lifecycle.sealCustomSearchRelease({ releaseId: RELEASE_ID,
      environment: "staging", createdAt: "2026-09-06T00:02:00.000Z" });
    const active = await lifecycle.activateCurrent({ currentReleaseId: RELEASE_ID,
      environment: "staging", actor: "test", reason: "Accept the recorded capability smoke.",
      createdAt: "2026-09-08T00:00:00.000Z" });
    assert.equal(active.currentReleaseId, RELEASE_ID);
    assert.equal(active.asOfReleaseId, null);
    assert.equal(active.comparisonHistoryReleaseId, null);
  } finally { sqlite.close(); }
});

test("custom governance rejects changed roots, missing checks, unsafe privacy, and spend or capacity excess", async () => {
  const mutations: Array<(input: CustomReleaseGovernance) => void> = [
    input => { input.build.finalMutationId = "changed"; },
    input => { input.build.result.sha256 = "b".repeat(64); },
    input => { input.build.vectorizeFullListReconciled = false; },
    input => { input.smoke.checks.pop(); },
    input => { input.smoke.checks[0]!.passed = false; },
    input => { input.smoke.completedAt = "2026-09-06T00:11:00.000Z"; },
    input => { input.configuration.gatewayPayloadLogging = true; },
    input => { input.privacy.deterministicTransformAttested = false; },
    input => { input.cost.reservedCostUsd = 17; },
    input => { input.capacity.projectedBytes = 7_000_000_000; },
  ];
  for (const mutate of mutations) {
    const { sqlite, d1 } = customGovernanceFixture();
    try {
      const input = boundedGovernance(); mutate(input);
      assert.equal((await recordCustomReleaseGovernance({ db: d1 }, input)).passed, false);
    } finally { sqlite.close(); }
  }
});

test("custom runtime mappings are body-free, immutable, and query spend is capped before dispatch", () => {
  const sqlite = fixture();
  const itemKey = `${RELEASE_ID}/retrieval-chunk-v1:${"b".repeat(64)}`;
  sqlite.prepare(`INSERT INTO legal_custom_search_runtime_items
    (search_release_id,item_key,retrieval_chunk_id,item_ordinal,legal_identity_sha256)
    VALUES (?,?,?,?,?)`).run(RELEASE_ID, itemKey,
    `retrieval-chunk-v1:${"b".repeat(64)}`, 1_000, HASH);
  const columns = sqlite.prepare("PRAGMA table_info(legal_custom_search_runtime_items)")
    .all().map((row) => String((row as { name: string }).name));
  assert.equal(columns.some((column) => /(?:body|text|quotation|embedding)/iu.test(column)), false);
  assert.throws(() => sqlite.prepare(`UPDATE legal_custom_search_runtime_items
    SET item_ordinal=2 WHERE search_release_id=?`).run(RELEASE_ID),
  /LEGAL_CUSTOM_SEARCH_RUNTIME_IMMUTABLE/u);

  sqlite.prepare(`INSERT INTO legal_custom_query_budget_periods
    (environment,period,authorized_usd_micros,reserved_usd_micros,reserved_requests,created_at)
    VALUES ('staging','evaluation',1065,0,0,?)`).run("2026-09-06T00:00:00.000Z");
  const reserved = sqlite.prepare(`UPDATE legal_custom_query_budget_periods
    SET reserved_usd_micros=reserved_usd_micros+1065,reserved_requests=reserved_requests+1
    WHERE environment='staging' AND period='evaluation'
      AND reserved_usd_micros+1065<=authorized_usd_micros RETURNING reserved_usd_micros`).get();
  assert.deepEqual({ ...reserved as Record<string, unknown> }, { reserved_usd_micros: 1065 });
  assert.equal(sqlite.prepare(`UPDATE legal_custom_query_budget_periods
    SET reserved_usd_micros=reserved_usd_micros+1065,reserved_requests=reserved_requests+1
    WHERE environment='staging' AND period='evaluation'
      AND reserved_usd_micros+1065<=authorized_usd_micros`).run().changes, 0);
});

test("a failure observed after accepted custom smoke blocks reactivation", async () => {
  const { sqlite, d1 } = customGovernanceFixture();
  try {
    await recordCustomReleaseGovernance({ db: d1 }, boundedGovernance());
    const lifecycle = createReleaseLifecycle({ db: d1 });
    await lifecycle.sealCustomSearchRelease({ releaseId: RELEASE_ID,
      environment: "staging", createdAt: "2026-09-06T00:02:00.000Z" });
    await recordReleaseObservation({ db: d1 }, { id: "later-failure", releaseId: RELEASE_ID,
      environment: "staging", phase: "staging_soak", observedAt: "2026-09-06T00:03:00.000Z",
      requestCount: 1, green: false, gateBreachCount: 1 });
    await assert.rejects(() => lifecycle.activateCurrent({ currentReleaseId: RELEASE_ID,
      environment: "staging", actor: "test", reason: "Do not activate a known failing release.",
      createdAt: "2026-09-06T00:04:00.000Z" }), /ACTIVATION_REJECTED/u);
  } finally { sqlite.close(); }
});

test("a later failed governance receipt wins across equivalent timestamp offsets", async () => {
  const { sqlite, d1 } = customGovernanceFixture();
  try {
    const accepted = boundedGovernance();
    accepted.recordedAt = "2026-09-06T09:01:00+09:00";
    await recordCustomReleaseGovernance({ db: d1 }, accepted);
    const lifecycle = createReleaseLifecycle({ db: d1 });
    await lifecycle.sealCustomSearchRelease({ releaseId: RELEASE_ID,
      environment: "staging", createdAt: "2026-09-06T00:01:30.000Z" });
    const failed = boundedGovernance();
    failed.id = "later-failed-governance";
    failed.recordedAt = "2026-09-06T00:02:00.000Z";
    failed.rollbackHealthy = false;
    await recordCustomReleaseGovernance({ db: d1 }, failed);
    await assert.rejects(() => lifecycle.activateCurrent({ currentReleaseId: RELEASE_ID,
      environment: "staging", actor: "test", reason: "Do not hide the later failed governance.",
      createdAt: "2026-09-06T00:03:00.000Z" }), /ACTIVATION_REJECTED/u);
  } finally { sqlite.close(); }
});
