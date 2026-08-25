import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { z } from "zod";

import {
  FEDERATED_LEGAL_CORPUS_CATALOG_AUTHORITY,
  FEDERATED_LEGAL_CORPUS_MAX_SHARDS,
  FEDERATED_LEGAL_CORPUS_RELEASE_EVIDENCE_VERSION,
  evaluateFederatedLegalCorpusReleaseEvidence,
  federatedLegalCorpusD1CapacityEvidenceSchema,
  federatedLegalCorpusReleaseEvidenceSchema,
  federatedLegalCorpusShardSummarySchema,
  type FederatedLegalCorpusReleaseEvidence,
  type FederatedLegalCorpusReleaseVerdict,
} from "./federated-release-gate";
import {
  LEGAL_CORPUS_RELEASE_THRESHOLDS,
  legalCorpusReleaseEvidenceSchema,
} from "./release-gate";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const commitSchema = z.string().regex(/^[a-f0-9]{40}$/u);
const timestampSchema = z.string().datetime({ offset: true });
const numberedShardNameSchema = z.string()
  .regex(/^juro-staging-corpus-shard-[1-9][0-9]*$/u);
const artifactPathSchema = z.string().trim().min(1).max(4_096);
const workerNameSchema = z.string().trim().min(1).max(128)
  .regex(/^[A-Za-z0-9._-]+$/u);

const routedShardSchema = z.object({
  databaseName: numberedShardNameSchema,
  databaseId: z.string().uuid(),
  bindingName: z.string().regex(/^[A-Z][A-Z0-9_]{1,127}$/u),
}).strict();

export const federatedLegalCorpusRoutingContractSchema = z.object({
  schemaVersion: z.literal(1),
  environment: z.literal("staging"),
  capturedAt: timestampSchema,
  applicationCommit: commitSchema,
  catalogAuthorityDatabaseName: z.literal(FEDERATED_LEGAL_CORPUS_CATALOG_AUTHORITY),
  shards: z.array(routedShardSchema).min(2).max(FEDERATED_LEGAL_CORPUS_MAX_SHARDS),
  lexStream: z.object({
    observedAt: timestampSchema,
    host: z.literal("lex.uz"),
    workerNames: z.array(workerNameSchema).min(1).max(FEDERATED_LEGAL_CORPUS_MAX_SHARDS),
    enabledScheduledWorkerNames: z.array(workerNameSchema)
      .max(FEDERATED_LEGAL_CORPUS_MAX_SHARDS),
    concurrentStreamCount: z.number().int().min(0).max(1),
    maximumObservedConcurrentStreams: z.literal(1),
    minimumCrawlDelaySeconds: z.number().int().min(20),
  }).strict(),
}).strict();

const shardTotalsSchema = federatedLegalCorpusShardSummarySchema.omit({
  databaseName: true,
  databaseId: true,
  corpusSnapshotSha256: true,
  canonicalDocumentIdSetSha256: true,
  chunkIdSetSha256: true,
});

const partitionShardSchema = z.object({
  databaseName: numberedShardNameSchema,
  databaseId: z.string().uuid(),
  corpusSnapshotSha256: sha256Schema,
  canonicalDocumentIdsFile: artifactPathSchema,
  chunkIdsFile: artifactPathSchema,
  totals: shardTotalsSchema,
}).strict();

export const federatedLegalCorpusPartitionManifestSchema = z.object({
  schemaVersion: z.literal(1),
  environment: z.literal("staging"),
  capturedAt: timestampSchema,
  applicationCommit: commitSchema,
  shards: z.array(partitionShardSchema).min(2).max(FEDERATED_LEGAL_CORPUS_MAX_SHARDS),
}).strict();

const snapshotShardSchema = z.object({
  databaseName: numberedShardNameSchema,
  databaseId: z.string().uuid(),
  corpusSnapshotSha256: sha256Schema,
  exportSha256: sha256Schema,
  quickCheck: z.literal("ok"),
  foreignKeyViolationCount: z.literal(0),
}).strict();

