import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { buildHistoricalMetadataAcceptance, loadHistoricalMetadataControl,
  recordHistoricalMetadataAcceptance, serializeHistoricalMetadataAcceptance }
  from "../lib/legal-corpus/historical-metadata-acceptance";

const hash = (character: string) => character.repeat(64);

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE legal_complete_corpus_runs (id TEXT PRIMARY KEY,status TEXT,completed_at TEXT,
      source_cutoff TEXT,source_bookmark TEXT,source_inventory_sha256 TEXT,source_canonical_sha256 TEXT,
      source_alias_sha256 TEXT,plan_r2_key TEXT,plan_sha256 TEXT,final_reconstruction_r2_key TEXT,
      final_reconstruction_sha256 TEXT,expected_record_count INTEGER,materialized_record_count INTEGER);
    CREATE TABLE legal_complete_corpus_snapshots (run_id TEXT PRIMARY KEY,r2_key TEXT,snapshot_sha256 TEXT);
    CREATE TABLE legal_complete_corpus_manifests (run_id TEXT,membership TEXT,record_count INTEGER,
      root_sha256 TEXT,r2_key TEXT,manifest_sha256 TEXT);
    CREATE TABLE legal_complete_corpus_aliases (run_id TEXT,alias_kind TEXT);
    CREATE TABLE legal_complete_corpus_lineage_refs (run_id TEXT);
    CREATE TABLE legal_complete_corpus_lane_reports (run_id TEXT,report_kind TEXT);
    CREATE TABLE legal_search_releases (id TEXT PRIMARY KEY);
    CREATE TABLE legal_activation_sets (id TEXT PRIMARY KEY,current_release_id TEXT);
    CREATE TABLE legal_active_activation_sets (environment TEXT PRIMARY KEY,activation_set_id TEXT);
    INSERT INTO legal_complete_corpus_runs VALUES
      ('complete','materialized',NULL,'2026-08-31T06:26:27.225Z','bookmark','${hash("1")}',
       '${hash("2")}','${hash("3")}','plan.json','${hash("4")}','reconstruction.json','${hash("5")}',3,3);
    INSERT INTO legal_complete_corpus_snapshots VALUES ('complete','snapshot.json','${hash("6")}');
    INSERT INTO legal_complete_corpus_manifests VALUES
      ('complete','current',1,'${hash("7")}','current.json','${hash("8")}'),
      ('complete','history',2,'${hash("9")}','history.json','${hash("a")}'),
      ('complete','gaps',1,'${hash("b")}','gaps.json','${hash("c")}'),
      ('complete','quarantines',1,'${hash("d")}','quarantines.json','${hash("e")}'),
      ('complete','union',4,'${hash("f")}','union.json','${hash("0")}');
    INSERT INTO legal_complete_corpus_aliases VALUES
      ('complete','raw_capture'),('complete','normalized_revision'),('complete','version_url');
    INSERT INTO legal_complete_corpus_lineage_refs VALUES ('complete');
    INSERT INTO legal_complete_corpus_lane_reports VALUES
      ('complete','manifest'),('complete','manifest'),('complete','manifest'),
      ('complete','manifest'),('complete','manifest'),('complete','manifest'),
      ('complete','manifest'),('complete','manifest'),('complete','manifest');
    INSERT INTO legal_search_releases VALUES ('release:staging:current');
    INSERT INTO legal_activation_sets VALUES ('activation:staging','release:staging:current');
    INSERT INTO legal_active_activation_sets VALUES ('staging','activation:staging');`);
  const db = { prepare(sql: string) { return { bind(...values: Array<string | number>) { return {
    async first() { return sqlite.prepare(sql).get(...values); },
    async run() { return sqlite.prepare(sql).run(...values); },
  }; } }; } } as unknown as D1Database;
  return { sqlite, db };
}

function reconstruction() {
  return { schemaVersion: 1, kind: "complete-corpus-reconstruction", runId: "complete",
    derivativeIndexMutations: 0, providerRequests: 0, missingObjects: 0, hashMismatches: 0,
    reconstructionLaneCount: 16, reconstructionRootSha256: hash("1"), exact: {
      records: 3, currentRecords: 1, historicalRecords: 2, gaps: 1, overlapRecords: 1,
      quarantineCount: 1, sourceVersionCount: 1, distinctBodies: 2,
      physicalObjectCounts: { dataObjects: 4, rawObjects: 1, normalizedObjects: 1,
        provisionObjects: 2 },
    } };
}

async function reconstructionFixture(control: Awaited<ReturnType<typeof loadHistoricalMetadataControl>>) {
  const bytes = new TextEncoder().encode(JSON.stringify(reconstruction()));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  control.reconstructionSha256 = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0")).join("");
  return bytes;
}

test("accepts one body-free historical metadata result from sealed control evidence", async () => {
  const { sqlite, db } = fixture();
  try {
    sqlite.exec(readFileSync(new URL("../legal-drizzle/0027_historical_metadata_acceptance.sql",
      import.meta.url), "utf8"));
    const control = await loadHistoricalMetadataControl(db, "complete", "staging");
    const result = await buildHistoricalMetadataAcceptance({ control,
      reconstructionBytes: await reconstructionFixture(control),
      environment: "staging", catalogDatabaseId: "catalog", acceptedAt: "2026-09-05T23:50:00.000Z",
      waiver: { id: "ticket29-owner-waiver-2026-09-05", recordedAt: "2026-09-05T00:00:00.000Z",
        skippedChecks: ["isolated qualification"] } });
    assert.equal(result.metadata.materializedRecords, 3);
    assert.equal(result.memberships.union.count, 4);
    assert.equal(result.memberships.currentHistoryOverlap, 1);
    assert.equal(result.metadata.membershipManifestCount, 5);
    assert.equal(result.metadata.manifestLaneCount, 9);
    assert.deepEqual(result.writes, { newHistoricalRecords: 0, newEvidenceObjects: 0 });
    assert.equal(result.activation.currentReleaseId, "release:staging:current");
    const serialized = await serializeHistoricalMetadataAcceptance(result);
    const receipt = await recordHistoricalMetadataAcceptance({ db, id: "acceptance", result,
      resultR2Key: `historical-metadata/${serialized.sha256}.json`, resultSha256: serialized.sha256 });
    assert.equal(receipt.historyRecordCount, 2);
    assert.deepEqual(await recordHistoricalMetadataAcceptance({ db, id: "acceptance", result,
      resultR2Key: `historical-metadata/${serialized.sha256}.json`, resultSha256: serialized.sha256 }), receipt);
    await assert.rejects(() => recordHistoricalMetadataAcceptance({ db, id: "acceptance", result,
      resultR2Key: `historical-metadata/${serialized.sha256}.json`, resultSha256: hash("f") }),
    /RESULT_HASH_MISMATCH/u);
  } finally { sqlite.close(); }
});

test("rejects mismatched reconstruction evidence and immutable receipt replacement", async () => {
  const { sqlite, db } = fixture();
  try {
    const control = await loadHistoricalMetadataControl(db, "complete", "staging");
    const changed = new TextEncoder().encode(JSON.stringify({ ...reconstruction(),
      exact: { ...reconstruction().exact, records: 4 } }));
    await assert.rejects(() => buildHistoricalMetadataAcceptance({ control,
      reconstructionBytes: changed,
      environment: "staging", catalogDatabaseId: "catalog", acceptedAt: "2026-09-05T23:50:00.000Z",
      waiver: { id: "waiver", recordedAt: "2026-09-05T00:00:00.000Z",
        skippedChecks: ["qualification"] } }), /RECONSTRUCTION_HASH_MISMATCH/u);
    const digest = await crypto.subtle.digest("SHA-256", changed);
    control.reconstructionSha256 = [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, "0")).join("");
    await assert.rejects(() => buildHistoricalMetadataAcceptance({ control,
      reconstructionBytes: changed,
      environment: "staging", catalogDatabaseId: "catalog", acceptedAt: "2026-09-05T23:50:00.000Z",
      waiver: { id: "waiver", recordedAt: "2026-09-05T00:00:00.000Z",
        skippedChecks: ["qualification"] } }), /RECONSTRUCTION_MISMATCH/u);
    sqlite.exec(readFileSync(new URL("../legal-drizzle/0027_historical_metadata_acceptance.sql",
      import.meta.url), "utf8"));
    sqlite.exec(`INSERT INTO legal_historical_metadata_acceptances VALUES
      ('acceptance','staging','catalog','complete','${hash("9")}',2,1,3,1,
       'activation:staging','release:staging:current','waiver',0,0,'result.json','${hash("8")}',
       '2026-09-05T23:50:00.000Z')`);
    assert.throws(() => sqlite.exec(`INSERT OR REPLACE INTO legal_historical_metadata_acceptances VALUES
      ('acceptance','staging','catalog','other-run','${hash("9")}',2,1,3,1,
       'activation:staging','release:staging:current','waiver',0,0,'other-result.json','${hash("8")}',
       '2026-09-05T23:50:00.000Z')`), /ACCEPTANCE_IMMUTABLE/u);
    assert.throws(() => sqlite.exec(`INSERT OR REPLACE INTO legal_historical_metadata_acceptances VALUES
      ('other-acceptance','staging','catalog','other-run','${hash("9")}',2,1,3,1,
       'activation:staging','release:staging:current','waiver',0,0,'result.json','${hash("8")}',
       '2026-09-05T23:50:00.000Z')`), /ACCEPTANCE_IMMUTABLE/u);
    assert.throws(() => sqlite.exec("DELETE FROM legal_historical_metadata_acceptances"),
      /ACCEPTANCE_IMMUTABLE/u);
  } finally { sqlite.close(); }
});
