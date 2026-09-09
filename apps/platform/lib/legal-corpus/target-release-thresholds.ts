/** Quality and cost floors shared by R2-native candidate qualification. */
export const TARGET_RELEASE_THRESHOLDS = Object.freeze({
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
  maximumTechnicalUnavailabilityRate: 0.02,
  p95RetrievalMs: 5_000,
  p95CompleteAnswerMs: 30_000,
  maximumProviderCostUsd: 30,
});
