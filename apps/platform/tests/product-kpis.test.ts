import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PRODUCT_KPI_COMPARABLE_MIN_SAMPLE,
  PRODUCT_KPI_PRIVACY_MIN_SAMPLE,
  readProductKpiDashboard,
} from "../lib/analytics/product-kpis";
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

    const requestStatuses = ["accepted", "offer_proposed", "offer_accepted", "completed", "conflict_check_pending"];
    for (let index = 0; index < 5; index += 1) {
      const userId = `cohort-0${index}`;
      const workspaceId = `workspace-${userId}`;
      const caseId = `workflow-case-${index}`;
      const createdAt = `2026-08-28T0${index + 1}:00:00.000Z`;
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
  } finally {
    sqlite.close();
  }
});

test("product KPI console is no-store, administrator-only and fresh-MFA-gated", () => {
  const api = readFileSync(new URL("../app/api/platform/admin/product-kpis/route.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/[locale]/admin/product-kpis/page.tsx", import.meta.url), "utf8");
  const service = readFileSync(new URL("../lib/analytics/product-kpis.ts", import.meta.url), "utf8");
  assert.equal(platformStaffRoleAllows("administrator", "staff.operations.manage"), true);
  assert.equal(platformStaffRoleAllows("support", "staff.operations.manage"), false);
  assert.match(api, /requirePlatformStaffRequest\(request, "staff\.operations\.manage", \{/);
  assert.match(api, /freshMfaWithinMs: 15 \* 60 \* 1_000/);
  assert.match(api, /private, no-store/);
  assert.match(page, /requirePlatformStaffAccess\(runtime\.DB, session, "staff\.operations\.manage"/);
  assert.match(page, /robots: \{ index: false, follow: false, nocache: true \}/);
  assert.doesNotMatch(service, /SELECT\s+profile\.email|SELECT\s+message\.content|email\s+AS|content\s+AS/i);
  assert.match(service, /rawIdentifiersReturned: false/);
});
