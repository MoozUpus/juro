import assert from "node:assert/strict";
import test from "node:test";

import {
  LEGAL_CORPUS_BASELINE,
  evaluateLegalCorpusReleaseEvidence,
  legalCorpusReleaseEvidenceSchema,
  type LegalCorpusReleaseEvidence,
} from "../lib/legal-corpus/release-gate";
import { LEX_CORPUS_CATEGORIES, LEX_CORPUS_LANGUAGES } from "../lib/legal-corpus/lex-discovery";

const now = new Date("2026-08-15T12:00:00.000Z");
const commit = "a".repeat(40);
const snapshot = "b".repeat(64);

function validEvidence(): LegalCorpusReleaseEvidence {
  return legalCorpusReleaseEvidenceSchema.parse({
    schemaVersion: 3,
    environment: "staging",
    capturedAt: "2026-08-15T11:58:00.000Z",
    applicationCommit: commit,
    corpusSnapshotSha256: snapshot,
    humanReview: {
      schemaVersion: 1,
      corpusVersion: "2026-08-13.1",
      corpusSha256: "c".repeat(64),
      evaluationRunId: "staging-20260814-canonical",
      attestationId: "22000000-0000-4000-8000-000000000001",
      attestationEventHash: "d".repeat(64),
      scopeDigest: "e".repeat(64),
      exportDigest: "f".repeat(64),
      fileSha256: "1".repeat(64),
      recordCount: 314,
      correctCount: 314,
      exportedAt: "2026-08-14T12:06:38.000Z",
      verified: true,
    },
    dashboard: {
      environment: "staging",
      featureFlags: {
        LEGAL_CORPUS_ENABLED: true,
        LEGAL_CORPUS_LIVE_LEXUZ_ENABLED: true,
        LEGAL_CORPUS_AUTO_INGEST_ENABLED: false,
        LEGAL_CORPUS_MULTILINGUAL_ENABLED: true,
        LEGAL_CORPUS_OWNER_UPLOAD_AUTO_TRUST: true,
        LEGAL_CORPUS_USER_UPLOAD_AUTO_TRUST: true,
        LEGAL_CORPUS_HISTORICAL_ENABLED: true,
        LEGAL_CORPUS_DENSE_ENABLED: true,
        LEGAL_CORPUS_SHADOW_MODE: true,
      },
      lexHealth: { state: "fresh" },
      qdrantHealth: {
        configured: true,
        enabled: true,
        status: "ready",
        totalPoints: 25_000,
        currentPoints: 22_513,
        errorCode: null,
        checkedAt: "2026-08-15T11:59:00.000Z",
      },
      totals: {
        canonicalDocuments: 1_283,
        languageVariants: 2_400,
        uniqueProvisions: 20_296,
        currentProvisions: 20_296,
        currentChunks: 22_513,
        indexedChunks: 22_513,
        activeDocuments: 1_183,
        repealedDocuments: 100,
        historicalVersions: 3_000,
        documentsFetchedToday: 50,
        liveOrManualQueued: 0,
        failedDocuments: 0,
        lastSuccessfulUpdate: "2026-08-15T11:55:00.000Z",
      },
      coverage: LEX_CORPUS_CATEGORIES.flatMap(({ key }) =>
        LEX_CORPUS_LANGUAGES.map(({ language }) => ({
          categoryKey: key,
          language,
          status: "completed",
          expectedDocuments: 100,
          discoveredDocuments: 100,
          fetchedDocuments: 100,
          extractedDocuments: 100,
          indexedDocuments: 100,
          technicallyUnavailable: 0,
          pageNumber: 5,
          lastErrorCode: null,
          updatedAt: "2026-08-15T11:55:00.000Z",
          complete: true,
        })),
      ),
      failures: [],
      integrity: { valid: true, checked: 2 },
    },
    benchmark: {
      generatedAt: "2026-08-15T11:59:00.000Z",
      applicationCommit: commit,
      corpusSnapshotSha256: snapshot,
      scenarioCount: 314,
      reviewedScenarioCount: 314,
      providerRequestCount: 628,
      unpricedRequestCount: 0,
      totalProviderCostUsd: 12.5,
      identicalSourcePackets: true,
      officialOnly: true,
      denseEnabled: true,
      sparseEnabled: true,
      rrfEnabled: true,
      qdrantVectorSize: 1536,
      qdrantDistance: "Cosine",
      qdrantCurrentPointCount: 22_513,
      qdrantTotalPointCount: 25_000,
      qdrantSnapshotSha256: "2".repeat(64),
      qdrantSnapshotCurrentPointCount: 22_513,
      qdrantSnapshotTotalPointCount: 25_000,
      rerankMode: "deterministic",
      recallAt5: 0.94,
      recallAt10: 0.97,
      mrr: 0.9,
      citationPrecision: 1,
      citationRecall: 0.97,
      articleExactness: 0.97,
      documentExactness: 0.99,
      abstentionAccuracy: 0.97,
      partialAnswerAccuracy: 0.94,
      staleSourceRate: 0,
      invalidLinkRate: 0,
      groundedness: 0.98,
      p95RetrievalMs: 2_500,
      p95CompleteAnswerMs: 21_000,
    },
  });
}

