import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  calculateLegalEvaluationHumanEvidenceCorpusSha256,
  calculateLegalEvaluationHumanEvidenceDigest,
  legalEvaluationHumanEvidenceSchema,
  verifyLegalEvaluationHumanEvidence,
  type LegalEvaluationHumanEvidence,
} from "../evaluation/legal-evaluation-human-evidence";
import { LEGAL_EVALUATION_CORPUS_VERSION } from "../evaluation/legal-evaluation-contract";
import { legalEvaluationCorpus } from "../evaluation/legal-evaluation-corpus";

const zero = "0".repeat(64);
const reviewUser = "human-reviewer";
const session = "human-review-session";
const assignment = "human-review-assignment";
const attestationId = "01234567-89ab-4cde-8123-456789abcdef";

async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (item) => item.toString(16).padStart(2, "0")).join("");
}

async function evidenceFixture(): Promise<LegalEvaluationHumanEvidence> {
  let previousHash = zero;
  const records = [];
  for (const [index, scenario] of legalEvaluationCorpus.entries()) {
    const reviewEventId = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    const createdAt = new Date(Date.parse("2026-08-14T16:20:00.000Z") + index).toISOString();
    const event = {
      id: reviewEventId, attestationId,
      evaluationRunId: "staging-20260814-canonical", corpusVersion: LEGAL_EVALUATION_CORPUS_VERSION,
      scenarioId: scenario.id, attemptId: `attempt-${index + 1}`, aiRunId: `run-${index + 1}`,
      promptSha256: (await hash(scenario.prompt)).toUpperCase(), responseSha256: "A".repeat(64),
      classification: "correct" as const, reviewerUserId: reviewUser,
      reviewerSessionId: session, reviewerAssignmentId: assignment,
      reviewerMfaVerifiedAt: "2026-08-14T16:19:59.000Z",
      materializationReason: "attestation_scope_materialization" as const,
      previousHash: previousHash.toUpperCase(), createdAt,
    };
    const reviewEventHash = await hash(JSON.stringify(event));
    records.push({
      scenarioId: scenario.id, attemptId: event.attemptId, aiRunId: event.aiRunId,
      promptSha256: event.promptSha256.toLowerCase(), responseSha256: event.responseSha256.toLowerCase(),
      classification: event.classification, reviewerUserId: reviewUser,
      reviewerSessionId: session, reviewerAssignmentId: assignment,
      reviewerMfaVerifiedAt: event.reviewerMfaVerifiedAt,
      materializationReason: event.materializationReason, reviewEventId,
      previousHash, reviewEventHash, reviewedAt: createdAt,
    });
    previousHash = reviewEventHash;
  }
  const unsigned = legalEvaluationHumanEvidenceSchema.parse({
    schemaVersion: 1, corpusVersion: LEGAL_EVALUATION_CORPUS_VERSION,
    corpusSha256: await calculateLegalEvaluationHumanEvidenceCorpusSha256(),
    environment: "staging", evaluationRunId: "staging-20260814-canonical",
    attestationId, attestationEventHash: "B".repeat(64).toLowerCase(), scopeDigest: "C".repeat(64).toLowerCase(),
    recordCount: 314, exportedAt: "2026-08-14T16:21:00.000Z", records, exportDigest: zero,
  });
  return legalEvaluationHumanEvidenceSchema.parse({
    ...unsigned,
    exportDigest: await calculateLegalEvaluationHumanEvidenceDigest(unsigned),
  });
}

test("human evaluation evidence validates all 314 immutable per-scenario records without raw answers", async () => {
  const evidence = await evidenceFixture();
  assert.deepEqual(await verifyLegalEvaluationHumanEvidence(evidence), []);
  assert.equal(evidence.records.length, 314);
  assert.doesNotMatch(JSON.stringify(evidence), new RegExp(legalEvaluationCorpus[0]!.prompt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const tampered = { ...evidence, records: [{ ...evidence.records[0]!, responseSha256: "f".repeat(64) }, ...evidence.records.slice(1)] };
  const failures = await verifyLegalEvaluationHumanEvidence(tampered);
  assert.ok(failures.includes("LEGAL_HUMAN_EVIDENCE_DIGEST_MISMATCH"));
  assert.ok(failures.some((item) => item.startsWith("LEGAL_HUMAN_EVIDENCE_EVENT_HASH_INVALID:")));
});

test("materialization is fresh-MFA guarded, immutable, and distinct from user feedback", async () => {
  const [migration, service, route, reviewRoute] = await Promise.all([
    readFile(new URL("../drizzle/0123_legal_evaluation_human_review_records.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/ai/legal-evaluation-human-review.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/admin/ai-quality/evaluation-human-evidence/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/platform/admin/ai-quality/evaluation-review/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /legal_evaluation_human_review_records/u);
  assert.match(migration, /LEGAL_EVALUATION_HUMAN_RECORD_ACCESS_DENIED/u);
  assert.match(migration, /LEGAL_EVALUATION_HUMAN_RECORD_IMMUTABLE/u);
  assert.match(migration, /attestation_scope_materialization/u);
  assert.doesNotMatch(migration, /ai_feedback/u);
  assert.match(service, /I_CONFIRM_MATERIALIZE_PERSONAL_REVIEWS/u);
  assert.match(service, /input\.db\.batch\(statements\)/u);
  assert.match(route, /assertSafeWrite\(request\)/u);
  assert.match(route, /freshMfaWithinMs: 15 \* 60 \* 1_000/u);
  assert.match(route, /APP_ENV !== "staging"/u);
  assert.match(reviewRoute, /APP_ENV !== "staging"/u);
  assert.doesNotMatch(route, /export async function GET/u);
});
