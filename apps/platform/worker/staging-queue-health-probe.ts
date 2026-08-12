import { z } from "zod";
import { recordDependencyHealthEvidence } from "./dependency-health-evidence";

/**
 * The probe deliberately has its own staging-only queue. It must never share
 * a user-work queue (especially cleanup, document, or notification work), so
 * the only body it can receive is a short-lived opaque technical identifier.
 */
export const STAGING_QUEUE_HEALTH_PROBE_QUEUE_NAME = "staging-queue-health";
export const STAGING_QUEUE_HEALTH_PROBE_INTERVAL_MS = 15 * 60_000;
export const STAGING_QUEUE_HEALTH_PROBE_CONSUMPTION_TIMEOUT_MS = 15 * 60_000;

const probeScheduleName = "staging-queue-health-probe";
const probeHolderId = "staging-queue-health-probe";
const probeKeyPrefix = "staging-queue-health-v1";
const queueRetryDelaySeconds = 30;

const probeMessageSchema = z.object({
  schemaVersion: z.literal(1),
  probeId: z.string().uuid(),
  probeKey: z.string().regex(/^staging-queue-health-v1-\d{7,16}$/u),
  enqueuedAt: z.iso.datetime({ offset: true }),
}).strict();

type StagingQueueHealthProbeMessage = z.infer<typeof probeMessageSchema>;

type ProbeRow = {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt: string;
};

export type StagingQueueHealthProbeEnv = {
  APP_ENV: string;
  DB: D1Database;
  STAGING_QUEUE_HEALTH_PROBE_ENABLED?: string;
  STAGING_QUEUE_HEALTH_PROBE_QUEUE?: Queue<unknown>;
};

export type StagingQueueHealthProbeSummary = {
  enqueued: number;
  stale: number;
  failed: number;
  skipped: number;
};

export type StagingQueueHealthProbeOptions = {
  /** Only used by deterministic tests; scheduled code intentionally omits it. */
  now?: Date;
};

function timestampBucket(now: Date): number {
  return Math.floor(now.getTime() / STAGING_QUEUE_HEALTH_PROBE_INTERVAL_MS);
}

function bucketStart(now: Date): Date {
  return new Date(timestampBucket(now) * STAGING_QUEUE_HEALTH_PROBE_INTERVAL_MS);
}

export function stagingQueueHealthProbeKey(now = new Date()): string {
  return `${probeKeyPrefix}-${timestampBucket(now)}`;
}

export function stagingQueueHealthProbeEnabled(
  env: Pick<StagingQueueHealthProbeEnv, "APP_ENV" | "STAGING_QUEUE_HEALTH_PROBE_ENABLED">,
): boolean {
  return env.APP_ENV === "staging"
    && env.STAGING_QUEUE_HEALTH_PROBE_ENABLED === "true";
}

export function isStagingQueueHealthProbeQueue(
  queueName: string,
  env: Pick<StagingQueueHealthProbeEnv, "APP_ENV">,
): boolean {
  return env.APP_ENV === "staging" && queueName === STAGING_QUEUE_HEALTH_PROBE_QUEUE_NAME;
}

function probeSummary(input: Partial<StagingQueueHealthProbeSummary> = {}): StagingQueueHealthProbeSummary {
  return {
    enqueued: input.enqueued ?? 0,
    stale: input.stale ?? 0,
    failed: input.failed ?? 0,
    skipped: input.skipped ?? 0,
  };
}

async function recordProbeFailure(
  env: Pick<StagingQueueHealthProbeEnv, "APP_ENV" | "DB">,
  input: {
    safeErrorCode: "DEPENDENCY_UNAVAILABLE" | "QUEUE_PROBE_NOT_CONSUMED" | "QUEUE_PROBE_INVALID_MESSAGE";
    startedAt: number;
  },
): Promise<void> {
  await recordDependencyHealthEvidence(env, {
    key: "queues",
    state: "degraded",
    safeErrorCode: input.safeErrorCode,
    evidenceKind: "synthetic_probe",
    startedAt: input.startedAt,
  });
}

/**
 * Flags a probe whose producer-side durable claim was made but whose message
 * was not consumed within one full probe window. The next window may try a
 * fresh, independently idempotent message; an old row is never reused.
 */
