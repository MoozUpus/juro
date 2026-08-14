import assert from "node:assert/strict";
import test from "node:test";

import {
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
    schemaVersion: 1,
    environment: "staging",
    capturedAt: "2026-08-15T11:58:00.000Z",
    applicationCommit: commit,
    corpusSnapshotSha256: snapshot,
    dashboard: {
      environment: "staging",
      featureFlags: {
        LEGAL_CORPUS_ENABLED: true,
        LEGAL_CORPUS_LIVE_LEXUZ_ENABLED: true,
        LEGAL_CORPUS_AUTO_INGEST_ENABLED: false,
        LEGAL_CORPUS_MULTILINGUAL_ENABLED: true,
        LEGAL_CORPUS_OWNER_UPLOAD_AUTO_TRUST: false,
        LEGAL_CORPUS_USER_UPLOAD_AUTO_TRUST: false,
        LEGAL_CORPUS_HISTORICAL_ENABLED: true,
        LEGAL_CORPUS_DENSE_ENABLED: true,
        LEGAL_CORPUS_SHADOW_MODE: true,
      },
      lexHealth: { state: "fresh" },
      totals: {
        canonicalDocuments: 1_200,
        languageVariants: 2_400,
        uniqueProvisions: 20_000,
        currentProvisions: 20_000,
        currentChunks: 22_000,
        indexedChunks: 22_000,
        activeDocuments: 1_100,
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
    "PROVISIONS_EMPTY",
    "CHUNKS_EMPTY",
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

test("release evidence schema requires exactly 314 reviewed scenarios", () => {
  const evidence = validEvidence() as unknown as { benchmark: { scenarioCount: number } };
  evidence.benchmark.scenarioCount = 313;
  assert.equal(legalCorpusReleaseEvidenceSchema.safeParse(evidence).success, false);
});
