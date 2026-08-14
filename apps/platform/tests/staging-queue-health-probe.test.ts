import assert from "node:assert/strict";
import test from "node:test";
import {
  enqueueStagingQueueHealthProbe,
  handleStagingQueueHealthProbeBatch,
  isStagingQueueHealthProbeQueue,
  stagingQueueHealthProbeEnabled,
  stagingQueueHealthProbeKey,
  STAGING_QUEUE_HEALTH_PROBE_QUEUE_NAME,
} from "../worker/staging-queue-health-probe";
import { readDependencyHealth } from "../lib/operations/dependency-health";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

type ProbeBody = Record<string, unknown>;

function probeQueue(sends: ProbeBody[]): Queue<unknown> {
  return {
    async send(body: unknown) {
      sends.push(body as ProbeBody);
      return {
        metadata: { metrics: { backlogCount: 1, backlogBytes: 0 } },
      };
    },
  } as Queue<unknown>;
}

function probeBatch(body: unknown): {
  batch: MessageBatch<unknown>;
  state: { acknowledgements: number; retries: number[] };
} {
  const state = { acknowledgements: 0, retries: [] as number[] };
  const message = {
    id: "staging-queue-health-message",
    timestamp: new Date("2026-08-12T09:00:01.000Z"),
    body,
    attempts: 1,
    ack() {
      state.acknowledgements += 1;
    },
    retry(input?: QueueRetryOptions) {
      state.retries.push(input?.delaySeconds ?? 0);
    },
  } as Message<unknown>;
  return {
    batch: {
      queue: STAGING_QUEUE_HEALTH_PROBE_QUEUE_NAME,
      messages: [message],
      metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } },
      ackAll() {},
      retryAll() {},
    } as MessageBatch<unknown>,
    state,
  };
}

async function latestQueueHealth(db: D1Database) {
  return db.prepare(`
    SELECT state,safe_error_code AS safeErrorCode,evidence_kind AS evidenceKind
    FROM dependency_health_checks
    WHERE environment='staging' AND dependency_key='queues'
    ORDER BY checked_at DESC,id DESC
    LIMIT 1
  `).first<{ state: string; safeErrorCode: string | null; evidenceKind: string }>();
}

test("the Queue round-trip probe is impossible outside explicitly enabled staging", () => {
  assert.equal(stagingQueueHealthProbeEnabled({ APP_ENV: "development", STAGING_QUEUE_HEALTH_PROBE_ENABLED: "true" }), false);
  assert.equal(stagingQueueHealthProbeEnabled({ APP_ENV: "production", STAGING_QUEUE_HEALTH_PROBE_ENABLED: "true" }), false);
  assert.equal(stagingQueueHealthProbeEnabled({ APP_ENV: "staging", STAGING_QUEUE_HEALTH_PROBE_ENABLED: "false" }), false);
  assert.equal(stagingQueueHealthProbeEnabled({ APP_ENV: "staging", STAGING_QUEUE_HEALTH_PROBE_ENABLED: "true" }), true);
  assert.equal(isStagingQueueHealthProbeQueue("production-queue-health", { APP_ENV: "production" }), false);
  assert.equal(isStagingQueueHealthProbeQueue(STAGING_QUEUE_HEALTH_PROBE_QUEUE_NAME, { APP_ENV: "staging" }), true);
});

