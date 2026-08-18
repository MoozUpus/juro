import { z } from "zod";

import { LEGAL_EVALUATION_CORPUS_VERSION } from "../../evaluation/legal-evaluation-contract";
import { LEX_CORPUS_CATEGORIES, LEX_CORPUS_LANGUAGES } from "./lex-discovery";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const commitSchema = z.string().regex(/^[a-f0-9]{40}$/u);
const isoTimestampSchema = z.string().datetime({ offset: true });

export const LEGAL_CORPUS_RELEASE_EVIDENCE_VERSION = 4;
export const LEGAL_CORPUS_RELEASE_SCENARIO_COUNT = 314;
export const LEGAL_CORPUS_RELEASE_EXPECTED_CHECKPOINTS =
  LEX_CORPUS_CATEGORIES.length * LEX_CORPUS_LANGUAGES.length;
export const LEGAL_CORPUS_STAGING_D1_DATABASE_NAME = "juro-staging";

/**
 * Cloudflare currently limits one paid D1 database to 10 GB. The release gate
 * reserves 20% of that ceiling for an in-progress crawl, version history and
 * operational recovery; it is not a claim about the account-wide allowance.
 */
export const LEGAL_CORPUS_MAX_D1_DATABASE_BYTES = 10_000_000_000;
export const LEGAL_CORPUS_MAX_RELEASE_D1_DATABASE_BYTES = 8_000_000_000;

/**
 * The release floor is the greater of the verified Huquq AI main-branch
 * corpus at the pinned source commit and the owner's explicit reserve floor.
 * Huquq AI's audited reference counts are 1,283 documents and 20,296
 * provisions; the owner has raised JURO's reserve to 1,500 and 22,000.
 * Language variants are deliberately excluded from a numeric floor because
 * completeness is proved per discovered category/language checkpoint instead
 * of assuming that every act exists in four languages.
 */
export const LEGAL_CORPUS_BASELINE = Object.freeze({
  sourceRepository: "toxirerkinov70-commits/huquq-ai",
  sourceCommit: "1bce500c69b8213373d8ce0b40d56be7d83f6aec",
  canonicalDocuments: 1_500,
  uniqueProvisions: 22_000,
  indexedChunks: 22_513,
});

export const LEGAL_CORPUS_RELEASE_THRESHOLDS = Object.freeze({
  minimumCanonicalDocuments: LEGAL_CORPUS_BASELINE.canonicalDocuments,
  minimumUniqueProvisions: LEGAL_CORPUS_BASELINE.uniqueProvisions,
  minimumIndexedChunks: LEGAL_CORPUS_BASELINE.indexedChunks,
  recallAt5: 0.9,
  recallAt10: 0.95,
  mrr: 0.85,
  citationPrecision: 1,
  citationRecall: 0.95,
  articleExactness: 0.95,
  documentExactness: 0.97,
  abstentionAccuracy: 0.95,
  partialAnswerAccuracy: 0.9,
  groundedness: 0.95,
  staleSourceRate: 0,
  invalidLinkRate: 0,
  maximumTechnicalUnavailabilityRate: 0.02,
  p95RetrievalMs: 5_000,
  p95CompleteAnswerMs: 30_000,
  maximumProviderCostUsd: 30,
  maximumEvidenceAgeMs: 24 * 60 * 60_000,
  maximumD1DatabaseBytes: LEGAL_CORPUS_MAX_RELEASE_D1_DATABASE_BYTES,
});

