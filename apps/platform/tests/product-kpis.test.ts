import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PRODUCT_KPI_COMPARABLE_MIN_SAMPLE,
  PRODUCT_KPI_PRIVACY_MIN_SAMPLE,
  readProductKpiDashboard,
} from "../lib/analytics/product-kpis";
import {
  recordAiAnswerSourceOpen,
  recordLawyerDirectoryVisit,
} from "../lib/analytics/product-funnel-observations";
import { platformStaffRoleAllows } from "../lib/auth/staff-access";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const now = new Date("2026-08-29T12:00:00.000Z");
const onboardedAt = "2026-08-01T00:00:00.000Z";

function seedProfile(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"], id: string): void {
  sqlite.prepare(`INSERT INTO user_profiles
    (id,email,onboarding_completed_at,created_at,updated_at)
    VALUES (?,?,?, ?,?)`).run(id, `${id}@example.test`, onboardedAt, onboardedAt, onboardedAt);
}

function seedWorkspace(sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"], userId: string): string {
  const workspaceId = `workspace-${userId}`;
  sqlite.prepare(`INSERT INTO workspaces
    (id,type,name,created_by_user_id,created_at,updated_at)
    VALUES (?,'individual',?,?,?,?)`).run(workspaceId, `Workspace ${userId}`, userId, onboardedAt, onboardedAt);
  return workspaceId;
}

function seedProfileWithoutOnboarding(
  sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"],
  id: string,
  createdAt: string,
): void {
  sqlite.prepare(`INSERT INTO user_profiles
    (id,email,created_at,updated_at)
    VALUES (?,?,?,?)`).run(id, `${id}@example.test`, createdAt, createdAt);
}

function seedCase(
  sqlite: ReturnType<typeof sqliteD1Fixture>["sqlite"],
  input: { id: string; workspaceId: string; userId: string; createdAt: string },
): void {
  sqlite.prepare(`INSERT INTO cases
    (id,workspace_id,owner_user_id,account_type,locale,title,legal_area,status,created_at,updated_at)
    VALUES (?,?,?,'individual','ru','KPI test case','contracts','open',?,?)`)
    .run(input.id, input.workspaceId, input.userId, input.createdAt, input.createdAt);
}

