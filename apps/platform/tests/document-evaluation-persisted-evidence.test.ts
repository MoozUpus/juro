import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  documentEvaluationReviewRequestSchema,
  DocumentEvaluationReviewError,
  executeDocumentEvaluationReview,
  verifyDocumentEvaluationReviewHistory,
} from "../lib/document-analysis/evaluation-review";
import { verifyDocumentEvaluationPersistedEvidence } from "../evaluation/document-evaluation-contract";
import type { PlatformStaffAccess, PlatformStaffRole } from "../lib/auth/staff-access";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const REVIEWER_ID = "document-evaluation-reviewer";
const SESSION_ID = "document-evaluation-session";
const ASSIGNMENT_ID = "document-evaluation-assignment";
const OWNER_ID = "document-evaluation-owner";
const WORKSPACE_ID = "document-evaluation-workspace";
const FILE_ID = "document-evaluation-file";
const ANALYSIS_ID = "document-evaluation-analysis";
const RUN_ID = `document-analysis-run-${ANALYSIS_ID}`;
const SCAN_ID = "document-evaluation-scan";
const ARTIFACT_SHA = "a".repeat(64);
const RESULT_JSON = JSON.stringify({ documentType: "Договор оказания услуг", risks: 1 });
const RESULT_SHA = createHash("sha256").update(RESULT_JSON).digest("hex");
const MFA_AT = "2026-08-05T15:50:00.000Z";
const COMPLETED_AT = "2026-08-05T15:55:00.000Z";
const NOW = "2026-08-05T16:00:00.000Z";

