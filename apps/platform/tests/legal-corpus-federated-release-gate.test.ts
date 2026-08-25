import assert from "node:assert/strict";
import test from "node:test";

import {
  FEDERATED_LEGAL_CORPUS_CATALOG_AUTHORITY,
  evaluateFederatedLegalCorpusReleaseEvidence,
  federatedLegalCorpusReleaseEvidenceSchema,
  type FederatedLegalCorpusReleaseEvidence,
} from "../lib/legal-corpus/federated-release-gate";
import { LEGAL_CORPUS_MAX_RELEASE_D1_DATABASE_BYTES } from "../lib/legal-corpus/release-gate";
import {
  LEGAL_CORPUS_TEST_NOW,
  validLegalCorpusReleaseEvidence,
} from "./helpers/legal-corpus-release-evidence";

const shard1Id = "e09e0682-0c2e-4458-a8f3-be9de28117e3";
const shard2Id = "d09e0682-0c2e-4458-a8f3-be9de28117e4";

function validFederatedEvidence(): FederatedLegalCorpusReleaseEvidence {
  const baseEvidence = validLegalCorpusReleaseEvidence();
  baseEvidence.d1Capacity = {
    schemaVersion: 1,
    environment: "staging",
    databaseId: shard1Id,
    databaseName: FEDERATED_LEGAL_CORPUS_CATALOG_AUTHORITY,
    observedAt: "2026-08-15T11:59:00.000Z",
    databaseSizeBytes: 3_000_000_000,
    source: "wrangler_d1_info",
    fileSha256: "3".repeat(64),
  };
  return federatedLegalCorpusReleaseEvidenceSchema.parse({
    schemaVersion: 1,
    baseEvidence,
    routing: {
      catalogAuthorityDatabaseName: FEDERATED_LEGAL_CORPUS_CATALOG_AUTHORITY,
      shardNames: [
        "juro-staging-corpus-shard-1",
        "juro-staging-corpus-shard-2",
      ],
      partitionManifestSha256: "4".repeat(64),
      routingContractSha256: "5".repeat(64),
      snapshotManifestSha256: "6".repeat(64),
      retrievalVerificationSha256: "7".repeat(64),
      canonicalDocumentDuplicateCount: 0,
      chunkDuplicateCount: 0,
      canonicalDocumentIdsDisjoint: true,
      chunkIdsDisjoint: true,
      pointInTimeSemanticsVerified: true,
      sparseDenseSourcePacketParityVerified: true,
      singleLexStreamVerified: true,
    },
    d1Capacities: [
      baseEvidence.d1Capacity,
      {
        schemaVersion: 1,
        environment: "staging",
        databaseId: shard2Id,
        databaseName: "juro-staging-corpus-shard-2",
        observedAt: "2026-08-15T11:59:30.000Z",
        databaseSizeBytes: 2_000_000_000,
        source: "wrangler_d1_info",
        fileSha256: "e".repeat(64),
      },
    ],
    shards: [
      {
        databaseName: "juro-staging-corpus-shard-1",
        databaseId: shard1Id,
        corpusSnapshotSha256: "8".repeat(64),
        canonicalDocumentIdSetSha256: "9".repeat(64),
        chunkIdSetSha256: "a".repeat(64),
        canonicalDocuments: 900,
        languageVariants: 1_400,
        uniqueProvisions: 13_000,
        currentProvisions: 13_000,
        currentChunks: 13_000,
        indexedChunks: 13_000,
        activeDocuments: 850,
        repealedDocuments: 50,
        historicalVersions: 1_800,
        liveOrManualQueued: 0,
        failedDocuments: 0,
      },
      {
        databaseName: "juro-staging-corpus-shard-2",
        databaseId: shard2Id,
        corpusSnapshotSha256: "b".repeat(64),
        canonicalDocumentIdSetSha256: "c".repeat(64),
        chunkIdSetSha256: "d".repeat(64),
        canonicalDocuments: 600,
        languageVariants: 1_000,
        uniqueProvisions: 9_000,
        currentProvisions: 9_000,
        currentChunks: 9_513,
        indexedChunks: 9_513,
        activeDocuments: 550,
        repealedDocuments: 50,
        historicalVersions: 1_200,
        liveOrManualQueued: 0,
        failedDocuments: 0,
      },
    ],
  });
}

