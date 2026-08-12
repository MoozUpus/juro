import assert from "node:assert/strict";
import test from "node:test";

import {
  isFreshTrustedMonitoringSource,
  summarizeMonitoringFreshness,
} from "../lib/legal/monitoring-freshness";

const NOW = new Date("2026-08-12T12:00:00.000Z");
const trustedLex = {
  officialUrl: "https://lex.uz/ru/docs/123",
  status: "verified",
  sourceType: "lex",
  verificationState: "verified",
  verifiedAt: "2026-08-12T11:00:00.000Z",
  contentSha256: "a".repeat(64),
};

test("monitoring only treats a recently checked trusted official source as fresh", () => {
  assert.equal(isFreshTrustedMonitoringSource({
    ...trustedLex,
    lastCheckedAt: "2026-08-06T12:00:00.000Z",
  }, NOW), true);
  assert.equal(isFreshTrustedMonitoringSource({
    ...trustedLex,
    lastCheckedAt: "2026-08-05T11:59:59.000Z",
  }, NOW), false);
  assert.equal(isFreshTrustedMonitoringSource({
    ...trustedLex,
    officialUrl: "https://example.com/legal/123",
    lastCheckedAt: NOW.toISOString(),
  }, NOW), false);
});

test("monitoring freshness never treats missing or stale evidence as a green feed", () => {
  assert.deepEqual(summarizeMonitoringFreshness([], NOW), {
    state: "unavailable",
    latestCheckedAt: null,
    ageDays: null,
    maxAgeDays: 7,
    freshSourceCount: 0,
    trustedSourceCount: 0,
  });
  const stale = summarizeMonitoringFreshness([{
    ...trustedLex,
    lastCheckedAt: "2026-08-01T12:00:00.000Z",
  }], NOW);
  assert.equal(stale.state, "stale");
  assert.equal(stale.freshSourceCount, 0);
  const fresh = summarizeMonitoringFreshness([{
    ...trustedLex,
    lastCheckedAt: "2026-08-12T11:00:00.000Z",
  }], NOW);
  assert.equal(fresh.state, "fresh");
  assert.equal(fresh.freshSourceCount, 1);
});