async function failStaleProbeClaims(
  env: Pick<StagingQueueHealthProbeEnv, "APP_ENV" | "DB">,
  now: Date,
): Promise<number> {
  const cutoff = new Date(
    now.getTime() - STAGING_QUEUE_HEALTH_PROBE_CONSUMPTION_TIMEOUT_MS,
  ).toISOString();
  const result = await env.DB.prepare(`
    UPDATE scheduled_runs
    SET status='failed',error_code='QUEUE_PROBE_NOT_CONSUMED',
        finished_at=?,updated_at=?
    WHERE schedule_name=?
      AND status='running'
      AND started_at<=?
  `).bind(
    now.toISOString(),
    now.toISOString(),
    probeScheduleName,
    cutoff,
  ).run();
  const stale = Number(result.meta.changes ?? 0);
  if (stale > 0) {
    await recordProbeFailure(env, {
      safeErrorCode: "QUEUE_PROBE_NOT_CONSUMED",
      startedAt: now.getTime(),
    });
  }
  return stale;
}

/**
 * Enqueues at most one content-free message per 15-minute staging window.
 * There is deliberately no producer-side green status: only the separate
 * Queue consumer may publish operational evidence after it handles the
 * matching durable claim.
 */
export async function enqueueStagingQueueHealthProbe(
  env: StagingQueueHealthProbeEnv,
  options: StagingQueueHealthProbeOptions = {},
): Promise<StagingQueueHealthProbeSummary> {
  if (!stagingQueueHealthProbeEnabled(env)) return probeSummary({ skipped: 1 });

  const now = options.now ?? new Date();
  let stale = 0;
  try {
    stale = await failStaleProbeClaims(env, now);
  } catch {
    // The scheduler's normal D1 observation will keep platform status out of
    // false green if this cannot be persisted. Avoid turning an optional,
    // staging-only probe write into a user-work failure.
    console.error(JSON.stringify({
      event: "staging.queue_health_probe_stale_reconciliation_failed",
      environment: env.APP_ENV,
    }));
    return probeSummary({ failed: 1 });
  }

  const queue = env.STAGING_QUEUE_HEALTH_PROBE_QUEUE;
  if (!queue) {
    await recordProbeFailure(env, {
      safeErrorCode: "DEPENDENCY_UNAVAILABLE",
      startedAt: now.getTime(),
    });
    return probeSummary({ stale, failed: 1 });
  }

  const startedAt = now.toISOString();
  const id = crypto.randomUUID();
  const probeKey = stagingQueueHealthProbeKey(now);
  const inserted = await env.DB.prepare(`
    INSERT INTO scheduled_runs (
      id,schedule_name,cron,scheduled_for,idempotency_key,holder_id,
      status,error_code,started_at,finished_at,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,'pending',NULL,?,NULL,?,?)
    ON CONFLICT(idempotency_key) DO NOTHING
  `).bind(
    id,
    probeScheduleName,
    "*/15 * * * *",
    bucketStart(now).toISOString(),
    `${probeScheduleName}:${probeKey}`,
    probeHolderId,
    startedAt,
    startedAt,
    startedAt,
  ).run();
  if (Number(inserted.meta.changes ?? 0) !== 1) {
    return probeSummary({ stale, skipped: 1 });
  }

  const claimed = await env.DB.prepare(`
    UPDATE scheduled_runs
    SET status='running',updated_at=?
    WHERE id=? AND schedule_name=? AND status='pending'
  `).bind(now.toISOString(), id, probeScheduleName).run();
  if (Number(claimed.meta.changes ?? 0) !== 1) {
    await recordProbeFailure(env, {
      safeErrorCode: "DEPENDENCY_UNAVAILABLE",
      startedAt: now.getTime(),
    });
    return probeSummary({ stale, failed: 1 });
  }

  const message: StagingQueueHealthProbeMessage = {
    schemaVersion: 1,
    probeId: id,
    probeKey,
    enqueuedAt: startedAt,
  };
  try {
    await queue.send(message);
  } catch {
    await env.DB.prepare(`
      UPDATE scheduled_runs
      SET status='failed',error_code='DEPENDENCY_UNAVAILABLE',
          finished_at=?,updated_at=?
      WHERE id=? AND schedule_name=? AND status='running'
    `).bind(now.toISOString(), now.toISOString(), id, probeScheduleName).run();
    await recordProbeFailure(env, {
      safeErrorCode: "DEPENDENCY_UNAVAILABLE",
      startedAt: now.getTime(),
    });
    return probeSummary({ stale, failed: 1 });
  }
  return probeSummary({ stale, enqueued: 1 });
}