test("the producer uses one opaque, idempotent staging message and does not write green health", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const sends: ProbeBody[] = [];
    const env = {
      APP_ENV: "staging",
      STAGING_QUEUE_HEALTH_PROBE_ENABLED: "true",
      STAGING_QUEUE_HEALTH_PROBE_QUEUE: probeQueue(sends),
      DB: d1,
    };
    const at = new Date("2026-08-12T09:00:00.000Z");
    assert.equal(stagingQueueHealthProbeKey(at), "staging-queue-health-v1-1985028");
    assert.deepEqual(await enqueueStagingQueueHealthProbe(env, { now: at }), {
      enqueued: 1,
      stale: 0,
      failed: 0,
      skipped: 0,
    });
    assert.deepEqual(await enqueueStagingQueueHealthProbe(env, { now: new Date("2026-08-12T09:14:59.999Z") }), {
      enqueued: 0,
      stale: 0,
      failed: 0,
      skipped: 1,
    });
    assert.equal(sends.length, 1);
    assert.deepEqual(Object.keys(sends[0] ?? {}).sort(), [
      "enqueuedAt",
      "probeId",
      "probeKey",
      "schemaVersion",
    ]);
    assert.doesNotMatch(JSON.stringify(sends[0]), /workspace|document|user|email|content|secret/i);
    assert.equal(await latestQueueHealth(d1), null);
    assert.deepEqual(
      sqlite.prepare(`
        SELECT schedule_name AS scheduleName,status,error_code AS errorCode
        FROM scheduled_runs WHERE schedule_name='staging-queue-health-probe'
      `).all().map((row) => ({ ...(row as object) })),
      [{ scheduleName: "staging-queue-health-probe", status: "running", errorCode: null }],
    );
  } finally {
    sqlite.close();
  }
});

test("only the actual dedicated Queue consumer publishes operational queues evidence", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const sends: ProbeBody[] = [];
    const env = {
      APP_ENV: "staging",
      STAGING_QUEUE_HEALTH_PROBE_ENABLED: "true",
      STAGING_QUEUE_HEALTH_PROBE_QUEUE: probeQueue(sends),
      DB: d1,
    };
    await enqueueStagingQueueHealthProbe(env, { now: new Date("2026-08-12T09:00:00.000Z") });
    const delivery = probeBatch(sends[0]);
    await handleStagingQueueHealthProbeBatch(delivery.batch, {
      APP_ENV: "staging",
      STAGING_QUEUE_HEALTH_PROBE_ENABLED: "true",
      DB: d1,
    });
    assert.deepEqual(delivery.state, { acknowledgements: 1, retries: [] });
    assert.deepEqual({ ...(await latestQueueHealth(d1)) }, {
      state: "operational",
      safeErrorCode: null,
      evidenceKind: "synthetic_probe",
    });
    assert.equal(
      (sqlite.prepare(`
        SELECT status FROM scheduled_runs
        WHERE schedule_name='staging-queue-health-probe'
      `).get() as { status: string }).status,
      "completed",
    );

    const duplicate = probeBatch(sends[0]);
    await handleStagingQueueHealthProbeBatch(duplicate.batch, {
      APP_ENV: "staging",
      STAGING_QUEUE_HEALTH_PROBE_ENABLED: "true",
      DB: d1,
    });
    assert.deepEqual(duplicate.state, { acknowledgements: 1, retries: [] });
    assert.equal(
      (sqlite.prepare(`
        SELECT COUNT(*) AS count FROM dependency_health_checks
        WHERE environment='staging' AND dependency_key='queues'
      `).get() as { count: number }).count,
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("a completed probe just before the nominal 15-minute boundary still refreshes Queue evidence", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const sends: ProbeBody[] = [];
    const env = {
      APP_ENV: "staging",
      STAGING_QUEUE_HEALTH_PROBE_ENABLED: "true",
      STAGING_QUEUE_HEALTH_PROBE_QUEUE: probeQueue(sends),
      DB: d1,
    };
    await enqueueStagingQueueHealthProbe(env, { now: new Date("2026-08-12T09:00:00.000Z") });
    await handleStagingQueueHealthProbeBatch(probeBatch(sends[0]).batch, {
      APP_ENV: "staging",
      STAGING_QUEUE_HEALTH_PROBE_ENABLED: "true",
      DB: d1,
    }, { now: new Date("2026-08-12T09:00:03.000Z") });

    await enqueueStagingQueueHealthProbe(env, { now: new Date("2026-08-12T09:15:00.000Z") });
    await handleStagingQueueHealthProbeBatch(probeBatch(sends[1]).batch, {
      APP_ENV: "staging",
      STAGING_QUEUE_HEALTH_PROBE_ENABLED: "true",
      DB: d1,
    }, { now: new Date("2026-08-12T09:15:02.000Z") });

    assert.equal(
      (sqlite.prepare(`
        SELECT COUNT(*) AS count FROM dependency_health_checks
        WHERE environment='staging' AND dependency_key='queues' AND state='operational'
      `).get() as { count: number }).count,
      2,
    );
    const health = await readDependencyHealth({
      db: d1,
      environment: "staging",
      now: new Date("2026-08-12T09:15:03.000Z"),
    });
    assert.equal(health.find((entry) => entry.key === "queues")?.state, "operational");
  } finally {
    sqlite.close();
  }
});