test("product KPI dashboard computes mature activation without returning identities or content", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    for (let index = 0; index < PRODUCT_KPI_COMPARABLE_MIN_SAMPLE; index += 1) {
      seedProfile(sqlite, `cohort-${String(index).padStart(2, "0")}`);
    }
    seedProfile(sqlite, "legal_eval_user_excluded");
    seedProfile(sqlite, "10000000-0000-4000-8000-000000000001");
    seedProfile(sqlite, "staff-excluded");
    sqlite.prepare(`INSERT INTO platform_staff_assignments
      (id,user_id,role,grant_source,granted_by_user_id,grant_reason,granted_at,expires_at,
       created_at,updated_at)
      VALUES ('staff-assignment','staff-excluded','administrator','operator_bootstrap',NULL,
        'Exclude active staff from product cohorts.',?,?,?,?)`)
      .run(onboardedAt, "2027-08-01T00:00:00.000Z", onboardedAt, onboardedAt);

    [
      "legal_eval_user_excluded",
      "10000000-0000-4000-8000-000000000001",
      "staff-excluded",
    ].forEach((userId, index) => {
      const workspaceId = seedWorkspace(sqlite, userId);
      const caseId = `excluded-escalation-case-${index}`;
      const outcomeAt = `2026-07-24T1${index}:00:00.000Z`;
      const requestAt = `2026-07-25T1${index}:00:00.000Z`;
      seedCase(sqlite, { id: caseId, workspaceId, userId, createdAt: outcomeAt });
      sqlite.prepare(`INSERT INTO lawyer_requests
        (id,workspace_id,case_id,requester_user_id,status,anonymized_summary,
         requested_scope_json,created_at,updated_at)
        VALUES (?,?,?,?,?,'excluded aggregate test','{}',?,?)`)
        .run(
          `excluded-escalation-request-${index}`, workspaceId, caseId, userId,
          "conflict_check_pending", requestAt, requestAt,
        );
    });

    for (let index = 0; index < 2; index += 1) {
      const userId = `cohort-${String(index).padStart(2, "0")}`;
      const workspaceId = seedWorkspace(sqlite, userId);
      const conversationId = `conversation-${index}`;
      const messageId = `message-${index}`;
      const completedAt = `2026-08-01T0${index + 1}:00:00.000Z`;
      sqlite.prepare(`INSERT INTO conversations
        (id,workspace_id,owner_user_id,title,locale,status,created_at,updated_at)
        VALUES (?,?,?,'KPI conversation','ru','active',?,?)`)
        .run(conversationId, workspaceId, userId, onboardedAt, completedAt);
      sqlite.prepare(`INSERT INTO conversation_messages
        (id,conversation_id,author_type,content,structured_json,created_at)
        VALUES (?,?,'assistant','redacted test answer',?,?)`)
        .run(messageId, conversationId, JSON.stringify({
          responseKind: "answer",
          sourceValidationStatus: "validated",
          sources: [{ url: "https://lex.uz/docs/test" }],
        }), completedAt);
      sqlite.prepare(`INSERT INTO ai_runs
        (id,workspace_id,user_id,conversation_id,response_message_id,idempotency_key,correlation_id,
         provider,model,answer_mode,reasoning_mode,status,legal_database_as_of,instruction_hash,
         source_version_hash,started_at,completed_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,'detailed','fast','completed',?,?,?, ?,?,?,?)`)
        .run(
          `run-${index}`, workspaceId, userId, conversationId, messageId, `idem-${index}`,
          `corr-${index}`, "anthropic", "claude-sonnet-4-6", onboardedAt,
          "a".repeat(64), "b".repeat(64), completedAt, completedAt, completedAt, completedAt,
        );
    }

    {
      const userId = "cohort-02";
      const workspaceId = seedWorkspace(sqlite, userId);
      const completedAt = "2026-08-01T03:00:00.000Z";
      sqlite.prepare(`INSERT INTO document_files
        (id,workspace_id,owner_user_id,kind,r2_key,file_name,mime_type,size_bytes,created_at,updated_at)
        VALUES ('file-kpi',?,?,'analysis_source','kpi/file','kpi.pdf','application/pdf',20,?,?)`)
        .run(workspaceId, userId, onboardedAt, completedAt);
      sqlite.prepare(`INSERT INTO document_analyses
        (id,workspace_id,owner_user_id,uploaded_file_id,status,consent_version,created_at,updated_at)
        VALUES ('analysis-kpi',?,?,'file-kpi','completed','2026-08',?,?)`)
        .run(workspaceId, userId, onboardedAt, completedAt);
    }

    for (let index = 3; index < 5; index += 1) {
      const userId = `cohort-0${index}`;
      const workspaceId = seedWorkspace(sqlite, userId);
      const createdAt = `2026-08-01T0${index + 1}:00:00.000Z`;
      const caseId = `activation-case-${index}`;
      seedCase(sqlite, { id: caseId, workspaceId, userId, createdAt });
      sqlite.prepare(`INSERT INTO action_plans
        (id,case_id,created_by_user_id,title,status,progress_percent,created_at,updated_at)
        VALUES (?,?,?,'KPI activation plan','in_progress',0,?,?)`)
        .run(`activation-plan-${index}`, caseId, userId, createdAt, createdAt);
    }

    for (let index = 0; index < 3; index += 1) {
      const userId = `cohort-0${index}`;
      seedCase(sqlite, {
        id: `return-case-${index}`,
        workspaceId: `workspace-${userId}`,
        userId,
        createdAt: `2026-08-0${index + 3}T10:00:00.000Z`,
      });
    }

    seedWorkspace(sqlite, "cohort-05");
    for (let index = 0; index < 6; index += 1) {
      const userId = `cohort-0${index}`;
      const workspaceId = `workspace-${userId}`;
      const conversationId = `answer-funnel-conversation-${index}`;
      const requestMessageId = `answer-funnel-request-${index}`;
      const responseMessageId = `answer-funnel-response-${index}`;
      const questionAt = `2026-08-10T0${index}:00:00.000Z`;
      const answerAt = `2026-08-11T0${index}:00:00.000Z`;
      sqlite.prepare(`INSERT INTO conversations
        (id,workspace_id,owner_user_id,title,locale,status,created_at,updated_at)
        VALUES (?,?,?,'Answer funnel conversation','ru','active',?,?)`)
        .run(conversationId, workspaceId, userId, questionAt, answerAt);
      sqlite.prepare(`INSERT INTO conversation_messages
        (id,conversation_id,author_type,content,structured_json,created_at)
        VALUES (?,?,'user','aggregate-only test question',NULL,?)`)
        .run(requestMessageId, conversationId, questionAt);
      if (index >= 5) continue;
      sqlite.prepare(`INSERT INTO conversation_messages
        (id,conversation_id,author_type,content,structured_json,created_at)
        VALUES (?,?,'assistant','aggregate-only test answer',?,?)`)
        .run(responseMessageId, conversationId, JSON.stringify({
          responseKind: "answer",
          sourceValidationStatus: "validated",
          sources: [{ url: "https://lex.uz/docs/funnel-test" }],
        }), answerAt);
      sqlite.prepare(`INSERT INTO ai_runs
        (id,workspace_id,user_id,conversation_id,request_message_id,response_message_id,
         idempotency_key,correlation_id,provider,model,answer_mode,reasoning_mode,status,
         legal_database_as_of,instruction_hash,source_version_hash,started_at,completed_at,
         created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,'detailed','fast','completed',?,?,?,?,?,?,?)`)
        .run(
          `answer-funnel-run-${index}`, workspaceId, userId, conversationId,
          requestMessageId, responseMessageId, `answer-funnel-idem-${index}`,
          `answer-funnel-corr-${index}`, "anthropic", "claude-sonnet-4-6",
          questionAt, "c".repeat(64), "d".repeat(64), questionAt, answerAt, answerAt, answerAt,
        );
      if (index < 3) {
        await recordAiAnswerSourceOpen({
          db: d1,
          userId,
          responseMessageId,
          observedAt: new Date(`2026-08-12T0${index}:00:00.000Z`),
        });
      }
    }

    const feedbackTypes = ["helpful", "wrong_norm", "broken_link", "incomplete", "outdated"] as const;
    feedbackTypes.forEach((feedbackType, index) => {
      const userId = `cohort-0${index}`;
      sqlite.prepare(`INSERT INTO ai_feedback
        (id,workspace_id,user_id,conversation_id,assistant_message_id,ai_run_id,
         feedback_type,comment,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,NULL,?,?)`)
        .run(
          `feedback-${index}`, `workspace-${userId}`, userId,
          `answer-funnel-conversation-${index}`, `answer-funnel-response-${index}`,
          `answer-funnel-run-${index}`, feedbackType,
          `2026-08-2${index}T10:00:00.000Z`, `2026-08-2${index}T10:00:00.000Z`,
        );
    });

    for (let index = 0; index < 5; index += 1) {
      const userId = `escalation-${index}`;
      const outcomeAt = `2026-07-24T0${index}:00:00.000Z`;
      seedProfileWithoutOnboarding(sqlite, userId, outcomeAt);
      const workspaceId = seedWorkspace(sqlite, userId);
      const caseId = `escalation-case-${index}`;
      seedCase(sqlite, { id: caseId, workspaceId, userId, createdAt: outcomeAt });
      if (index < 3) {
        const requestAt = `2026-07-25T0${index}:00:00.000Z`;
        sqlite.prepare(`INSERT INTO lawyer_requests
          (id,workspace_id,case_id,requester_user_id,status,anonymized_summary,
           requested_scope_json,created_at,updated_at)
          VALUES (?,?,?,?,?,'aggregate-only escalation test','{}',?,?)`)
          .run(
            `escalation-request-${index}`, workspaceId, caseId, userId,
            "conflict_check_pending", requestAt, requestAt,
          );
      }
    }

    const requestStatuses = ["accepted", "offer_proposed", "offer_accepted", "completed", "conflict_check_pending"];
    for (let index = 0; index < 5; index += 1) {
      const userId = `cohort-0${index}`;
      const workspaceId = `workspace-${userId}`;
      const caseId = `workflow-case-${index}`;
      const createdAt = `2026-08-28T0${index + 1}:00:00.000Z`;
      const firstViewedAt = `2026-08-22T0${index}:00:00.000Z`;
      sqlite.prepare(`INSERT INTO lawyer_directory_daily_visits
        (user_id,visit_day,first_viewed_at,last_viewed_at)
        VALUES (?,'2026-08-22',?,?)`).run(userId, firstViewedAt, firstViewedAt);
      seedCase(sqlite, { id: caseId, workspaceId, userId, createdAt });
      sqlite.prepare(`INSERT INTO action_plans
        (id,case_id,created_by_user_id,title,status,progress_percent,created_at,updated_at)
        VALUES (?,?,?,'KPI workflow plan',?,?,?,?)`)
        .run(`workflow-plan-${index}`, caseId, userId, index < 3 ? "completed" : "in_progress", index < 3 ? 100 : 0, createdAt, createdAt);
      sqlite.prepare(`INSERT INTO lawyer_requests
        (id,workspace_id,case_id,requester_user_id,status,anonymized_summary,requested_scope_json,created_at,updated_at)
        VALUES (?,?,?,?,?,'aggregate-only test','{}',?,?)`)
        .run(`workflow-request-${index}`, workspaceId, caseId, userId, requestStatuses[index], createdAt, createdAt);
    }

    const dashboard = await readProductKpiDashboard({ db: d1, now });
    assert.equal(dashboard.activation.eligibleSignups, 30);
    assert.equal(dashboard.activation.activatedSignups, 5);
    assert.equal(dashboard.activation.rateBasisPoints, 1_667);
    assert.equal(dashboard.activation.readiness, "ready");
    assert.deepEqual(dashboard.activation.qualifyingUsers, {
      groundedAnswer: 2,
      documentAnalysis: 1,
      caseWithPlan: 2,
    });
    assert.deepEqual(dashboard.activation.ttfvSeconds, {
      p50: 10_800,
      p75: 14_400,
      p95: 18_000,
    });
    assert.deepEqual(dashboard.engagedReturn, {
      cohortStartedAt: "2026-07-16T12:00:00.000Z",
      cohortEndedAt: "2026-08-15T12:00:00.000Z",
      activationWindowDays: 7,
      returnWindowDays: 7,
      activatedUsers: 5,
      returningUsers: 3,
      rateBasisPoints: 6_000,
      readiness: "insufficient_sample",
    });
    assert.deepEqual(dashboard.answerFunnel, {
      cohortStartedAt: "2026-07-16T12:00:00.000Z",
      cohortEndedAt: "2026-08-15T12:00:00.000Z",
      answerWindowDays: 7,
      sourceOpenWindowDays: 7,
      firstQuestionUsers: 6,
      answeredUsers: 5,
      sourceOpeningUsers: 3,
      answerCompletionRateBasisPoints: 8_333,
      answerDropOffRateBasisPoints: 1_667,
      sourceOpenRateBasisPoints: 6_000,
      sourceDropOffRateBasisPoints: 4_000,
      answerReadiness: "insufficient_sample",
      sourceReadiness: "insufficient_sample",
    });
    assert.deepEqual(dashboard.feedbackQuality, {
      windowStartedAt: "2026-07-30T12:00:00.000Z",
      windowEndedAt: "2026-08-29T12:00:00.000Z",
      submitted: 5,
      helpful: 1,
      partial: 1,
      reportedErrors: 3,
      outdatedReports: 1,
      userReportedErrorRateBasisPoints: 6_000,
      readiness: "insufficient_sample",
    });
    assert.deepEqual(dashboard.lawyerEscalation, {
      cohortStartedAt: "2026-07-23T12:00:00.000Z",
      cohortEndedAt: "2026-08-22T12:00:00.000Z",
      conversionWindowDays: 7,
      eligibleOutcomeUsers: 10,
      escalatingUsers: 3,
      rateBasisPoints: 3_000,
      readiness: "insufficient_sample",
      firstOutcomeUsers: {
        groundedAnswer: 2,
        documentAnalysis: 1,
        caseCreated: 7,
      },
    });
    assert.deepEqual(dashboard.workflows.plans, {
      created: 7,
      completed: 3,
      completionRateBasisPoints: 4_286,
      readiness: "insufficient_sample",
    });
    assert.deepEqual(dashboard.workflows.lawyerRequests, {
      created: 5,
      acceptedOrLater: 4,
      completed: 1,
      acceptanceRateBasisPoints: 8_000,
      readiness: "insufficient_sample",
    });
    assert.deepEqual(dashboard.workflows.lawyerMarketplace, {
      cohortStartedAt: "2026-07-23T12:00:00.000Z",
      cohortEndedAt: "2026-08-22T12:00:00.000Z",
      conversionWindowDays: 7,
      directoryVisitors: 5,
      requestingVisitors: 5,
      conversionRateBasisPoints: 10_000,
      readiness: "insufficient_sample",
    });
    const serialized = JSON.stringify(dashboard);
    for (const forbidden of ["cohort-00", "@example.test", "redacted test answer", "lex.uz/docs/test"]) {
      assert.doesNotMatch(serialized, new RegExp(forbidden.replaceAll(".", "\\.")));
    }
    assert.deepEqual(dashboard.privacy, {
      protectedByFreshMfa: true,
      rawIdentifiersReturned: false,
      contentReturned: false,
      excludedCohorts: ["legal_evaluation", "investor_demo", "active_platform_staff"],
    });
  } finally {
    sqlite.close();
  }
});