function source(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function seed(role: PlatformStaffRole = "legal_reviewer") {
  const value = sqliteD1Fixture();
  value.sqlite.prepare(
    "INSERT INTO workspaces(id,type,name,full_name,short_name,locale,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
  ).run(WORKSPACE_ID, "individual", "Document evaluation", null, null, "ru", MFA_AT, MFA_AT);
  value.sqlite.prepare(
    "INSERT INTO user_profiles(id,email,full_name,locale,account_type,default_workspace_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
  ).run(OWNER_ID, "owner@example.invalid", "Owner", "ru", "individual", WORKSPACE_ID, MFA_AT, MFA_AT);
  value.sqlite.prepare(
    "INSERT INTO user_profiles(id,email,full_name,locale,account_type,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
  ).run(REVIEWER_ID, "reviewer@example.invalid", "Reviewer", "ru", "individual", MFA_AT, MFA_AT);
  value.sqlite.prepare(
    "INSERT INTO auth_devices(id,user_id,display_name,first_seen_at,last_seen_at) VALUES ('document-evaluation-device',?,'Evaluation device',?,?)",
  ).run(REVIEWER_ID, MFA_AT, MFA_AT);
  value.sqlite.prepare(
    `INSERT INTO auth_sessions
     (id,user_id,device_id,token_hash,auth_method,assurance_level,authenticated_at,
      mfa_verified_at,expires_at,idle_expires_at,created_at,last_seen_at)
     VALUES (?,?,'document-evaluation-device','document-evaluation-session-hash','email_otp+totp','mfa',?,?,'2026-08-06T16:00:00.000Z','2026-08-06T16:00:00.000Z',?,?)`,
  ).run(SESSION_ID, REVIEWER_ID, MFA_AT, MFA_AT, MFA_AT, MFA_AT);
  value.sqlite.prepare(
    `INSERT INTO auth_totp_credentials
     (id,user_id,status,secret_ciphertext,secret_iv,key_version,enrollment_expires_at,
      created_at,updated_at,verified_at)
     VALUES ('document-evaluation-totp',?,'active','ciphertext','abcdefghijklmnop','v1','2026-08-06T16:00:00.000Z',?,?,?)`,
  ).run(REVIEWER_ID, MFA_AT, MFA_AT, MFA_AT);
  value.sqlite.prepare(
    `INSERT INTO platform_staff_assignments
     (id,user_id,role,grant_source,grant_reason,granted_at,expires_at,created_at,updated_at)
     VALUES (?,?,?,'operator_bootstrap','Approved document evaluation','2026-08-05T15:00:00.000Z','2026-08-06T16:00:00.000Z',?,?)`,
  ).run(ASSIGNMENT_ID, REVIEWER_ID, role, MFA_AT, MFA_AT);
  value.sqlite.prepare(
    `INSERT INTO document_files
     (id,workspace_id,owner_user_id,kind,r2_key,file_name,mime_type,size_bytes,sha256,created_at,updated_at)
     VALUES (?,?,?,'analysis_quarantined','quarantine/evaluation/file','controlled.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',4096,?,?,?)`,
  ).run(FILE_ID, WORKSPACE_ID, OWNER_ID, ARTIFACT_SHA, MFA_AT, MFA_AT);
  value.sqlite.prepare(
    `INSERT INTO document_analyses
     (id,workspace_id,owner_user_id,uploaded_file_id,status,summary_json,result_sha256,error_code,
      consent_version,created_at,updated_at)
     VALUES (?,?,?,?,'quarantined',NULL,NULL,NULL,'evaluation-consent-v1',?,?)`,
  ).run(ANALYSIS_ID, WORKSPACE_ID, OWNER_ID, FILE_ID, MFA_AT, MFA_AT);
  value.sqlite.prepare(
    `INSERT INTO file_scan_results
     (id,analysis_id,file_id,workspace_id,owner_user_id,verdict,provider,engine,engine_version,
      signature_version,provider_scan_id,source_sha256,response_sha256,threats_json,completed_at,created_at)
     VALUES (?,?,?,?,?,'clean','controlled-scanner','clamav','1.4','2026-08-05','scan-remote-1',?,?,'[]',?,?)`,
  ).run(SCAN_ID, ANALYSIS_ID, FILE_ID, WORKSPACE_ID, OWNER_ID, ARTIFACT_SHA, "b".repeat(64), COMPLETED_AT, COMPLETED_AT);
  value.sqlite.prepare("UPDATE document_files SET kind='analysis_safe',r2_key='safe/evaluation/file',updated_at=? WHERE id=?")
    .run(COMPLETED_AT, FILE_ID);
  value.sqlite.prepare(
    "UPDATE document_analyses SET status='completed',summary_json=?,result_sha256=?,updated_at=? WHERE id=?",
  ).run(RESULT_JSON, RESULT_SHA, COMPLETED_AT, ANALYSIS_ID);
  value.sqlite.prepare(
    `INSERT INTO ai_runs
     (id,workspace_id,user_id,idempotency_key,correlation_id,provider,model,provider_response_id,
      answer_mode,reasoning_mode,status,legal_database_as_of,instruction_hash,source_version_hash,
      started_at,completed_at,created_at,updated_at)
     VALUES (?,?,?,?,?,'anthropic','claude-evaluation','provider-response-1','full','fast','completed',
      '2026-08-05T00:00:00.000Z','instruction-hash','source-version-hash',?,?,?,?)`,
  ).run(RUN_ID, WORKSPACE_ID, OWNER_ID, `document-analysis:${ANALYSIS_ID}`, "document-evaluation-correlation", MFA_AT, COMPLETED_AT, MFA_AT, COMPLETED_AT);
  value.sqlite.prepare(
    "INSERT INTO document_risks(id,analysis_id,level,title,description,created_at) VALUES ('document-evaluation-risk',?,'critical','Risk','Controlled critical risk',?)",
  ).run(ANALYSIS_ID, COMPLETED_AT);
  return value;
}

function staff(role: PlatformStaffRole = "legal_reviewer"): PlatformStaffAccess {
  return {
    userId: REVIEWER_ID,
    sessionId: SESSION_ID,
    capability: "ai.quality.review",
    roles: [role],
    assignmentIds: [ASSIGNMENT_ID],
    mfaVerifiedAt: MFA_AT,
  };
}

function reviewRequest() {
  return documentEvaluationReviewRequestSchema.parse({
    action: "review",
    evaluationRunId: "document-evaluation-2026-08-05",
    corpusVersion: "2026-08-04.1",
    packageId: "document-package-061",
    disposition: "pass",
    artifactSha256: ARTIFACT_SHA,
    artifactBytes: 4096,
    fileId: FILE_ID,
    analysisId: ANALYSIS_ID,
    analysisRunId: RUN_ID,
    scanResultId: SCAN_ID,
    actualFormat: "docx",
    actualDocumentType: "contract",
    datesAndSumsVerified: true,
    ocrCharacterAccuracyBps: null,
    userSideDetected: true,
    userSideConfirmed: true,
    comparisonPeerPackageId: null,
    comparisonId: null,
    comparisonReviewed: false,
    promptInjectionResisted: true,
  });
}

test("0092 binds a content-free review/export to current scan, analysis result and provider run", async () => {
  const { sqlite, d1 } = seed();
  try {
    const reviewed = await executeDocumentEvaluationReview({
      db: d1, staff: staff(), request: reviewRequest(), now: new Date(NOW),
    });
    assert.equal(reviewed.action, "review");
    assert.equal(reviewed.reviewVersion, 1);
    assert.deepEqual(await verifyDocumentEvaluationReviewHistory(d1), { valid: true, checked: 1 });

    const exported = await executeDocumentEvaluationReview({
      db: d1,
      staff: staff(),
      request: {
        action: "export",
        evaluationRunId: "document-evaluation-2026-08-05",
        corpusVersion: "2026-08-04.1",
        applicationCommit: "c".repeat(40),
        artifactManifestSha256: "d".repeat(64),
      },
      now: new Date("2026-08-05T16:01:00.000Z"),
    });
    assert.equal(exported.action, "export");
    const verified = await verifyDocumentEvaluationPersistedEvidence(exported.evidence);
    assert.equal(verified.valid, true, verified.failures.join(","));
    const tampered = structuredClone(exported.evidence);
    tampered.records[0]!.actualDocumentType = "claim";
    const tamperedVerdict = await verifyDocumentEvaluationPersistedEvidence(tampered);
    assert.equal(tamperedVerdict.valid, false);
    assert.ok(tamperedVerdict.failures.includes("DOCUMENT_EVALUATION_RECORDS_DIGEST_MISMATCH"));
    assert.equal(exported.evidence.records[0]?.analysisResultSha256, RESULT_SHA);
    assert.equal(exported.evidence.records[0]?.provider, "anthropic");
    assert.equal(exported.evidence.records[0]?.criticalRisksDetected, 1);
    assert.doesNotMatch(JSON.stringify(exported.evidence), /controlled\.docx|Договор оказания услуг|Controlled critical risk/u);
    assert.throws(
      () => sqlite.prepare("UPDATE document_evaluation_review_events SET disposition='fail'").run(),
      /DOCUMENT_EVALUATION_EVENT_IMMUTABLE/u,
    );
    assert.throws(
      () => sqlite.prepare("DELETE FROM document_evaluation_review_events").run(),
      /DOCUMENT_EVALUATION_EVENT_IMMUTABLE/u,
    );
  } finally { sqlite.close(); }
});

test("0092 fails closed when authoritative provider evidence changes after review", async () => {
  const { sqlite, d1 } = seed();
  try {
    await executeDocumentEvaluationReview({ db: d1, staff: staff(), request: reviewRequest(), now: new Date(NOW) });
    sqlite.prepare("UPDATE ai_runs SET model='changed-model' WHERE id=?").run(RUN_ID);
    await assert.rejects(
      executeDocumentEvaluationReview({
        db: d1,
        staff: staff(),
        request: {
          action: "export", evaluationRunId: "document-evaluation-2026-08-05",
          corpusVersion: "2026-08-04.1", applicationCommit: "c".repeat(40),
          artifactManifestSha256: "d".repeat(64),
        },
        now: new Date("2026-08-05T16:01:00.000Z"),
      }),
      (error: unknown) => error instanceof DocumentEvaluationReviewError
        && error.code === "DOCUMENT_EVALUATION_REVIEW_STALE_OR_UNVERIFIED",
    );
  } finally { sqlite.close(); }
});

test("0092 D1 actor guard rejects a forged non-reviewer and route is POST-only/fresh-MFA", async () => {
  const { sqlite, d1 } = seed("support");
  try {
    await assert.rejects(
      executeDocumentEvaluationReview({ db: d1, staff: staff("support"), request: reviewRequest(), now: new Date(NOW) }),
      (error: unknown) => error instanceof DocumentEvaluationReviewError
        && error.code === "DOCUMENT_EVALUATION_REVIEW_WRITE_FAILED",
    );
  } finally { sqlite.close(); }
  const route = source("app/api/platform/admin/document-evaluation/route.ts");
  assert.match(route, /assertSafeWrite\(request\)/u);
  assert.match(route, /ai\.quality\.review/u);
  assert.match(route, /freshMfaWithinMs:\s*15 \* 60 \* 1_000/u);
  assert.match(route, /private, no-store/u);
  assert.doesNotMatch(route, /export async function GET/u);
});

test("document evaluation request schema rejects self-declared provider evidence and malformed pair claims", () => {
  assert.equal(documentEvaluationReviewRequestSchema.safeParse({
    ...reviewRequest(), provider: "anthropic",
  }).success, false);
  assert.equal(documentEvaluationReviewRequestSchema.safeParse({
    ...reviewRequest(), comparisonReviewed: true,
  }).success, false);
  assert.equal(documentEvaluationReviewRequestSchema.safeParse({
    ...reviewRequest(), userSideDetected: false, userSideConfirmed: true,
  }).success, false);
  const validator = source("scripts/validate-document-evaluation.ts");
  assert.match(validator, /--evidence/u);
  assert.match(validator, /ARTIFACT_MANIFEST_HASH_MISMATCH/u);
  assert.doesNotMatch(validator, /process\.argv\.indexOf\("--results"\)/u);
});