export const legalCorpusFeatureFlagsEvidenceSchema = z.object({
  LEGAL_CORPUS_ENABLED: z.boolean(),
  LEGAL_CORPUS_LIVE_LEXUZ_ENABLED: z.boolean(),
  LEGAL_CORPUS_AUTO_INGEST_ENABLED: z.boolean(),
  LEGAL_CORPUS_MULTILINGUAL_ENABLED: z.boolean(),
  LEGAL_CORPUS_OWNER_UPLOAD_AUTO_TRUST: z.boolean(),
  LEGAL_CORPUS_USER_UPLOAD_AUTO_TRUST: z.boolean(),
  LEGAL_CORPUS_HISTORICAL_ENABLED: z.boolean(),
  LEGAL_CORPUS_DENSE_ENABLED: z.boolean(),
  LEGAL_CORPUS_SHADOW_MODE: z.boolean(),
}).strict();

export const legalCorpusTotalsEvidenceSchema = z.object({
  canonicalDocuments: z.number().int().nonnegative(),
  languageVariants: z.number().int().nonnegative(),
  uniqueProvisions: z.number().int().nonnegative(),
  currentProvisions: z.number().int().nonnegative(),
  currentChunks: z.number().int().nonnegative(),
  indexedChunks: z.number().int().nonnegative(),
  activeDocuments: z.number().int().nonnegative(),
  repealedDocuments: z.number().int().nonnegative(),
  historicalVersions: z.number().int().nonnegative(),
  documentsFetchedToday: z.number().int().nonnegative(),
  liveOrManualQueued: z.number().int().nonnegative(),
  failedDocuments: z.number().int().nonnegative(),
  lastSuccessfulUpdate: isoTimestampSchema.nullable(),
}).strict();

export const legalCorpusCoverageEvidenceSchema = z.object({
  categoryKey: z.enum(LEX_CORPUS_CATEGORIES.map(({ key }) => key)),
  language: z.enum(LEX_CORPUS_LANGUAGES.map(({ language }) => language)),
  status: z.string().min(1).max(40),
  expectedDocuments: z.number().int().nonnegative().nullable(),
  discoveredDocuments: z.number().int().nonnegative(),
  fetchedDocuments: z.number().int().nonnegative(),
  extractedDocuments: z.number().int().nonnegative(),
  indexedDocuments: z.number().int().nonnegative(),
  technicallyUnavailable: z.number().int().nonnegative(),
  pageNumber: z.number().int().nonnegative(),
  lastErrorCode: z.string().min(1).max(120).nullable(),
  updatedAt: isoTimestampSchema,
  complete: z.boolean(),
}).strict();

export const legalCorpusFailureEvidenceSchema = z.object({
  retryState: z.string().min(1).max(40),
  retryable: z.boolean(),
  canRetry: z.boolean(),
}).passthrough();

export const legalCorpusBenchmarkEvidenceSchema = z.object({
  generatedAt: isoTimestampSchema,
  applicationCommit: commitSchema,
  corpusSnapshotSha256: sha256Schema,
  scenarioCount: z.literal(LEGAL_CORPUS_RELEASE_SCENARIO_COUNT),
  reviewedScenarioCount: z.literal(LEGAL_CORPUS_RELEASE_SCENARIO_COUNT),
  providerRequestCount: z.number().int().positive(),
  unpricedRequestCount: z.number().int().nonnegative(),
  totalProviderCostUsd: z.number().nonnegative(),
  identicalSourcePackets: z.literal(true),
  officialOnly: z.literal(true),
  denseEnabled: z.literal(true),
  sparseEnabled: z.literal(true),
  rrfEnabled: z.literal(true),
  qdrantVectorSize: z.literal(1536),
  qdrantDistance: z.literal("Cosine"),
  qdrantCurrentPointCount: z.number().int().nonnegative(),
  qdrantTotalPointCount: z.number().int().nonnegative(),
  qdrantSnapshotSha256: sha256Schema,
  qdrantSnapshotCurrentPointCount: z.number().int().nonnegative(),
  qdrantSnapshotTotalPointCount: z.number().int().nonnegative(),
  rerankMode: z.enum(["deterministic", "openai", "local", "validated_fallback"]),
  recallAt5: z.number().min(0).max(1),
  recallAt10: z.number().min(0).max(1),
  mrr: z.number().min(0).max(1),
  citationPrecision: z.number().min(0).max(1),
  citationRecall: z.number().min(0).max(1),
  articleExactness: z.number().min(0).max(1),
  documentExactness: z.number().min(0).max(1),
  abstentionAccuracy: z.number().min(0).max(1),
  partialAnswerAccuracy: z.number().min(0).max(1),
  staleSourceRate: z.number().min(0).max(1),
  invalidLinkRate: z.number().min(0).max(1),
  groundedness: z.number().min(0).max(1),
  p95RetrievalMs: z.number().int().nonnegative(),
  p95CompleteAnswerMs: z.number().int().nonnegative(),
}).strict();