test("release gate accepts only complete frozen staging evidence", () => {
  const verdict = evaluateLegalCorpusReleaseEvidence(validEvidence(), now);
  assert.deepEqual(verdict.failures, []);
  assert.equal(verdict.passed, true);
  assert.equal(verdict.observed.checkpointCount, 44);
  assert.equal(verdict.observed.completeCheckpointCount, 44);
  assert.equal(verdict.observed.discoveredDocuments, 4_400);
});

test("release gate resolves every discovered ID instead of trusting a lower expected count", () => {
  const evidence = validEvidence();
  const row = evidence.dashboard.coverage[0]!;
  row.discoveredDocuments = 101;
  row.complete = true;
  const verdict = evaluateLegalCorpusReleaseEvidence(evidence, now);
  const key = `${row.categoryKey}:${row.language}`;
  for (const code of [
    `CHECKPOINT_DISCOVERY_COUNT_MISMATCH:${key}`,
    `CHECKPOINT_COVERAGE_GAP:${key}`,
    `CHECKPOINT_INCOMPLETE:${key}`,
  ]) assert.ok(verdict.failures.includes(code), code);
  assert.equal(verdict.passed, false);
});

test("release gate enforces the pinned Huquq AI and owner reserve corpus floor", () => {
  assert.deepEqual(LEGAL_CORPUS_BASELINE, {
    sourceRepository: "toxirerkinov70-commits/huquq-ai",
    sourceCommit: "1bce500c69b8213373d8ce0b40d56be7d83f6aec",
    canonicalDocuments: 1_283,
    uniqueProvisions: 20_296,
    indexedChunks: 22_513,
  });
  const evidence = validEvidence();
  evidence.dashboard.totals.canonicalDocuments -= 1;
  evidence.dashboard.totals.uniqueProvisions -= 1;
  evidence.dashboard.totals.currentProvisions -= 1;
  evidence.dashboard.totals.currentChunks -= 1;
  evidence.dashboard.totals.indexedChunks -= 1;
  const verdict = evaluateLegalCorpusReleaseEvidence(evidence, now);
  for (const code of [
    "CANONICAL_DOCUMENT_COUNT_BELOW_BASELINE",
    "UNIQUE_PROVISION_COUNT_BELOW_BASELINE",
    "INDEXED_CHUNK_COUNT_BELOW_BASELINE",
  ]) assert.ok(verdict.failures.includes(code), code);
});

test("release gate fails closed for the currently empty disabled corpus", () => {
  const evidence = validEvidence();
  evidence.dashboard.featureFlags.LEGAL_CORPUS_ENABLED = false;
  evidence.dashboard.featureFlags.LEGAL_CORPUS_DENSE_ENABLED = false;
  evidence.dashboard.featureFlags.LEGAL_CORPUS_SHADOW_MODE = false;
  evidence.dashboard.totals.canonicalDocuments = 0;
  evidence.dashboard.totals.languageVariants = 0;
  evidence.dashboard.totals.uniqueProvisions = 0;
  evidence.dashboard.totals.currentProvisions = 0;
  evidence.dashboard.totals.currentChunks = 0;
  evidence.dashboard.totals.indexedChunks = 0;
  evidence.dashboard.totals.activeDocuments = 0;
  evidence.dashboard.totals.historicalVersions = 0;
  evidence.dashboard.coverage = [];
  const verdict = evaluateLegalCorpusReleaseEvidence(evidence, now);
  assert.equal(verdict.passed, false);
  for (const code of [
    "FEATURE_FLAG_REQUIRED:LEGAL_CORPUS_ENABLED",
    "FEATURE_FLAG_REQUIRED:LEGAL_CORPUS_DENSE_ENABLED",
    "FEATURE_FLAG_REQUIRED:LEGAL_CORPUS_SHADOW_MODE",
    "CHECKPOINT_COUNT_MISMATCH",
    "CORPUS_EMPTY",
    "CANONICAL_DOCUMENT_COUNT_BELOW_BASELINE",
    "PROVISIONS_EMPTY",
    "UNIQUE_PROVISION_COUNT_BELOW_BASELINE",
    "CHUNKS_EMPTY",
    "INDEXED_CHUNK_COUNT_BELOW_BASELINE",
    "ACTIVE_DOCUMENTS_EMPTY",
    "HISTORICAL_VERSIONS_EMPTY",
  ]) assert.ok(verdict.failures.includes(code), code);
});

