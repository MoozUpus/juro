import assert from "node:assert/strict";
import test from "node:test";
import { legalSourceHealth } from "../lib/legal/source-health";

test("legal source health reports freshness and work queues without source content", async () => {
  const db = {
    prepare(sql: string) {
      return {
        all: async () => ({ results: sql.includes("source_sync_runs") ? [
          { sourceKind: "lex", status: "success", finishedAt: "2026-08-01T00:00:00.000Z", discoveredCount: 1, fetchedCount: 1, changedCount: 0, verifiedCount: 1, errorCount: 0 },
          { sourceKind: "advice", status: "success", finishedAt: "2026-08-01T01:00:00.000Z", discoveredCount: 1, fetchedCount: 1, changedCount: 0, verifiedCount: 1, errorCount: 0 },
        ] : [] }),
        first: async () => ({ total: sql.includes("status='approved'") ? 1 : sql.includes("legal_review_queue") ? 2 : 2 }),
      };
    },
  } as unknown as D1Database;
  const health = await legalSourceHealth(db, new Date("2026-08-02T00:00:00.000Z"));
  assert.equal(health.freshness.status, "fresh");
  assert.deepEqual(health.latestRuns.map((run) => run.sourceKind), ["lex"]);
  assert.equal(health.pendingReviewCount, 2);
  assert.equal(health.approvedPendingPublicationCount, 1);
  assert.equal(health.pendingFetchCount, 2);
});
