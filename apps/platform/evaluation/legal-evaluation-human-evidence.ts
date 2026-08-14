import { z } from "zod";

import { LEGAL_EVALUATION_CORPUS_VERSION } from "./legal-evaluation-contract";
import { legalEvaluationCorpus, type LegalEvaluationScenario } from "./legal-evaluation-corpus";

const ZERO_HASH = "0".repeat(64);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const identifierSchema = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9._:-]+$/);
const isoDateSchema = z.string().datetime({ offset: true });

export const LEGAL_EVALUATION_HUMAN_EVIDENCE_VERSION = 1;

export const legalEvaluationHumanEvidenceRecordSchema = z.object({
  scenarioId: identifierSchema,
  attemptId: identifierSchema,
  aiRunId: identifierSchema,
  promptSha256: sha256Schema,
  responseSha256: sha256Schema,
  classification: z.literal("correct"),
  reviewerUserId: identifierSchema,
  reviewerSessionId: identifierSchema,
  reviewerAssignmentId: identifierSchema,
  reviewerMfaVerifiedAt: isoDateSchema,
  materializationReason: z.literal("attestation_scope_materialization"),
  reviewEventId: z.string().uuid(),
  previousHash: sha256Schema,
  reviewEventHash: sha256Schema,
  reviewedAt: isoDateSchema,
}).strict();

export const legalEvaluationHumanEvidenceSchema = z.object({
  schemaVersion: z.literal(LEGAL_EVALUATION_HUMAN_EVIDENCE_VERSION),
  corpusVersion: z.literal(LEGAL_EVALUATION_CORPUS_VERSION),
  corpusSha256: sha256Schema,
  environment: z.literal("staging"),
  evaluationRunId: identifierSchema,
  attestationId: z.string().uuid(),
  attestationEventHash: sha256Schema,
  scopeDigest: sha256Schema,
  recordCount: z.literal(314),
  exportedAt: isoDateSchema,
  records: z.array(legalEvaluationHumanEvidenceRecordSchema).length(314),
  exportDigest: sha256Schema,
}).strict();

export type LegalEvaluationHumanEvidence = z.infer<typeof legalEvaluationHumanEvidenceSchema>;

export class LegalEvaluationHumanEvidenceError extends Error {
  constructor(readonly code: "LEGAL_EVALUATION_HUMAN_EVIDENCE_INVALID" | "LEGAL_EVALUATION_HUMAN_EVIDENCE_INTEGRITY_FAILED" | "LEGAL_EVALUATION_HUMAN_EVIDENCE_NOT_FOUND") {
    super(code); this.name = "LegalEvaluationHumanEvidenceError";
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (item) => item.toString(16).padStart(2, "0")).join("");
}

function withoutDigest(evidence: LegalEvaluationHumanEvidence): Omit<LegalEvaluationHumanEvidence, "exportDigest"> {
  const { exportDigest: _exportDigest, ...unsigned } = evidence;
  void _exportDigest;
  return unsigned;
}

export async function calculateLegalEvaluationHumanEvidenceDigest(evidence: LegalEvaluationHumanEvidence): Promise<string> {
  return sha256(JSON.stringify(withoutDigest(evidence)));
}

export async function calculateLegalEvaluationHumanEvidenceCorpusSha256(
  scenarios: readonly LegalEvaluationScenario[] = legalEvaluationCorpus,
): Promise<string> {
  return sha256(`${JSON.stringify(scenarios, null, 2)}\n`);
}

type EvidenceRow = Omit<z.infer<typeof legalEvaluationHumanEvidenceRecordSchema>, "reviewEventHash"> & { reviewEventHash: string; attestationId: string; attestationEventHash: string; scopeDigest: string };

function normalizedRecord(row: EvidenceRow): z.infer<typeof legalEvaluationHumanEvidenceRecordSchema> {
  return {
    scenarioId: row.scenarioId, attemptId: row.attemptId, aiRunId: row.aiRunId,
    promptSha256: row.promptSha256.toLowerCase(), responseSha256: row.responseSha256.toLowerCase(),
    classification: row.classification, reviewerUserId: row.reviewerUserId,
    reviewerSessionId: row.reviewerSessionId, reviewerAssignmentId: row.reviewerAssignmentId,
    reviewerMfaVerifiedAt: row.reviewerMfaVerifiedAt,
    materializationReason: row.materializationReason,
    reviewEventId: row.reviewEventId, previousHash: row.previousHash.toLowerCase(),
    reviewEventHash: row.reviewEventHash.toLowerCase(), reviewedAt: row.reviewedAt,
  };
}