export const legalCorpusHumanReviewBindingSchema = z.object({
  schemaVersion: z.literal(1),
  corpusVersion: z.literal(LEGAL_EVALUATION_CORPUS_VERSION),
  corpusSha256: sha256Schema,
  evaluationRunId: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9._:-]+$/u),
  attestationId: z.string().uuid(),
  attestationEventHash: sha256Schema,
  scopeDigest: sha256Schema,
  exportDigest: sha256Schema,
  fileSha256: sha256Schema,
  recordCount: z.literal(LEGAL_CORPUS_RELEASE_SCENARIO_COUNT),
  correctCount: z.literal(LEGAL_CORPUS_RELEASE_SCENARIO_COUNT),
  exportedAt: isoTimestampSchema,
  verified: z.literal(true),
}).strict();

/**
 * The input is emitted by `capture-legal-corpus-d1-capacity.mjs`, which calls
 * `wrangler d1 info --json` against staging. The final evidence adds a digest
 * of that independent input file so reviewers can retain the exact probe.
 */
export const legalCorpusD1CapacityInputSchema = z.object({
  schemaVersion: z.literal(1),
  environment: z.literal("staging"),
  databaseId: z.string().uuid(),
  databaseName: z.literal(LEGAL_CORPUS_STAGING_D1_DATABASE_NAME),
  observedAt: isoTimestampSchema,
  databaseSizeBytes: z.number().int().nonnegative(),
  source: z.literal("wrangler_d1_info"),
}).strict();

export const legalCorpusD1CapacityEvidenceSchema = legalCorpusD1CapacityInputSchema.extend({
  fileSha256: sha256Schema,
}).strict();

export const legalCorpusDashboardEvidenceSchema = z.object({
  environment: z.literal("staging"),
  featureFlags: legalCorpusFeatureFlagsEvidenceSchema,
  lexHealth: z.object({ state: z.literal("fresh") }).passthrough(),
  qdrantHealth: z.object({
    configured: z.boolean(),
    enabled: z.boolean(),
    status: z.enum(["disabled", "not_configured", "ready", "collection_missing", "incompatible", "unavailable"]),
    totalPoints: z.number().int().nonnegative().nullable(),
    currentPoints: z.number().int().nonnegative().nullable(),
    errorCode: z.string().min(1).max(120).nullable(),
    checkedAt: isoTimestampSchema,
  }).strict(),
  totals: legalCorpusTotalsEvidenceSchema,
  coverage: z.array(legalCorpusCoverageEvidenceSchema).max(LEGAL_CORPUS_RELEASE_EXPECTED_CHECKPOINTS),
  failures: z.array(legalCorpusFailureEvidenceSchema).max(10_000),
  integrity: z.object({ valid: z.boolean(), checked: z.number().int().nonnegative() }).strict(),
}).strict();

export const legalCorpusReleaseEvidenceSchema = z.object({
  schemaVersion: z.literal(LEGAL_CORPUS_RELEASE_EVIDENCE_VERSION),
  environment: z.literal("staging"),
  capturedAt: isoTimestampSchema,
  applicationCommit: commitSchema,
  corpusSnapshotSha256: sha256Schema,
  humanReview: legalCorpusHumanReviewBindingSchema,
  d1Capacity: legalCorpusD1CapacityEvidenceSchema,
  dashboard: legalCorpusDashboardEvidenceSchema,
  benchmark: legalCorpusBenchmarkEvidenceSchema,
}).strict();

