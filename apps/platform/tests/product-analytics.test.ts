import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PRODUCT_EVENT_SCHEMA_VERSION,
  productEventNameSchema,
  productEventSchema,
  writeProductEvent,
} from "../lib/platform/analytics";
import {
  productAccountMilestoneCreated,
  productAccountMilestoneStatement,
  productClarificationCompletedStatement,
} from "../lib/platform/product-account-milestone";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

function source(relativePath: string): string {
  return readFileSync(new URL("../" + relativePath, import.meta.url), "utf8");
}

function dataset(output: AnalyticsEngineDataPoint[]): AnalyticsEngineDataset {
  return {
    writeDataPoint(value = {}) {
      output.push(value);
    },
  };
}

test("product analytics writes one fixed content-free row without a stable identity index", () => {
  const points: AnalyticsEngineDataPoint[] = [];
  assert.equal(writeProductEvent(dataset(points), {
    event: "case_created" as const,
    surface: "platform" as const,
    locale: "ru" as const,
    accountType: "individual" as const,
    outcome: "completed" as const,
  }), true);
  assert.deepEqual(points, [{
    blobs: [
      PRODUCT_EVENT_SCHEMA_VERSION,
      "case_created",
      "platform",
      "ru",
      "individual",
      "completed",
      "none",
    ],
    doubles: [1, 0],
  }]);
});

test("product analytics rejects unknown fields, events, dimensions and invalid durations", () => {
  const valid = {
    event: "case_created",
    surface: "platform",
    locale: "ru",
    accountType: "individual",
    outcome: "completed",
  };
  assert.equal(productEventSchema.safeParse({ ...valid, question: "secret" }).success, false);
  assert.equal(productEventSchema.safeParse({ ...valid, event: "invented_event" }).success, false);
  assert.equal(productEventSchema.safeParse({ ...valid, reason: "free text" }).success, false);
  assert.equal(productEventSchema.safeParse({ ...valid, durationMs: -1 }).success, false);
  assert.equal(productEventSchema.safeParse({ ...valid, durationMs: 1_800_001 }).success, false);
});

test("product analytics failures never escape into the durable product workflow", () => {
  const throwingDataset: AnalyticsEngineDataset = {
    writeDataPoint() {
      throw new Error("synthetic analytics outage");
    },
  };
  assert.equal(writeProductEvent(throwingDataset, {
    event: "plan_created",
    surface: "platform",
    locale: "uz",
    accountType: "business",
    outcome: "completed",
  }), false);
  assert.equal(writeProductEvent(undefined, {
    event: "plan_created",
    surface: "platform",
    locale: "uz",
    accountType: "business",
    outcome: "completed",
  }), false);
});

test("the event catalog covers the execution brief and durable routes emit only after persistence", () => {
  for (const event of [
    "landing_view",
    "start_scenario",
    "signup_started",
    "signup_completed",
    "first_question_sent",
    "clarification_completed",
    "source_opened",
    "plan_created",
    "case_created",
    "document_uploaded",
    "document_analyzed",
    "document_compared",
    "lawyer_viewed",
    "lawyer_request_created",
    "lawyer_request_accepted",
    "consultation_scheduled",
    "paid_action_started",
    "AI_error",
    "retrieval_fallback",
    "source_not_found",
    "feedback_submitted",
  ]) {
    assert.equal(productEventNameSchema.safeParse(event).success, true, event);
  }

  const routes = [
    ["app/api/platform/cases/route.ts", "case_created"],
    ["app/api/platform/cases/route.ts", "plan_created"],
    ["app/api/platform/ai/action-plan/route.ts", "plan_created"],
    ["app/api/platform/lawyer-requests/route.ts", "lawyer_request_created"],
    ["app/api/platform/lawyer-requests/[requestId]/access-grant/route.ts", "lawyer_request_accepted"],
    ["app/api/platform/consultations/route.ts", "consultation_scheduled"],
    ["app/api/platform/document-analysis/uploads/[analysisId]/finalize/route.ts", "document_uploaded"],
    ["app/api/platform/document-comparisons/[comparisonId]/process/route.ts", "document_compared"],
    ["app/api/platform/ai/feedback/route.ts", "feedback_submitted"],
    ["app/api/auth/verify-otp/route.ts", "signup_completed"],
    ["app/api/auth/request-otp/route.ts", "signup_started"],
    ["app/api/platform/ai/route.ts", "first_question_sent"],
    ["app/api/platform/ai/route.ts", "clarification_completed"],
    ["app/api/checkout/[orderId]/confirm/route.ts", "paid_action_started"],
    ["app/api/checkout/[orderId]/confirm-marketplace/route.ts", "paid_action_started"],
  ] as const;
  for (const [path, event] of routes) {
    const route = source(path);
    assert.match(route, /trackProductEvent/);
    assert.match(route, new RegExp("event: ?[\"']" + event + "[\"']"));
    assert.ok(
      route.lastIndexOf("trackProductEvent") > route.indexOf("await "),
      path + " must emit after its awaited durable operation",
    );
  }
});

