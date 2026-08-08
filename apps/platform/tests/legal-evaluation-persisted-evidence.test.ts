import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  calculateLegalEvaluationCorpusSha256,
  exportLegalEvaluationPersistedEvidence,
  LegalEvaluationEvidenceError,
  legalEvaluationEvidenceExportRequestSchema,
  legalEvaluationPersistedEvidenceSchema,
  verifyLegalEvaluationPersistedEvidence,
} from "../evaluation/legal-evaluation-persisted-evidence";
import {
  LEGAL_EVALUATION_CORPUS_VERSION,
  legalEvaluationResultsEnvelopeSchema,
  type LegalEvaluationResultsEnvelope,
} from "../evaluation/legal-evaluation-artifacts";
import {
  legalEvaluationCorpus,
  type LegalEvaluationResult,
} from "../evaluation/legal-evaluation-corpus";
import { executeAiQualityReview } from "../lib/ai/quality-review";
import type { PlatformStaffAccess } from "../lib/auth/staff-access";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const scenario = legalEvaluationCorpus[0]!;
const REVIEWER_ID = "evaluation-reviewer";
const SESSION_ID = "evaluation-session";
const ASSIGNMENT_ID = "evaluation-assignment";
const USER_ID = "evaluation-user";
const WORKSPACE_ID = "evaluation-workspace";
const CONVERSATION_ID = "evaluation-conversation";
const QUESTION_ID = "edfcf243-8a17-4ba0-a77e-abef900c8ed7";
const ANSWER_ID = "be9f22ba-6603-4d32-8fc5-3539f695e6c8";
const FEEDBACK_ID = "26e02c3c-7983-476a-85a9-cf5000c4a80f";
const RUN_ID = "evaluation-ai-run-001";
const MFA_AT = "2026-08-05T13:50:00.000Z";
const COMPLETED_AT = "2026-08-05T13:55:00.000Z";
const REVIEWED_AT = "2026-08-05T14:00:00.000Z";
const EXPORTED_AT = "2026-08-05T14:05:00.000Z";
const INSTRUCTION_HASH = "1".repeat(64);
const SOURCE_VERSION_HASH = "2".repeat(64);
const SOURCE_HASH = "3".repeat(64);
const SOURCE_URL = "https://lex.uz/ru/docs/-424242";
const ANSWER = "Применимую редакцию и дату события должен подтвердить юрист по источнику.";

const structuredOutput = {
  responseKind: "answer" as const,
  summary: "Нужно проверить редакцию нормы на дату события.",
  answer: ANSWER,
  language: scenario.locale,
  jurisdiction: "UZ" as const,
  answerMode: "detailed" as const,
  reasoningMode: "deep" as const,
  clarificationQuestions: [],
  confirmedFindings: [{
    title: "Дата события влияет на редакцию",
    explanation: "Проверяется редакция на дату события.",
    sourceIds: ["lex-fixture"],
  }],
  assumptions: [],
  risks: [],
  sources: [{
    sourceId: "lex-fixture",
    actTitle: "Тестовый нормативный источник",
    actIdentifier: null,
    article: null,
    excerpt: "Проверяемый тестовый фрагмент.",
    originalUrl: SOURCE_URL,
    status: "current" as const,
    effectiveDate: null,
    verifiedAt: COMPLETED_AT,
  }],
  requiredDocuments: [],
  actionPlan: [],
  deadlines: [],
  successOutlook: null,
  urgency: "normal" as const,
  suggestedDocument: null,
  suggestLawyer: true,
  legalDatabaseAsOf: COMPLETED_AT,
};