async function currentProbeRow(
  env: Pick<StagingQueueHealthProbeEnv, "DB">,
  message: StagingQueueHealthProbeMessage,
): Promise<ProbeRow | null> {
  return env.DB.prepare(`
    SELECT id,status,started_at AS startedAt
    FROM scheduled_runs
    WHERE id=?
      AND schedule_name=?
      AND idempotency_key=?
    LIMIT 1
  `).bind(
    message.probeId,
    probeScheduleName,
    `${probeScheduleName}:${message.probeKey}`,
  ).first<ProbeRow>();
}

async function consumeProbeMessage(
  env: Pick<StagingQueueHealthProbeEnv, "APP_ENV" | "DB">,
  message: Message<unknown>,
): Promise<"ack" | "retry"> {
  const parsed = probeMessageSchema.safeParse(message.body);
  if (!parsed.success) {
    await recordProbeFailure(env, {
      safeErrorCode: "QUEUE_PROBE_INVALID_MESSAGE",
      startedAt: Date.now(),
    });
    return "ack";
  }

  try {
    const row = await currentProbeRow(env, parsed.data);
    if (!row) {
      await recordProbeFailure(env, {
        safeErrorCode: "QUEUE_PROBE_INVALID_MESSAGE",
        startedAt: Date.now(),
      });
      return "ack";
    }
    if (row.status === "completed") return "ack";
    if (row.status !== "running") {
      await recordProbeFailure(env, {
        safeErrorCode: "QUEUE_PROBE_INVALID_MESSAGE",
        startedAt: Date.now(),
      });
      return "ack";
    }

    const now = new Date();
    const completed = await env.DB.prepare(`
      UPDATE scheduled_runs
      SET status='completed',error_code=NULL,finished_at=?,updated_at=?
      WHERE id=? AND schedule_name=? AND status='running'
    `).bind(
      now.toISOString(),
      now.toISOString(),
      parsed.data.probeId,
      probeScheduleName,
    ).run();
    if (Number(completed.meta.changes ?? 0) !== 1) {
      // A concurrent delivery may already have completed the immutable window;
      // it is a harmless at-least-once duplicate and must not create new green
      // evidence.
      return "ack";
    }

    const startedAt = Date.parse(row.startedAt);
    await recordDependencyHealthEvidence(env, {
      key: "queues",
      state: "operational",
      evidenceKind: "synthetic_probe",
      startedAt: Number.isFinite(startedAt) ? startedAt : now.getTime(),
      minimumOperationalIntervalMs: STAGING_QUEUE_HEALTH_PROBE_INTERVAL_MS,
    }, now);
    return "ack";
  } catch {
    // Do not acknowledge an unobservable consumption. The queue's bounded
    // retry policy is the recovery path; after the probe window the producer
    // records a truthful degraded observation rather than pretending success.
    return "retry";
  }
}

/**
 * Handles only the dedicated staging probe queue. It does not delegate to the
 * platform job consumer and cannot execute a user job, publish an outbox row,
 * or access a document/workspace payload.
 */
export async function handleStagingQueueHealthProbeBatch(
  batch: MessageBatch<unknown>,
  env: Pick<StagingQueueHealthProbeEnv, "APP_ENV" | "DB" | "STAGING_QUEUE_HEALTH_PROBE_ENABLED">,
): Promise<void> {
  if (!isStagingQueueHealthProbeQueue(batch.queue, env)) {
    throw new TypeError("STAGING_QUEUE_HEALTH_PROBE_QUEUE_MISMATCH");
  }
  if (!stagingQueueHealthProbeEnabled(env)) {
    // A disabled staging probe must not turn an older queued message into a
    // fresh health observation. Acknowledging it makes the durable running
    // claim age into a visible degraded outcome on the next reconciliation.
    for (const message of batch.messages) message.ack();
    return;
  }
  for (const message of batch.messages) {
    const outcome = await consumeProbeMessage(env, message);
    if (outcome === "retry") message.retry({ delaySeconds: queueRetryDelaySeconds });
    else message.ack();
  }
}