test("replayable milestones emit only after a newly completed durable transition", () => {
  const upload = source("app/api/platform/document-analysis/uploads/[analysisId]/finalize/route.ts");
  assert.ok(upload.indexOf('record.status === "quarantined"') < upload.lastIndexOf("trackProductEvent"));
  assert.ok(upload.lastIndexOf("trackProductEvent") > upload.indexOf("const queued = await queueMalwareScan"));
  assert.match(upload, /if \(queued\.created\) \{\s*trackProductEvent/);
  assert.match(upload, /created = Number\(results\[1\]\?\.meta\.changes \?\? 0\) === 1/);

  const comparison = source("app/api/platform/document-comparisons/[comparisonId]/process/route.ts");
  assert.ok(comparison.indexOf('comparison.status === "completed"') < comparison.lastIndexOf("trackProductEvent"));
  assert.ok(comparison.lastIndexOf("trackProductEvent") > comparison.lastIndexOf("await db.batch(["));

  const grant = source("app/api/platform/lawyer-requests/[requestId]/access-grant/route.ts");
  assert.ok(grant.lastIndexOf("trackProductEvent") > grant.indexOf("Number(results[0]?.meta.changes ?? 0) !== 1"));
  assert.match(grant, /accountType: workspace\.type/);

  const signup = source("app/api/auth/verify-otp/route.ts");
  assert.ok(signup.lastIndexOf("trackProductEvent") > signup.indexOf("await recordRegistrationAcceptances"));
  assert.match(signup, /purpose === "register"/);

  const signupStart = source("app/api/auth/request-otp/route.ts");
  assert.match(signupStart, /if \(purpose === "register"\)/);
  assert.ok(
    signupStart.indexOf('event: "signup_started"')
      > signupStart.indexOf("if (!sent?.ok)"),
  );

  const ai = source("app/api/platform/ai/route.ts");
  assert.match(ai, /productAccountMilestoneStatement/);
  assert.match(ai, /eventName: "first_question_sent"/);
  assert.match(ai, /productAccountMilestoneCreated/);
  assert.match(ai, /productClarificationCompletedStatement/);
  assert.match(ai, /result\.responseKind === "answer"/);
  assert.match(ai, /branchInput\.operation === "follow_up"/);
  assert.ok(ai.lastIndexOf('event: "first_question_sent"') > ai.indexOf("await db.batch"));
  assert.ok(ai.lastIndexOf('event: "clarification_completed"') > ai.indexOf("await db.batch"));
  assert.ok(ai.lastIndexOf('event: "first_question_sent"') > ai.indexOf("await input.db.batch"));

  const analysis = source("lib/document-analysis/processor.ts");
  assert.match(analysis, /event: "document_analyzed"/);
  assert.match(analysis, /const completedTransition = await persistNormalizedAnalysis/);
  assert.match(analysis, /return Number\(results\[2\]\?\.meta\.changes \?\? 0\) === 1/);
  assert.ok(
    analysis.indexOf("writeProductEvent(scopedEnv.PRODUCT_ANALYTICS")
      > analysis.indexOf("const completedTransition = await persistNormalizedAnalysis"),
  );

  for (const path of [
    "app/api/checkout/[orderId]/confirm/route.ts",
    "app/api/checkout/[orderId]/confirm-marketplace/route.ts",
  ]) {
    const checkout = source(path);
    assert.match(checkout, /if \(transition\.createdPaymentAttempt\)/);
    assert.ok(
      checkout.indexOf('event: "paid_action_started"')
        > checkout.indexOf("await confirm"),
      path,
    );
  }
});

test("the first-question account milestone stays in D1 and is concurrency-safe", () => {
  const migration = source("drizzle/0150_product_account_milestones.sql");
  const milestone = source("lib/platform/product-account-milestone.ts");
  const analytics = source("lib/platform/analytics.ts");

  assert.match(migration, /PRIMARY KEY\(`user_id`,\s*`event_name`\)/);
  assert.match(migration, /ON DELETE cascade/);
  assert.match(milestone, /INSERT OR IGNORE INTO product_account_milestones/);
  assert.match(milestone, /Number\(result\?\.meta\.changes \?\? 0\) === 1/);
  assert.doesNotMatch(analytics, /userId|workspaceId|conversationId|messageId/);
});

test("the D1 account milestone elects exactly one first-question winner", async () => {
  const { d1 } = sqliteD1Fixture();
  const now = "2026-09-01T00:00:00.000Z";
  await d1.prepare(
    `INSERT INTO user_profiles (
       id,email,locale,account_type,created_at,updated_at
     ) VALUES (?,?,?,?,?,?)`,
  ).bind("user_analytics", "analytics@example.test", "ru", "individual", now, now).run();

  const first = await d1.batch([productAccountMilestoneStatement({
    db: d1,
    userId: "user_analytics",
    eventName: "first_question_sent",
    completedAt: now,
  })]);
  const replay = await d1.batch([productAccountMilestoneStatement({
    db: d1,
    userId: "user_analytics",
    eventName: "first_question_sent",
    completedAt: "2026-09-01T00:00:01.000Z",
  })]);

  assert.equal(productAccountMilestoneCreated(first[0]), true);
  assert.equal(productAccountMilestoneCreated(replay[0]), false);
});

test("the D1 clarification milestone requires a durable clarification parent and elects one account winner", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const now = "2026-09-01T00:00:00.000Z";
  sqlite.prepare(
    "INSERT INTO user_profiles (id,email,locale,account_type,created_at,updated_at) VALUES (?,?,?,?,?,?)",
  ).run("user_clarification", "clarification@example.test", "ru", "individual", now, now);
  sqlite.prepare(
    "INSERT INTO workspaces (id,type,name,locale,created_at,updated_at) VALUES (?,?,?,?,?,?)",
  ).run("workspace_clarification", "individual", "Clarification", "ru", now, now);
  sqlite.prepare(
    "INSERT INTO conversations (id,workspace_id,owner_user_id,title,locale,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
  ).run("conversation_clarification", "workspace_clarification", "user_clarification", "Question", "ru", "active", now, now);
  sqlite.prepare(
    "INSERT INTO conversation_messages (id,conversation_id,author_type,content,created_at) VALUES (?,?,?,?,?)",
  ).run("request_clarification", "conversation_clarification", "user", "Question", now);
  sqlite.prepare(
    "INSERT INTO conversation_messages (id,conversation_id,author_type,content,created_at) VALUES (?,?,?,?,?)",
  ).run("request_answer", "conversation_clarification", "user", "Other question", now);
  sqlite.prepare(
    "INSERT INTO conversation_messages (id,conversation_id,author_type,content,structured_json,created_at) VALUES (?,?,?,?,?,?)",
  ).run(
    "response_clarification",
    "conversation_clarification",
    "assistant",
    "More facts are required.",
    JSON.stringify({ responseKind: "clarification_required" }),
    now,
  );
  sqlite.prepare(
    "INSERT INTO conversation_messages (id,conversation_id,author_type,content,structured_json,created_at) VALUES (?,?,?,?,?,?)",
  ).run(
    "response_answer",
    "conversation_clarification",
    "assistant",
    "A completed Legal Answer.",
    JSON.stringify({ responseKind: "answer" }),
    now,
  );
  sqlite.prepare(
    `INSERT INTO message_branches (
       id,conversation_id,workspace_id,owner_user_id,parent_branch_id,
       forked_from_message_id,request_message_id,response_message_id,operation,created_at
     ) VALUES (?,?,?,?,NULL,NULL,?,?,?,?)`,
  ).run(
    "branch_clarification",
    "conversation_clarification",
    "workspace_clarification",
    "user_clarification",
    "request_clarification",
    "response_clarification",
    "new",
    now,
  );
  sqlite.prepare(
    `INSERT INTO message_branches (
       id,conversation_id,workspace_id,owner_user_id,parent_branch_id,
       forked_from_message_id,request_message_id,response_message_id,operation,created_at
     ) VALUES (?,?,?,?,NULL,NULL,?,?,?,?)`,
  ).run(
    "branch_answer",
    "conversation_clarification",
    "workspace_clarification",
    "user_clarification",
    "request_answer",
    "response_answer",
    "new",
    now,
  );

  const notClarification = await d1.batch([productClarificationCompletedStatement({
    db: d1,
    userId: "user_clarification",
    workspaceId: "workspace_clarification",
    conversationId: "conversation_clarification",
    parentBranchId: "branch_answer",
    completedAt: "2026-09-01T00:00:30.000Z",
  })]);
  const first = await d1.batch([productClarificationCompletedStatement({
    db: d1,
    userId: "user_clarification",
    workspaceId: "workspace_clarification",
    conversationId: "conversation_clarification",
    parentBranchId: "branch_clarification",
    completedAt: "2026-09-01T00:01:00.000Z",
  })]);
  const replay = await d1.batch([productClarificationCompletedStatement({
    db: d1,
    userId: "user_clarification",
    workspaceId: "workspace_clarification",
    conversationId: "conversation_clarification",
    parentBranchId: "branch_clarification",
    completedAt: "2026-09-01T00:02:00.000Z",
  })]);
  const unrelated = await d1.batch([productClarificationCompletedStatement({
    db: d1,
    userId: "user_clarification",
    workspaceId: "workspace_clarification",
    conversationId: "conversation_clarification",
    parentBranchId: "missing_branch",
    completedAt: "2026-09-01T00:03:00.000Z",
  })]);

  assert.equal(productAccountMilestoneCreated(notClarification[0]), false);
  assert.equal(productAccountMilestoneCreated(first[0]), true);
  assert.equal(productAccountMilestoneCreated(replay[0]), false);
  assert.equal(productAccountMilestoneCreated(unrelated[0]), false);
  const stored = sqlite.prepare(
    "SELECT event_name,first_completed_at FROM product_account_milestones WHERE user_id=?",
  ).get("user_clarification") as {
    event_name: string;
    first_completed_at: string;
  };
  assert.equal(stored.event_name, "clarification_completed");
  assert.equal(stored.first_completed_at, "2026-09-01T00:01:00.000Z");
});