test("release gate rejects snapshot drift, unresolved failures and metric regression", () => {
  const evidence = validEvidence();
  evidence.benchmark.corpusSnapshotSha256 = "c".repeat(64);
  evidence.dashboard.failures = [{ retryState: "terminal", retryable: false, canRetry: false }];
  evidence.benchmark.citationPrecision = 0.999;
  evidence.benchmark.invalidLinkRate = 0.001;
  evidence.benchmark.p95CompleteAnswerMs = 30_001;
  const verdict = evaluateLegalCorpusReleaseEvidence(evidence, now);
  for (const code of [
    "BENCHMARK_CORPUS_MISMATCH",
    "UNRESOLVED_INGESTION_FAILURES",
    "CITATION_PRECISION_FAILED",
    "INVALID_LINK_RATE_FAILED",
    "P95_COMPLETE_ANSWER_FAILED",
  ]) assert.ok(verdict.failures.includes(code), code);
});

test("release gate rejects incomplete or drifted Qdrant snapshot evidence", () => {
  const evidence = validEvidence();
  evidence.benchmark.qdrantCurrentPointCount -= 1;
  evidence.benchmark.qdrantTotalPointCount = evidence.benchmark.qdrantCurrentPointCount - 1;
  evidence.benchmark.qdrantSnapshotCurrentPointCount -= 2;
  evidence.benchmark.qdrantSnapshotTotalPointCount += 1;
  const verdict = evaluateLegalCorpusReleaseEvidence(evidence, now);
  for (const code of [
    "QDRANT_CURRENT_POINT_COUNT_MISMATCH",
    "QDRANT_TOTAL_POINT_COUNT_INVALID",
    "QDRANT_SNAPSHOT_CURRENT_POINT_COUNT_MISMATCH",
    "QDRANT_SNAPSHOT_TOTAL_POINT_COUNT_MISMATCH",
  ]) assert.ok(verdict.failures.includes(code), code);
});

test("release gate binds fresh dashboard Qdrant health to the benchmark counts", () => {
  const evidence = validEvidence();
  evidence.dashboard.qdrantHealth.status = "unavailable";
  evidence.dashboard.qdrantHealth.errorCode = "QDRANT_REQUEST_FAILED";
  evidence.dashboard.qdrantHealth.currentPoints = 22_512;
  evidence.dashboard.qdrantHealth.totalPoints = null;
  evidence.dashboard.qdrantHealth.checkedAt = "2026-08-13T11:59:00.000Z";
  const verdict = evaluateLegalCorpusReleaseEvidence(evidence, now);
  for (const code of [
    "QDRANT_HEALTH_NOT_READY",
    "QDRANT_HEALTH_ERROR",
    "QDRANT_HEALTH_STALE",
    "QDRANT_HEALTH_CURRENT_POINT_COUNT_MISMATCH",
    "QDRANT_HEALTH_TOTAL_POINT_COUNT_MISMATCH",
  ]) assert.ok(verdict.failures.includes(code), code);
});

test("release evidence schema requires exactly 314 reviewed scenarios", () => {
  const evidence = validEvidence() as unknown as { benchmark: { scenarioCount: number } };
  evidence.benchmark.scenarioCount = 313;
  assert.equal(legalCorpusReleaseEvidenceSchema.safeParse(evidence).success, false);
});

test("release evidence schema requires a verified cryptographic human-review binding", () => {
  const evidence = validEvidence() as unknown as { humanReview: { verified: boolean; fileSha256: string } };
  evidence.humanReview.verified = false;
  assert.equal(legalCorpusReleaseEvidenceSchema.safeParse(evidence).success, false);
  evidence.humanReview.verified = true;
  evidence.humanReview.fileSha256 = "not-a-digest";
  assert.equal(legalCorpusReleaseEvidenceSchema.safeParse(evidence).success, false);
});
