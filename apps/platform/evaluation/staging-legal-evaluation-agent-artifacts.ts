import { createHash } from "node:crypto";

import { z } from "zod";

import {
  LEGAL_EVALUATION_BEHAVIORS,
  legalEvaluationCorpus,
  type LegalEvaluationScenario,
} from "./legal-evaluation-corpus";
import { LEGAL_EVALUATION_CORPUS_VERSION } from "./legal-evaluation-contract";

export const STAGING_LEGAL_AGENT_RESULTS_VERSION = 2;
export const STAGING_LEGAL_AGENT_EVIDENCE_VERSION = 2;
export const STAGING_LEGAL_AGENT_ATTESTATION = "AI_REVIEW_NOT_HUMAN_LEGAL_APPROVAL";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const identifierSchema = z.string().trim().min(1).max(160)
  .regex(/^[A-Za-z0-9._:-]+$/u);
const isoDateSchema = z.string().datetime({ offset: true });

export const stagingLegalAgentClassificationSchema = z.enum([
  "correct",
  "partially_incorrect",
  "incorrect",
  "unsafe",
  "outdated_source",
  "broken_citation",
  "insufficient_context",
  "language_issue",
]);

export const stagingLegalAgentMetricsSchema = z.object({
  criticalDeadlineDetected: z.boolean().optional(),
  retrievalRank1Matched: z.boolean().optional(),
  retrievalRank3Matched: z.boolean().optional(),
  supportedLegalClaimCount: z.number().int().min(0).max(1_000).optional(),
  unsupportedLegalClaimCount: z.number().int().min(0).max(1_000).optional(),
  citedLegalClaimCount: z.number().int().min(0).max(1_000).optional(),
  validCitedLegalClaimCount: z.number().int().min(0).max(1_000).optional(),
  sourceQualityPassed: z.boolean().optional(),
  uiNoiseDetected: z.boolean().optional(),
  refused: z.boolean().optional(),
  providerTimedOut: z.boolean().optional(),
}).strict();

export const stagingLegalStoredSourceSchema = z.object({
  sourceId: identifierSchema,
  originalUrl: z.string().url().max(2_048),
  actTitle: z.string().trim().min(1).max(1_000),
  actIdentifier: z.string().trim().min(1).max(160),
  article: z.string().trim().min(1).max(500).nullable(),
  status: z.string().trim().min(1).max(80),
  verifiedAt: isoDateSchema,
}).strict();

export const stagingLegalAgentReviewedResultSchema = z.object({
  scenarioId: identifierSchema,
  attemptId: identifierSchema,
  attemptNumber: z.number().int().min(1).max(5),
  aiRunId: identifierSchema,
  provider: z.enum(["openai", "anthropic"]),
  model: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9._:/-]+$/u),
  instructionHash: sha256Schema,
  legalDatabaseVersion: z.string().trim().min(1).max(160),
  sourceVersionHash: sha256Schema,
  runCompletedAt: isoDateSchema,
  attemptStartedAt: isoDateSchema,
  attemptCompletedAt: isoDateSchema,
  completionMs: z.number().int().min(0).max(300_000),
  workerVersionId: z.string().uuid(),
  workerVersionCreatedAt: isoDateSchema,
  responseSha256: sha256Schema,
  structuredOutputSha256: sha256Schema,
  answerLanguage: z.enum(["ru", "uz"]),
  jurisdiction: z.literal("UZ"),
  responseKind: z.enum(["answer", "clarification_required", "out_of_scope"]),
  confirmedFindingCount: z.number().int().min(0).max(100),
  storedSources: z.array(stagingLegalStoredSourceSchema).max(50),
  reviewerKind: z.literal("openai_codex"),
  reviewerId: z.literal("openai-codex"),
  reviewerTaskId: identifierSchema,
  attestation: z.literal(STAGING_LEGAL_AGENT_ATTESTATION),
  classification: stagingLegalAgentClassificationSchema,
  reviewedLanguageQuality: z.number().int().min(0).max(100),
  observedBehaviors: z.array(z.enum(LEGAL_EVALUATION_BEHAVIORS))
    .max(LEGAL_EVALUATION_BEHAVIORS.length),
  metrics: stagingLegalAgentMetricsSchema,
  reviewNotes: z.string().trim().min(1).max(4_000),
  reviewedAt: isoDateSchema,
  questionSha256: sha256Schema,
  answerSha256: sha256Schema,
  reviewEvidenceHash: sha256Schema,
}).strict();

