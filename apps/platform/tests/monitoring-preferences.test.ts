import assert from "node:assert/strict";
import test from "node:test";

import { normalizeMonitoringAudience } from "../lib/platform/monitoring-preferences";

test("monitoring normalizes legacy personal route segments to an individual audience", () => {
  assert.equal(normalizeMonitoringAudience("individual"), "individual");
  assert.equal(normalizeMonitoringAudience("entrepreneur"), "individual");
  assert.equal(normalizeMonitoringAudience("lawyer"), "individual");
  assert.equal(normalizeMonitoringAudience("business"), "business");
});

test("monitoring defaults malformed or absent audience data to the safe personal audience", () => {
  assert.equal(normalizeMonitoringAudience("legacy-personal"), "individual");
  assert.equal(normalizeMonitoringAudience(null), "individual");
  assert.equal(normalizeMonitoringAudience(undefined), "individual");
});
