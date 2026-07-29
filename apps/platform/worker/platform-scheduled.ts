import { dispatchOutbox } from "./platform-outbox";
import type { PlatformJobEnv } from "./platform-jobs";

const OUTBOX_CRON = "*/5 * * * *";
const LOCK_NAME = "outbox-dispatch";
const LOCK_MS = 4 * 60 * 1_000;

function isoAfter(value: string, milliseconds: number): string {
  return new Date(Date.parse(value) + milliseconds).toISOString();
}

function scheduledFor(controller: ScheduledController): string {
  return new Date(controller.scheduledTime).toISOString();
}

function logScheduled(
  level: "info" | "error",
  fields: Record<string, string | number | boolean | null>,
): void {
  const entry = JSON.stringify(fields);
  if (level === "error") console.error(entry);
  else console.log(entry);
}

async function claimSchedule(
  env: PlatformJobEnv,
  controller: ScheduledController,
): Promise<{ runId: string; holderId: string } | null> {
  const now = new Date().toISOString();
  const holderId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const dueAt = scheduledFor(controller);
  const idempotencyKey = `${LOCK_NAME}:${dueAt}`;
  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO scheduled_locks (name,holder_id,acquired_at,expires_at,updated_at)
       VALUES (?,?,?,?,?)
       ON CONFLICT(name) DO UPDATE SET
         holder_id=excluded.holder_id,
         acquired_at=excluded.acquired_at,
         expires_at=excluded.expires_at,
         updated_at=excluded.updated_at
       WHERE scheduled_locks.expires_at<=excluded.acquired_at`,
    ).bind(LOCK_NAME, holderId, now, isoAfter(now, LOCK_MS), now),
    env.DB.prepare(
      `INSERT INTO scheduled_runs (
         id,schedule_name,cron,scheduled_for,idempotency_key,holder_id,
         status,error_code,started_at,finished_at,created_at,updated_at
       )
       SELECT ?,?,?,?,?,?,'running',NULL,?,NULL,?,?
       WHERE EXISTS (
         SELECT 1 FROM scheduled_locks
         WHERE name=? AND holder_id=? AND expires_at>?
       )
       ON CONFLICT(idempotency_key) DO NOTHING`,
    ).bind(
      runId,
      LOCK_NAME,
      controller.cron,
      dueAt,
      idempotencyKey,
      holderId,
      now,
      now,
      now,
      LOCK_NAME,
      holderId,
      now,
    ),
  ]);
  if (Number(results[1]?.meta?.changes ?? 0) === 1) {
    return { runId, holderId };
  }
  await env.DB.prepare(
    `DELETE FROM scheduled_locks WHERE name=? AND holder_id=?`,
  ).bind(LOCK_NAME, holderId).run();
  return null;
}

async function finishSchedule(
  env: PlatformJobEnv,
  run: { runId: string; holderId: string },
  status: "completed" | "failed",
  errorCode: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE scheduled_runs
       SET status=?,error_code=?,finished_at=?,updated_at=?
       WHERE id=? AND holder_id=? AND status='running'`,
    ).bind(status, errorCode, now, now, run.runId, run.holderId),
    env.DB.prepare(
      `DELETE FROM scheduled_locks
       WHERE name=? AND holder_id=?`,
    ).bind(LOCK_NAME, run.holderId),
  ]);
  if (Number(results[0]?.meta?.changes ?? 0) !== 1) {
    throw new Error("SCHEDULE_LEASE_LOST");
  }
}

export async function handleScheduled(
  controller: ScheduledController,
  env: PlatformJobEnv,
): Promise<void> {
  if (
    String(env.ASYNC_RUNTIME_ENABLED) !== "true"
    || String(env.CRON_ENABLED) !== "true"
  ) {
    logScheduled("info", {
      event: "scheduled.runtime_disabled",
      environment: env.APP_ENV,
      cron: controller.cron,
    });
    controller.noRetry();
    return;
  }
  if (controller.cron !== OUTBOX_CRON) {
    logScheduled("error", {
      event: "scheduled.unknown_cron",
      environment: env.APP_ENV,
      cron: controller.cron,
    });
    controller.noRetry();
    return;
  }

  const run = await claimSchedule(env, controller);
  if (!run) {
    logScheduled("info", {
      event: "scheduled.duplicate_or_busy",
      environment: env.APP_ENV,
      cron: controller.cron,
    });
    controller.noRetry();
    return;
  }
  try {
    const summary = await dispatchOutbox(env, 100);
    await finishSchedule(env, run, "completed", null);
    logScheduled("info", {
      event: "scheduled.outbox_completed",
      environment: env.APP_ENV,
      cron: controller.cron,
      claimed: summary.claimed,
      dispatched: summary.dispatched,
      retrying: summary.retrying,
      rejected: summary.rejected,
    });
  } catch {
    try {
      await finishSchedule(env, run, "failed", "OUTBOX_DISPATCH_FAILED");
    } catch {
      // The expiring lock allows recovery when bookkeeping also fails.
    }
    throw new Error("OUTBOX_DISPATCH_FAILED");
  }
}