test("product KPI dashboard suppresses rates and TTFV below the privacy threshold", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    for (let index = 0; index < PRODUCT_KPI_PRIVACY_MIN_SAMPLE - 1; index += 1) {
      seedProfile(sqlite, `small-${index}`);
    }
    const dashboard = await readProductKpiDashboard({ db: d1, now });
    assert.equal(dashboard.activation.eligibleSignups, 4);
    assert.equal(dashboard.activation.readiness, "privacy_threshold");
    assert.equal(dashboard.activation.rateBasisPoints, null);
    assert.deepEqual(dashboard.activation.ttfvSeconds, { p50: null, p75: null, p95: null });
    assert.equal(dashboard.engagedReturn.rateBasisPoints, null);
    assert.equal(dashboard.answerFunnel.answerCompletionRateBasisPoints, null);
    assert.equal(dashboard.answerFunnel.sourceOpenRateBasisPoints, null);
    assert.equal(dashboard.answerFunnel.answerReadiness, "no_data");
    assert.equal(dashboard.feedbackQuality.userReportedErrorRateBasisPoints, null);
    assert.equal(dashboard.feedbackQuality.readiness, "no_data");
    assert.equal(dashboard.lawyerEscalation.rateBasisPoints, null);
    assert.equal(dashboard.lawyerEscalation.readiness, "no_data");
    assert.equal(dashboard.workflows.lawyerMarketplace.conversionRateBasisPoints, null);
  } finally {
    sqlite.close();
  }
});

