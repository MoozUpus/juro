import { z } from "zod";

import { LEGAL_EVALUATION_CORPUS_VERSION } from "../../evaluation/legal-evaluation-contract";
import { legalEvaluationCorpus } from "../../evaluation/legal-evaluation-corpus";
import type { PlatformStaffAccess } from "../auth/staff-access";
import { sha256Json } from "./run-store";

const ZERO_HASH = "0".repeat(64);
const evaluationRunIdSchema = z.string().trim().min(8).max(120).regex(/^[A-Za-z0-9._:-]+$/);

export const legalEvaluationHumanReviewRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("summary"), evaluationRunId: evaluationRunIdSchema }).strict(),
  z.object({
    action: z.literal("attest"), evaluationRunId: evaluationRunIdSchema,
    expectedScopeDigest: z.string().regex(/^[a-f0-9]{64}$/),
    disposition: z.literal("confirmed_correct"),
    confirmation: z.literal("I_CONFIRM_PERSONAL_LEGAL_REVIEW"),
  }).strict(),
]);

export type LegalEvaluationHumanReviewRequest = z.infer<typeof legalEvaluationHumanReviewRequestSchema>;

type ScopeRow = { scenarioId: string; aiRunId: string; promptSha256: string; responseSha256: string; completedAt: string };
type StoredAttestation = { id: string; eventHash: string; createdAt: string; reviewerUserId: string; disposition: "confirmed_correct" | "needs_follow_up" };

export class LegalEvaluationHumanReviewError extends Error {
  constructor(readonly code: "LEGAL_EVALUATION_HUMAN_REVIEW_INVALID" | "LEGAL_EVALUATION_HUMAN_REVIEW_INCOMPLETE" | "LEGAL_EVALUATION_HUMAN_REVIEW_INTEGRITY_FAILED") {
    super(code); this.name = "LegalEvaluationHumanReviewError";
  }
}

async function scope(db: D1Database, evaluationRunId: string): Promise<{ scopeDigest: string; rows: ScopeRow[] }> {
  const result = await db.prepare(
    `SELECT attempt.scenario_id AS scenarioId,attempt.ai_run_id AS aiRunId,
      attempt.prompt_sha256 AS promptSha256,attempt.response_sha256 AS responseSha256,
      attempt.completed_at AS completedAt
     FROM staging_legal_evaluation_attempts attempt
     WHERE attempt.evaluation_run_id=? AND attempt.status='completed'
       AND attempt.attempt_number=(SELECT min(candidate.attempt_number)
         FROM staging_legal_evaluation_attempts candidate
         WHERE candidate.evaluation_run_id=attempt.evaluation_run_id
           AND candidate.scenario_id=attempt.scenario_id AND candidate.status='completed')
     ORDER BY attempt.scenario_id`,
  ).bind(evaluationRunId).all<ScopeRow>();
  const rows = result.results;
  const expectedIds = new Set(legalEvaluationCorpus.map((item) => item.id));
  if (rows.length !== legalEvaluationCorpus.length || new Set(rows.map((row) => row.scenarioId)).size !== rows.length || rows.some((row) => !expectedIds.has(row.scenarioId) || !row.aiRunId || !row.responseSha256 || !row.completedAt)) {
    throw new LegalEvaluationHumanReviewError("LEGAL_EVALUATION_HUMAN_REVIEW_INCOMPLETE");
  }
  return { scopeDigest: (await sha256Json({ evaluationRunId, corpusVersion: LEGAL_EVALUATION_CORPUS_VERSION, rows })).toUpperCase(), rows };
}

async function existing(db: D1Database, evaluationRunId: string, scopeDigest: string, reviewerUserId: string) {
  return db.prepare(
    `SELECT id,event_hash AS eventHash,created_at AS createdAt,reviewer_user_id AS reviewerUserId,disposition
     FROM legal_evaluation_human_attestations
     WHERE evaluation_run_id=? AND scope_digest=? AND reviewer_user_id=? LIMIT 1`,
  ).bind(evaluationRunId, scopeDigest, reviewerUserId).first<StoredAttestation>();
}

