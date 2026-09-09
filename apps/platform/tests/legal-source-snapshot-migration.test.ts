import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSourceSnapshotProjectionPlan,
  SourceSnapshotBuildInterruptedError,
  executeSourceSnapshotProjectionPlan,
  type SourceSnapshotBuildInput,
  type SourceSnapshotBuildStore,
} from "../lib/legal-corpus/source-snapshot";
import { sqliteD1FixtureFromDirectory } from "./helpers/sqlite-d1";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const CAPTURED_AT = "2026-08-31T06:26:27.225Z";

function representativeInput(): SourceSnapshotBuildInput {
  return {
    environment: "staging",
    cutoffAt: CAPTURED_AT,
    releaseId: "release:staging:current:source-snapshot-v1",
    shardCount: 2,
    configurationIdentity: "ai-search-staging-v1",
    sourceDocuments: [
      {
        publisher: "lex.uz",
        publisherDocumentToken: "lexuz-family:100:uz-Latn",
        languageTag: "uz-Latn",
        sourceUrl: "https://lex.uz/uz/docs/-100",
        legacyInstrumentId: "instrument:100",
        legacyExpressionId: "expression:100:uz-Latn",
      },
      {
        publisher: "lex.uz",
        publisherDocumentToken: "lexuz-family:100:ru",
        languageTag: "ru",
        sourceUrl: "https://lex.uz/ru/docs/100",
        legacyInstrumentId: "instrument:100",
        legacyExpressionId: "expression:100:ru",
      },
      {
        publisher: "lex.uz",
        publisherDocumentToken: "lexuz-family:200:en",
        languageTag: "en",
        sourceUrl: "https://lex.uz/en/docs/200",
        legacyInstrumentId: "instrument:200",
        legacyExpressionId: null,
      },
    ],
    snapshots: [
      {
        publisherDocumentToken: "lexuz-family:100:uz-Latn",
        publisherRevisionToken: "1:uz",
        languageTag: "uz-Latn",
        captureId: "capture:uz",
        capturedAt: CAPTURED_AT,
        rawLocatorId: "raw:uz",
        rawR2Key: "corpus/raw/uz/source.html",
        rawByteCount: 10,
        rawSha256: HASH_A,
        normalizedLocatorId: "normalized:uz",
        normalizedR2Key: "corpus/normalized/uz.json",
        normalizedByteCount: 20,
        normalizedSha256: HASH_B,
        legacyTextRevisionId: "revision:uz",
        legacyTextualAuthority: "unknown",
      },
      {
        publisherDocumentToken: "lexuz-family:100:ru",
        publisherRevisionToken: "1:ru",
        languageTag: "ru",
        captureId: "capture:ru",
        capturedAt: CAPTURED_AT,
        rawLocatorId: "raw:ru",
        rawR2Key: "corpus/raw/ru/source.html",
        rawByteCount: 11,
        rawSha256: HASH_B,
        normalizedLocatorId: "normalized:ru",
        normalizedR2Key: "corpus/normalized/ru.json",
        normalizedByteCount: 21,
        normalizedSha256: HASH_C,
        legacyTextRevisionId: "revision:ru",
        legacyTextualAuthority: "unknown",
      },
    ],
    provisions: [
      {
        publisherDocumentToken: "lexuz-family:100:uz-Latn",
        legacyTextRevisionId: "revision:uz",
        legacyProvisionRenditionId: "rendition:uz",
        sourcePositionToken: "article:1:sequence:0",
        articleNumber: "1",
        articleTitle: "Purpose",
        sequence: 0,
        documentType: "Law",
        provisionText: "Eligible current provision.",
        provisionLocatorId: "provision:uz",
        provisionR2Key: "corpus/provisions/uz.json",
        provisionByteCount: 30,
        provisionSha256: HASH_A,
        sourceNormalizedSha256: HASH_B,
        sourceUrl: "https://lex.uz/uz/docs/-100",
        temporalState: "current_supported",
        currentPointerVerified: true,
        privacyClass: "public_official_source",
        quarantined: false,
        canonicalizationConflict: false,
        legacyTextualAuthority: "unknown",
      },
      {
        publisherDocumentToken: "lexuz-family:100:ru",
        legacyTextRevisionId: "revision:ru",
        legacyProvisionRenditionId: "rendition:ru",
        sourcePositionToken: "article:1:sequence:0",
        articleNumber: "1",
        articleTitle: null,
        sequence: 0,
        documentType: "Закон",
        provisionText: "Unknown temporal provision.",
        provisionLocatorId: "provision:ru",
        provisionR2Key: "corpus/provisions/ru.json",
        provisionByteCount: 31,
        provisionSha256: HASH_B,
        sourceNormalizedSha256: HASH_C,
        sourceUrl: "https://lex.uz/ru/docs/100",
        temporalState: "unknown",
        currentPointerVerified: true,
        privacyClass: "public_official_source",
        quarantined: false,
        canonicalizationConflict: false,
        legacyTextualAuthority: "unknown",
      },
    ],
    quarantines: [{
      publisherDocumentToken: "lexuz-family:200:en",
      sourceVersionToken: "lexuz-family:200:en:v1:empty",
      reasonCode: "NO_MATERIALIZED_PROVISIONS",
    }],
    aliases: [],
    deferredInventories: [{ kind: "post_cutoff", count: 4, inventorySha256: HASH_C }],
  };
}

