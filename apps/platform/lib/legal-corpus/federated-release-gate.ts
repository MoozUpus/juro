import { z } from "zod";

import {
  LEGAL_CORPUS_MAX_RELEASE_D1_DATABASE_BYTES,
  LEGAL_CORPUS_RELEASE_THRESHOLDS,
  evaluateLegalCorpusReleaseEvidence,
  legalCorpusD1CapacityEvidenceSchema,
  legalCorpusReleaseEvidenceSchema,
  type LegalCorpusReleaseEvidence,
} from "./release-gate";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const numberedShardNameSchema = z.string()
  .regex(/^juro-staging-corpus-shard-[1-9][0-9]*$/u);

export const FEDERATED_LEGAL_CORPUS_RELEASE_EVIDENCE_VERSION = 1;
export const FEDERATED_LEGAL_CORPUS_MAX_SHARDS = 32;
export const FEDERATED_LEGAL_CORPUS_CATALOG_AUTHORITY =
  "juro-staging-corpus-shard-1";

export const federatedLegalCorpusD1CapacityEvidenceSchema =
  legalCorpusD1CapacityEvidenceSchema.omit({ databaseName: true }).extend({
    databaseName: numberedShardNameSchema,
  }).strict();

export const federatedLegalCorpusShardSummarySchema = z.object({
  databaseName: numberedShardNameSchema,
  databaseId: z.string().uuid(),
  corpusSnapshotSha256: sha256Schema,
  canonicalDocumentIdSetSha256: sha256Schema,
  chunkIdSetSha256: sha256Schema,
  canonicalDocuments: z.number().int().nonnegative(),
  languageVariants: z.number().int().nonnegative(),
  uniqueProvisions: z.number().int().nonnegative(),
  currentProvisions: z.number().int().nonnegative(),
  currentChunks: z.number().int().nonnegative(),
  indexedChunks: z.number().int().nonnegative(),
  activeDocuments: z.number().int().nonnegative(),
  repealedDocuments: z.number().int().nonnegative(),
  historicalVersions: z.number().int().nonnegative(),
  liveOrManualQueued: z.number().int().nonnegative(),
  failedDocuments: z.number().int().nonnegative(),
}).strict();

export const federatedLegalCorpusReleaseEvidenceSchema = z.object({
  schemaVersion: z.literal(FEDERATED_LEGAL_CORPUS_RELEASE_EVIDENCE_VERSION),
  baseEvidence: legalCorpusReleaseEvidenceSchema,
  routing: z.object({
    catalogAuthorityDatabaseName: z.literal(FEDERATED_LEGAL_CORPUS_CATALOG_AUTHORITY),
    shardNames: z.array(numberedShardNameSchema)
      .min(2)
      .max(FEDERATED_LEGAL_CORPUS_MAX_SHARDS),
    partitionManifestSha256: sha256Schema,
    routingContractSha256: sha256Schema,
    snapshotManifestSha256: sha256Schema,
    retrievalVerificationSha256: sha256Schema,
    canonicalDocumentDuplicateCount: z.literal(0),
    chunkDuplicateCount: z.literal(0),
    canonicalDocumentIdsDisjoint: z.literal(true),
    chunkIdsDisjoint: z.literal(true),
    pointInTimeSemanticsVerified: z.literal(true),
    sparseDenseSourcePacketParityVerified: z.literal(true),
    singleLexStreamVerified: z.literal(true),
  }).strict(),
  d1Capacities: z.array(federatedLegalCorpusD1CapacityEvidenceSchema)
    .min(2)
    .max(FEDERATED_LEGAL_CORPUS_MAX_SHARDS),
  shards: z.array(federatedLegalCorpusShardSummarySchema)
    .min(2)
    .max(FEDERATED_LEGAL_CORPUS_MAX_SHARDS),
}).strict();

export type FederatedLegalCorpusReleaseEvidence = z.infer<
  typeof federatedLegalCorpusReleaseEvidenceSchema
>;

export type FederatedLegalCorpusReleaseVerdict = {
  passed: boolean;
  failures: string[];
  observed: ReturnType<typeof evaluateLegalCorpusReleaseEvidence>["observed"] & {
    shardCount: number;
    totalDatabaseBytes: number;
    maximumShardBytes: number;
  };
};

function fresh(value: string, now: Date): boolean {
  const age = now.getTime() - Date.parse(value);
  return Number.isFinite(age)
    && age >= 0
    && age <= LEGAL_CORPUS_RELEASE_THRESHOLDS.maximumEvidenceAgeMs;
}

function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function sortedShardNumbers(names: readonly string[]): number[] {
  return names.map((name) => Number(name.slice(name.lastIndexOf("-") + 1)))
    .sort((left, right) => left - right);
}

function sum(
  shards: readonly z.infer<typeof federatedLegalCorpusShardSummarySchema>[],
  key: keyof z.infer<typeof federatedLegalCorpusShardSummarySchema>,
): number {
  return shards.reduce((total, shard) => {
    const value = shard[key];
    return total + (typeof value === "number" ? value : 0);
  }, 0);
}

