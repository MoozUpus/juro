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
    ["app/api/platform/ai/route.ts", "first_question_sent"],
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

  const ai = source("app/api/platform/ai/route.ts");
  assert.match(ai, /productAccountMilestoneStatement/);
  assert.match(ai, /eventName: "first_question_sent"/);
  assert.match(ai, /productAccountMilestoneCreated/);
  assert.ok(ai.lastIndexOf('event: "first_question_sent"') > ai.indexOf("await db.batch"));
  assert.ok(ai.lastIndexOf('event: "first_question_sent"') > ai.indexOf("await input.db.batch"));
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
