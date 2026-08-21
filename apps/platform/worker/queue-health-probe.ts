import { z } from "zod";
import { recordDependencyHealthEvidence } from "./dependency-health-evidence";

const queueHealthProbeMessageSchema = z.object({
  schemaVersion: z.literal(1),
  probeId: z.string().uuid(),
  probeKey: z.string().min(12).max(96),
  enqueuedAt: z.iso.datetime({ offset: true }),
}).strict();

type QueueHealthProbeMessage = z.infer<typeof queueHealthProbeMessageSchema>;

type ProbeRow = {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt: string;
};

export type QueueHealthProbeEnvironment = "staging" | "production";

export type QueueHealthProbeConfig = {
  environment: QueueHealthProbeEnvironment;
  queueName: string;
  scheduleName: string;
  holderId: string;
  keyPrefix: string;
  cron: string;
  intervalMs: number;
  consumptionTimeoutMs: number;
  retryDelaySeconds: number;
};

export type QueueHealthProbeEnv = {
  APP_ENV: string;
  DB: D1Database;
};

export type QueueHealthProbeSummary = {
  enqueued: number;
  stale: number;
  failed: number;
  skipped: number;
};

function summary(input: Partial<QueueHealthProbeSummary> = {}): QueueHealthProbeSummary {
  return {
    enqueued: input.enqueued ?? 0,
    stale: input.stale ?? 0,
    failed: input.failed ?? 0,
    skipped: input.skipped ?? 0,
  };
}

function timestampBucket(config: QueueHealthProbeConfig, now: Date): number {
  return Math.floor(now.getTime() / config.intervalMs);
}

function bucketStart(config: QueueHealthProbeConfig, now: Date): Date {
  return new Date(timestampBucket(config, now) * config.intervalMs);
}

export function queueHealthProbeKey(
  config: QueueHealthProbeConfig,
  now = new Date(),
): string {
  return `${config.keyPrefix}-${timestampBucket(config, now)}`;
}

export function queueHealthProbeEnabled(
  env: Pick<QueueHealthProbeEnv, "APP_ENV">,
  enabledValue: string | undefined,
  config: QueueHealthProbeConfig,
): boolean {
  return env.APP_ENV === config.environment && enabledValue === "true";
}

export function isQueueHealthProbeQueue(
  queueName: string,
  env: Pick<QueueHealthProbeEnv, "APP_ENV">,
  config: QueueHealthProbeConfig,
): boolean {
  return env.APP_ENV === config.environment && queueName === config.queueName;
}

function validProbeKey(value: string, config: QueueHealthProbeConfig): boolean {
  if (!value.startsWith(`${config.keyPrefix}-`)) return false;
  const bucket = value.slice(config.keyPrefix.length + 1);
  return /^\d{7,16}$/u.test(bucket);
}

async function recordFailure(
  env: QueueHealthProbeEnv,
  safeErrorCode:
    | "DEPENDENCY_UNAVAILABLE"
    | "QUEUE_PROBE_NOT_CONSUMED"
    | "QUEUE_PROBE_INVALID_MESSAGE",
  startedAt: number,
): Promise<void> {
  await recordDependencyHealthEvidence(env, {
    key: "queues",
    state: "degraded",
    safeErrorCode,
    evidenceKind: "synthetic_probe",
    startedAt,
  });
}

async function failStaleProbeClaims(
  env: QueueHealthProbeEnv,
  config: QueueHealthProbeConfig,
  now: Date,
): Promise<number> {
  const cutoff = new Date(now.getTime() - config.consumptionTimeoutMs).toISOString();
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
    config.scheduleName,
    cutoff,
  ).run();
  const stale = Number(result.meta.changes ?? 0);
  if (stale > 0) {
    await recordFailure(env, "QUEUE_PROBE_NOT_CONSUMED", now.getTime());
  }
  return stale;
}

/**
 * Publishes at most one opaque message per configured window. Producer
 * success never creates green evidence; only the dedicated consumer can do
 * that after it matches and completes the durable claim.
 */
