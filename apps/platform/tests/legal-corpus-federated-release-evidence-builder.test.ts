import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildFederatedLegalCorpusReleaseEvidence } from
  "../lib/legal-corpus/federated-release-evidence-builder";
import {
  FEDERATED_LEGAL_CORPUS_CATALOG_AUTHORITY,
} from "../lib/legal-corpus/federated-release-gate";
import {
  LEGAL_CORPUS_TEST_NOW,
  validLegalCorpusReleaseEvidence,
} from "./helpers/legal-corpus-release-evidence";

const shard1Id = "e09e0682-0c2e-4458-a8f3-be9de28117e3";
const shard2Id = "d09e0682-0c2e-4458-a8f3-be9de28117e4";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function identifiers(prefix: string, start: number, count: number): string {
  return `${Array.from({ length: count }, (_, index) =>
    `${prefix}-${String(start + index).padStart(6, "0")}`).join("\n")}\n`;
}

type Fixture = {
  directory: string;
  input: Parameters<typeof buildFederatedLegalCorpusReleaseEvidence>[0];
  paths: {
    base: string;
    routing: string;
    shard2CanonicalIds: string;
  };
};

async function createFixture(): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), "juro-federated-release-"));
  const paths = {
    base: join(directory, "base-evidence.json"),
    routing: join(directory, "routing-contract.json"),
    partition: join(directory, "partition-manifest.json"),
    snapshot: join(directory, "snapshot-manifest.json"),
    retrieval: join(directory, "retrieval-verification.json"),
    capacity1: join(directory, "capacity-1.json"),
    capacity2: join(directory, "capacity-2.json"),
    shard1CanonicalIds: join(directory, "shard-1-canonical-ids.txt"),
    shard2CanonicalIds: join(directory, "shard-2-canonical-ids.txt"),
    shard1ChunkIds: join(directory, "shard-1-chunk-ids.txt"),
    shard2ChunkIds: join(directory, "shard-2-chunk-ids.txt"),
  };
  const applicationCommit = "a".repeat(40);
  const capacity1Raw = json({
    schemaVersion: 1,
    environment: "staging",
    databaseId: shard1Id,
    databaseName: FEDERATED_LEGAL_CORPUS_CATALOG_AUTHORITY,
    observedAt: "2026-08-15T11:59:00.000Z",
    databaseSizeBytes: 3_000_000_000,
    source: "wrangler_d1_info",
  });
  const capacity2Raw = json({
    schemaVersion: 1,
    environment: "staging",
    databaseId: shard2Id,
    databaseName: "juro-staging-corpus-shard-2",
    observedAt: "2026-08-15T11:59:00.000Z",
    databaseSizeBytes: 2_000_000_000,
    source: "wrangler_d1_info",
  });
  const snapshotRaw = json({
    schemaVersion: 1,
    environment: "staging",
    capturedAt: "2026-08-15T11:59:00.000Z",
    applicationCommit,
    shards: [
      {
        databaseName: FEDERATED_LEGAL_CORPUS_CATALOG_AUTHORITY,
        databaseId: shard1Id,
        corpusSnapshotSha256: "8".repeat(64),
        exportSha256: "9".repeat(64),
        quickCheck: "ok",
        foreignKeyViolationCount: 0,
      },
      {
        databaseName: "juro-staging-corpus-shard-2",
        databaseId: shard2Id,
        corpusSnapshotSha256: "b".repeat(64),
        exportSha256: "c".repeat(64),
        quickCheck: "ok",
        foreignKeyViolationCount: 0,
      },
    ],
  });
  const routingRaw = json({
    schemaVersion: 1,
    environment: "staging",
    capturedAt: "2026-08-15T11:59:00.000Z",
    applicationCommit,
    catalogAuthorityDatabaseName: FEDERATED_LEGAL_CORPUS_CATALOG_AUTHORITY,
    shards: [
      {
        databaseName: FEDERATED_LEGAL_CORPUS_CATALOG_AUTHORITY,
        databaseId: shard1Id,
        bindingName: "LEGAL_CORPUS_SHARD_1",
      },
      {
        databaseName: "juro-staging-corpus-shard-2",
        databaseId: shard2Id,
        bindingName: "LEGAL_CORPUS_SHARD_2",
      },
    ],
    lexStream: {
      observedAt: "2026-08-15T11:59:00.000Z",
      host: "lex.uz",
      workerNames: ["juro-legal-corpus-shard-staging"],
      enabledScheduledWorkerNames: [],
      concurrentStreamCount: 0,
      maximumObservedConcurrentStreams: 1,
      minimumCrawlDelaySeconds: 20,
    },
  });
  const partitionRaw = json({
    schemaVersion: 1,
    environment: "staging",
    capturedAt: "2026-08-15T11:59:00.000Z",
    applicationCommit,
    shards: [
      {
        databaseName: FEDERATED_LEGAL_CORPUS_CATALOG_AUTHORITY,
        databaseId: shard1Id,
        corpusSnapshotSha256: "8".repeat(64),
        canonicalDocumentIdsFile: "shard-1-canonical-ids.txt",
        chunkIdsFile: "shard-1-chunk-ids.txt",
        totals: {
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
      },
      {
        databaseName: "juro-staging-corpus-shard-2",
        databaseId: shard2Id,
        corpusSnapshotSha256: "b".repeat(64),
        canonicalDocumentIdsFile: "shard-2-canonical-ids.txt",
        chunkIdsFile: "shard-2-chunk-ids.txt",
        totals: {
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
      },
    ],
  });
  const retrievalRaw = json({
    schemaVersion: 1,
    environment: "staging",
    capturedAt: "2026-08-15T11:59:00.000Z",
    applicationCommit,
    testCommand: "npm test -- legal-corpus-federated-retrieval.test.ts",
    scenarios: Array.from({ length: 24 }, (_, index) => ({
      scenarioId: `federated-retrieval-${String(index + 1).padStart(2, "0")}`,
      pointInTimeSemanticsPassed: true,
      sparseDenseSourcePacketParityPassed: true,
    })),
  });
  const baseEvidence = validLegalCorpusReleaseEvidence();
  baseEvidence.dashboard.featureFlags.LEGAL_CORPUS_FEDERATED_ENABLED = true;
  baseEvidence.capturedAt = "2026-08-15T11:59:30.000Z";
  baseEvidence.corpusSnapshotSha256 = sha256(snapshotRaw);
  baseEvidence.benchmark.corpusSnapshotSha256 = baseEvidence.corpusSnapshotSha256;
  baseEvidence.d1Capacity = {
    schemaVersion: 1,
    environment: "staging",
    databaseId: shard1Id,
    databaseName: FEDERATED_LEGAL_CORPUS_CATALOG_AUTHORITY,
    observedAt: "2026-08-15T11:59:00.000Z",
    databaseSizeBytes: 3_000_000_000,
    source: "wrangler_d1_info",
    fileSha256: sha256(capacity1Raw),
  };

  await Promise.all([
    writeFile(paths.base, json(baseEvidence), "utf8"),
    writeFile(paths.routing, routingRaw, "utf8"),
    writeFile(paths.partition, partitionRaw, "utf8"),
    writeFile(paths.snapshot, snapshotRaw, "utf8"),
    writeFile(paths.retrieval, retrievalRaw, "utf8"),
    writeFile(paths.capacity1, capacity1Raw, "utf8"),
    writeFile(paths.capacity2, capacity2Raw, "utf8"),
    writeFile(paths.shard1CanonicalIds, identifiers("doc", 0, 900), "utf8"),
    writeFile(paths.shard2CanonicalIds, identifiers("doc", 900, 600), "utf8"),
    writeFile(paths.shard1ChunkIds, identifiers("chunk", 0, 13_000), "utf8"),
    writeFile(paths.shard2ChunkIds, identifiers("chunk", 13_000, 9_513), "utf8"),
  ]);
  return {
    directory,
    input: {
      baseEvidencePath: paths.base,
      routingContractPath: paths.routing,
      partitionManifestPath: paths.partition,
      snapshotManifestPath: paths.snapshot,
      retrievalVerificationPath: paths.retrieval,
      d1CapacityPaths: [paths.capacity1, paths.capacity2],
    },
    paths: {
      base: paths.base,
      routing: paths.routing,
      shard2CanonicalIds: paths.shard2CanonicalIds,
    },
  };
}

test("federated release builder derives bound disjoint shard evidence", async () => {
  const fixture = await createFixture();
  try {
    const { evidence, verdict } = await buildFederatedLegalCorpusReleaseEvidence(
      fixture.input,
      LEGAL_CORPUS_TEST_NOW,
    );
    assert.equal(verdict.passed, true);
    assert.equal(evidence.shards.length, 2);
    assert.equal(evidence.routing.canonicalDocumentDuplicateCount, 0);
    assert.equal(evidence.routing.chunkDuplicateCount, 0);
    assert.equal(evidence.routing.canonicalDocumentIdsDisjoint, true);
    assert.equal(evidence.routing.chunkIdsDisjoint, true);
    assert.match(evidence.routing.partitionManifestSha256, /^[a-f0-9]{64}$/u);
    assert.match(evidence.routing.retrievalVerificationSha256, /^[a-f0-9]{64}$/u);
    assert.notEqual(
      evidence.shards[0]!.canonicalDocumentIdSetSha256,
      evidence.shards[1]!.canonicalDocumentIdSetSha256,
    );
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test("federated release builder rejects identifiers shared by two shards", async () => {
  const fixture = await createFixture();
  try {
    const shard2 = await readFile(fixture.paths.shard2CanonicalIds, "utf8");
    await writeFile(
      fixture.paths.shard2CanonicalIds,
      shard2.replace("doc-000900", "doc-000000"),
      "utf8",
    );
    await assert.rejects(
      buildFederatedLegalCorpusReleaseEvidence(fixture.input, LEGAL_CORPUS_TEST_NOW),
      /FEDERATION_CANONICAL_IDS_NOT_DISJOINT/u,
    );
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test("federated release builder requires a frozen Lex stream", async () => {
  const fixture = await createFixture();
  try {
    const routing = JSON.parse(await readFile(fixture.paths.routing, "utf8")) as {
      lexStream: { enabledScheduledWorkerNames: string[]; concurrentStreamCount: number };
    };
    routing.lexStream.enabledScheduledWorkerNames = ["juro-legal-corpus-shard-staging"];
    routing.lexStream.concurrentStreamCount = 1;
    await writeFile(fixture.paths.routing, json(routing), "utf8");
    await assert.rejects(
      buildFederatedLegalCorpusReleaseEvidence(fixture.input, LEGAL_CORPUS_TEST_NOW),
      /FEDERATION_LEX_STREAM_NOT_FROZEN/u,
    );
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test("federated release builder binds the base benchmark to the snapshot manifest", async () => {
  const fixture = await createFixture();
  try {
    const base = JSON.parse(await readFile(fixture.paths.base, "utf8")) as {
      corpusSnapshotSha256: string;
      benchmark: { corpusSnapshotSha256: string };
    };
    base.corpusSnapshotSha256 = "f".repeat(64);
    base.benchmark.corpusSnapshotSha256 = base.corpusSnapshotSha256;
    await writeFile(fixture.paths.base, json(base), "utf8");
    await assert.rejects(
      buildFederatedLegalCorpusReleaseEvidence(fixture.input, LEGAL_CORPUS_TEST_NOW),
      /FEDERATION_BASE_SNAPSHOT_MANIFEST_MISMATCH/u,
    );
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test("federated release builder checks every retrieval scenario", async () => {
  const fixture = await createFixture();
  try {
    const input = JSON.parse(await readFile(fixture.input.retrievalVerificationPath, "utf8")) as {
      scenarios: Array<{
        pointInTimeSemanticsPassed: boolean;
        sparseDenseSourcePacketParityPassed: boolean;
      }>;
    };
    input.scenarios[0]!.pointInTimeSemanticsPassed = false;
    await writeFile(fixture.input.retrievalVerificationPath, json(input), "utf8");
    await assert.rejects(
      buildFederatedLegalCorpusReleaseEvidence(fixture.input, LEGAL_CORPUS_TEST_NOW),
      /FEDERATION_POINT_IN_TIME_VERIFICATION_FAILED/u,
    );
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});
