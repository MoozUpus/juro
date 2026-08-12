import assert from "node:assert/strict";
import test from "node:test";
import { readDependencyHealth } from "../lib/operations/dependency-health";
import {
  dependencyHealthLatencyMs,
  providerFailureEvidence,
  recordDependencyHealthEvidence,
} from "../worker/dependency-health-evidence";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

test("dependency evidence records bounded, safe operational and failure outcomes", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const now = new Date("2026-08-12T06:00:00.000Z");
    const env = { APP_ENV: "staging", DB: d1 };
    assert.equal(await recordDependencyHealthEvidence(env, {
      key: "openai",
      state: "operational",
      evidenceKind: "synthetic_probe",
      startedAt: now.getTime() - 42,
      minimumOperationalIntervalMs: 15 * 60_000,
    }, now), true);
    assert.equal(await recordDependencyHealthEvidence(env, {
      key: "openai",
      state: "operational",
      evidenceKind: "synthetic_probe",
      startedAt: now.getTime() - 84,
      minimumOperationalIntervalMs: 15 * 60_000,
    }, new Date("2026-08-12T06:01:00.000Z")), false);

    const failure = providerFailureEvidence("openai", "PROBE_OPENAI_TIMEOUT");
    assert.equal(await recordDependencyHealthEvidence(env, {
      ...failure,
      evidenceKind: "synthetic_probe",
      startedAt: new Date("2026-08-12T06:01:00.000Z").getTime() - 120,
    }, new Date("2026-08-12T06:01:00.000Z")), true);

    const health = await readDependencyHealth({
      db: d1,
      environment: "staging",
      now: new Date("2026-08-12T06:01:00.000Z"),
    });
    const openai = health.find((entry) => entry.key === "openai");
    assert.equal(openai?.state, "degraded");
    assert.equal(openai?.safeErrorCode, "PROVIDER_TIMEOUT");
    assert.equal(openai?.latencyMs, 120);
    const countRow = sqlite.prepare(
      "SELECT count(*) AS count FROM dependency_health_checks WHERE dependency_key='openai'",
    ).get() as { count: number };
    assert.equal(countRow.count, 2);
  } finally {
    sqlite.close();
  }
});

test("dependency evidence classifies provider configuration/auth failures without raw values", () => {
  assert.deepEqual(providerFailureEvidence("anthropic", "STAGING_AI_CHAT_OPENAI_NOT_CONFIGURED"), {
    key: "anthropic",
    state: "outage",
    safeErrorCode: "PROBE_CONFIGURATION_ERROR",
  });
  assert.deepEqual(providerFailureEvidence("openai", "PROBE_OPENAI_HTTP_401"), {
    key: "openai",
    state: "outage",
    safeErrorCode: "PROBE_AUTH_ERROR",
  });
  assert.equal(dependencyHealthLatencyMs(0, 120_000), 60_000);
});