export const federatedLegalCorpusSnapshotManifestSchema = z.object({
  schemaVersion: z.literal(1),
  environment: z.literal("staging"),
  capturedAt: timestampSchema,
  applicationCommit: commitSchema,
  shards: z.array(snapshotShardSchema).min(2).max(FEDERATED_LEGAL_CORPUS_MAX_SHARDS),
}).strict();

export const federatedLegalCorpusRetrievalVerificationSchema = z.object({
  schemaVersion: z.literal(1),
  environment: z.literal("staging"),
  capturedAt: timestampSchema,
  applicationCommit: commitSchema,
  testCommand: z.string().trim().min(1).max(1_000),
  scenarios: z.array(z.object({
    scenarioId: z.string().trim().min(1).max(160)
      .regex(/^[A-Za-z0-9._:-]+$/u),
    pointInTimeSemanticsPassed: z.boolean(),
    sparseDenseSourcePacketParityPassed: z.boolean(),
  }).strict()).min(1).max(10_000),
}).strict();

export const federatedLegalCorpusD1CapacityInputSchema =
  federatedLegalCorpusD1CapacityEvidenceSchema.omit({ fileSha256: true });

type JsonArtifact<T> = {
  path: string;
  raw: string;
  value: T;
};

export type FederatedLegalCorpusReleaseEvidenceBuildInput = {
  baseEvidencePath: string;
  routingContractPath: string;
  partitionManifestPath: string;
  snapshotManifestPath: string;
  retrievalVerificationPath: string;
  d1CapacityPaths: string[];
};

