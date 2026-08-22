import assert from "node:assert/strict";
import test from "node:test";
import {
  jobLeaseDurationMs,
  redriveVersionDisposition,
} from "../worker/platform-jobs";

test("document analysis keeps its durable lease inside the Queue wall-time", () => {
  assert.equal(jobLeaseDurationMs("document.analyze"), 12 * 60_000);
  assert.equal(jobLeaseDurationMs("document.index"), 5 * 60_000);
  assert.ok(jobLeaseDurationMs("document.analyze") < 15 * 60_000);
});

test("a newer audited redrive supersedes only older DLQ deliveries", () => {
  assert.equal(redriveVersionDisposition(0, 0), "current");
  assert.equal(redriveVersionDisposition(2, 2), "current");
  assert.equal(redriveVersionDisposition(1, 2), "superseded");
  assert.equal(redriveVersionDisposition(3, 2), "invalid");
  assert.equal(redriveVersionDisposition(-1, 0), "invalid");
});
