import type { LegalEvaluationMetrics } from "./legal-evaluation-corpus";

export type LegalChatReleaseGate = {
  passed: boolean;
  failures: string[];
};

/**
 * A provider/model switch is fail-closed. Candidate results must use the same
 * corpus/source packets and may not regress the four safety/reliability axes
 * called out in the JURO release policy.
 */
export function evaluateLegalChatModelRelease(input: {
  baseline: LegalEvaluationMetrics;
  candidate: LegalEvaluationMetrics;
  identicalCorpus: boolean;
  identicalSourcePackets: boolean;
  minimumScenarioCount?: number;
}): LegalChatReleaseGate {
  const failures: string[] = [];
  const minimumScenarioCount = input.minimumScenarioCount ?? 150;
  if (!input.identicalCorpus) failures.push("EVAL_CORPUS_MISMATCH");
  if (!input.identicalSourcePackets) failures.push("EVAL_SOURCE_PACKETS_MISMATCH");
  if (input.candidate.scenarioCount < minimumScenarioCount) failures.push("EVAL_SCENARIO_COUNT_BELOW_MINIMUM");
  if (input.candidate.citationPrecision < input.baseline.citationPrecision) failures.push("CITATION_PRECISION_REGRESSION");
  if (input.candidate.unsupportedLegalClaimRate > input.baseline.unsupportedLegalClaimRate) failures.push("UNSUPPORTED_CLAIM_RATE_REGRESSION");
  if (input.candidate.providerTimeoutRate > input.baseline.providerTimeoutRate) failures.push("PROVIDER_TIMEOUT_RATE_REGRESSION");
  if (input.candidate.p95TtftMs === null || input.candidate.p95TtftMs > 5_000) failures.push("P95_TTFT_SLO_FAILED");
  if (input.candidate.p95CompletionMs === null || input.candidate.p95CompletionMs > 30_000) failures.push("P95_COMPLETION_SLO_FAILED");
  if (input.baseline.p95TtftMs !== null && input.candidate.p95TtftMs !== null
    && input.candidate.p95TtftMs > input.baseline.p95TtftMs) failures.push("P95_TTFT_REGRESSION");
  if (input.baseline.p95CompletionMs !== null && input.candidate.p95CompletionMs !== null
    && input.candidate.p95CompletionMs > input.baseline.p95CompletionMs) failures.push("P95_COMPLETION_REGRESSION");
  if (input.candidate.uiNoiseRate > 0) failures.push("UI_NOISE_DETECTED");
  return { passed: failures.length === 0, failures };
}