export async function exportLegalEvaluationHumanEvidence(input: { db: D1Database; evaluationRunId: string; now?: Date }): Promise<LegalEvaluationHumanEvidence> {
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new LegalEvaluationHumanEvidenceError("LEGAL_EVALUATION_HUMAN_EVIDENCE_INVALID");
  const result = await input.db.prepare(
    `SELECT record.id AS reviewEventId,record.attestation_id AS attestationId,
      record.scenario_id AS scenarioId,record.attempt_id AS attemptId,record.ai_run_id AS aiRunId,
      record.prompt_sha256 AS promptSha256,record.response_sha256 AS responseSha256,
      record.classification,record.reviewer_user_id AS reviewerUserId,
      record.reviewer_session_id AS reviewerSessionId,record.reviewer_assignment_id AS reviewerAssignmentId,
      record.reviewer_mfa_verified_at AS reviewerMfaVerifiedAt,
      record.materialization_reason AS materializationReason,record.previous_hash AS previousHash,
      record.event_hash AS reviewEventHash,record.created_at AS reviewedAt,
      attestation.event_hash AS attestationEventHash,attestation.scope_digest AS scopeDigest
     FROM legal_evaluation_human_review_records record
     JOIN legal_evaluation_human_attestations attestation ON attestation.id=record.attestation_id
     WHERE record.evaluation_run_id=? AND record.corpus_version=?
     ORDER BY record.scenario_id`,
  ).bind(input.evaluationRunId, LEGAL_EVALUATION_CORPUS_VERSION).all<EvidenceRow>();
  if (result.results.length === 0) throw new LegalEvaluationHumanEvidenceError("LEGAL_EVALUATION_HUMAN_EVIDENCE_NOT_FOUND");
  const first = result.results[0]!;
  if (result.results.length !== legalEvaluationCorpus.length || result.results.some((row) => row.attestationId !== first.attestationId || row.attestationEventHash !== first.attestationEventHash || row.scopeDigest !== first.scopeDigest)) {
    throw new LegalEvaluationHumanEvidenceError("LEGAL_EVALUATION_HUMAN_EVIDENCE_INTEGRITY_FAILED");
  }
  const provisional = legalEvaluationHumanEvidenceSchema.parse({
    schemaVersion: LEGAL_EVALUATION_HUMAN_EVIDENCE_VERSION,
    corpusVersion: LEGAL_EVALUATION_CORPUS_VERSION,
    corpusSha256: await calculateLegalEvaluationHumanEvidenceCorpusSha256(),
    environment: "staging",
    evaluationRunId: input.evaluationRunId,
    attestationId: first.attestationId,
    attestationEventHash: first.attestationEventHash.toLowerCase(),
    scopeDigest: first.scopeDigest.toLowerCase(),
    recordCount: legalEvaluationCorpus.length,
    exportedAt: now.toISOString(),
    records: result.results.map(normalizedRecord),
    exportDigest: "0".repeat(64),
  });
  const exportDigest = await calculateLegalEvaluationHumanEvidenceDigest(provisional);
  return legalEvaluationHumanEvidenceSchema.parse({ ...provisional, exportDigest });
}

export async function verifyLegalEvaluationHumanEvidence(
  evidence: LegalEvaluationHumanEvidence,
  scenarios: readonly LegalEvaluationScenario[] = legalEvaluationCorpus,
): Promise<string[]> {
  const failures: string[] = [];
  if (evidence.exportDigest !== await calculateLegalEvaluationHumanEvidenceDigest(evidence)) failures.push("LEGAL_HUMAN_EVIDENCE_DIGEST_MISMATCH");
  if (evidence.corpusSha256 !== await calculateLegalEvaluationHumanEvidenceCorpusSha256(scenarios)) failures.push("LEGAL_HUMAN_EVIDENCE_CORPUS_MISMATCH");
  if (evidence.recordCount !== scenarios.length || evidence.records.length !== scenarios.length) failures.push("LEGAL_HUMAN_EVIDENCE_COUNT_MISMATCH");
  const expected = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const seen = new Set<string>();
  let previousHash = ZERO_HASH;
  for (const record of evidence.records) {
    const scenario = expected.get(record.scenarioId);
    if (!scenario) { failures.push(`LEGAL_HUMAN_EVIDENCE_UNKNOWN_SCENARIO:${record.scenarioId}`); continue; }
    if (seen.has(record.scenarioId)) failures.push(`LEGAL_HUMAN_EVIDENCE_DUPLICATE_SCENARIO:${record.scenarioId}`);
    seen.add(record.scenarioId);
    if (record.promptSha256 !== await sha256(scenario.prompt)) failures.push(`LEGAL_HUMAN_EVIDENCE_PROMPT_MISMATCH:${record.scenarioId}`);
    if (record.previousHash !== previousHash) failures.push(`LEGAL_HUMAN_EVIDENCE_CHAIN_LINK_INVALID:${record.scenarioId}`);
    const event = {
      id: record.reviewEventId, attestationId: evidence.attestationId,
      evaluationRunId: evidence.evaluationRunId, corpusVersion: evidence.corpusVersion,
      scenarioId: record.scenarioId, attemptId: record.attemptId, aiRunId: record.aiRunId,
      promptSha256: record.promptSha256.toUpperCase(), responseSha256: record.responseSha256.toUpperCase(),
      classification: record.classification, reviewerUserId: record.reviewerUserId,
      reviewerSessionId: record.reviewerSessionId, reviewerAssignmentId: record.reviewerAssignmentId,
      reviewerMfaVerifiedAt: record.reviewerMfaVerifiedAt, materializationReason: record.materializationReason,
      previousHash: record.previousHash.toUpperCase(), createdAt: record.reviewedAt,
    };
    if (record.reviewEventHash !== await sha256(JSON.stringify(event))) {
      failures.push(`LEGAL_HUMAN_EVIDENCE_EVENT_HASH_INVALID:${record.scenarioId}`);
    }
    previousHash = record.reviewEventHash;
  }
  for (const scenario of scenarios) if (!seen.has(scenario.id)) failures.push(`LEGAL_HUMAN_EVIDENCE_MISSING:${scenario.id}`);
  return failures;
}