test("lawyer directory visits are daily-deduplicated without storing page or profile content", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seedProfile(sqlite, "visit-user");
    await recordLawyerDirectoryVisit({
      db: d1,
      userId: "visit-user",
      observedAt: new Date("2026-08-22T10:00:00.000Z"),
    });
    await recordLawyerDirectoryVisit({
      db: d1,
      userId: "visit-user",
      observedAt: new Date("2026-08-22T15:00:00.000Z"),
    });
    await recordLawyerDirectoryVisit({
      db: d1,
      userId: "visit-user",
      observedAt: new Date("2026-08-23T09:00:00.000Z"),
    });
    assert.deepEqual(
      sqlite.prepare(`SELECT visit_day AS visitDay,first_viewed_at AS firstViewedAt,
        last_viewed_at AS lastViewedAt
        FROM lawyer_directory_daily_visits ORDER BY visit_day`).all().map((row) => ({ ...row })),
      [
        {
          visitDay: "2026-08-22",
          firstViewedAt: "2026-08-22T10:00:00.000Z",
          lastViewedAt: "2026-08-22T15:00:00.000Z",
        },
        {
          visitDay: "2026-08-23",
          firstViewedAt: "2026-08-23T09:00:00.000Z",
          lastViewedAt: "2026-08-23T09:00:00.000Z",
        },
      ],
    );
    const columns = sqlite.prepare("PRAGMA table_info(lawyer_directory_daily_visits)").all()
      .map((column) => String((column as { name: string }).name));
    assert.deepEqual(columns, ["user_id", "visit_day", "first_viewed_at", "last_viewed_at"]);
  } finally {
    sqlite.close();
  }
});

