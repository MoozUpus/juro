import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { env } from "cloudflare:workers";
import { POST as collectPublicAnalytics } from "../app/api/public/analytics/route";
import { productEventNames, trackProductEvent, trackPublicSiteEvent } from "../lib/platform/analytics";

const requiredEvents = [
  "landing_view", "start_scenario", "signup_started", "signup_completed",
  "first_question_sent", "clarification_completed", "source_opened", "plan_created",
  "case_created", "document_uploaded", "document_analyzed", "document_compared",
  "lawyer_viewed", "lawyer_request_created", "lawyer_request_accepted",
  "consultation_scheduled", "paid_action_started", "AI_error", "retrieval_fallback",
  "source_not_found", "feedback_submitted",
] as const;

test("product telemetry exposes the complete bounded event vocabulary", () => {
  assert.deepEqual(productEventNames, requiredEvents);
  const source = readFileSync(new URL("../lib/platform/analytics.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /(?:userId|workspaceId|email|phone|question|fileName|requestUrl)\s*[?:]/u);
  assert.match(source, /productEvents\.has\(input\.event\)/u);
  assert.match(source, /Math\.min\(input\.elapsedMs \?\? 0, 3_600_000\)/u);
});

test("product telemetry writes only aggregate enum dimensions and ignores invalid runtime input", () => {
  const runtime = env as unknown as {
    PLATFORM_ANALYTICS?: { writeDataPoint(value?: { blobs?: string[]; doubles?: number[] }): void };
  };
  const original = runtime.PLATFORM_ANALYTICS;
  const points: Array<{ blobs?: string[]; doubles?: number[] }> = [];
  try {
    runtime.PLATFORM_ANALYTICS = { writeDataPoint(value) { if (value) points.push(value); } };
    trackProductEvent({
      event: "document_analyzed",
      surface: "document_analysis",
      locale: "uz",
      outcome: "success",
      provider: "openai",
      fallback: "none",
      elapsedMs: 8_500,
    });
    trackProductEvent({
      event: "document_analyzed",
      surface: "document_analysis",
      locale: "uz",
      outcome: "success",
      provider: "openai",
      fallback: "none",
      elapsedMs: 9_999_999,
    });
    trackProductEvent({
      event: "not_allowlisted" as "document_analyzed",
      surface: "document_analysis",
    });
    assert.equal(trackPublicSiteEvent({ event: "landing_view", locale: "en", page: "landing" }), true);
    assert.equal(trackPublicSiteEvent({ event: "landing_view", locale: "en", page: "lawyers" }), false);
    assert.equal(trackPublicSiteEvent({ event: "feedback_submitted", locale: "en", page: "landing" }), false);
    assert.deepEqual(points, [
      {
        blobs: ["document_analyzed", "document_analysis", "uz", "success", "openai", "none"],
        doubles: [1, 8_500],
      },
      {
        blobs: ["document_analyzed", "document_analysis", "uz", "success", "openai", "none"],
        doubles: [1, 3_600_000],
      },
      {
        blobs: ["landing_view", "public_site", "en", "success", "none", "landing"],
        doubles: [1, 0],
      },
    ]);
  } finally {
    if (original === undefined) delete runtime.PLATFORM_ANALYTICS;
    else runtime.PLATFORM_ANALYTICS = original;
  }
});

test("public telemetry requires an exact first-party browser origin and event-page pair", async () => {
  const runtime = env as unknown as {
    APP_ENV?: string;
    PLATFORM_ANALYTICS?: { writeDataPoint(value?: { blobs?: string[]; doubles?: number[] }): void };
  };
  const originalEnvironment = runtime.APP_ENV;
  const originalAnalytics = runtime.PLATFORM_ANALYTICS;
  const points: Array<{ blobs?: string[]; doubles?: number[] }> = [];
  try {
    runtime.APP_ENV = "production";
    runtime.PLATFORM_ANALYTICS = { writeDataPoint(value) { if (value) points.push(value); } };
    const request = (body: object, headers: Record<string, string> = {}) => new Request("https://app.juro.uz/api/public/analytics", {
      method: "POST",
      headers: {
        origin: "https://juro.uz",
        "sec-fetch-site": "same-site",
        "content-type": "text/plain;charset=UTF-8",
        ...headers,
      },
      body: JSON.stringify(body),
    });
    assert.equal((await collectPublicAnalytics(request({ event: "landing_view", locale: "ru", page: "landing" }))).status, 204);
    assert.equal((await collectPublicAnalytics(request({ event: "landing_view", locale: "ru", page: "lawyers" }))).status, 400);
    assert.equal((await collectPublicAnalytics(request(
      { event: "landing_view", locale: "ru", page: "landing" },
      { origin: "https://example.com" },
    ))).status, 403);
    assert.equal((await collectPublicAnalytics(request(
      { event: "landing_view", locale: "ru", page: "landing" },
      { "sec-fetch-site": "" },
    ))).status, 403);
    assert.deepEqual(points, [{
      blobs: ["landing_view", "public_site", "ru", "success", "none", "landing"],
      doubles: [1, 0],
    }]);
  } finally {
    if (originalEnvironment === undefined) delete runtime.APP_ENV;
    else runtime.APP_ENV = originalEnvironment;
    if (originalAnalytics === undefined) delete runtime.PLATFORM_ANALYTICS;
    else runtime.PLATFORM_ANALYTICS = originalAnalytics;
  }
});