export const stagingLegalAgentResultsEnvelopeSchema = z.object({
  schemaVersion: z.literal(STAGING_LEGAL_AGENT_RESULTS_VERSION),
  artifactType: z.literal("staging_agent_reviewed_legal_evaluation"),
  corpusVersion: z.literal(LEGAL_EVALUATION_CORPUS_VERSION),
  corpusSha256: sha256Schema,
  corpusSize: z.literal(314),
  environment: z.literal("staging"),
  databaseId: z.string().uuid(),
  sourceRevision: z.object({
    gitCommit: z.string().regex(/^[a-f0-9]{40}$/u),
    workingTreeDirty: z.boolean(),
  }).strict(),
  evaluationRunId: identifierSchema,
  generatedAt: isoDateSchema,
  deployedWorkerVersionIds: z.array(z.string().uuid()).min(1).max(5),
  reviewAttestation: z.literal(STAGING_LEGAL_AGENT_ATTESTATION),
  releaseGate: z.literal("agent_review_only_human_legal_approval_pending"),
  results: z.array(stagingLegalAgentReviewedResultSchema).length(314),
}).strict();

export const stagingLegalAgentEvidenceRecordSchema = z.object({
  evaluationRunId: identifierSchema,
  scenarioId: identifierSchema,
  scenarioPromptSha256: sha256Schema,
  attemptId: identifierSchema,
  attemptNumber: z.number().int().min(1).max(5),
  aiRunId: identifierSchema,
  runStatus: z.literal("completed"),
  provider: z.enum(["openai", "anthropic"]),
  model: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9._:/-]+$/u),
  instructionHash: sha256Schema,
  legalDatabaseAsOf: z.string().trim().min(1).max(160),
  sourceVersionHash: sha256Schema,
  runCompletedAt: isoDateSchema,
  attemptStartedAt: isoDateSchema,
  attemptCompletedAt: isoDateSchema,
  responseSha256: sha256Schema,
  structuredOutputSha256: sha256Schema,
  workerVersionId: z.string().uuid(),
  workerVersionCreatedAt: isoDateSchema,
  reviewId: z.string().uuid(),
  reviewerKind: z.literal("openai_codex"),
  reviewerId: z.literal("openai-codex"),
  reviewerTaskId: identifierSchema,
  attestation: z.literal(STAGING_LEGAL_AGENT_ATTESTATION),
  classification: stagingLegalAgentClassificationSchema,
  languageQuality: z.number().int().min(0).max(100),
  observedBehaviors: z.array(z.enum(LEGAL_EVALUATION_BEHAVIORS))
    .max(LEGAL_EVALUATION_BEHAVIORS.length),
  metrics: stagingLegalAgentMetricsSchema,
  observedBehaviorsJson: z.string().trim().min(2).max(4_000),
  metricsJson: z.string().trim().min(2).max(4_000),
  notes: z.string().trim().min(1).max(4_000),
  questionSha256: sha256Schema,
  answerSha256: sha256Schema,
  previousHash: sha256Schema,
  eventHash: sha256Schema,
  reviewedAt: isoDateSchema,
}).strict();