test("answer source opens are answer-deduplicated, owner-bound and content-free", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    seedProfile(sqlite, "source-open-user");
    seedProfile(sqlite, "source-open-other");
    const workspaceId = seedWorkspace(sqlite, "source-open-user");
    seedWorkspace(sqlite, "source-open-other");
    sqlite.prepare(`INSERT INTO conversations
      (id,workspace_id,owner_user_id,title,locale,status,created_at,updated_at)
      VALUES ('source-open-conversation',?,?,'Source open test','ru','active',?,?)`)
      .run(workspaceId, "source-open-user", onboardedAt, onboardedAt);
    sqlite.prepare(`INSERT INTO conversation_messages
      (id,conversation_id,author_type,content,structured_json,created_at)
      VALUES ('source-open-response','source-open-conversation','assistant','test answer','{}',?)`)
      .run(onboardedAt);

    await recordAiAnswerSourceOpen({
      db: d1,
      userId: "source-open-user",
      responseMessageId: "source-open-response",
      observedAt: new Date("2026-08-12T15:00:00.000Z"),
    });
    await recordAiAnswerSourceOpen({
      db: d1,
      userId: "source-open-user",
      responseMessageId: "source-open-response",
      observedAt: new Date("2026-08-12T10:00:00.000Z"),
    });
    assert.deepEqual(
      { ...sqlite.prepare(`SELECT user_id AS userId,response_message_id AS responseMessageId,
        first_opened_at AS firstOpenedAt,last_opened_at AS lastOpenedAt
        FROM ai_answer_source_opens`).get() },
      {
        userId: "source-open-user",
        responseMessageId: "source-open-response",
        firstOpenedAt: "2026-08-12T10:00:00.000Z",
        lastOpenedAt: "2026-08-12T15:00:00.000Z",
      },
    );
    await assert.rejects(
      recordAiAnswerSourceOpen({
        db: d1,
        userId: "source-open-other",
        responseMessageId: "source-open-response",
      }),
      /AI_ANSWER_SOURCE_OPEN_OWNER_MISMATCH/,
    );
    const columns = sqlite.prepare("PRAGMA table_info(ai_answer_source_opens)").all()
      .map((column) => String((column as { name: string }).name));
    assert.deepEqual(columns, ["user_id", "response_message_id", "first_opened_at", "last_opened_at"]);
  } finally {
    sqlite.close();
  }
});