export type FederatedLegalCorpusReleaseEvidenceBuildResult = {
  evidence: FederatedLegalCorpusReleaseEvidence;
  verdict: FederatedLegalCorpusReleaseVerdict;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function readJsonArtifact<T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<JsonArtifact<T>> {
  const absolutePath = resolve(path);
  const raw = await readFile(absolutePath, "utf8");
  return {
    path: absolutePath,
    raw,
    value: schema.parse(JSON.parse(raw) as unknown),
  };
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort(compareStrings);
}

function assertNoDuplicates(values: readonly string[], code: string): void {
  const repeated = duplicates(values);
  if (repeated.length > 0) {
    throw new TypeError(`${code}:${repeated.slice(0, 3).join(",")}`);
  }
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  const sortedLeft = [...left].sort(compareStrings);
  const sortedRight = [...right].sort(compareStrings);
  return sortedLeft.length === sortedRight.length
    && sortedLeft.every((value, index) => value === sortedRight[index]);
}

function assertFreshAtCapture(value: string, capturedAt: string, code: string): void {
  const age = Date.parse(capturedAt) - Date.parse(value);
  if (!Number.isFinite(age)
    || age < 0
    || age > LEGAL_CORPUS_RELEASE_THRESHOLDS.maximumEvidenceAgeMs) {
    throw new TypeError(code);
  }
}

type IdentifierFile = {
  values: string[];
  digest: string;
};

async function readIdentifierFile(path: string, code: string): Promise<IdentifierFile> {
  const raw = (await readFile(path, "utf8")).replace(/^\uFEFF/u, "");
  const lines = raw.split(/\r?\n/u);
  if (lines.at(-1) === "") lines.pop();
  if (lines.length === 0
    || lines.some((line) => line.length === 0 || line !== line.trim())) {
    throw new TypeError(`${code}_FORMAT_INVALID`);
  }
  if (lines.some((line) => line.length > 512)) {
    throw new TypeError(`${code}_IDENTIFIER_TOO_LONG`);
  }
  assertNoDuplicates(lines, `${code}_DUPLICATE`);
  const sorted = [...lines].sort(compareStrings);
  if (!lines.every((value, index) => value === sorted[index])) {
    throw new TypeError(`${code}_NOT_SORTED`);
  }
  return {
    values: lines,
    digest: sha256(`${lines.join("\n")}\n`),
  };
}

function assertMatchingShardSets(
  expected: readonly string[],
  actual: readonly string[],
  code: string,
): void {
  assertNoDuplicates(actual, `${code}_DUPLICATE`);
  if (!sameSet(expected, actual)) throw new TypeError(`${code}_MISMATCH`);
}

function assertAlignedDatabaseIds(
  expected: ReadonlyMap<string, string>,
  rows: readonly { databaseName: string; databaseId: string }[],
  code: string,
): void {
  for (const row of rows) {
    if (expected.get(row.databaseName) !== row.databaseId) {
      throw new TypeError(`${code}:${row.databaseName}`);
    }
  }
}

function assertArtifactCommit(
  expected: string,
  actual: string,
  code: string,
): void {
  if (expected !== actual) throw new TypeError(code);
}

export async function buildFederatedLegalCorpusReleaseEvidence(
  input: FederatedLegalCorpusReleaseEvidenceBuildInput,
  now = new Date(),
): Promise<FederatedLegalCorpusReleaseEvidenceBuildResult> {
  if (input.d1CapacityPaths.length < 2
    || input.d1CapacityPaths.length > FEDERATED_LEGAL_CORPUS_MAX_SHARDS) {
    throw new TypeError("FEDERATED_LEGAL_CORPUS_D1_CAPACITY_COUNT_INVALID");
  }

  const [baseArtifact, routingArtifact, partitionArtifact, snapshotArtifact,
    retrievalArtifact] = await Promise.all([
    readJsonArtifact(input.baseEvidencePath, legalCorpusReleaseEvidenceSchema),
    readJsonArtifact(input.routingContractPath, federatedLegalCorpusRoutingContractSchema),
    readJsonArtifact(input.partitionManifestPath, federatedLegalCorpusPartitionManifestSchema),
    readJsonArtifact(input.snapshotManifestPath, federatedLegalCorpusSnapshotManifestSchema),
    readJsonArtifact(
      input.retrievalVerificationPath,
      federatedLegalCorpusRetrievalVerificationSchema,
    ),
  ] as const);
  const capacityArtifacts = await Promise.all(input.d1CapacityPaths.map((path) =>
    readJsonArtifact(path, federatedLegalCorpusD1CapacityInputSchema)));
  const baseEvidence = baseArtifact.value;
  const applicationCommit = baseEvidence.applicationCommit;
  assertArtifactCommit(
    applicationCommit,
    routingArtifact.value.applicationCommit,
    "FEDERATION_ROUTING_COMMIT_MISMATCH",
  );
  assertArtifactCommit(
    applicationCommit,
    partitionArtifact.value.applicationCommit,
    "FEDERATION_PARTITION_COMMIT_MISMATCH",
  );
  assertArtifactCommit(
    applicationCommit,
    snapshotArtifact.value.applicationCommit,
    "FEDERATION_SNAPSHOT_COMMIT_MISMATCH",
  );
  assertArtifactCommit(
    applicationCommit,
    retrievalArtifact.value.applicationCommit,
    "FEDERATION_RETRIEVAL_COMMIT_MISMATCH",
  );
  assertNoDuplicates(
    retrievalArtifact.value.scenarios.map(({ scenarioId }) => scenarioId),
    "FEDERATION_RETRIEVAL_SCENARIO_DUPLICATE",
  );
  if (retrievalArtifact.value.scenarios.some(({ pointInTimeSemanticsPassed }) =>
    !pointInTimeSemanticsPassed)) {
    throw new TypeError("FEDERATION_POINT_IN_TIME_VERIFICATION_FAILED");
  }
  if (retrievalArtifact.value.scenarios.some(({
    sparseDenseSourcePacketParityPassed,
  }) => !sparseDenseSourcePacketParityPassed)) {
    throw new TypeError("FEDERATION_SOURCE_PACKET_PARITY_VERIFICATION_FAILED");
  }

  for (const [value, code] of [
    [routingArtifact.value.capturedAt, "FEDERATION_ROUTING_STALE"],
    [routingArtifact.value.lexStream.observedAt, "FEDERATION_LEX_STREAM_STALE"],
    [partitionArtifact.value.capturedAt, "FEDERATION_PARTITION_STALE"],
    [snapshotArtifact.value.capturedAt, "FEDERATION_SNAPSHOT_STALE"],
    [retrievalArtifact.value.capturedAt, "FEDERATION_RETRIEVAL_VERIFICATION_STALE"],
  ] as const) {
    assertFreshAtCapture(value, baseEvidence.capturedAt, code);
  }

  const routeNames = routingArtifact.value.shards.map(({ databaseName }) => databaseName);
  assertNoDuplicates(routeNames, "FEDERATION_ROUTE_DUPLICATE");
  assertNoDuplicates(
    routingArtifact.value.shards.map(({ databaseId }) => databaseId),
    "FEDERATION_ROUTE_DATABASE_ID_DUPLICATE",
  );
  assertNoDuplicates(
    routingArtifact.value.shards.map(({ bindingName }) => bindingName),
    "FEDERATION_ROUTE_BINDING_DUPLICATE",
  );
  assertNoDuplicates(
    routingArtifact.value.lexStream.workerNames,
    "FEDERATION_LEX_WORKER_DUPLICATE",
  );
  assertNoDuplicates(
    routingArtifact.value.lexStream.enabledScheduledWorkerNames,
    "FEDERATION_ENABLED_LEX_WORKER_DUPLICATE",
  );
  if (!routingArtifact.value.lexStream.enabledScheduledWorkerNames.every((worker) =>
    routingArtifact.value.lexStream.workerNames.includes(worker))) {
    throw new TypeError("FEDERATION_ENABLED_LEX_WORKER_UNKNOWN");
  }
  if (routingArtifact.value.lexStream.enabledScheduledWorkerNames.length !== 0
    || routingArtifact.value.lexStream.concurrentStreamCount !== 0) {
    throw new TypeError("FEDERATION_LEX_STREAM_NOT_FROZEN");
  }

  const databaseIds = new Map(
    routingArtifact.value.shards.map(({ databaseName, databaseId }) =>
      [databaseName, databaseId] as const),
  );
  const partitionNames = partitionArtifact.value.shards.map(({ databaseName }) => databaseName);
  const snapshotNames = snapshotArtifact.value.shards.map(({ databaseName }) => databaseName);
  const capacities = capacityArtifacts.map((artifact) => ({
    ...artifact.value,
    fileSha256: sha256(artifact.raw),
  }));
  const capacityNames = capacities.map(({ databaseName }) => databaseName);
  assertMatchingShardSets(routeNames, partitionNames, "FEDERATION_PARTITION_SET");
  assertMatchingShardSets(routeNames, snapshotNames, "FEDERATION_SNAPSHOT_SET");
  assertMatchingShardSets(routeNames, capacityNames, "FEDERATION_CAPACITY_SET");
  assertAlignedDatabaseIds(databaseIds, partitionArtifact.value.shards,
    "FEDERATION_PARTITION_DATABASE_ID_MISMATCH");
  assertAlignedDatabaseIds(databaseIds, snapshotArtifact.value.shards,
    "FEDERATION_SNAPSHOT_DATABASE_ID_MISMATCH");
  assertAlignedDatabaseIds(databaseIds, capacities,
    "FEDERATION_CAPACITY_DATABASE_ID_MISMATCH");

  const snapshotByName = new Map(
    snapshotArtifact.value.shards.map((shard) => [shard.databaseName, shard] as const),
  );
  const canonicalIds = new Set<string>();
  const chunkIds = new Set<string>();
  const partitionDirectory = dirname(partitionArtifact.path);
  const shards: FederatedLegalCorpusReleaseEvidence["shards"] = [];
  for (const shard of partitionArtifact.value.shards) {
    const snapshot = snapshotByName.get(shard.databaseName);
    if (!snapshot || snapshot.corpusSnapshotSha256 !== shard.corpusSnapshotSha256) {
      throw new TypeError(`FEDERATION_SHARD_SNAPSHOT_MISMATCH:${shard.databaseName}`);
    }
    const canonical = await readIdentifierFile(
      resolve(partitionDirectory, shard.canonicalDocumentIdsFile),
      `FEDERATION_CANONICAL_IDS:${shard.databaseName}`,
    );
    const chunks = await readIdentifierFile(
      resolve(partitionDirectory, shard.chunkIdsFile),
      `FEDERATION_CHUNK_IDS:${shard.databaseName}`,
    );
    let canonicalDuplicateCount = 0;
    for (const id of canonical.values) {
      if (canonicalIds.has(id)) canonicalDuplicateCount += 1;
      canonicalIds.add(id);
    }
    if (canonicalDuplicateCount > 0) {
      throw new TypeError(
        `FEDERATION_CANONICAL_IDS_NOT_DISJOINT:${shard.databaseName}:${canonicalDuplicateCount}`,
      );
    }
    let chunkDuplicateCount = 0;
    for (const id of chunks.values) {
      if (chunkIds.has(id)) chunkDuplicateCount += 1;
      chunkIds.add(id);
    }
    if (chunkDuplicateCount > 0) {
      throw new TypeError(
        `FEDERATION_CHUNK_IDS_NOT_DISJOINT:${shard.databaseName}:${chunkDuplicateCount}`,
      );
    }
    if (shard.totals.canonicalDocuments !== canonical.values.length) {
      throw new TypeError(`FEDERATION_CANONICAL_COUNT_MISMATCH:${shard.databaseName}`);
    }
    if (shard.totals.currentChunks !== chunks.values.length
      || shard.totals.indexedChunks !== chunks.values.length) {
      throw new TypeError(`FEDERATION_CHUNK_COUNT_MISMATCH:${shard.databaseName}`);
    }
    shards.push(federatedLegalCorpusShardSummarySchema.parse({
      databaseName: shard.databaseName,
      databaseId: shard.databaseId,
      corpusSnapshotSha256: shard.corpusSnapshotSha256,
      canonicalDocumentIdSetSha256: canonical.digest,
      chunkIdSetSha256: chunks.digest,
      ...shard.totals,
    }));
  }

  const snapshotManifestSha256 = sha256(snapshotArtifact.raw);
  if (baseEvidence.corpusSnapshotSha256 !== snapshotManifestSha256) {
    throw new TypeError("FEDERATION_BASE_SNAPSHOT_MANIFEST_MISMATCH");
  }
  const evidence = federatedLegalCorpusReleaseEvidenceSchema.parse({
    schemaVersion: FEDERATED_LEGAL_CORPUS_RELEASE_EVIDENCE_VERSION,
    baseEvidence,
    routing: {
      catalogAuthorityDatabaseName: routingArtifact.value.catalogAuthorityDatabaseName,
      shardNames: routeNames,
      partitionManifestSha256: sha256(partitionArtifact.raw),
      routingContractSha256: sha256(routingArtifact.raw),
      snapshotManifestSha256,
      retrievalVerificationSha256: sha256(retrievalArtifact.raw),
      canonicalDocumentDuplicateCount: 0,
      chunkDuplicateCount: 0,
      canonicalDocumentIdsDisjoint: true,
      chunkIdsDisjoint: true,
      pointInTimeSemanticsVerified: true,
      sparseDenseSourcePacketParityVerified: true,
      singleLexStreamVerified: true,
    },
    d1Capacities: capacities,
    shards,
  });
  return {
    evidence,
    verdict: evaluateFederatedLegalCorpusReleaseEvidence(evidence, now),
  };
}