export const stagingLegalAgentPersistedEvidenceSchema = z.object({
  schemaVersion: z.literal(STAGING_LEGAL_AGENT_EVIDENCE_VERSION),
  artifactType: z.literal("staging_persisted_agent_review_evidence"),
  corpusVersion: z.literal(LEGAL_EVALUATION_CORPUS_VERSION),
  corpusSha256: sha256Schema,
  environment: z.literal("staging"),
  databaseId: z.string().uuid(),
  evaluationRunId: identifierSchema,
  resultsGeneratedAt: isoDateSchema,
  resultsEnvelopeSha256: sha256Schema,
  exportedAt: isoDateSchema,
  reviewChain: z.object({
    reviewerId: z.literal("openai-codex"),
    priorReviewChainHash: sha256Schema,
    headEventHash: sha256Schema,
    recordCount: z.literal(314),
  }).strict(),
  records: z.array(stagingLegalAgentEvidenceRecordSchema).length(314),
  exportDigest: sha256Schema,
}).strict();

export type StagingLegalAgentReviewedResult = z.infer<typeof stagingLegalAgentReviewedResultSchema>;
export type StagingLegalAgentResultsEnvelope = z.infer<typeof stagingLegalAgentResultsEnvelopeSchema>;
export type StagingLegalAgentEvidenceRecord = z.infer<typeof stagingLegalAgentEvidenceRecordSchema>;
export type StagingLegalAgentPersistedEvidence = z.infer<typeof stagingLegalAgentPersistedEvidenceSchema>;

export function stagingLegalArtifactSha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function stagingLegalTextSha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function reviewEventHash(record: StagingLegalAgentEvidenceRecord): string {
  const observedBehaviors = JSON.parse(record.observedBehaviorsJson) as unknown;
  const metrics = JSON.parse(record.metricsJson) as unknown;
  // D1's JSON result serialization may trim trailing zeroes from an ISO
  // fractional second. The Worker always hashed Date#toISOString(), which has
  // exactly three millisecond digits, so restore that canonical representation.
  const createdAt = new Date(record.reviewedAt).toISOString();
  return stagingLegalArtifactSha256({
    id: record.reviewId,
    evaluationRunId: record.evaluationRunId,
    scenarioId: record.scenarioId,
    attemptId: record.attemptId,
    aiRunId: record.aiRunId,
    reviewerKind: record.reviewerKind,
    reviewerId: record.reviewerId,
    reviewerTaskId: record.reviewerTaskId,
    attestation: record.attestation,
    classification: record.classification,
    languageQuality: record.languageQuality,
    observedBehaviors,
    metrics,
    notes: record.notes,
    questionSha256: record.questionSha256,
    answerSha256: record.answerSha256,
    previousHash: record.previousHash,
    createdAt,
  });
}

function resultMatchesEvidence(
  result: StagingLegalAgentReviewedResult,
  record: StagingLegalAgentEvidenceRecord,
): boolean {
  return result.attemptId === record.attemptId
    && result.attemptNumber === record.attemptNumber
    && result.aiRunId === record.aiRunId
    && result.provider === record.provider
    && result.model === record.model
    && result.instructionHash === record.instructionHash
    && result.legalDatabaseVersion === record.legalDatabaseAsOf
    && result.sourceVersionHash === record.sourceVersionHash
    && result.runCompletedAt === record.runCompletedAt
    && result.attemptStartedAt === record.attemptStartedAt
    && result.attemptCompletedAt === record.attemptCompletedAt
    && result.responseSha256 === record.responseSha256
    && result.structuredOutputSha256 === record.structuredOutputSha256
    && result.workerVersionId === record.workerVersionId
    && result.workerVersionCreatedAt === record.workerVersionCreatedAt
    && result.reviewerKind === record.reviewerKind
    && result.reviewerId === record.reviewerId
    && result.reviewerTaskId === record.reviewerTaskId
    && result.attestation === record.attestation
    && result.classification === record.classification
    && result.reviewedLanguageQuality === record.languageQuality
    && JSON.stringify(result.observedBehaviors) === JSON.stringify(record.observedBehaviors)
    && JSON.stringify(result.metrics) === JSON.stringify(record.metrics)
    && result.reviewNotes === record.notes
    && result.reviewedAt === record.reviewedAt
    && result.questionSha256 === record.questionSha256
    && result.answerSha256 === record.answerSha256
    && result.reviewEvidenceHash === record.eventHash;
}