test("product KPI console is no-store, administrator-only and fresh-MFA-gated", () => {
  const api = readFileSync(new URL("../app/api/platform/admin/product-kpis/route.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/[locale]/admin/product-kpis/page.tsx", import.meta.url), "utf8");
  const service = readFileSync(new URL("../lib/analytics/product-kpis.ts", import.meta.url), "utf8");
  const observation = readFileSync(new URL("../lib/analytics/product-funnel-observations.ts", import.meta.url), "utf8");
  const directoryRoute = readFileSync(new URL("../app/api/platform/lawyers/route.ts", import.meta.url), "utf8");
  const citationRoute = readFileSync(new URL("../app/api/platform/ai/citations/[messageId]/route.ts", import.meta.url), "utf8");
  assert.equal(platformStaffRoleAllows("administrator", "staff.operations.manage"), true);
  assert.equal(platformStaffRoleAllows("support", "staff.operations.manage"), false);
  assert.match(api, /requirePlatformStaffRequest\(request, "staff\.operations\.manage", \{/);
  assert.match(api, /freshMfaWithinMs: 15 \* 60 \* 1_000/);
  assert.match(api, /private, no-store/);
  assert.match(page, /requirePlatformStaffAccess\(runtime\.DB, session, "staff\.operations\.manage"/);
  assert.match(page, /robots: \{ index: false, follow: false, nocache: true \}/);
  assert.doesNotMatch(service, /SELECT\s+profile\.email|SELECT\s+message\.content|email\s+AS|content\s+AS/i);
  assert.match(service, /rawIdentifiersReturned: false/);
  assert.match(service, /date\(engagement\.engagedAt\)>date\(first\.firstValueAt\)/);
  assert.match(observation, /ON CONFLICT\(user_id,visit_day\) DO UPDATE/);
  assert.match(directoryRoute, /recordLawyerDirectoryVisit\(\{ db, userId: user\.id \}\)/);
  assert.match(citationRoute, /recordAiAnswerSourceOpenBestEffort\(\{ db, userId: user\.id, responseMessageId: messageId \}\)/);
  assert.match(observation, /ON CONFLICT\(user_id,response_message_id\) DO UPDATE/);
  assert.doesNotMatch(observation, /profile_id|lawyer_id|case_id|workspace_id|content|query/i);
  assert.match(service, /FROM ai_feedback feedback/);
  assert.doesNotMatch(service, /SELECT[^;]*feedback\.comment/is);
  assert.match(service, /PARTITION BY event\.userId[\s\S]*outcomeRank=1/);
  assert.match(service, /request\.requester_user_id=outcome\.userId/);
});
