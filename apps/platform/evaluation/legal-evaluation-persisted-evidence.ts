import { z } from "zod";

import { legalChatResponseSchema } from "../lib/ai/legal-chat-schema";
import { verifyAiQualityReviewHistory } from "../lib/ai/quality-review";
import {
  legalEvaluationCorpus,
  type LegalEvaluationResult,
  type LegalEvaluationScenario,
} from "./legal-evaluation-corpus";
import {
  LEGAL_EVALUATION_CORPUS_VERSION,
  legalEvaluationResultsEnvelopeSchema,
  type LegalEvaluationResultsEnvelope,
} from "./legal-evaluation-contract";

export const LEGAL_EVALUATION_PERSISTED_EVIDENCE_VERSION = 1;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const evidenceIdentifierSchema = z.string().trim().min(1).max(160)
  .regex(/^[A-Za-z0-9._:-]+$/);
const providerSchema = z.enum(["openai", "anthropic"]);

export const legalEvaluationPersistedEvidenceRecordSchema = z.object({
  scenarioId: evidenceIdentifierSchema,
  scenarioPromptSha256: sha256Schema,
  aiRunId: evidenceIdentifierSchema,
  runStatus: z.literal("completed"),
  provider: providerSchema,
  model: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9._:/-]+$/),
  instructionHash: sha256Schema,
  legalDatabaseAsOf: z.string().trim().min(1).max(160),
  sourceVersionHash: sha256Schema,
  completedAt: z.string().datetime({ offset: true }),
  structuredOutputSha256: sha256Schema,
  feedbackId: evidenceIdentifierSchema,
  reviewerUserId: evidenceIdentifierSchema,
  reviewEventId: evidenceIdentifierSchema,
  reviewVersion: z.number().int().positive(),
  reviewClassification: z.literal("correct"),
  reviewedAt: z.string().datetime({ offset: true }),
  reviewQuestionHash: sha256Schema,
  reviewAnswerHash: sha256Schema,
  reviewEventHash: sha256Schema,
}).strict();

export const legalEvaluationPersistedEvidenceSchema = z.object({
  schemaVersion: z.literal(LEGAL_EVALUATION_PERSISTED_EVIDENCE_VERSION),
  corpusVersion: z.literal(LEGAL_EVALUATION_CORPUS_VERSION),
  corpusSha256: sha256Schema,
  environment: z.literal("staging"),
  applicationCommit: z.string().regex(/^[a-f0-9]{40}$/),
  evaluationRunId: evidenceIdentifierSchema,
  resultsGeneratedAt: z.string().datetime({ offset: true }),
  resultsEnvelopeSha256: sha256Schema,
  exportedAt: z.string().datetime({ offset: true }),
  qualityReviewHistoryChecked: z.number().int().positive().max(10_000),
  records: z.array(legalEvaluationPersistedEvidenceRecordSchema)
    .max(legalEvaluationCorpus.length),
  exportDigest: sha256Schema,
}).strict();

export const legalEvaluationEvidenceExportRequestSchema = z.object({
  resultsEnvelope: legalEvaluationResultsEnvelopeSchema,
}).strict();

export type LegalEvaluationPersistedEvidenceRecord = z.infer<
  typeof legalEvaluationPersistedEvidenceRecordSchema
>;
export type LegalEvaluationPersistedEvidence = z.infer<
  typeof legalEvaluationPersistedEvidenceSchema
>;
export type LegalEvaluationEvidenceExportRequest = z.infer<
  typeof legalEvaluationEvidenceExportRequestSchema
>;

type PersistedEvidenceRow = {
  aiRunId: string;
  runStatus: string;
  provider: string;
  model: string;
  instructionHash: string;
  legalDatabaseAsOf: string;
  sourceVersionHash: string;
  completedAt: string | null;
  question: string;
  answer: string;
  structuredJson: string | null;
  feedbackId: string;
  reviewerUserId: string;
  reviewEventId: string;
  reviewVersion: number;
  reviewClassification: string;
  reviewedAt: string;
  reviewQuestionHash: string;
  reviewAnswerHash: string;
  reviewEventHash: string;
};

