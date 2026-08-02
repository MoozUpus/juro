import { dispatchOutbox } from "./platform-outbox";
import {
  LEGAL_CORPUS_SYNC_CRON,
  reconcileScheduledCorpusSyncRuns,
  startScheduledCorpusSync,
} from "../lib/legal/scheduled-corpus-sync";
import type { PlatformJobEnv } from "./platform-jobs";

const OUTBOX_CRON = "*/5 * * * *";
const LOCK_NAME = "outbox-dispatch";
const LOCK_MS = 4 * 60 * 1_000;
const TASK_REMINDER_BATCH_SIZE = 100;

type DueTaskReminder = {
  reminderId: string;
  taskId: string;
  workspaceId: string;
  userId: string;
  taskTitle: string;
  dueAt: string | null;
  locale: "ru" | "uz";
};

function isoAfter(value: string, milliseconds: number): string {
  return new Date(Date.parse(value) + milliseconds).toISOString();
}

function scheduledFor(controller: ScheduledController): string {
  return new Date(controller.scheduledTime).toISOString();
}

async function maybeRunStagingProviderProbes(env: PlatformJobEnv) {
  if (
    env.APP_ENV !== "staging"
    || (env as Record<string, unknown>).STAGING_SYNTHETIC_PROBES_ENABLED !== "true"
  ) return null;
  const { runStagingProviderProbes } = await import("./staging-provider-probe");
  return runStagingProviderProbes(env);
}
function logScheduled(
  level: "info" | "error",
  fields: Record<string, string | number | boolean | null>,
): void {
  const entry = JSON.stringify(fields);
  if (level === "error") console.error(entry);
  else console.log(entry);
}

function taskReminderCopy(
  reminder: Pick<DueTaskReminder, "locale" | "taskTitle">,
): { title: string; body: string } {
  if (reminder.locale === "uz") {
    return {
      title: "Vazifa muddati",
      body: `Vazifa muddati yaqinlashmoqda: ${reminder.taskTitle}.`,
    };
  }
  return {
    title: "Срок по задаче",
    body: `Приближается срок по задаче: ${reminder.taskTitle}.`,
  };
}

/**
 * Delivers due in-app task reminders directly to the existing notifications
 * inbox. The deterministic notification id and conditional state transition
 * make a retry safe even after a Worker interruption.
 */
export async function dispatchDueTaskReminders(
  env: PlatformJobEnv,
  now: string,
): Promise<{ due: number; sent: number }> {
  const due = await env.DB.prepare(
    `SELECT
       tr.id AS reminderId,
       tr.task_id AS taskId,
       t.workspace_id AS workspaceId,
       t.owner_user_id AS userId,
       t.title AS taskTitle,
       t.due_at AS dueAt,
       c.locale AS locale
     FROM task_reminders tr
     JOIN tasks t ON t.id=tr.task_id
     JOIN cases c ON c.id=t.case_id
     WHERE tr.channel='in_app'
       AND tr.status='pending'
       AND tr.reminder_at<=?
       AND t.status NOT IN ('completed','cancelled')
       AND c.archived_at IS NULL
     ORDER BY tr.reminder_at ASC, tr.id ASC
     LIMIT ?`,
  ).bind(now, TASK_REMINDER_BATCH_SIZE).all<DueTaskReminder>();

  let sent = 0;
  for (const reminder of due.results) {
    const copy = taskReminderCopy(reminder);
    const notificationId = `task-reminder:${reminder.reminderId}`;
    const results = await env.DB.batch([
      env.DB.prepare(
        `INSERT OR IGNORE INTO notifications (
           id,workspace_id,user_id,document_id,type,title,body,read_at,created_at
         )
         SELECT ?,?,?,?,?,?,?,NULL,?
         WHERE EXISTS (
           SELECT 1
           FROM task_reminders tr
           JOIN tasks t ON t.id=tr.task_id
           JOIN cases c ON c.id=t.case_id
           WHERE tr.id=?
             AND tr.channel='in_app'
             AND tr.status='pending'
             AND tr.reminder_at<=?
             AND t.id=?
             AND t.workspace_id=?
             AND t.owner_user_id=?
             AND t.status NOT IN ('completed','cancelled')
             AND c.archived_at IS NULL
         )`,
      ).bind(
        notificationId,
        reminder.workspaceId,
        reminder.userId,
        null,
        "deadline_reminder",
        copy.title,
        copy.body,
        now,
        reminder.reminderId,
        now,
        reminder.taskId,
        reminder.workspaceId,
        reminder.userId,
      ),
      env.DB.prepare(
        `UPDATE task_reminders
         SET status='sent',sent_at=?,updated_at=?
         WHERE id=?
           AND channel='in_app'
           AND status='pending'
           AND reminder_at<=?
           AND EXISTS (
             SELECT 1
             FROM tasks t
             JOIN cases c ON c.id=t.case_id
             WHERE t.id=task_reminders.task_id
               AND t.id=?
               AND t.workspace_id=?
               AND t.owner_user_id=?
               AND t.status NOT IN ('completed','cancelled')
               AND c.archived_at IS NULL
           )`,
      ).bind(
        now,
        now,
        reminder.reminderId,
        now,
        reminder.taskId,
        reminder.workspaceId,
        reminder.userId,
      ),
    ]);
    sent += Number(results[1]?.meta?.changes ?? 0);
  }
  return { due: due.results.length, sent };
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
  if (controller.cron !== OUTBOX_CRON && controller.cron !== LEGAL_CORPUS_SYNC_CRON) {
    logScheduled("error", {
      event: "scheduled.unknown_cron",
      environment: env.APP_ENV,
      cron: controller.cron,
    });
    controller.noRetry();
    return;
  }

  if (controller.cron === LEGAL_CORPUS_SYNC_CRON) {
    const summary = await startScheduledCorpusSync(env);
    logScheduled("info", {
      event: "scheduled.legal_corpus_started",
      environment: env.APP_ENV,
      cron: controller.cron,
      started: summary.started,
      busy: summary.busy,
      empty: summary.empty,
    });
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
    const taskReminders = await dispatchDueTaskReminders(
      env,
      new Date().toISOString(),
    );
    const providerProbe = await maybeRunStagingProviderProbes(env);
    const corpusRunsCompleted =
      env.LEGAL_ADVICE_INGESTION_ENABLED === "true"
        ? await reconcileScheduledCorpusSyncRuns(env)
        : 0;
    await finishSchedule(env, run, "completed", null);
    logScheduled("info", {
      event: "scheduled.outbox_completed",
      environment: env.APP_ENV,
      cron: controller.cron,
      claimed: summary.claimed,
      dispatched: summary.dispatched,
      retrying: summary.retrying,
      rejected: summary.rejected,
      taskRemindersDue: taskReminders.due,
      taskRemindersSent: taskReminders.sent,
      providerProbeAttempted: providerProbe?.attempted ?? 0,
      providerProbeSucceeded: providerProbe?.succeeded ?? 0,
      providerProbeFailed: providerProbe?.failed ?? 0,
      providerProbeSkipped: providerProbe?.skipped ?? 0,
      corpusRunsCompleted,
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
