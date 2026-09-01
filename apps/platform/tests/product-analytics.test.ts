import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PRODUCT_EVENT_SCHEMA_VERSION,
  productEventNameSchema,
  productEventSchema,
  writeProductEvent,
} from "../lib/platform/analytics";

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
    ["app/api/platform/consultations/route.ts", "consultation_scheduled"],
    ["app/api/platform/ai/feedback/route.ts", "feedback_submitted"],
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
