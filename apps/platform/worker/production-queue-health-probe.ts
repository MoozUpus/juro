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
 * Production uses an isolated, content-free round trip. The producer cannot
 * publish green evidence; only this queue's consumer can do so after matching
 * the durable D1 claim.
 */
export const PRODUCTION_QUEUE_HEALTH_PROBE_QUEUE_NAME = "production-queue-health";
export const PRODUCTION_QUEUE_HEALTH_PROBE_INTERVAL_MS = 5 * 60_000;
export const PRODUCTION_QUEUE_HEALTH_PROBE_CONSUMPTION_TIMEOUT_MS = 10 * 60_000;

const productionQueueHealthProbeConfig = {
  environment: "production",
  queueName: PRODUCTION_QUEUE_HEALTH_PROBE_QUEUE_NAME,
  scheduleName: "production-queue-health-probe",
  holderId: "production-queue-health-probe",
  keyPrefix: "production-queue-health-v1",
  cron: "*/5 * * * *",
  intervalMs: PRODUCTION_QUEUE_HEALTH_PROBE_INTERVAL_MS,
  consumptionTimeoutMs: PRODUCTION_QUEUE_HEALTH_PROBE_CONSUMPTION_TIMEOUT_MS,
  retryDelaySeconds: 30,
} as const satisfies QueueHealthProbeConfig;

export type ProductionQueueHealthProbeEnv = {
  APP_ENV: string;
  DB: D1Database;
  PRODUCTION_QUEUE_HEALTH_PROBE_ENABLED?: string;
  PRODUCTION_QUEUE_HEALTH_PROBE_QUEUE?: Queue<unknown>;
};

export type ProductionQueueHealthProbeSummary = QueueHealthProbeSummary;

export function productionQueueHealthProbeKey(now = new Date()): string {
  return queueHealthProbeKey(productionQueueHealthProbeConfig, now);
}

export function productionQueueHealthProbeEnabled(
  env: Pick<
    ProductionQueueHealthProbeEnv,
    "APP_ENV" | "PRODUCTION_QUEUE_HEALTH_PROBE_ENABLED"
  >,
): boolean {
  return queueHealthProbeEnabled(
    env,
    env.PRODUCTION_QUEUE_HEALTH_PROBE_ENABLED,
    productionQueueHealthProbeConfig,
  );
}

export function isProductionQueueHealthProbeQueue(
  queueName: string,
  env: Pick<ProductionQueueHealthProbeEnv, "APP_ENV">,
): boolean {
  return isQueueHealthProbeQueue(queueName, env, productionQueueHealthProbeConfig);
}

export async function enqueueProductionQueueHealthProbe(
  env: ProductionQueueHealthProbeEnv,
  options: { now?: Date } = {},
): Promise<ProductionQueueHealthProbeSummary> {
  return enqueueQueueHealthProbe({
    env,
    queue: env.PRODUCTION_QUEUE_HEALTH_PROBE_QUEUE,
    enabled: productionQueueHealthProbeEnabled(env),
    config: productionQueueHealthProbeConfig,
    now: options.now,
  });
}

export async function handleProductionQueueHealthProbeBatch(
  batch: MessageBatch<unknown>,
  env: Pick<
    ProductionQueueHealthProbeEnv,
    "APP_ENV" | "DB" | "PRODUCTION_QUEUE_HEALTH_PROBE_ENABLED"
  >,
  options: { now?: Date } = {},
): Promise<void> {
  await handleQueueHealthProbeBatch({
    batch,
    env,
    enabled: productionQueueHealthProbeEnabled(env),
    config: productionQueueHealthProbeConfig,
    now: options.now,
  });
}
