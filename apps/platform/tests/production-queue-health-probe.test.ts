import assert from "node:assert/strict";
import test from "node:test";
import {
  enqueueProductionQueueHealthProbe,
  handleProductionQueueHealthProbeBatch,
  isProductionQueueHealthProbeQueue,
  productionQueueHealthProbeEnabled,
  productionQueueHealthProbeKey,
  PRODUCTION_QUEUE_HEALTH_PROBE_QUEUE_NAME,
} from "../worker/production-queue-health-probe";
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
    id: "production-queue-health-message",
    timestamp: new Date("2026-08-21T09:00:01.000Z"),
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
      queue: PRODUCTION_QUEUE_HEALTH_PROBE_QUEUE_NAME,
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
    WHERE environment='production' AND dependency_key='queues'
    ORDER BY checked_at DESC,id DESC
    LIMIT 1
  `).first<{ state: string; safeErrorCode: string | null; evidenceKind: string }>();
}

test("the production Queue probe is impossible outside explicitly enabled production", () => {
  assert.equal(productionQueueHealthProbeEnabled({ APP_ENV: "development", PRODUCTION_QUEUE_HEALTH_PROBE_ENABLED: "true" }), false);
  assert.equal(productionQueueHealthProbeEnabled({ APP_ENV: "staging", PRODUCTION_QUEUE_HEALTH_PROBE_ENABLED: "true" }), false);
  assert.equal(productionQueueHealthProbeEnabled({ APP_ENV: "production", PRODUCTION_QUEUE_HEALTH_PROBE_ENABLED: "false" }), false);
  assert.equal(productionQueueHealthProbeEnabled({ APP_ENV: "production", PRODUCTION_QUEUE_HEALTH_PROBE_ENABLED: "true" }), true);
  assert.equal(isProductionQueueHealthProbeQueue("staging-queue-health", { APP_ENV: "staging" }), false);
  assert.equal(isProductionQueueHealthProbeQueue(PRODUCTION_QUEUE_HEALTH_PROBE_QUEUE_NAME, { APP_ENV: "production" }), true);
});

test("the production producer is opaque and cannot publish green evidence", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const sends: ProbeBody[] = [];
    const env = {
      APP_ENV: "production",
      PRODUCTION_QUEUE_HEALTH_PROBE_ENABLED: "true",
      PRODUCTION_QUEUE_HEALTH_PROBE_QUEUE: probeQueue(sends),
      DB: d1,
    };
    const at = new Date("2026-08-21T09:00:00.000Z");
    assert.match(productionQueueHealthProbeKey(at), /^production-queue-health-v1-\d{7,16}$/u);
    assert.deepEqual(await enqueueProductionQueueHealthProbe(env, { now: at }), {
      enqueued: 1,
      stale: 0,
      failed: 0,
      skipped: 0,
    });
    assert.deepEqual(await enqueueProductionQueueHealthProbe(env, { now: new Date("2026-08-21T09:04:59.999Z") }), {
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
  } finally {
    sqlite.close();
  }
});

test("only the production Queue consumer publishes operational evidence once", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const sends: ProbeBody[] = [];
    const env = {
      APP_ENV: "production",
      PRODUCTION_QUEUE_HEALTH_PROBE_ENABLED: "true",
      PRODUCTION_QUEUE_HEALTH_PROBE_QUEUE: probeQueue(sends),
      DB: d1,
    };
    await enqueueProductionQueueHealthProbe(env, { now: new Date("2026-08-21T09:00:00.000Z") });
    const first = probeBatch(sends[0]);
    await handleProductionQueueHealthProbeBatch(first.batch, env, {
      now: new Date("2026-08-21T09:00:02.000Z"),
    });
    assert.deepEqual(first.state, { acknowledgements: 1, retries: [] });
    assert.deepEqual({ ...(await latestQueueHealth(d1)) }, {
      state: "operational",
      safeErrorCode: null,
      evidenceKind: "synthetic_probe",
    });

    const duplicate = probeBatch(sends[0]);
    await handleProductionQueueHealthProbeBatch(duplicate.batch, env);
    assert.deepEqual(duplicate.state, { acknowledgements: 1, retries: [] });
    assert.equal(
      (sqlite.prepare(`
        SELECT COUNT(*) AS count FROM dependency_health_checks
        WHERE environment='production' AND dependency_key='queues'
      `).get() as { count: number }).count,
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("an unconsumed production probe becomes degraded after its timeout", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const sends: ProbeBody[] = [];
    const env = {
      APP_ENV: "production",
      PRODUCTION_QUEUE_HEALTH_PROBE_ENABLED: "true",
      PRODUCTION_QUEUE_HEALTH_PROBE_QUEUE: probeQueue(sends),
      DB: d1,
    };
    await enqueueProductionQueueHealthProbe(env, { now: new Date("2026-08-21T09:00:00.000Z") });
    const result = await enqueueProductionQueueHealthProbe(env, { now: new Date("2026-08-21T09:10:00.000Z") });
    assert.deepEqual(result, { enqueued: 1, stale: 1, failed: 0, skipped: 0 });
    assert.deepEqual({ ...(await latestQueueHealth(d1)) }, {
      state: "degraded",
      safeErrorCode: "QUEUE_PROBE_NOT_CONSUMED",
      evidenceKind: "synthetic_probe",
    });
  } finally {
    sqlite.close();
  }
});

test("invalid production probe messages are acknowledged as degraded", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const delivery = probeBatch({ schemaVersion: 1, unexpected: "not-a-probe" });
    await handleProductionQueueHealthProbeBatch(delivery.batch, {
      APP_ENV: "production",
      PRODUCTION_QUEUE_HEALTH_PROBE_ENABLED: "true",
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

test("a disabled production probe drains old messages without fresh evidence", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  try {
    const delivery = probeBatch({ schemaVersion: 1, unexpected: "leftover" });
    await handleProductionQueueHealthProbeBatch(delivery.batch, {
      APP_ENV: "production",
      PRODUCTION_QUEUE_HEALTH_PROBE_ENABLED: "false",
      DB: d1,
    });
    assert.deepEqual(delivery.state, { acknowledgements: 1, retries: [] });
    assert.equal(await latestQueueHealth(d1), null);
  } finally {
    sqlite.close();
  }
});