test("federated release gate accepts only disjoint contiguous capacity-bounded shards", () => {
  const verdict = evaluateFederatedLegalCorpusReleaseEvidence(
    validFederatedEvidence(),
    LEGAL_CORPUS_TEST_NOW,
  );
  assert.deepEqual(verdict.failures, []);
  assert.equal(verdict.passed, true);
  assert.equal(verdict.observed.shardCount, 2);
  assert.equal(verdict.observed.totalDatabaseBytes, 5_000_000_000);
  assert.equal(verdict.observed.maximumShardBytes, 3_000_000_000);
});

test("federated release gate checks every shard capacity and freshness", () => {
  const evidence = validFederatedEvidence();
  evidence.d1Capacities[1]!.databaseSizeBytes =
    LEGAL_CORPUS_MAX_RELEASE_D1_DATABASE_BYTES + 1;
  evidence.d1Capacities[1]!.observedAt = "2026-08-14T11:59:00.000Z";
  const verdict = evaluateFederatedLegalCorpusReleaseEvidence(
    evidence,
    LEGAL_CORPUS_TEST_NOW,
  );
  assert.ok(verdict.failures.includes(
    "FEDERATION_D1_CAPACITY_LIMIT_FAILED:juro-staging-corpus-shard-2",
  ));
  assert.ok(verdict.failures.includes(
    "FEDERATION_D1_CAPACITY_STALE:juro-staging-corpus-shard-2",
  ));
  assert.equal(verdict.passed, false);
});

test("federated release gate rejects missing, duplicate, and non-contiguous shard sets", () => {
  const evidence = validFederatedEvidence();
  evidence.routing.shardNames = [
    "juro-staging-corpus-shard-1",
    "juro-staging-corpus-shard-1",
  ];
  evidence.shards[1]!.databaseName = "juro-staging-corpus-shard-3";
  const verdict = evaluateFederatedLegalCorpusReleaseEvidence(
    evidence,
    LEGAL_CORPUS_TEST_NOW,
  );
  assert.ok(verdict.failures.includes(
    "FEDERATION_ROUTE_DUPLICATE:juro-staging-corpus-shard-1",
  ));
  assert.ok(verdict.failures.includes("FEDERATION_CAPACITY_SET_MISMATCH"));
  assert.ok(verdict.failures.includes("FEDERATION_SUMMARY_SET_MISMATCH"));

  const nonContiguous = validFederatedEvidence();
  nonContiguous.routing.shardNames[1] = "juro-staging-corpus-shard-3";
  nonContiguous.d1Capacities[1]!.databaseName = "juro-staging-corpus-shard-3";
  nonContiguous.shards[1]!.databaseName = "juro-staging-corpus-shard-3";
  const nonContiguousVerdict = evaluateFederatedLegalCorpusReleaseEvidence(
    nonContiguous,
    LEGAL_CORPUS_TEST_NOW,
  );
  assert.ok(nonContiguousVerdict.failures.includes("FEDERATION_SHARD_SEQUENCE_INVALID"));
});

test("federated release gate recomputes aggregate totals from shard summaries", () => {
  const evidence = validFederatedEvidence();
  evidence.shards[1]!.indexedChunks -= 1;
  evidence.shards[0]!.liveOrManualQueued = 1;
  const verdict = evaluateFederatedLegalCorpusReleaseEvidence(
    evidence,
    LEGAL_CORPUS_TEST_NOW,
  );
  assert.ok(verdict.failures.includes("FEDERATION_TOTAL_MISMATCH:indexedChunks"));
  assert.ok(verdict.failures.includes("FEDERATION_TOTAL_MISMATCH:liveOrManualQueued"));
});

test("federated evidence schema rejects unverified routing attestations", () => {
  const evidence = validFederatedEvidence() as unknown as {
    routing: { pointInTimeSemanticsVerified: boolean };
  };
  evidence.routing.pointInTimeSemanticsVerified = false;
  assert.equal(
    federatedLegalCorpusReleaseEvidenceSchema.safeParse(evidence).success,
    false,
  );
});
