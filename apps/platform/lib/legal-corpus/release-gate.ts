import { z } from "zod";

import { LEX_CORPUS_CATEGORIES, LEX_CORPUS_LANGUAGES } from "./lex-discovery";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const commitSchema = z.string().regex(/^[a-f0-9]{40}$/u);
const isoTimestampSchema = z.string().datetime({ offset: true });

export const LEGAL_CORPUS_RELEASE_EVIDENCE_VERSION = 1;
export const LEGAL_CORPUS_RELEASE_SCENARIO_COUNT = 314;
export const LEGAL_CORPUS_RELEASE_EXPECTED_CHECKPOINTS =
  LEX_CORPUS_CATEGORIES.length * LEX_CORPUS_LANGUAGES.length;

export const LEGAL_CORPUS_RELEASE_THRESHOLDS = Object.freeze({
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
});

const featureFlagsSchema = z.object({
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

const totalsSchema = z.object({
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

const coverageSchema = z.object({
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

const failureSchema = z.object({
  retryState: z.string().min(1).max(40),
  retryable: z.boolean(),
  canRetry: z.boolean(),
}).passthrough();

const benchmarkSchema = z.object({
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

export const legalCorpusReleaseEvidenceSchema = z.object({
  schemaVersion: z.literal(LEGAL_CORPUS_RELEASE_EVIDENCE_VERSION),
  environment: z.literal("staging"),
  capturedAt: isoTimestampSchema,
  applicationCommit: commitSchema,
  corpusSnapshotSha256: sha256Schema,
  dashboard: z.object({
    environment: z.literal("staging"),
    featureFlags: featureFlagsSchema,
    lexHealth: z.object({ state: z.literal("fresh") }).passthrough(),
    totals: totalsSchema,
    coverage: z.array(coverageSchema).max(LEGAL_CORPUS_RELEASE_EXPECTED_CHECKPOINTS),
    failures: z.array(failureSchema).max(10_000),
    integrity: z.object({ valid: z.boolean(), checked: z.number().int().nonnegative() }).strict(),
  }).strict(),
  benchmark: benchmarkSchema,
}).strict();

export type LegalCorpusReleaseEvidence = z.infer<typeof legalCorpusReleaseEvidenceSchema>;

export type LegalCorpusReleaseVerdict = {
  passed: boolean;
  failures: string[];
  observed: {
    checkpointCount: number;
    completeCheckpointCount: number;
    expectedDocuments: number;
    indexedDocuments: number;
    technicallyUnavailable: number;
    technicalUnavailabilityRate: number;
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

  if (!fresh(evidence.capturedAt, now)) failures.push("EVIDENCE_STALE");
  if (!fresh(benchmark.generatedAt, now)) failures.push("BENCHMARK_STALE");
  if (!fresh(totals.lastSuccessfulUpdate, now)) failures.push("CORPUS_UPDATE_STALE");
  if (benchmark.applicationCommit !== evidence.applicationCommit) failures.push("BENCHMARK_COMMIT_MISMATCH");
  if (benchmark.corpusSnapshotSha256 !== evidence.corpusSnapshotSha256) failures.push("BENCHMARK_CORPUS_MISMATCH");

  for (const flag of [
    "LEGAL_CORPUS_ENABLED",
    "LEGAL_CORPUS_LIVE_LEXUZ_ENABLED",
    "LEGAL_CORPUS_MULTILINGUAL_ENABLED",
    "LEGAL_CORPUS_HISTORICAL_ENABLED",
    "LEGAL_CORPUS_DENSE_ENABLED",
    "LEGAL_CORPUS_SHADOW_MODE",
  ] as const) {
    if (!flags[flag]) failures.push(`FEATURE_FLAG_REQUIRED:${flag}`);
  }
  if (flags.LEGAL_CORPUS_AUTO_INGEST_ENABLED) failures.push("CORPUS_NOT_FROZEN");
  if (flags.LEGAL_CORPUS_OWNER_UPLOAD_AUTO_TRUST) failures.push("OWNER_AUTO_TRUST_ENABLED");
  if (flags.LEGAL_CORPUS_USER_UPLOAD_AUTO_TRUST) failures.push("USER_AUTO_TRUST_ENABLED");
  if (!evidence.dashboard.integrity.valid) failures.push("ADMIN_AUDIT_INTEGRITY_FAILED");

  const expectedCoverageKeys = new Set(
    LEX_CORPUS_CATEGORIES.flatMap(({ key }) =>
      LEX_CORPUS_LANGUAGES.map(({ language }) => `${key}:${language}`),
    ),
  );
  const observedCoverageKeys = new Set<string>();
  let expectedDocuments = 0;
  let indexedDocuments = 0;
  let technicallyUnavailable = 0;
  let completeCheckpointCount = 0;
  for (const row of coverage) {
    const key = `${row.categoryKey}:${row.language}`;
    if (observedCoverageKeys.has(key)) failures.push(`CHECKPOINT_DUPLICATE:${key}`);
    observedCoverageKeys.add(key);
    if (!expectedCoverageKeys.has(key)) failures.push(`CHECKPOINT_UNEXPECTED:${key}`);
    if (row.expectedDocuments === null) failures.push(`CHECKPOINT_EXPECTED_COUNT_MISSING:${key}`);
    else expectedDocuments += row.expectedDocuments;
    indexedDocuments += row.indexedDocuments;
    technicallyUnavailable += row.technicallyUnavailable;
    if (row.complete && row.status === "completed" && row.lastErrorCode === null) completeCheckpointCount += 1;
    else failures.push(`CHECKPOINT_INCOMPLETE:${key}`);
    if (row.expectedDocuments !== null
      && row.indexedDocuments + row.technicallyUnavailable < row.expectedDocuments) {
      failures.push(`CHECKPOINT_COVERAGE_GAP:${key}`);
    }
  }
  for (const key of expectedCoverageKeys) {
    if (!observedCoverageKeys.has(key)) failures.push(`CHECKPOINT_MISSING:${key}`);
  }
  if (coverage.length !== LEGAL_CORPUS_RELEASE_EXPECTED_CHECKPOINTS) {
    failures.push("CHECKPOINT_COUNT_MISMATCH");
  }

  const technicalUnavailabilityRate = expectedDocuments === 0
    ? 1
    : technicallyUnavailable / expectedDocuments;
  if (technicalUnavailabilityRate > LEGAL_CORPUS_RELEASE_THRESHOLDS.maximumTechnicalUnavailabilityRate) {
    failures.push("TECHNICAL_UNAVAILABILITY_RATE_FAILED");
  }
  if (totals.canonicalDocuments === 0) failures.push("CORPUS_EMPTY");
  if (totals.languageVariants < totals.canonicalDocuments) failures.push("LANGUAGE_VARIANT_COUNT_INVALID");
  if (totals.uniqueProvisions === 0 || totals.currentProvisions === 0) failures.push("PROVISIONS_EMPTY");
  if (totals.currentChunks === 0) failures.push("CHUNKS_EMPTY");
  if (totals.indexedChunks !== totals.currentChunks) failures.push("CURRENT_CHUNKS_NOT_FULLY_INDEXED");
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
      indexedDocuments,
      technicallyUnavailable,
      technicalUnavailabilityRate,
    },
  };
}
