import assert from "node:assert/strict";
import test from "node:test";

import { evaluateLegalChatModelRelease } from "../evaluation/legal-chat-release-gate";
import type { LegalEvaluationMetrics } from "../evaluation/legal-evaluation-corpus";

function metrics(overrides: Partial<LegalEvaluationMetrics> = {}): LegalEvaluationMetrics {
  return {
    scenarioCount: 314, resultCount: 314, citationCount: 314,
    citationExistenceRate: 1, sourceClassificationRate: 1,
    criticalDeadlineDetectionRate: 1, humanReviewRate: 1,
    languageQualityPassRate: 1, expectedBehaviorPassRate: 1,
    retrievalRecallAt1: 0.9, retrievalRecallAt3: 0.98,
    citationPrecision: 0.99, unsupportedLegalClaimRate: 0.01,
    sourceQualityPassRate: 0.99, falseRefusalRate: 0.01,
    uiNoiseRate: 0, providerTimeoutRate: 0.01,
    p50TtftMs: 1_500, p95TtftMs: 4_500,
    p50CompletionMs: 8_000, p95CompletionMs: 25_000,
    costPerCompletedAnswerUsd: 0.02, ruUzParity: 0.99,
    ...overrides,
  };
}

test("release gate accepts a non-regressing candidate on identical inputs", () => {
  assert.deepEqual(evaluateLegalChatModelRelease({
    baseline: metrics(),
    candidate: metrics({ p95TtftMs: 4_000, p95CompletionMs: 24_000 }),
    identicalCorpus: true,
    identicalSourcePackets: true,
  }), { passed: true, failures: [] });
});

test("release gate blocks unsupported claims, latency, timeout and input drift", () => {
  const result = evaluateLegalChatModelRelease({
    baseline: metrics(),
    candidate: metrics({
      citationPrecision: 0.9,
      unsupportedLegalClaimRate: 0.05,
      providerTimeoutRate: 0.03,
      p95TtftMs: 6_000,
      p95CompletionMs: 31_000,
      uiNoiseRate: 0.01,
    }),
    identicalCorpus: false,
    identicalSourcePackets: false,
  });
  assert.equal(result.passed, false);
  assert.match(result.failures.join(" "), /EVAL_CORPUS_MISMATCH/);
  assert.match(result.failures.join(" "), /UNSUPPORTED_CLAIM_RATE_REGRESSION/);
  assert.match(result.failures.join(" "), /P95_COMPLETION_SLO_FAILED/);
  assert.match(result.failures.join(" "), /UI_NOISE_DETECTED/);
});