/**
 * Keeps the proven single-database release gate intact, then adds the evidence
 * required before totals from independently capacity-bounded D1 shards may be
 * treated as one corpus. The catalog authority remains shard 1; every other
 * shard is a disjoint data partition and cannot contribute by assertion alone.
 */
export function evaluateFederatedLegalCorpusReleaseEvidence(
  evidence: FederatedLegalCorpusReleaseEvidence,
  now = new Date(),
): FederatedLegalCorpusReleaseVerdict {
  const baseEvidence: LegalCorpusReleaseEvidence = evidence.baseEvidence;
  const baseVerdict = evaluateLegalCorpusReleaseEvidence(baseEvidence, now);
  const failures = [...baseVerdict.failures];
  const routeNames = evidence.routing.shardNames;
  const capacityNames = evidence.d1Capacities.map(({ databaseName }) => databaseName);
  const summaryNames = evidence.shards.map(({ databaseName }) => databaseName);

  for (const duplicate of duplicateValues(routeNames)) {
    failures.push(`FEDERATION_ROUTE_DUPLICATE:${duplicate}`);
  }
  for (const duplicate of duplicateValues(capacityNames)) {
    failures.push(`FEDERATION_CAPACITY_DUPLICATE:${duplicate}`);
  }
  for (const duplicate of duplicateValues(summaryNames)) {
    failures.push(`FEDERATION_SUMMARY_DUPLICATE:${duplicate}`);
  }
  for (const duplicate of duplicateValues(
    evidence.d1Capacities.map(({ databaseId }) => databaseId),
  )) {
    failures.push(`FEDERATION_DATABASE_ID_DUPLICATE:${duplicate}`);
  }

  const expectedNames = [...new Set(routeNames)].sort();
  const numbers = sortedShardNumbers(expectedNames);
  if (numbers.some((number, index) => number !== index + 1)) {
    failures.push("FEDERATION_SHARD_SEQUENCE_INVALID");
  }
  if (expectedNames.length !== routeNames.length
    || expectedNames.length !== evidence.d1Capacities.length
    || expectedNames.length !== evidence.shards.length) {
    failures.push("FEDERATION_SHARD_COUNT_MISMATCH");
  }
  if (JSON.stringify([...capacityNames].sort()) !== JSON.stringify(expectedNames)) {
    failures.push("FEDERATION_CAPACITY_SET_MISMATCH");
  }
  if (JSON.stringify([...summaryNames].sort()) !== JSON.stringify(expectedNames)) {
    failures.push("FEDERATION_SUMMARY_SET_MISMATCH");
  }
  if (baseEvidence.d1Capacity.databaseName
    !== evidence.routing.catalogAuthorityDatabaseName) {
    failures.push("FEDERATION_CATALOG_AUTHORITY_MISMATCH");
  }
  const authorityCapacity = evidence.d1Capacities.find(({ databaseName }) =>
    databaseName === evidence.routing.catalogAuthorityDatabaseName);
  if (!authorityCapacity
    || authorityCapacity.databaseId !== baseEvidence.d1Capacity.databaseId
    || authorityCapacity.fileSha256 !== baseEvidence.d1Capacity.fileSha256) {
    failures.push("FEDERATION_CATALOG_CAPACITY_MISMATCH");
  }

  for (const capacity of evidence.d1Capacities) {
    if (!fresh(capacity.observedAt, now)) {
      failures.push(`FEDERATION_D1_CAPACITY_STALE:${capacity.databaseName}`);
    }
    if (capacity.databaseSizeBytes > LEGAL_CORPUS_MAX_RELEASE_D1_DATABASE_BYTES) {
      failures.push(`FEDERATION_D1_CAPACITY_LIMIT_FAILED:${capacity.databaseName}`);
    }
  }

  const totals = baseEvidence.dashboard.totals;
  const aggregateChecks = [
    ["canonicalDocuments", totals.canonicalDocuments],
    ["languageVariants", totals.languageVariants],
    ["uniqueProvisions", totals.uniqueProvisions],
    ["currentProvisions", totals.currentProvisions],
    ["currentChunks", totals.currentChunks],
    ["indexedChunks", totals.indexedChunks],
    ["activeDocuments", totals.activeDocuments],
    ["repealedDocuments", totals.repealedDocuments],
    ["historicalVersions", totals.historicalVersions],
    ["liveOrManualQueued", totals.liveOrManualQueued],
    ["failedDocuments", totals.failedDocuments],
  ] as const;
  for (const [key, expected] of aggregateChecks) {
    if (sum(evidence.shards, key) !== expected) {
      failures.push(`FEDERATION_TOTAL_MISMATCH:${key}`);
    }
  }

  const totalDatabaseBytes = evidence.d1Capacities.reduce(
    (total, capacity) => total + capacity.databaseSizeBytes,
    0,
  );
  const maximumShardBytes = Math.max(
    ...evidence.d1Capacities.map(({ databaseSizeBytes }) => databaseSizeBytes),
  );
  return {
    passed: failures.length === 0,
    failures: [...new Set(failures)],
    observed: {
      ...baseVerdict.observed,
      shardCount: evidence.shards.length,
      totalDatabaseBytes,
      maximumShardBytes,
    },
  };
}
