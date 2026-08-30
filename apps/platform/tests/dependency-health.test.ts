import assert from "node:assert/strict";
import test from "node:test";
import {
  dependencyHealthKeys,
  deriveComponentHealth,
  readDependencyHealth,
  recordDependencyHealth,
  recordDependencyHealthSchema,
} from "../lib/operations/dependency-health";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

const now = new Date("2026-08-12T05:00:00.000Z");

async function recordAllOperational(db: D1Database): Promise<void> {
  await Promise.all(dependencyHealthKeys.map((key) => recordDependencyHealth({
    db,
    now,
    value: {
      environment: "staging",
      key,
      state: "operational",
      latencyMs: 25,
      evidenceKind: "synthetic_probe",
    },
  })));
}

test("0112 records only safe evidence and derives conservative component health", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    assert.equal(recordDependencyHealthSchema.safeParse({
      environment: "staging",
      key: "unapproved_dependency",
      state: "operational",
      evidenceKind: "probe",
    }).success, false);
    assert.equal(recordDependencyHealthSchema.safeParse({
      environment: "staging",
      key: "openai",
      state: "operational",
      safeErrorCode: "PROVIDER_TIMEOUT",
      evidenceKind: "probe",
    }).success, false);
    assert.equal(recordDependencyHealthSchema.safeParse({
      environment: "staging",
      key: "openai",
      state: "outage",
      safeErrorCode: "RAW_PROVIDER_MESSAGE",
      evidenceKind: "probe",
    }).success, false);
    assert.equal(recordDependencyHealthSchema.safeParse({
      environment: "staging",
      key: "anthropic",
      state: "degraded",
      safeErrorCode: "PROVIDER_CREDIT_BALANCE_LOW",
      evidenceKind: "synthetic_probe",
    }).success, true);
    const initial = await readDependencyHealth({ db: d1, environment: "staging", now });
    assert.equal(initial.length, dependencyHealthKeys.length);
    assert.ok(initial.every((entry) => entry.state === "unknown" && entry.checkedAt === null));

    await recordAllOperational(d1);
    const operational = await readDependencyHealth({ db: d1, environment: "staging", now });
    assert.ok(operational.every((entry) => entry.state === "operational"));
    assert.ok(deriveComponentHealth(operational).every((component) => component.status === "operational"));

    await recordDependencyHealth({
      db: d1,
      now: new Date("2026-08-12T05:01:00.000Z"),
      value: {
        environment: "staging",
        key: "malware_scanner",
        state: "degraded",
        latencyMs: 1_200,
        safeErrorCode: "SCANNER_TIMEOUT",
        evidenceKind: "probe",
      },
    });
    const degraded = deriveComponentHealth(await readDependencyHealth({
      db: d1,
      environment: "staging",
      now: new Date("2026-08-12T05:01:00.000Z"),
    }));
    assert.equal(degraded.find((component) => component.key === "upload")?.status, "degraded");
    assert.equal(degraded.find((component) => component.key === "document_analysis")?.status, "degraded");

    assert.throws(
      () => sqlite.prepare("UPDATE dependency_health_checks SET state='operational' WHERE dependency_key='malware_scanner'").run(),
      /DEPENDENCY_HEALTH_CHECK_IMMUTABLE/,
    );
    assert.throws(
      () => sqlite.prepare("DELETE FROM dependency_health_checks WHERE dependency_key='malware_scanner'").run(),
      /DEPENDENCY_HEALTH_CHECK_APPEND_ONLY/,
    );
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { sqlite.close(); }
});

test("0112 marks old green evidence stale without erasing the last success", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    await recordDependencyHealth({
      db: d1,
      now,
      value: {
        environment: "production",
        key: "d1",
        state: "operational",
        latencyMs: 4,
        evidenceKind: "probe",
      },
    });
    const health = await readDependencyHealth({
      db: d1,
      environment: "production",
      now: new Date("2026-08-12T05:11:00.000Z"),
    });
    const d1Health = health.find((entry) => entry.key === "d1");
    assert.equal(d1Health?.state, "stale");
    assert.equal(d1Health?.recordedState, "operational");
    assert.equal(d1Health?.lastSuccessfulAt, now.toISOString());
    assert.equal(d1Health?.safeErrorCode, null);
  } finally { sqlite.close(); }
});

test("document analysis health follows its routed feature probe instead of one named provider", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    await recordAllOperational(d1);
    await recordDependencyHealth({
      db: d1,
      now: new Date("2026-08-12T05:01:00.000Z"),
      value: {
        environment: "staging",
        key: "anthropic",
        state: "degraded",
        latencyMs: 25,
        safeErrorCode: "PROVIDER_UNAVAILABLE",
        evidenceKind: "synthetic_probe",
      },
    });
    const components = deriveComponentHealth(await readDependencyHealth({
      db: d1,
      environment: "staging",
      now: new Date("2026-08-12T05:01:00.000Z"),
    }));
    assert.equal(components.find((component) => component.key === "ai")?.status, "degraded");
    assert.equal(components.find((component) => component.key === "document_analysis")?.status, "operational");
  } finally {
    sqlite.close();
  }
});

test("0112 gives missing mandatory evidence precedence over stale evidence, but not a hard failure", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    await recordDependencyHealth({
      db: d1,
      now: new Date("2026-08-12T04:49:00.000Z"),
      value: {
        environment: "staging",
        key: "d1",
        state: "operational",
        latencyMs: 5,
        evidenceKind: "probe",
      },
    });
    const withStaleD1 = await readDependencyHealth({
      db: d1,
      environment: "staging",
      now,
    });
    assert.equal(withStaleD1.find((entry) => entry.key === "d1")?.state, "stale");
    assert.equal(
      deriveComponentHealth(withStaleD1).find((component) => component.key === "platform")?.status,
      "unknown",
      "missing queue and DLQ evidence must not be masked by stale D1 evidence",
    );

    await recordDependencyHealth({
      db: d1,
      now,
      value: {
        environment: "staging",
        key: "d1",
        state: "degraded",
        latencyMs: 10,
        safeErrorCode: "DEPENDENCY_UNAVAILABLE",
        evidenceKind: "probe",
      },
    });
    const withFailure = await readDependencyHealth({ db: d1, environment: "staging", now });
    assert.equal(
      deriveComponentHealth(withFailure).find((component) => component.key === "platform")?.status,
      "degraded",
      "an explicit failure remains higher priority than missing evidence",
    );
  } finally { sqlite.close(); }
});

test("0112 never ages an explicit unknown observation into stale", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    await recordDependencyHealth({
      db: d1,
      now: new Date("2026-08-12T04:00:00.000Z"),
      value: {
        environment: "staging",
        key: "resend",
        state: "unknown",
        latencyMs: null,
        evidenceKind: "manual_verification",
      },
    });
    const health = await readDependencyHealth({ db: d1, environment: "staging", now });
    assert.equal(health.find((entry) => entry.key === "resend")?.state, "unknown");
  } finally { sqlite.close(); }
});