export function verifyStagingLegalAgentResults(
  envelope: StagingLegalAgentResultsEnvelope,
  scenarios: readonly LegalEvaluationScenario[] = legalEvaluationCorpus,
): string[] {
  const failures: string[] = [];
  if (envelope.corpusSize !== scenarios.length || envelope.results.length !== scenarios.length) {
    failures.push("AGENT_RESULTS_COUNT_MISMATCH");
  }
  const scenariosById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const seenScenarios = new Set<string>();
  const seenRuns = new Set<string>();
  const workerVersions = new Set(envelope.deployedWorkerVersionIds);
  for (const result of envelope.results) {
    const scenario = scenariosById.get(result.scenarioId);
    if (!scenario) failures.push(`AGENT_RESULTS_UNKNOWN_SCENARIO:${result.scenarioId}`);
    if (seenScenarios.has(result.scenarioId)) failures.push(`AGENT_RESULTS_DUPLICATE_SCENARIO:${result.scenarioId}`);
    if (seenRuns.has(result.aiRunId)) failures.push(`AGENT_RESULTS_DUPLICATE_RUN:${result.aiRunId}`);
    seenScenarios.add(result.scenarioId);
    seenRuns.add(result.aiRunId);
    if (scenario && result.answerLanguage !== scenario.locale) {
      failures.push(`AGENT_RESULTS_LANGUAGE_MISMATCH:${result.scenarioId}`);
    }
    if (!workerVersions.has(result.workerVersionId)) {
      failures.push(`AGENT_RESULTS_WORKER_VERSION_MISMATCH:${result.scenarioId}`);
    }
    if (Date.parse(result.runCompletedAt) > Date.parse(result.reviewedAt)) {
      failures.push(`AGENT_RESULTS_REVIEW_TIME_INVALID:${result.scenarioId}`);
    }
    if (Date.parse(result.reviewedAt) > Date.parse(envelope.generatedAt)) {
      failures.push(`AGENT_RESULTS_GENERATED_TIME_INVALID:${result.scenarioId}`);
    }
    const duration = Date.parse(result.attemptCompletedAt) - Date.parse(result.attemptStartedAt);
    if (duration !== result.completionMs) {
      failures.push(`AGENT_RESULTS_DURATION_MISMATCH:${result.scenarioId}`);
    }
  }
  for (const scenario of scenarios) {
    if (!seenScenarios.has(scenario.id)) failures.push(`AGENT_RESULTS_MISSING:${scenario.id}`);
  }
  return failures;
}