export class LegalEvaluationEvidenceError extends Error {
  constructor(readonly code:
    | "LEGAL_EVALUATION_EVIDENCE_INVALID"
    | "LEGAL_EVALUATION_EVIDENCE_NOT_FOUND"
    | "LEGAL_EVALUATION_EVIDENCE_INTEGRITY_FAILED") {
    super(code);
    this.name = "LegalEvaluationEvidenceError";
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizedHash(value: string): string {
  return value.toLowerCase();
}

function withoutDigest(
  evidence: Omit<LegalEvaluationPersistedEvidence, "exportDigest"> | LegalEvaluationPersistedEvidence,
): Omit<LegalEvaluationPersistedEvidence, "exportDigest"> {
  return {
    schemaVersion: evidence.schemaVersion,
    corpusVersion: evidence.corpusVersion,
    corpusSha256: evidence.corpusSha256,
    environment: evidence.environment,
    applicationCommit: evidence.applicationCommit,
    evaluationRunId: evidence.evaluationRunId,
    resultsGeneratedAt: evidence.resultsGeneratedAt,
    resultsEnvelopeSha256: evidence.resultsEnvelopeSha256,
    exportedAt: evidence.exportedAt,
    qualityReviewHistoryChecked: evidence.qualityReviewHistoryChecked,
    records: evidence.records,
  };
}

export async function calculateLegalEvaluationEvidenceDigest(
  evidence: Omit<LegalEvaluationPersistedEvidence, "exportDigest"> | LegalEvaluationPersistedEvidence,
): Promise<string> {
  return sha256Hex(JSON.stringify(withoutDigest(evidence)));
}

export async function calculateLegalEvaluationCorpusSha256(
  scenarios: readonly LegalEvaluationScenario[] = legalEvaluationCorpus,
): Promise<string> {
  return sha256Hex(`${JSON.stringify(scenarios, null, 2)}\n`);
}

function parseStoredOutput(value: string | null) {
  if (!value) throw new LegalEvaluationEvidenceError("LEGAL_EVALUATION_EVIDENCE_INTEGRITY_FAILED");
  try {
    return legalChatResponseSchema.parse(JSON.parse(value) as unknown);
  } catch {
    throw new LegalEvaluationEvidenceError("LEGAL_EVALUATION_EVIDENCE_INTEGRITY_FAILED");
  }
}

function assertResultMatchesStoredOutput(
  result: LegalEvaluationResult,
  structuredJson: string,
): void {
  const output = parseStoredOutput(structuredJson);
  if (
    output.language !== result.answerLanguage
    || output.jurisdiction !== result.jurisdiction
    || output.confirmedFindings.length !== result.confirmedFindingCount
    || output.legalDatabaseAsOf !== result.legalDatabaseVersion
  ) throw new LegalEvaluationEvidenceError("LEGAL_EVALUATION_EVIDENCE_INTEGRITY_FAILED");

  const resultSources = new Map(result.citations.map((citation) => [citation.sourceId, citation.url]));
  if (resultSources.size !== result.citations.length || resultSources.size !== output.sources.length) {
    throw new LegalEvaluationEvidenceError("LEGAL_EVALUATION_EVIDENCE_INTEGRITY_FAILED");
  }
  for (const source of output.sources) {
    if (resultSources.get(source.sourceId) !== source.originalUrl) {
      throw new LegalEvaluationEvidenceError("LEGAL_EVALUATION_EVIDENCE_INTEGRITY_FAILED");
    }
  }
}

async function persistedRow(db: D1Database, aiRunId: string): Promise<PersistedEvidenceRow> {
  const row = await db.prepare(
    `SELECT run.id AS aiRunId,run.status AS runStatus,run.provider,run.model,
      run.instruction_hash AS instructionHash,run.legal_database_as_of AS legalDatabaseAsOf,
      run.source_version_hash AS sourceVersionHash,run.completed_at AS completedAt,
      request.content AS question,response.content AS answer,response.structured_json AS structuredJson,
      feedback.id AS feedbackId,event.actor_user_id AS reviewerUserId,event.id AS reviewEventId,
      event.review_version AS reviewVersion,event.classification AS reviewClassification,
      event.created_at AS reviewedAt,event.question_hash AS reviewQuestionHash,
      event.answer_hash AS reviewAnswerHash,event.event_hash AS reviewEventHash
     FROM ai_runs run
     JOIN conversation_messages request ON request.id=run.request_message_id
       AND request.conversation_id=run.conversation_id AND request.author_type='user'
     JOIN conversation_messages response ON response.id=run.response_message_id
       AND response.conversation_id=run.conversation_id AND response.author_type='assistant'
     JOIN ai_quality_review_events event ON event.id=(
       SELECT candidate.id
       FROM ai_quality_review_events candidate
       JOIN ai_feedback candidate_feedback ON candidate_feedback.id=candidate.feedback_id
       WHERE candidate_feedback.ai_run_id=run.id AND candidate.request_action='resolve'
       ORDER BY candidate.created_at DESC,candidate.review_version DESC,candidate.id DESC
       LIMIT 1
     )
     JOIN ai_feedback feedback ON feedback.id=event.feedback_id
       AND feedback.ai_run_id=run.id AND feedback.assistant_message_id=run.response_message_id
     JOIN ai_quality_review_contents content ON content.event_id=event.id
       AND content.feedback_id=feedback.id AND content.reviewer_user_id=event.actor_user_id
       AND content.captured_feedback_updated_at=event.feedback_updated_at
     WHERE run.id=? AND run.status='completed'
     LIMIT 1`,
  ).bind(aiRunId).first<PersistedEvidenceRow>();
  if (!row) throw new LegalEvaluationEvidenceError("LEGAL_EVALUATION_EVIDENCE_NOT_FOUND");
  return row;
}

export async function exportLegalEvaluationPersistedEvidence(input: {
  db: D1Database;
  resultsEnvelope: LegalEvaluationResultsEnvelope;
  now?: Date;
  scenarios?: readonly LegalEvaluationScenario[];
}): Promise<LegalEvaluationPersistedEvidence> {
  const parsedEnvelope = legalEvaluationResultsEnvelopeSchema.safeParse(input.resultsEnvelope);
  if (!parsedEnvelope.success) throw new LegalEvaluationEvidenceError("LEGAL_EVALUATION_EVIDENCE_INVALID");
  const scenarios = input.scenarios ?? legalEvaluationCorpus;
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new LegalEvaluationEvidenceError("LEGAL_EVALUATION_EVIDENCE_INVALID");
  if (parsedEnvelope.data.results.length !== scenarios.length) {
    throw new LegalEvaluationEvidenceError("LEGAL_EVALUATION_EVIDENCE_INVALID");
  }
  if (parsedEnvelope.data.corpusSha256 !== await calculateLegalEvaluationCorpusSha256(scenarios)) {
    throw new LegalEvaluationEvidenceError("LEGAL_EVALUATION_EVIDENCE_INVALID");
  }
  if (Date.parse(parsedEnvelope.data.generatedAt) > now.getTime()) {
    throw new LegalEvaluationEvidenceError("LEGAL_EVALUATION_EVIDENCE_INVALID");
  }

  const scenarioById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const seenScenarios = new Set<string>();
  const seenRuns = new Set<string>();
  const history = await verifyAiQualityReviewHistory(input.db);
  if (!history.valid || history.checked < 1) {
    throw new LegalEvaluationEvidenceError("LEGAL_EVALUATION_EVIDENCE_INTEGRITY_FAILED");
  }

  const records: LegalEvaluationPersistedEvidenceRecord[] = [];
  for (const result of parsedEnvelope.data.results) {
    const scenario = scenarioById.get(result.scenarioId);
    if (!scenario || seenScenarios.has(result.scenarioId) || seenRuns.has(result.aiRunId)) {
      throw new LegalEvaluationEvidenceError("LEGAL_EVALUATION_EVIDENCE_INVALID");
    }
    seenScenarios.add(result.scenarioId);
    seenRuns.add(result.aiRunId);
    const row = await persistedRow(input.db, result.aiRunId);
    const promptHash = await sha256Hex(scenario.prompt);
    const questionHash = await sha256Hex(row.question);
    const answerHash = await sha256Hex(row.answer);
    if (
      row.question !== scenario.prompt
      || questionHash !== promptHash
      || normalizedHash(row.reviewQuestionHash) !== questionHash
      || normalizedHash(row.reviewAnswerHash) !== answerHash
      || row.runStatus !== "completed"
      || row.provider !== result.provider
      || row.model !== result.model
      || normalizedHash(row.instructionHash) !== result.instructionHash
      || row.legalDatabaseAsOf !== result.legalDatabaseVersion
      || row.completedAt !== result.completedAt
      || row.reviewerUserId !== result.humanReviewerId
      || row.reviewedAt !== result.reviewedAt
      || normalizedHash(row.reviewEventHash) !== result.reviewEvidenceHash
      || row.reviewClassification !== "correct"
      || Date.parse(row.completedAt ?? "") > Date.parse(row.reviewedAt)
      || Date.parse(row.reviewedAt) > Date.parse(parsedEnvelope.data.generatedAt)
      || Date.parse(row.reviewedAt) > now.getTime()
    ) throw new LegalEvaluationEvidenceError("LEGAL_EVALUATION_EVIDENCE_INTEGRITY_FAILED");
    if (!row.structuredJson) {
      throw new LegalEvaluationEvidenceError("LEGAL_EVALUATION_EVIDENCE_INTEGRITY_FAILED");
    }
    assertResultMatchesStoredOutput(result, row.structuredJson);
    const record = legalEvaluationPersistedEvidenceRecordSchema.parse({
      scenarioId: result.scenarioId,
      scenarioPromptSha256: promptHash,
      aiRunId: row.aiRunId,
      runStatus: row.runStatus,
      provider: row.provider,
      model: row.model,
      instructionHash: normalizedHash(row.instructionHash),
      legalDatabaseAsOf: row.legalDatabaseAsOf,
      sourceVersionHash: normalizedHash(row.sourceVersionHash),
      completedAt: row.completedAt,
      structuredOutputSha256: await sha256Hex(row.structuredJson),
      feedbackId: row.feedbackId,
      reviewerUserId: row.reviewerUserId,
      reviewEventId: row.reviewEventId,
      reviewVersion: row.reviewVersion,
      reviewClassification: row.reviewClassification,
      reviewedAt: row.reviewedAt,
      reviewQuestionHash: normalizedHash(row.reviewQuestionHash),
      reviewAnswerHash: normalizedHash(row.reviewAnswerHash),
      reviewEventHash: normalizedHash(row.reviewEventHash),
    });
    records.push(record);
  }

  const unsigned: Omit<LegalEvaluationPersistedEvidence, "exportDigest"> = {
    schemaVersion: LEGAL_EVALUATION_PERSISTED_EVIDENCE_VERSION,
    corpusVersion: LEGAL_EVALUATION_CORPUS_VERSION,
    corpusSha256: parsedEnvelope.data.corpusSha256,
    environment: "staging" as const,
    applicationCommit: parsedEnvelope.data.applicationCommit,
    evaluationRunId: parsedEnvelope.data.evaluationRunId,
    resultsGeneratedAt: parsedEnvelope.data.generatedAt,
    resultsEnvelopeSha256: await sha256Hex(JSON.stringify(parsedEnvelope.data)),
    exportedAt: now.toISOString(),
    qualityReviewHistoryChecked: history.checked,
    records,
  };
  return legalEvaluationPersistedEvidenceSchema.parse({
    ...unsigned,
    exportDigest: await calculateLegalEvaluationEvidenceDigest(unsigned),
  });
}

export async function verifyLegalEvaluationPersistedEvidence(
  evidence: LegalEvaluationPersistedEvidence,
  resultsEnvelope: LegalEvaluationResultsEnvelope,
  scenarios: readonly LegalEvaluationScenario[] = legalEvaluationCorpus,
): Promise<string[]> {
  const failures: string[] = [];
  if (evidence.exportDigest !== await calculateLegalEvaluationEvidenceDigest(evidence)) {
    failures.push("LEGAL_EVIDENCE_DIGEST_MISMATCH");
  }
  if (
    evidence.corpusVersion !== resultsEnvelope.corpusVersion
    || evidence.corpusSha256 !== resultsEnvelope.corpusSha256
  ) failures.push("LEGAL_EVIDENCE_CORPUS_MISMATCH");
  if (evidence.applicationCommit !== resultsEnvelope.applicationCommit) {
    failures.push("LEGAL_EVIDENCE_COMMIT_MISMATCH");
  }
  if (evidence.evaluationRunId !== resultsEnvelope.evaluationRunId) {
    failures.push("LEGAL_EVIDENCE_RUN_MISMATCH");
  }
  if (
    evidence.resultsGeneratedAt !== resultsEnvelope.generatedAt
    || evidence.resultsEnvelopeSha256 !== await sha256Hex(JSON.stringify(resultsEnvelope))
  ) failures.push("LEGAL_EVIDENCE_RESULTS_ENVELOPE_MISMATCH");
  if (Date.parse(resultsEnvelope.generatedAt) > Date.parse(evidence.exportedAt)) {
    failures.push("LEGAL_EVIDENCE_RESULTS_TIME_INVALID");
  }
  if (evidence.records.length !== scenarios.length || evidence.records.length !== resultsEnvelope.results.length) {
    failures.push("LEGAL_EVIDENCE_COUNT_MISMATCH");
  }

  const scenarioById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const resultById = new Map(resultsEnvelope.results.map((result) => [result.scenarioId, result]));
  const seenScenarioIds = new Set<string>();
  const seenRunIds = new Set<string>();
  const seenReviewEvents = new Set<string>();
  for (const record of evidence.records) {
    const scenario = scenarioById.get(record.scenarioId);
    const result = resultById.get(record.scenarioId);
    if (!scenario || !result) {
      failures.push(`LEGAL_EVIDENCE_UNKNOWN_SCENARIO:${record.scenarioId}`);
      continue;
    }
    if (seenScenarioIds.has(record.scenarioId)) failures.push(`LEGAL_EVIDENCE_DUPLICATE_SCENARIO:${record.scenarioId}`);
    if (seenRunIds.has(record.aiRunId)) failures.push(`LEGAL_EVIDENCE_DUPLICATE_RUN:${record.aiRunId}`);
    if (seenReviewEvents.has(record.reviewEventId)) failures.push(`LEGAL_EVIDENCE_DUPLICATE_REVIEW:${record.reviewEventId}`);
    seenScenarioIds.add(record.scenarioId);
    seenRunIds.add(record.aiRunId);
    seenReviewEvents.add(record.reviewEventId);
    if (record.scenarioPromptSha256 !== await sha256Hex(scenario.prompt)) {
      failures.push(`LEGAL_EVIDENCE_PROMPT_MISMATCH:${record.scenarioId}`);
    }
    if (
      record.aiRunId !== result.aiRunId
      || record.provider !== result.provider
      || record.model !== result.model
      || record.instructionHash !== result.instructionHash
      || record.legalDatabaseAsOf !== result.legalDatabaseVersion
      || record.completedAt !== result.completedAt
    ) failures.push(`LEGAL_EVIDENCE_AI_RUN_MISMATCH:${record.scenarioId}`);
    if (
      record.reviewerUserId !== result.humanReviewerId
      || record.reviewedAt !== result.reviewedAt
      || record.reviewEventHash !== result.reviewEvidenceHash
      || record.reviewClassification !== "correct"
    ) failures.push(`LEGAL_EVIDENCE_REVIEW_MISMATCH:${record.scenarioId}`);
    if (
      Date.parse(record.completedAt) > Date.parse(record.reviewedAt)
      || Date.parse(record.reviewedAt) > Date.parse(resultsEnvelope.generatedAt)
      || Date.parse(record.reviewedAt) > Date.parse(evidence.exportedAt)
    ) failures.push(`LEGAL_EVIDENCE_TIME_ORDER_INVALID:${record.scenarioId}`);
  }
  for (const scenario of scenarios) {
    if (!seenScenarioIds.has(scenario.id)) failures.push(`LEGAL_EVIDENCE_MISSING:${scenario.id}`);
  }
  return failures;
}
