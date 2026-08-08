import assert from "node:assert/strict";
import test from "node:test";

import {
  runDirectLegalSourceHealthCheck,
  summarizeDirectLegalSourceHealth,
} from "../lib/legal/direct-source-health";

test("direct health distinguishes unknown, stale and unavailable states without legal content", () => {
  const now = new Date("2026-08-06T12:00:00.000Z");
  assert.equal(summarizeDirectLegalSourceHealth([], now).state, "unknown");
  assert.equal(summarizeDirectLegalSourceHealth([
    { sourceKind: "lex", status: "healthy", checkedAt: "2026-08-04T00:00:00.000Z", latencyMs: 12, errorCode: null, endpointUrl: "https://lex.uz/robots.txt" },
    { sourceKind: "advice", status: "healthy", checkedAt: "2026-08-04T00:00:00.000Z", latencyMs: 12, errorCode: null, endpointUrl: "https://advice.uz/robots.txt" },
  ], now).state, "stale");
  const degraded = summarizeDirectLegalSourceHealth([
    { sourceKind: "lex", status: "healthy", checkedAt: now.toISOString(), latencyMs: 12, errorCode: null, endpointUrl: "https://lex.uz/robots.txt" },
    { sourceKind: "advice", status: "unavailable", checkedAt: now.toISOString(), latencyMs: 20, errorCode: "DIRECT_SOURCE_HEALTH_UNAVAILABLE", endpointUrl: "https://advice.uz/robots.txt" },
  ], now);
  assert.equal(degraded.state, "degraded");
  assert.equal(degraded.alertCode, "DIRECT_SOURCE_UNAVAILABLE");
});

test("direct health persists only bounded endpoint metadata", async () => {
  const inserted: unknown[][] = [];
  const db = {
    prepare() {
      return {
        bind(...values: unknown[]) { inserted.push(values); return this; },
      };
    },
    async batch(statements: unknown[]) { return statements; },
  } as unknown as D1Database;
  const now = new Date("2026-08-06T12:00:00.000Z");
  const result = await runDirectLegalSourceHealthCheck({
    db,
    environment: "staging",
    now: () => now,
    fetchImpl: (async () => new Response("User-agent: *\nAllow: /", { headers: { "content-type": "text/plain" } })) as typeof fetch,
  });
  assert.equal(result.state, "fresh");
  assert.equal(inserted.length, 2);
  assert.equal(inserted.flat().some((value) => typeof value === "string" && /<html|article|excerpt/i.test(value)), false);
  assert.deepEqual(inserted.map((row) => row[7]), ["https://lex.uz/robots.txt", "https://advice.uz/robots.txt"]);
});