class MemoryBuildStore implements SourceSnapshotBuildStore {
  readonly phases = new Map<string, string>();
  readonly rows = new Map<string, string>();
  readonly objects = new Map<string, Uint8Array>();

  async completedIdentity(phase: string) { return this.phases.get(phase) ?? null; }
  async persistPhase(phase: string, identity: string) { this.phases.set(phase, identity); }
  async persistRows(rows: readonly { identity: string; serialized: string }[]) {
    for (const row of rows) {
      const existing = this.rows.get(row.identity);
      if (existing !== undefined && existing !== row.serialized) throw new Error("IDENTITY_CONFLICT");
      this.rows.set(row.identity, row.serialized);
    }
  }
  async persistObjects(objects: readonly { key: string; bytes: Uint8Array }[]) {
    for (const object of objects) {
      const existing = this.objects.get(object.key);
      if (existing !== undefined && !Buffer.from(existing).equals(object.bytes)) {
        throw new Error("IDENTITY_CONFLICT");
      }
      this.objects.set(object.key, object.bytes);
    }
  }
}

test("current Source Snapshot retrieval ignores textual authority but fails closed on temporal state", async () => {
  const plan = await buildSourceSnapshotProjectionPlan(representativeInput());

  assert.deepEqual(plan.inventory.counts, {
    sourceDocuments: 3,
    sourceSnapshots: 2,
    snapshotProvisions: 2,
    currentPointers: 2,
    eligibleCurrentProvisions: 1,
    excludedCurrentProvisions: 1,
    quarantines: 1,
    aliases: 0,
    canonicalChunks: 1,
    sparsePostings: 1,
    denseCandidates: 1,
    releaseItems: 1,
  });
  assert.deepEqual(plan.inventory.exclusions, {
    CURRENT_TEMPORAL_STATE_UNKNOWN: 1,
    NO_MATERIALIZED_PROVISIONS: 1,
  });
  const eligible = plan.eligibility.find((row) => row.status === "eligible");
  const ineligible = plan.eligibility.find((row) => row.status === "ineligible");
  assert.deepEqual(eligible?.reasonCodes, []);
  assert.deepEqual(ineligible?.reasonCodes, ["CURRENT_TEMPORAL_STATE_UNKNOWN"]);
  assert.notEqual(plan.sourceDocuments[0]?.id, plan.sourceDocuments[1]?.id,
    "different language/source identities must never merge through a guessed relationship");
  assert.equal(plan.releaseItems.length, 1);
  const manifest = JSON.parse(new TextDecoder().decode(plan.manifest.bytes)) as { status: string };
  assert.equal(manifest.status, "constructed_unsealed");
  const artifact = new TextDecoder().decode(plan.chunkArtifacts[0]?.bytes);
  assert.match(artifact, /Eligible current provision/u);
  assert.doesNotMatch(artifact, /controlling|official.translation|textual.authority/iu);
});

