import {
  enqueueQueueHealthProbe,
  handleQueueHealthProbeBatch,
  isQueueHealthProbeQueue,
  queueHealthProbeEnabled,
  queueHealthProbeKey,
  type QueueHealthProbeConfig,
  type QueueHealthProbeSummary,
} from "./queue-health-probe";

/**
 * The probe deliberately has its own staging-only queue. It must never share
 * a user-work queue, so its only body is a short-lived opaque identifier.
 */
export const STAGING_QUEUE_HEALTH_PROBE_QUEUE_NAME = "staging-queue-health";
export const STAGING_QUEUE_HEALTH_PROBE_INTERVAL_MS = 15 * 60_000;
export const STAGING_QUEUE_HEALTH_PROBE_CONSUMPTION_TIMEOUT_MS = 15 * 60_000;

const stagingQueueHealthProbeConfig = {
  environment: "staging",
  queueName: STAGING_QUEUE_HEALTH_PROBE_QUEUE_NAME,
  scheduleName: "staging-queue-health-probe",
  holderId: "staging-queue-health-probe",
  keyPrefix: "staging-queue-health-v1",
  cron: "*/15 * * * *",
  intervalMs: STAGING_QUEUE_HEALTH_PROBE_INTERVAL_MS,
  consumptionTimeoutMs: STAGING_QUEUE_HEALTH_PROBE_CONSUMPTION_TIMEOUT_MS,
  retryDelaySeconds: 30,
} as const satisfies QueueHealthProbeConfig;

export type StagingQueueHealthProbeEnv = {
  APP_ENV: string;
  DB: D1Database;
  STAGING_QUEUE_HEALTH_PROBE_ENABLED?: string;
  STAGING_QUEUE_HEALTH_PROBE_QUEUE?: Queue<unknown>;
};

export type StagingQueueHealthProbeSummary = QueueHealthProbeSummary;

export type StagingQueueHealthProbeOptions = {
  /** Only used by deterministic tests; scheduled code intentionally omits it. */
  now?: Date;
};

export function stagingQueueHealthProbeKey(now = new Date()): string {
  return queueHealthProbeKey(stagingQueueHealthProbeConfig, now);
}

export function stagingQueueHealthProbeEnabled(
  env: Pick<StagingQueueHealthProbeEnv, "APP_ENV" | "STAGING_QUEUE_HEALTH_PROBE_ENABLED">,
): boolean {
  return queueHealthProbeEnabled(
    env,
    env.STAGING_QUEUE_HEALTH_PROBE_ENABLED,
    stagingQueueHealthProbeConfig,
  );
}

export function isStagingQueueHealthProbeQueue(
  queueName: string,
  env: Pick<StagingQueueHealthProbeEnv, "APP_ENV">,
): boolean {
  return isQueueHealthProbeQueue(queueName, env, stagingQueueHealthProbeConfig);
}

export async function enqueueStagingQueueHealthProbe(
  env: StagingQueueHealthProbeEnv,
  options: StagingQueueHealthProbeOptions = {},
): Promise<StagingQueueHealthProbeSummary> {
  return enqueueQueueHealthProbe({
    env,
    queue: env.STAGING_QUEUE_HEALTH_PROBE_QUEUE,
    enabled: stagingQueueHealthProbeEnabled(env),
    config: stagingQueueHealthProbeConfig,
    now: options.now,
  });
}

/**
 * Handles only the dedicated staging probe queue. It cannot delegate to the
 * platform job consumer or execute a user/workspace payload.
 */
export async function handleStagingQueueHealthProbeBatch(
  batch: MessageBatch<unknown>,
  env: Pick<
    StagingQueueHealthProbeEnv,
    "APP_ENV" | "DB" | "STAGING_QUEUE_HEALTH_PROBE_ENABLED"
  >,
  options: { now?: Date } = {},
): Promise<void> {
  await handleQueueHealthProbeBatch({
    batch,
    env,
    enabled: stagingQueueHealthProbeEnabled(env),
    config: stagingQueueHealthProbeConfig,
    now: options.now,
  });
}