function source(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function staff(): PlatformStaffAccess {
  return {
    userId: REVIEWER_ID,
    sessionId: SESSION_ID,
    capability: "ai.quality.review",
    roles: ["legal_reviewer"],
    assignmentIds: [ASSIGNMENT_ID],
    mfaVerifiedAt: MFA_AT,
  };
}

function seed() {
  const value = sqliteD1Fixture();
  value.sqlite.prepare(
    "INSERT INTO workspaces(id,type,name,full_name,short_name,locale,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
  ).run(WORKSPACE_ID, "individual", "Evaluation", null, null, "ru", MFA_AT, MFA_AT);
  value.sqlite.prepare(
    "INSERT INTO user_profiles(id,email,full_name,locale,account_type,default_workspace_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
  ).run(USER_ID, "evaluation-user@example.invalid", "Evaluation User", "ru", "individual", WORKSPACE_ID, MFA_AT, MFA_AT);
  value.sqlite.prepare(
    "INSERT INTO user_profiles(id,email,full_name,locale,account_type,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
  ).run(REVIEWER_ID, "evaluation-reviewer@example.invalid", "Evaluation Reviewer", "ru", "individual", MFA_AT, MFA_AT);
  value.sqlite.prepare(
    "INSERT INTO auth_devices(id,user_id,display_name,first_seen_at,last_seen_at) VALUES ('evaluation-device',?,'Evaluation device',?,?)",
  ).run(REVIEWER_ID, MFA_AT, MFA_AT);
  value.sqlite.prepare(
    `INSERT INTO auth_sessions
     (id,user_id,device_id,token_hash,auth_method,assurance_level,authenticated_at,
      mfa_verified_at,expires_at,idle_expires_at,created_at,last_seen_at)
     VALUES (?,?,'evaluation-device','evaluation-session-hash','email_otp+totp','mfa',?,?,'2026-08-06T14:00:00.000Z','2026-08-06T14:00:00.000Z',?,?)`,
  ).run(SESSION_ID, REVIEWER_ID, MFA_AT, MFA_AT, MFA_AT, MFA_AT);
  value.sqlite.prepare(
    `INSERT INTO auth_totp_credentials
     (id,user_id,status,secret_ciphertext,secret_iv,key_version,enrollment_expires_at,
      created_at,updated_at,verified_at)
     VALUES ('evaluation-totp',?,'active','ciphertext','abcdefghijklmnop','v1','2026-08-06T14:00:00.000Z',?,?,?)`,
  ).run(REVIEWER_ID, MFA_AT, MFA_AT, MFA_AT);
  value.sqlite.prepare(
    `INSERT INTO platform_staff_assignments
     (id,user_id,role,grant_source,grant_reason,granted_at,expires_at,created_at,updated_at)
     VALUES (?,?,'legal_reviewer','operator_bootstrap','Approved evaluation review','2026-08-05T13:00:00.000Z','2026-08-06T14:00:00.000Z',?,?)`,
  ).run(ASSIGNMENT_ID, REVIEWER_ID, MFA_AT, MFA_AT);
  value.sqlite.prepare(
    "INSERT INTO conversations(id,workspace_id,owner_user_id,case_id,title,locale,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
  ).run(CONVERSATION_ID, WORKSPACE_ID, USER_ID, null, "Evaluation", scenario.locale, "active", MFA_AT, MFA_AT);
  value.sqlite.prepare(
    "INSERT INTO conversation_messages(id,conversation_id,author_type,content,structured_json,created_at) VALUES (?,?,?,?,?,?)",
  ).run(QUESTION_ID, CONVERSATION_ID, "user", scenario.prompt, null, COMPLETED_AT);
  value.sqlite.prepare(
    "INSERT INTO conversation_messages(id,conversation_id,author_type,content,structured_json,created_at) VALUES (?,?,?,?,?,?)",
  ).run(ANSWER_ID, CONVERSATION_ID, "assistant", ANSWER, JSON.stringify(structuredOutput), COMPLETED_AT);
  value.sqlite.prepare(
    `INSERT INTO ai_runs
     (id,workspace_id,user_id,conversation_id,request_message_id,response_message_id,idempotency_key,
      correlation_id,provider,model,answer_mode,reasoning_mode,status,legal_database_as_of,
      instruction_hash,source_version_hash,started_at,completed_at,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    RUN_ID, WORKSPACE_ID, USER_ID, CONVERSATION_ID, QUESTION_ID, ANSWER_ID,
    "evaluation-key", "evaluation-correlation", "openai", "gpt-evaluation",
    "detailed", "deep", "completed", COMPLETED_AT, INSTRUCTION_HASH,
    SOURCE_VERSION_HASH, MFA_AT, COMPLETED_AT, MFA_AT, COMPLETED_AT,
  );
  value.sqlite.prepare(
    `INSERT INTO ai_feedback
     (id,workspace_id,user_id,conversation_id,assistant_message_id,ai_run_id,feedback_type,comment,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    FEEDBACK_ID, WORKSPACE_ID, USER_ID, CONVERSATION_ID, ANSWER_ID, RUN_ID,
    "helpful", null, COMPLETED_AT, COMPLETED_AT,
  );
  return value;
}

async function reviewedEnvelope(d1: D1Database, sqlite: ReturnType<typeof seed>["sqlite"]): Promise<LegalEvaluationResultsEnvelope> {
  await executeAiQualityReview({
    db: d1,
    staff: staff(),
    now: new Date(REVIEWED_AT),
    request: {
      action: "resolve",
      feedbackId: FEEDBACK_ID,
      classification: "correct",
      notes: "Ответ и язык проверены по сценарию; оценка качества 100.",
      correctedAnswer: null,
      goldenAnswer: null,
    },
  });
  const review = sqlite.prepare(
    "SELECT event_hash AS eventHash FROM ai_quality_review_events WHERE feedback_id=? AND request_action='resolve'",
  ).get(FEEDBACK_ID) as { eventHash: string };
  const result: LegalEvaluationResult = {
    scenarioId: scenario.id,
    aiRunId: RUN_ID,
    provider: "openai",
    model: "gpt-evaluation",
    instructionHash: INSTRUCTION_HASH,
    legalDatabaseVersion: COMPLETED_AT,
    completedAt: COMPLETED_AT,
    answerLanguage: scenario.locale,
    jurisdiction: "UZ",
    confirmedFindingCount: 1,
    citations: [{
      sourceId: "lex-fixture",
      sourceType: "lex",
      url: SOURCE_URL,
      exists: true,
      httpStatus: 200,
      checkedAt: COMPLETED_AT,
      sourceHash: SOURCE_HASH,
      verificationMethod: "http",
    }],
    observedBehaviors: [...scenario.expectedBehaviors],
    criticalDeadlineDetected: false,
    reviewedLanguageQuality: 100,
    humanReviewerId: REVIEWER_ID,
    reviewedAt: REVIEWED_AT,
    reviewEvidenceHash: review.eventHash.toLowerCase(),
  };
  return legalEvaluationResultsEnvelopeSchema.parse({
    schemaVersion: 1,
    corpusVersion: LEGAL_EVALUATION_CORPUS_VERSION,
    corpusSha256: await calculateLegalEvaluationCorpusSha256([scenario]),
    environment: "staging",
    applicationCommit: "a".repeat(40),
    evaluationRunId: "evaluation-fixture-001",
    generatedAt: REVIEWED_AT,
    results: [result],
  });
}

test("persisted evidence binds a reviewed result to stored run/output without exporting content", async () => {
  const { sqlite, d1 } = seed();
  try {
    const resultsEnvelope = await reviewedEnvelope(d1, sqlite);
    const evidence = await exportLegalEvaluationPersistedEvidence({
      db: d1,
      resultsEnvelope,
      scenarios: [scenario],
      now: new Date(EXPORTED_AT),
    });
    assert.equal(legalEvaluationPersistedEvidenceSchema.safeParse(evidence).success, true);
    assert.deepEqual(await verifyLegalEvaluationPersistedEvidence(evidence, resultsEnvelope, [scenario]), []);
    assert.equal(evidence.records[0]?.aiRunId, RUN_ID);
    assert.equal(evidence.records[0]?.reviewClassification, "correct");
    const serialized = JSON.stringify(evidence);
    assert.doesNotMatch(serialized, new RegExp(scenario.prompt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(serialized, new RegExp(ANSWER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(serialized, /evaluation-user@example\.invalid/);
    assert.doesNotMatch(serialized, new RegExp(WORKSPACE_ID));

    const tampered = { ...evidence, applicationCommit: "b".repeat(40) };
    const failures = await verifyLegalEvaluationPersistedEvidence(tampered, resultsEnvelope, [scenario]);
    assert.ok(failures.includes("LEGAL_EVIDENCE_DIGEST_MISMATCH"));
    assert.ok(failures.includes("LEGAL_EVIDENCE_COMMIT_MISMATCH"));

    const changedScore = legalEvaluationResultsEnvelopeSchema.parse({
      ...resultsEnvelope,
      results: [{ ...resultsEnvelope.results[0]!, reviewedLanguageQuality: 99 }],
    });
    assert.ok((await verifyLegalEvaluationPersistedEvidence(
      evidence,
      changedScore,
      [scenario],
    )).includes("LEGAL_EVIDENCE_RESULTS_ENVELOPE_MISMATCH"));
  } finally { sqlite.close(); }
});

test("persisted evidence export fails closed on self-declared run metadata and changed reviewed content", async () => {
  const first = seed();
  try {
    const resultsEnvelope = await reviewedEnvelope(first.d1, first.sqlite);
    const changed = {
      ...resultsEnvelope,
      results: [{ ...resultsEnvelope.results[0]!, model: "fabricated-model" }],
    };
    await assert.rejects(
      exportLegalEvaluationPersistedEvidence({
        db: first.d1,
        resultsEnvelope: changed,
        scenarios: [scenario],
        now: new Date(EXPORTED_AT),
      }),
      (error: unknown) => error instanceof LegalEvaluationEvidenceError
        && error.code === "LEGAL_EVALUATION_EVIDENCE_INTEGRITY_FAILED",
    );
  } finally { first.sqlite.close(); }

  const second = seed();
  try {
    const resultsEnvelope = await reviewedEnvelope(second.d1, second.sqlite);
    second.sqlite.prepare("UPDATE conversation_messages SET content='changed after review' WHERE id=?")
      .run(ANSWER_ID);
    await assert.rejects(
      exportLegalEvaluationPersistedEvidence({
        db: second.d1,
        resultsEnvelope,
        scenarios: [scenario],
        now: new Date(EXPORTED_AT),
      }),
      (error: unknown) => error instanceof LegalEvaluationEvidenceError
        && error.code === "LEGAL_EVALUATION_EVIDENCE_INTEGRITY_FAILED",
    );
  } finally { second.sqlite.close(); }
});

test("evidence endpoint is strict, POST-only, CSRF and fresh-MFA protected", () => {
  assert.equal(legalEvaluationEvidenceExportRequestSchema.safeParse({}).success, false);
  assert.equal(legalEvaluationEvidenceExportRequestSchema.safeParse({ resultsEnvelope: {}, extra: true }).success, false);
  const route = source("app/api/platform/admin/ai-quality/evaluation-evidence/route.ts");
  assert.match(route, /assertSafeWrite\(request\)/);
  assert.match(route, /ai\.quality\.review/);
  assert.match(route, /freshMfaWithinMs:\s*15 \* 60 \* 1_000/);
  assert.match(route, /private, no-store/);
  assert.doesNotMatch(route, /export async function GET/);
  const cli = source("scripts/validate-legal-evaluation.ts");
  assert.match(cli, /--evidence/);
  assert.match(cli, /legalEvaluationPersistedEvidenceSchema\.safeParse/);
  assert.match(cli, /verifyLegalEvaluationPersistedEvidence/);
});