test("canonical identities and release membership never depend on legacy textual authority", async () => {
  const input = representativeInput();
  const changed = structuredClone(input);
  changed.snapshots[0]!.legacyTextualAuthority = "controlling";
  changed.provisions[0]!.legacyTextualAuthority = "official_translation";
  const [baseline, withLegacyClaims] = await Promise.all([
    buildSourceSnapshotProjectionPlan(input), buildSourceSnapshotProjectionPlan(changed),
  ]);
  assert.deepEqual(withLegacyClaims.sourceDocuments.map((row) => row.id),
    baseline.sourceDocuments.map((row) => row.id));
  assert.deepEqual(withLegacyClaims.sourceSnapshots.map((row) => row.id),
    baseline.sourceSnapshots.map((row) => row.id));
  assert.deepEqual(withLegacyClaims.snapshotProvisions.map((row) => row.id),
    baseline.snapshotProvisions.map((row) => row.id));
  assert.deepEqual(withLegacyClaims.releaseItems, baseline.releaseItems);
  assert.equal(withLegacyClaims.release.identity, baseline.release.identity);
});

test("a partial Source Snapshot build restarts to byte-identical projections and one disjoint shard union", async () => {
  const input = representativeInput();
  const baseline = await buildSourceSnapshotProjectionPlan(input);
  const store = new MemoryBuildStore();

  await assert.rejects(
    executeSourceSnapshotProjectionPlan(store, baseline, { failAfterPhase: "inventory" }),
    SourceSnapshotBuildInterruptedError,
  );
  const resumed = await executeSourceSnapshotProjectionPlan(store, baseline);
  const repeated = await executeSourceSnapshotProjectionPlan(store,
    await buildSourceSnapshotProjectionPlan(input));

  assert.equal(resumed.inventoryIdentity, baseline.inventory.identity);
  assert.equal(resumed.releaseIdentity, baseline.release.identity);
  assert.deepEqual(repeated, resumed);
  assert.equal(store.objects.size, 2, "one chunk plus one release manifest is persisted exactly once");
  assert.equal(baseline.release.completeDisjointUnion, true);
  assert.equal(Object.values(baseline.release.shardItemCounts).reduce((sum, count) => sum + count, 0), 1);
});