export async function executeLegalEvaluationHumanReview(input: { db: D1Database; staff: PlatformStaffAccess; request: LegalEvaluationHumanReviewRequest; now?: Date }) {
  if (input.staff.capability !== "ai.quality.review" || !input.staff.assignmentIds[0] || !input.staff.mfaVerifiedAt) throw new LegalEvaluationHumanReviewError("LEGAL_EVALUATION_HUMAN_REVIEW_INTEGRITY_FAILED");
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new LegalEvaluationHumanReviewError("LEGAL_EVALUATION_HUMAN_REVIEW_INVALID");
  const current = await scope(input.db, input.request.evaluationRunId);
  const prior = await existing(input.db, input.request.evaluationRunId, current.scopeDigest, input.staff.userId);
  if (input.request.action === "summary") {
    return { action: "summary" as const, evaluationRunId: input.request.evaluationRunId, corpusVersion: LEGAL_EVALUATION_CORPUS_VERSION, scenarioCount: current.rows.length, scopeDigest: current.scopeDigest.toLowerCase(), existing: prior ? { id: prior.id, eventHash: prior.eventHash.toLowerCase(), createdAt: prior.createdAt, disposition: prior.disposition } : null };
  }
  if (input.request.expectedScopeDigest.toUpperCase() !== current.scopeDigest) throw new LegalEvaluationHumanReviewError("LEGAL_EVALUATION_HUMAN_REVIEW_INTEGRITY_FAILED");
  if (prior) return { action: "attest" as const, id: prior.id, eventHash: prior.eventHash.toLowerCase(), createdAt: prior.createdAt, replay: true };
  const head = await input.db.prepare(
    `SELECT event_hash AS eventHash FROM legal_evaluation_human_attestations WHERE reviewer_user_id=? ORDER BY created_at DESC,id DESC LIMIT 1`,
  ).bind(input.staff.userId).first<{ eventHash: string }>();
  const createdAt = now.toISOString();
  const event = {
    id: crypto.randomUUID(), evaluationRunId: input.request.evaluationRunId,
    corpusVersion: LEGAL_EVALUATION_CORPUS_VERSION, scopeDigest: current.scopeDigest,
    scenarioCount: current.rows.length, completedRunCount: current.rows.length,
    disposition: input.request.disposition, reviewerUserId: input.staff.userId,
    reviewerSessionId: input.staff.sessionId, reviewerAssignmentId: input.staff.assignmentIds[0],
    reviewerMfaVerifiedAt: input.staff.mfaVerifiedAt, previousHash: head?.eventHash ?? ZERO_HASH, createdAt,
  };
  const eventHash = (await sha256Json(event)).toUpperCase();
  try {
    await input.db.prepare(
      `INSERT INTO legal_evaluation_human_attestations
       (id,evaluation_run_id,corpus_version,scope_digest,scenario_count,completed_run_count,disposition,reviewer_user_id,reviewer_session_id,reviewer_assignment_id,reviewer_mfa_verified_at,previous_hash,event_hash,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(event.id,event.evaluationRunId,event.corpusVersion,event.scopeDigest,event.scenarioCount,event.completedRunCount,event.disposition,event.reviewerUserId,event.reviewerSessionId,event.reviewerAssignmentId,event.reviewerMfaVerifiedAt,event.previousHash,eventHash,event.createdAt).run();
  } catch (error) {
    if (String(error).includes("CHAIN_CONFLICT")) throw new LegalEvaluationHumanReviewError("LEGAL_EVALUATION_HUMAN_REVIEW_INTEGRITY_FAILED");
    throw error;
  }
  return { action: "attest" as const, id: event.id, eventHash: eventHash.toLowerCase(), createdAt, replay: false };
}