export async function enqueueQueueHealthProbe(input: {
  env: QueueHealthProbeEnv;
  queue: Queue<unknown> | undefined;
  enabled: boolean;
  config: QueueHealthProbeConfig;
  now?: Date;
}): Promise<QueueHealthProbeSummary> {
  if (!input.enabled) return summary({ skipped: 1 });

  const now = input.now ?? new Date();
  let stale = 0;
  try {
    stale = await failStaleProbeClaims(input.env, input.config, now);
  } catch {
    console.error(JSON.stringify({
      event: "queue_health_probe.stale_reconciliation_failed",
      environment: input.env.APP_ENV,
    }));
    return summary({ failed: 1 });
  }

  if (!input.queue) {
    await recordFailure(input.env, "DEPENDENCY_UNAVAILABLE", now.getTime());
    return summary({ stale, failed: 1 });
  }

  const startedAt = now.toISOString();
  const id = crypto.randomUUID();
  const probeKey = queueHealthProbeKey(input.config, now);
  const inserted = await input.env.DB.prepare(`
    INSERT INTO scheduled_runs (
      id,schedule_name,cron,scheduled_for,idempotency_key,holder_id,
      status,error_code,started_at,finished_at,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,'pending',NULL,?,NULL,?,?)
    ON CONFLICT(idempotency_key) DO NOTHING
  `).bind(
    id,
    input.config.scheduleName,
    input.config.cron,
    bucketStart(input.config, now).toISOString(),
    `${input.config.scheduleName}:${probeKey}`,
    input.config.holderId,
    startedAt,
    startedAt,
    startedAt,
  ).run();
  if (Number(inserted.meta.changes ?? 0) !== 1) {
    return summary({ stale, skipped: 1 });
  }

  const claimed = await input.env.DB.prepare(`
    UPDATE scheduled_runs
    SET status='running',updated_at=?
    WHERE id=? AND schedule_name=? AND status='pending'
  `).bind(now.toISOString(), id, input.config.scheduleName).run();
  if (Number(claimed.meta.changes ?? 0) !== 1) {
    await recordFailure(input.env, "DEPENDENCY_UNAVAILABLE", now.getTime());
    return summary({ stale, failed: 1 });
  }

  const message: QueueHealthProbeMessage = {
    schemaVersion: 1,
    probeId: id,
    probeKey,
    enqueuedAt: startedAt,
  };
  try {
    await input.queue.send(message, { contentType: "json" });
  } catch {
    await input.env.DB.prepare(`
      UPDATE scheduled_runs
      SET status='failed',error_code='DEPENDENCY_UNAVAILABLE',
          finished_at=?,updated_at=?
      WHERE id=? AND schedule_name=? AND status='running'
    `).bind(now.toISOString(), now.toISOString(), id, input.config.scheduleName).run();
    await recordFailure(input.env, "DEPENDENCY_UNAVAILABLE", now.getTime());
    return summary({ stale, failed: 1 });
  }
  return summary({ stale, enqueued: 1 });
}

async function currentProbeRow(
  env: QueueHealthProbeEnv,
  message: QueueHealthProbeMessage,
  config: QueueHealthProbeConfig,
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
    config.scheduleName,
    `${config.scheduleName}:${message.probeKey}`,
  ).first<ProbeRow>();
}

async function consumeProbeMessage(
  env: QueueHealthProbeEnv,
  message: Message<unknown>,
  config: QueueHealthProbeConfig,
  now: Date,
): Promise<"ack" | "retry"> {
  const parsed = queueHealthProbeMessageSchema.safeParse(message.body);
  if (!parsed.success || !validProbeKey(parsed.data.probeKey, config)) {
    await recordFailure(env, "QUEUE_PROBE_INVALID_MESSAGE", now.getTime());
    return "ack";
  }

  try {
    const row = await currentProbeRow(env, parsed.data, config);
    if (!row || (row.status !== "running" && row.status !== "completed")) {
      await recordFailure(env, "QUEUE_PROBE_INVALID_MESSAGE", now.getTime());
      return "ack";
    }
    if (row.status === "completed") return "ack";

    const completed = await env.DB.prepare(`
      UPDATE scheduled_runs
      SET status='completed',error_code=NULL,finished_at=?,updated_at=?
      WHERE id=? AND schedule_name=? AND status='running'
    `).bind(
      now.toISOString(),
      now.toISOString(),
      parsed.data.probeId,
      config.scheduleName,
    ).run();
    if (Number(completed.meta.changes ?? 0) !== 1) return "ack";

    const startedAt = Date.parse(row.startedAt);
    await recordDependencyHealthEvidence(env, {
      key: "queues",
      state: "operational",
      evidenceKind: "synthetic_probe",
      startedAt: Number.isFinite(startedAt) ? startedAt : now.getTime(),
    }, now);
    return "ack";
  } catch {
    return "retry";
  }
}

export async function handleQueueHealthProbeBatch(input: {
  batch: MessageBatch<unknown>;
  env: QueueHealthProbeEnv;
  enabled: boolean;
  config: QueueHealthProbeConfig;
  now?: Date;
}): Promise<void> {
  if (!isQueueHealthProbeQueue(input.batch.queue, input.env, input.config)) {
    throw new TypeError("QUEUE_HEALTH_PROBE_QUEUE_MISMATCH");
  }
  if (!input.enabled) {
    for (const message of input.batch.messages) message.ack();
    return;
  }
  const now = input.now ?? new Date();
  for (const message of input.batch.messages) {
    const outcome = await consumeProbeMessage(input.env, message, input.config, now);
    if (outcome === "retry") {
      message.retry({ delaySeconds: input.config.retryDelaySeconds });
    } else {
      message.ack();
    }
  }
}
