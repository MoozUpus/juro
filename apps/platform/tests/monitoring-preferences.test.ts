import assert from "node:assert/strict";
import test from "node:test";

import {
  monitoringPreferencesAreInformationalOnly,
  normalizeMonitoringAudience,
} from "../lib/platform/monitoring-preferences";

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

test("monitoring delivery stays informational until it exits controlled beta with fresh evidence", () => {
  assert.equal(monitoringPreferencesAreInformationalOnly({
    automaticPublication: true,
    controlledBeta: true,
    freshnessState: "fresh",
  }), true);
  assert.equal(monitoringPreferencesAreInformationalOnly({
    automaticPublication: false,
    controlledBeta: false,
    freshnessState: "fresh",
  }), true);
  assert.equal(monitoringPreferencesAreInformationalOnly({
    automaticPublication: true,
    controlledBeta: false,
    freshnessState: "stale",
  }), true);
  assert.equal(monitoringPreferencesAreInformationalOnly({
    automaticPublication: true,
    controlledBeta: false,
    freshnessState: "fresh",
  }), false);
});