test("an unconsumed probe turns degraded instead of becoming a producer-side false green", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const sends: ProbeBody[] = [];
    const env = {
      APP_ENV: "staging",
      STAGING_QUEUE_HEALTH_PROBE_ENABLED: "true",
      STAGING_QUEUE_HEALTH_PROBE_QUEUE: probeQueue(sends),
      DB: d1,
    };
    await enqueueStagingQueueHealthProbe(env, { now: new Date("2026-08-12T09:00:00.000Z") });
    const result = await enqueueStagingQueueHealthProbe(env, { now: new Date("2026-08-12T09:15:00.000Z") });
    assert.deepEqual(result, { enqueued: 1, stale: 1, failed: 0, skipped: 0 });
    assert.deepEqual({ ...(await latestQueueHealth(d1)) }, {
      state: "degraded",
      safeErrorCode: "QUEUE_PROBE_NOT_CONSUMED",
      evidenceKind: "synthetic_probe",
    });
    assert.equal(
      (sqlite.prepare(`
        SELECT status FROM scheduled_runs
        WHERE schedule_name='staging-queue-health-probe'
        ORDER BY scheduled_for ASC LIMIT 1
      `).get() as { status: string }).status,
      "failed",
    );
    assert.equal(sends.length, 2);
  } finally {
    sqlite.close();
  }
});

test("an invalid probe message is acknowledged as degraded and never treated as a Queue success", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const delivery = probeBatch({ schemaVersion: 1, unexpected: "not-a-probe" });
    await handleStagingQueueHealthProbeBatch(delivery.batch, {
      APP_ENV: "staging",
      STAGING_QUEUE_HEALTH_PROBE_ENABLED: "true",
      DB: d1,
    });
    assert.deepEqual(delivery.state, { acknowledgements: 1, retries: [] });
    assert.deepEqual({ ...(await latestQueueHealth(d1)) }, {
      state: "degraded",
      safeErrorCode: "QUEUE_PROBE_INVALID_MESSAGE",
      evidenceKind: "synthetic_probe",
    });
  } finally {
    sqlite.close();
  }
});

test("a disabled staging probe acknowledges a leftover message without publishing green evidence", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const sends: ProbeBody[] = [];
    const enabledEnv = {
      APP_ENV: "staging",
      STAGING_QUEUE_HEALTH_PROBE_ENABLED: "true",
      STAGING_QUEUE_HEALTH_PROBE_QUEUE: probeQueue(sends),
      DB: d1,
    };
    await enqueueStagingQueueHealthProbe(enabledEnv, { now: new Date("2026-08-12T09:00:00.000Z") });
    const delivery = probeBatch(sends[0]);
    await handleStagingQueueHealthProbeBatch(delivery.batch, {
      APP_ENV: "staging",
      STAGING_QUEUE_HEALTH_PROBE_ENABLED: "false",
      DB: d1,
    });
    assert.deepEqual(delivery.state, { acknowledgements: 1, retries: [] });
    assert.equal(await latestQueueHealth(d1), null);
    assert.equal(
      (sqlite.prepare(`
        SELECT status FROM scheduled_runs
        WHERE schedule_name='staging-queue-health-probe'
      `).get() as { status: string }).status,
      "running",
    );
  } finally {
    sqlite.close();
  }
});