export type LegalCorpusReleaseEvidence = z.infer<typeof legalCorpusReleaseEvidenceSchema>;

export type LegalCorpusReleaseVerdict = {
  passed: boolean;
  failures: string[];
  observed: {
    checkpointCount: number;
    completeCheckpointCount: number;
    expectedDocuments: number;
    discoveredDocuments: number;
    indexedDocuments: number;
    technicallyUnavailable: number;
    technicalUnavailabilityRate: number;
    qdrantCurrentPointCount: number;
    qdrantTotalPointCount: number;
    qdrantSnapshotCurrentPointCount: number;
    qdrantSnapshotTotalPointCount: number;
  };
};

function fresh(value: string | null, now: Date): boolean {
  if (!value) return false;
  const age = now.getTime() - Date.parse(value);
  return Number.isFinite(age)
    && age >= 0
    && age <= LEGAL_CORPUS_RELEASE_THRESHOLDS.maximumEvidenceAgeMs;
}

function minimum(
  failures: string[],
  code: string,
  actual: number,
  required: number,
): void {
  if (actual < required) failures.push(code);
}

export function evaluateLegalCorpusReleaseEvidence(
  evidence: LegalCorpusReleaseEvidence,
  now = new Date(),
): LegalCorpusReleaseVerdict {
  const failures: string[] = [];
  const flags = evidence.dashboard.featureFlags;
  const totals = evidence.dashboard.totals;
  const coverage = evidence.dashboard.coverage;
  const benchmark = evidence.benchmark;
  const humanReview = evidence.humanReview;
  const d1Capacity = evidence.d1Capacity;

  if (!fresh(evidence.capturedAt, now)) failures.push("EVIDENCE_STALE");
  if (!fresh(benchmark.generatedAt, now)) failures.push("BENCHMARK_STALE");
  if (!fresh(totals.lastSuccessfulUpdate, now)) failures.push("CORPUS_UPDATE_STALE");
  if (!fresh(d1Capacity.observedAt, now)) failures.push("D1_CAPACITY_EVIDENCE_STALE");
  if (d1Capacity.databaseName !== LEGAL_CORPUS_STAGING_D1_DATABASE_NAME) {
    failures.push("D1_CAPACITY_DATABASE_MISMATCH");
  }
  if (d1Capacity.databaseSizeBytes > LEGAL_CORPUS_RELEASE_THRESHOLDS.maximumD1DatabaseBytes) {
    failures.push("D1_CAPACITY_LIMIT_FAILED");
  }
  if (benchmark.applicationCommit !== evidence.applicationCommit) failures.push("BENCHMARK_COMMIT_MISMATCH");
  if (benchmark.corpusSnapshotSha256 !== evidence.corpusSnapshotSha256) failures.push("BENCHMARK_CORPUS_MISMATCH");
  // A benchmark is release evidence only when both retrieval paths evaluated
  // the same validated official packet. Otherwise good metrics could hide a
  // dense/sparse/RRF regression or comparisons made against different legal
  // contexts.
  if (!benchmark.identicalSourcePackets) failures.push("BENCHMARK_SOURCE_PACKETS_MISMATCH");
  if (!benchmark.officialOnly) failures.push("BENCHMARK_NON_OFFICIAL_SOURCE");
  if (!benchmark.denseEnabled) failures.push("BENCHMARK_DENSE_RETRIEVAL_DISABLED");
  if (!benchmark.sparseEnabled) failures.push("BENCHMARK_SPARSE_RETRIEVAL_DISABLED");
  if (!benchmark.rrfEnabled) failures.push("BENCHMARK_RRF_DISABLED");
  if (humanReview.recordCount !== benchmark.reviewedScenarioCount
    || humanReview.correctCount !== benchmark.scenarioCount) {
    failures.push("HUMAN_REVIEW_SCENARIO_MISMATCH");
  }

  for (const flag of [
    "LEGAL_CORPUS_ENABLED",
    "LEGAL_CORPUS_LIVE_LEXUZ_ENABLED",
    "LEGAL_CORPUS_MULTILINGUAL_ENABLED",
    "LEGAL_CORPUS_OWNER_UPLOAD_AUTO_TRUST",
    "LEGAL_CORPUS_USER_UPLOAD_AUTO_TRUST",
    "LEGAL_CORPUS_HISTORICAL_ENABLED",
    "LEGAL_CORPUS_DENSE_ENABLED",
    "LEGAL_CORPUS_SHADOW_MODE",
  ] as const) {
    if (!flags[flag]) failures.push(`FEATURE_FLAG_REQUIRED:${flag}`);
  }
  if (flags.LEGAL_CORPUS_AUTO_INGEST_ENABLED) failures.push("CORPUS_NOT_FROZEN");
  if (!evidence.dashboard.integrity.valid) failures.push("ADMIN_AUDIT_INTEGRITY_FAILED");

  const expectedCoverageKeys = new Set(
    LEX_CORPUS_CATEGORIES.flatMap(({ key }) =>
      LEX_CORPUS_LANGUAGES.map(({ language }) => `${key}:${language}`),
    ),
  );
  const observedCoverageKeys = new Set<string>();
  let expectedDocuments = 0;
  let discoveredDocuments = 0;
  let indexedDocuments = 0;
  let technicallyUnavailable = 0;
  let completeCheckpointCount = 0;
  for (const row of coverage) {
    const key = `${row.categoryKey}:${row.language}`;
    if (observedCoverageKeys.has(key)) failures.push(`CHECKPOINT_DUPLICATE:${key}`);
    observedCoverageKeys.add(key);
    if (!expectedCoverageKeys.has(key)) failures.push(`CHECKPOINT_UNEXPECTED:${key}`);
    if (row.expectedDocuments === null) failures.push(`CHECKPOINT_EXPECTED_COUNT_MISSING:${key}`);
    else {
      expectedDocuments += row.expectedDocuments;
      if (row.expectedDocuments !== row.discoveredDocuments) {
        failures.push(`CHECKPOINT_DISCOVERY_COUNT_MISMATCH:${key}`);
      }
    }
    discoveredDocuments += row.discoveredDocuments;
    indexedDocuments += row.indexedDocuments;
    technicallyUnavailable += row.technicallyUnavailable;
    const resolvedDocuments = row.indexedDocuments + row.technicallyUnavailable;
    const independentlyComplete = row.complete
      && row.status === "completed"
      && row.lastErrorCode === null
      && row.expectedDocuments !== null
      && row.expectedDocuments === row.discoveredDocuments
      && resolvedDocuments === row.discoveredDocuments;
    if (independentlyComplete) completeCheckpointCount += 1;
    else failures.push(`CHECKPOINT_INCOMPLETE:${key}`);
    if (resolvedDocuments !== row.discoveredDocuments) {
      failures.push(`CHECKPOINT_COVERAGE_GAP:${key}`);
    }
  }
  for (const key of expectedCoverageKeys) {
    if (!observedCoverageKeys.has(key)) failures.push(`CHECKPOINT_MISSING:${key}`);
  }
  if (coverage.length !== LEGAL_CORPUS_RELEASE_EXPECTED_CHECKPOINTS) {
    failures.push("CHECKPOINT_COUNT_MISMATCH");
  }

  const technicalUnavailabilityRate = discoveredDocuments === 0
    ? 1
    : technicallyUnavailable / discoveredDocuments;
  if (technicalUnavailabilityRate > LEGAL_CORPUS_RELEASE_THRESHOLDS.maximumTechnicalUnavailabilityRate) {
    failures.push("TECHNICAL_UNAVAILABILITY_RATE_FAILED");
  }
  if (totals.canonicalDocuments === 0) failures.push("CORPUS_EMPTY");
  minimum(
    failures,
    "CANONICAL_DOCUMENT_COUNT_BELOW_BASELINE",
    totals.canonicalDocuments,
    LEGAL_CORPUS_RELEASE_THRESHOLDS.minimumCanonicalDocuments,
  );
  if (totals.languageVariants < totals.canonicalDocuments) failures.push("LANGUAGE_VARIANT_COUNT_INVALID");
  if (totals.uniqueProvisions === 0 || totals.currentProvisions === 0) failures.push("PROVISIONS_EMPTY");
  minimum(
    failures,
    "UNIQUE_PROVISION_COUNT_BELOW_BASELINE",
    totals.uniqueProvisions,
    LEGAL_CORPUS_RELEASE_THRESHOLDS.minimumUniqueProvisions,
  );
  if (totals.currentChunks === 0) failures.push("CHUNKS_EMPTY");
  if (totals.indexedChunks !== totals.currentChunks) failures.push("CURRENT_CHUNKS_NOT_FULLY_INDEXED");
  if (benchmark.qdrantCurrentPointCount !== totals.currentChunks) {
    failures.push("QDRANT_CURRENT_POINT_COUNT_MISMATCH");
  }
  if (benchmark.qdrantTotalPointCount < benchmark.qdrantCurrentPointCount) {
    failures.push("QDRANT_TOTAL_POINT_COUNT_INVALID");
  }
  if (benchmark.qdrantSnapshotCurrentPointCount !== benchmark.qdrantCurrentPointCount) {
    failures.push("QDRANT_SNAPSHOT_CURRENT_POINT_COUNT_MISMATCH");
  }
  if (benchmark.qdrantSnapshotTotalPointCount !== benchmark.qdrantTotalPointCount) {
    failures.push("QDRANT_SNAPSHOT_TOTAL_POINT_COUNT_MISMATCH");
  }
  minimum(
    failures,
    "INDEXED_CHUNK_COUNT_BELOW_BASELINE",
    totals.indexedChunks,
    LEGAL_CORPUS_RELEASE_THRESHOLDS.minimumIndexedChunks,
  );
  if (totals.activeDocuments === 0) failures.push("ACTIVE_DOCUMENTS_EMPTY");
  if (totals.activeDocuments + totals.repealedDocuments > totals.canonicalDocuments) {
    failures.push("DOCUMENT_STATUS_TOTAL_INVALID");
  }
  if (totals.historicalVersions === 0) failures.push("HISTORICAL_VERSIONS_EMPTY");
  if (totals.liveOrManualQueued !== 0) failures.push("INGESTION_QUEUE_NOT_EMPTY");
  if (evidence.dashboard.failures.some((failure) =>
    failure.retryable || failure.canRetry || failure.retryState === "terminal" || failure.retryState === "pending")) {
    failures.push("UNRESOLVED_INGESTION_FAILURES");
  }

  const qdrantHealth = evidence.dashboard.qdrantHealth;
  if (!qdrantHealth.configured) failures.push("QDRANT_HEALTH_NOT_CONFIGURED");
  if (!qdrantHealth.enabled) failures.push("QDRANT_HEALTH_DISABLED");
  if (qdrantHealth.status !== "ready") failures.push("QDRANT_HEALTH_NOT_READY");
  if (qdrantHealth.errorCode !== null) failures.push("QDRANT_HEALTH_ERROR");
  if (!fresh(qdrantHealth.checkedAt, now)) failures.push("QDRANT_HEALTH_STALE");
  if (qdrantHealth.currentPoints !== benchmark.qdrantCurrentPointCount) {
    failures.push("QDRANT_HEALTH_CURRENT_POINT_COUNT_MISMATCH");
  }
  if (qdrantHealth.totalPoints !== benchmark.qdrantTotalPointCount) {
    failures.push("QDRANT_HEALTH_TOTAL_POINT_COUNT_MISMATCH");
  }

  minimum(failures, "RECALL_AT_5_FAILED", benchmark.recallAt5, LEGAL_CORPUS_RELEASE_THRESHOLDS.recallAt5);
  minimum(failures, "RECALL_AT_10_FAILED", benchmark.recallAt10, LEGAL_CORPUS_RELEASE_THRESHOLDS.recallAt10);
  minimum(failures, "MRR_FAILED", benchmark.mrr, LEGAL_CORPUS_RELEASE_THRESHOLDS.mrr);
  minimum(failures, "CITATION_PRECISION_FAILED", benchmark.citationPrecision, LEGAL_CORPUS_RELEASE_THRESHOLDS.citationPrecision);
  minimum(failures, "CITATION_RECALL_FAILED", benchmark.citationRecall, LEGAL_CORPUS_RELEASE_THRESHOLDS.citationRecall);
  minimum(failures, "ARTICLE_EXACTNESS_FAILED", benchmark.articleExactness, LEGAL_CORPUS_RELEASE_THRESHOLDS.articleExactness);
  minimum(failures, "DOCUMENT_EXACTNESS_FAILED", benchmark.documentExactness, LEGAL_CORPUS_RELEASE_THRESHOLDS.documentExactness);
  minimum(failures, "ABSTENTION_ACCURACY_FAILED", benchmark.abstentionAccuracy, LEGAL_CORPUS_RELEASE_THRESHOLDS.abstentionAccuracy);
  minimum(failures, "PARTIAL_ANSWER_ACCURACY_FAILED", benchmark.partialAnswerAccuracy, LEGAL_CORPUS_RELEASE_THRESHOLDS.partialAnswerAccuracy);
  minimum(failures, "GROUNDEDNESS_FAILED", benchmark.groundedness, LEGAL_CORPUS_RELEASE_THRESHOLDS.groundedness);
  if (benchmark.staleSourceRate > LEGAL_CORPUS_RELEASE_THRESHOLDS.staleSourceRate) failures.push("STALE_SOURCE_RATE_FAILED");
  if (benchmark.invalidLinkRate > LEGAL_CORPUS_RELEASE_THRESHOLDS.invalidLinkRate) failures.push("INVALID_LINK_RATE_FAILED");
  if (benchmark.p95RetrievalMs > LEGAL_CORPUS_RELEASE_THRESHOLDS.p95RetrievalMs) failures.push("P95_RETRIEVAL_FAILED");
  if (benchmark.p95CompleteAnswerMs > LEGAL_CORPUS_RELEASE_THRESHOLDS.p95CompleteAnswerMs) failures.push("P95_COMPLETE_ANSWER_FAILED");
  if (benchmark.totalProviderCostUsd > LEGAL_CORPUS_RELEASE_THRESHOLDS.maximumProviderCostUsd) failures.push("PROVIDER_COST_LIMIT_FAILED");
  if (benchmark.unpricedRequestCount !== 0) failures.push("UNPRICED_PROVIDER_REQUESTS");

  return {
    passed: failures.length === 0,
    failures,
    observed: {
      checkpointCount: coverage.length,
      completeCheckpointCount,
      expectedDocuments,
      discoveredDocuments,
      indexedDocuments,
      technicallyUnavailable,
      technicalUnavailabilityRate,
      qdrantCurrentPointCount: benchmark.qdrantCurrentPointCount,
      qdrantTotalPointCount: benchmark.qdrantTotalPointCount,
      qdrantSnapshotCurrentPointCount: benchmark.qdrantSnapshotCurrentPointCount,
      qdrantSnapshotTotalPointCount: benchmark.qdrantSnapshotTotalPointCount,
    },
  };
}