test("the additive target schema preserves legacy authority rows and protects Source Snapshot evidence", () => {
  const { sqlite } = sqliteD1FixtureFromDirectory(new URL("../legal-drizzle/", import.meta.url));
  try {
    const expectedTables = [
      "legal_source_documents",
      "legal_source_snapshots",
      "legal_snapshot_provisions",
      "legal_source_snapshot_current_pointers",
      "legal_retrieval_eligibility",
      "legal_source_snapshot_quarantines",
      "legal_source_snapshot_aliases",
      "legal_canonical_chunks",
      "legal_sparse_projection_postings",
      "legal_dense_projection_candidates",
      "legal_source_snapshot_builds",
      "legal_source_snapshot_build_checkpoints",
      "legal_source_snapshot_inventories",
      "legal_source_snapshot_stable_identities",
      "legal_source_snapshot_integrity_attestations",
      "legal_source_snapshot_replay_pages",
      "legal_source_snapshot_replay_runs",
      "legal_source_snapshot_qualifications",
    ];
    const rows = sqlite.prepare(`SELECT name FROM sqlite_master
      WHERE type='table' ORDER BY name`).all() as Array<{ name: string }>;
    const names = new Set(rows.map((row) => row.name));
    for (const table of expectedTables) assert.equal(names.has(table), true, table);
    assert.equal(names.has("legal_official_expressions"), true);
    assert.equal(names.has("legal_official_eligibility"), true);
    const triggers = new Set((sqlite.prepare(`SELECT name FROM sqlite_master
      WHERE type='trigger' ORDER BY name`).all() as Array<{ name: string }>).map((row) => row.name));
    for (const trigger of [
      "legal_source_documents_no_delete",
      "legal_source_snapshots_no_delete",
      "legal_snapshot_provisions_no_delete",
      "legal_source_snapshot_current_pointers_no_delete",
      "legal_retrieval_eligibility_no_delete",
      "legal_source_snapshot_quarantines_no_delete",
      "legal_source_snapshot_aliases_no_delete",
      "legal_canonical_chunks_no_delete",
      "legal_sparse_projection_postings_no_delete",
      "legal_dense_projection_candidates_no_delete",
      "legal_source_snapshot_release_members_no_delete",
      "legal_source_snapshot_build_checkpoints_no_delete",
      "legal_source_snapshot_inventories_no_delete",
      "legal_source_snapshot_deferred_inventories_no_delete",
      "legal_source_snapshot_deferred_inventories_no_update",
      "legal_source_snapshot_deferred_inventories_validate_insert",
      "legal_source_snapshot_stable_identities_no_delete",
      "legal_source_snapshot_integrity_attestations_no_delete",
      "legal_source_snapshot_replay_pages_no_delete",
      "legal_source_snapshot_replay_runs_no_delete",
      "legal_source_snapshot_qualifications_no_delete",
    ]) assert.equal(triggers.has(trigger), true, trigger);
    sqlite.prepare(`INSERT INTO legal_source_documents
      (id,publisher,publisher_document_token,language_tag,source_url,legacy_instrument_id,
       legacy_expression_id,provenance_sha256,created_at)
      VALUES ('source-document:immutability-test','lex.uz','immutability-test','en',
        'https://lex.uz/docs/immutability-test',NULL,NULL,?,?)`).run(HASH_A, CAPTURED_AT);
    assert.throws(() => sqlite.prepare(`DELETE FROM legal_source_documents
      WHERE id='source-document:immutability-test'`).run(), /LEGAL_SOURCE_DOCUMENT_IMMUTABLE/u);
    sqlite.prepare(`INSERT INTO legal_source_snapshot_builds
      (id,environment,cutoff_at,release_id,configuration_identity,shard_count,status,phase,
       processed_count,eligible_count,excluded_count,created_at,updated_at)
      VALUES ('build:deferred-inventory-test','staging',?,'release:test',?,1,'complete','complete',
        0,0,0,?,?)`).run(CAPTURED_AT, HASH_A, CAPTURED_AT, CAPTURED_AT);
    sqlite.prepare(`INSERT INTO legal_source_snapshot_deferred_inventories
      (build_id,inventory_kind,item_count,inventory_sha256,evidence_json,recorded_at)
      VALUES ('build:deferred-inventory-test','valid',0,?,'{}',?)`).run(HASH_A, CAPTURED_AT);
    assert.throws(() => sqlite.prepare(`UPDATE legal_source_snapshot_deferred_inventories
      SET item_count=1 WHERE build_id='build:deferred-inventory-test' AND inventory_kind='valid'`).run(),
    /LEGAL_SOURCE_SNAPSHOT_DEFERRED_INVENTORY_IMMUTABLE/u);
    assert.throws(() => sqlite.prepare(`INSERT INTO legal_source_snapshot_deferred_inventories
      (build_id,inventory_kind,item_count,inventory_sha256,evidence_json,recorded_at)
      VALUES ('build:deferred-inventory-test','negative-count',-1,?,'{}',?)`).run(HASH_A, CAPTURED_AT),
    /LEGAL_SOURCE_SNAPSHOT_DEFERRED_INVENTORY_INVALID/u);
    assert.throws(() => sqlite.prepare(`INSERT INTO legal_source_snapshot_deferred_inventories
      (build_id,inventory_kind,item_count,inventory_sha256,evidence_json,recorded_at)
      VALUES ('build:deferred-inventory-test','invalid-hash',0,?,'{}',?)`)
      .run("A".repeat(64), CAPTURED_AT), /LEGAL_SOURCE_SNAPSHOT_DEFERRED_INVENTORY_INVALID/u);
  } finally {
    sqlite.close();
  }
});