export function verifyStagingLegalAgentEvidence(
  evidence: StagingLegalAgentPersistedEvidence,
  envelope: StagingLegalAgentResultsEnvelope,
  scenarios: readonly LegalEvaluationScenario[] = legalEvaluationCorpus,
): string[] {
  const failures: string[] = [];
  const { exportDigest: _exportDigest, ...unsigned } = evidence;
  void _exportDigest;
  if (evidence.exportDigest !== stagingLegalArtifactSha256(unsigned)) {
    failures.push("AGENT_EVIDENCE_DIGEST_MISMATCH");
  }
  if (evidence.resultsEnvelopeSha256 !== stagingLegalArtifactSha256(envelope)) {
    failures.push("AGENT_EVIDENCE_RESULTS_HASH_MISMATCH");
  }
  if (
    evidence.corpusVersion !== envelope.corpusVersion
    || evidence.corpusSha256 !== envelope.corpusSha256
    || evidence.databaseId !== envelope.databaseId
    || evidence.evaluationRunId !== envelope.evaluationRunId
    || evidence.resultsGeneratedAt !== envelope.generatedAt
  ) failures.push("AGENT_EVIDENCE_ENVELOPE_MISMATCH");
  if (evidence.records.length !== scenarios.length || evidence.reviewChain.recordCount !== scenarios.length) {
    failures.push("AGENT_EVIDENCE_COUNT_MISMATCH");
  }

  const scenariosById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const resultsById = new Map(envelope.results.map((result) => [result.scenarioId, result]));
  const seenScenarios = new Set<string>();
  const seenRuns = new Set<string>();
  const seenReviews = new Set<string>();
  let expectedPrevious = evidence.reviewChain.priorReviewChainHash;
  for (const record of evidence.records) {
    const scenario = scenariosById.get(record.scenarioId);
    const result = resultsById.get(record.scenarioId);
    if (!scenario || !result) {
      failures.push(`AGENT_EVIDENCE_UNKNOWN_SCENARIO:${record.scenarioId}`);
      continue;
    }
    if (seenScenarios.has(record.scenarioId)) failures.push(`AGENT_EVIDENCE_DUPLICATE_SCENARIO:${record.scenarioId}`);
    if (seenRuns.has(record.aiRunId)) failures.push(`AGENT_EVIDENCE_DUPLICATE_RUN:${record.aiRunId}`);
    if (seenReviews.has(record.reviewId)) failures.push(`AGENT_EVIDENCE_DUPLICATE_REVIEW:${record.reviewId}`);
    seenScenarios.add(record.scenarioId);
    seenRuns.add(record.aiRunId);
    seenReviews.add(record.reviewId);
    if (record.scenarioPromptSha256 !== stagingLegalTextSha256(scenario.prompt)) {
      failures.push(`AGENT_EVIDENCE_PROMPT_MISMATCH:${record.scenarioId}`);
    }
    if (!resultMatchesEvidence(result, record)) {
      failures.push(`AGENT_EVIDENCE_RESULT_MISMATCH:${record.scenarioId}`);
    }
    if (record.previousHash !== expectedPrevious) {
      failures.push(`AGENT_EVIDENCE_CHAIN_LINK_INVALID:${record.scenarioId}`);
    }
    try {
      const storedObservedBehaviors = stagingLegalAgentEvidenceRecordSchema.shape.observedBehaviors
        .parse(JSON.parse(record.observedBehaviorsJson) as unknown);
      const storedMetrics = stagingLegalAgentMetricsSchema
        .parse(JSON.parse(record.metricsJson) as unknown);
      if (
        JSON.stringify(storedObservedBehaviors) !== JSON.stringify(record.observedBehaviors)
        || JSON.stringify(storedMetrics) !== JSON.stringify(record.metrics)
      ) failures.push(`AGENT_EVIDENCE_SERIALIZED_REVIEW_MISMATCH:${record.scenarioId}`);
      if (record.eventHash !== reviewEventHash(record)) {
        failures.push(`AGENT_EVIDENCE_EVENT_HASH_INVALID:${record.scenarioId}`);
      }
    } catch {
      failures.push(`AGENT_EVIDENCE_SERIALIZED_REVIEW_INVALID:${record.scenarioId}`);
    }
    if (
      Date.parse(record.runCompletedAt) > Date.parse(record.reviewedAt)
      || Date.parse(record.reviewedAt) > Date.parse(evidence.resultsGeneratedAt)
      || Date.parse(evidence.resultsGeneratedAt) > Date.parse(evidence.exportedAt)
    ) failures.push(`AGENT_EVIDENCE_TIME_ORDER_INVALID:${record.scenarioId}`);
    expectedPrevious = record.eventHash;
  }
  if (expectedPrevious !== evidence.reviewChain.headEventHash) {
    failures.push("AGENT_EVIDENCE_CHAIN_HEAD_INVALID");
  }
  return failures;
}
