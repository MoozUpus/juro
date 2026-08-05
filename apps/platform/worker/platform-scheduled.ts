import { dispatchOutbox } from "./platform-outbox";
import {
  LEGAL_CORPUS_SYNC_CRON,
  reconcileScheduledCorpusSyncRuns,
  startScheduledCorpusSync,
} from "../lib/legal/scheduled-corpus-sync";
import { evaluateLegalCorpusAlerts } from "../lib/legal/corpus-alerts";
import { purgeDueDeletedUserMemories } from "../lib/ai/user-memory";
import { purgeExpiredGuestAiSessions } from "../lib/ai/guest-session";
import { purgeExpiredVoiceRecordings } from "../lib/ai/voice-recording";
import { reconcileAnalysisVersionObjectWrites } from "../lib/document-analysis/version-object-write";
import { taskReminderSubjectId } from "../lib/notifications/task-reminder-dispatch";
import type { PlatformJobEnv } from "./platform-jobs";

const OUTBOX_CRON = "*/5 * * * *";
const LOCK_NAME = "outbox-dispatch";
const LOCK_MS = 4 * 60 * 1_000;
const TASK_REMINDER_BATCH_SIZE = 100;

type DueTaskReminder = {
  reminderId: string;
  workspaceId: string;
  updatedAt: string;
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

/**
 * Enqueues opaque reminder identifiers through the durable outbox. The queue
 * consumer reloads and authorizes all tenant state before delivery.
 */
export async function enqueueDueTaskReminders(
  env: PlatformJobEnv,
  now: string,
): Promise<{ due: number; enqueued: number }> {
  const due = await env.DB.prepare(
    `SELECT
       tr.id AS reminderId,
       t.workspace_id AS workspaceId,
       tr.updated_at AS updatedAt
     FROM task_reminders tr
     JOIN tasks t ON t.id=tr.task_id
     JOIN cases c ON c.id=t.case_id AND c.workspace_id=t.workspace_id
     JOIN workspace_members wm
       ON wm.workspace_id=t.workspace_id
      AND wm.user_id=t.owner_user_id
      AND wm.status='active'
     WHERE tr.channel='in_app'
       AND tr.status='pending'
       AND tr.reminder_at<=?
       AND t.status NOT IN ('completed','cancelled')
       AND c.archived_at IS NULL
     ORDER BY tr.reminder_at ASC, tr.id ASC
     LIMIT ?`,
  ).bind(now, TASK_REMINDER_BATCH_SIZE).all<DueTaskReminder>();

  let enqueued = 0;
  for (const reminder of due.results) {
    const subjectId = taskReminderSubjectId(
      reminder.reminderId,
      reminder.updatedAt,
    );
    const result = await env.DB.prepare(
      `INSERT OR IGNORE INTO job_outbox (
         id,queue_binding,job_type,schema_version,idempotency_key,subject_id,
         workspace_id,correlation_id,enqueued_at,available_at,status,
         dispatch_attempts,created_at,updated_at
       ) VALUES (
         ?,'NOTIFICATIONS_QUEUE','notification.dispatch',1,?,?,?, ?,?,?,
         'pending',0,?,?
       )`,
    ).bind(
      subjectId,
      subjectId,
      subjectId,
      reminder.workspaceId,
      subjectId,
      now,
      now,
      now,
      now,
    ).run();
    enqueued += Number(result.meta?.changes ?? 0);
  }
  return { due: due.results.length, enqueued };
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
    const summary = await startScheduledCorpusSync(env, {
      discoveryWait: (delayMs) => scheduler.wait(delayMs),
    });
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
  let failureCode = "OUTBOX_DISPATCH_FAILED";
  try {
    failureCode = "TASK_REMINDER_ENQUEUE_FAILED";
    const now = new Date().toISOString();
    const taskReminders = await enqueueDueTaskReminders(env, now);
    failureCode = "OUTBOX_DISPATCH_FAILED";
    const summary = await dispatchOutbox(env, 100);
    failureCode = "MEMORY_RETENTION_CLEANUP_FAILED";
    const memoryRetention = await purgeDueDeletedUserMemories({
      db: env.DB,
      now,
    });
    failureCode = "GUEST_AI_RETENTION_CLEANUP_FAILED";
    const guestAiRetention = await purgeExpiredGuestAiSessions({
      db: env.DB,
      now,
    });
    failureCode = "VOICE_RETENTION_CLEANUP_FAILED";
    const voiceRetention = await purgeExpiredVoiceRecordings({
      db: env.DB,
      bucket: env.BUCKET,
      quarantineBucket: env.QUARANTINE_BUCKET,
      now,
    });
    failureCode = "ANALYSIS_VERSION_OBJECT_RECONCILIATION_FAILED";
    const analysisVersionObjects = await reconcileAnalysisVersionObjectWrites({
      db: env.DB,
      bucket: env.BUCKET,
      now,
    });
    failureCode = "PROVIDER_PROBE_FAILED";
    const providerProbe = await maybeRunStagingProviderProbes(env);
    failureCode = "LEGAL_CORPUS_RECONCILE_FAILED";
    const corpusRunsCompleted =
      env.LEGAL_ADVICE_INGESTION_ENABLED === "true"
        ? await reconcileScheduledCorpusSyncRuns(env)
        : 0;
    failureCode = "LEGAL_CORPUS_ALERT_EVALUATION_FAILED";
    const corpusAlerts = env.LEGAL_ADVICE_INGESTION_ENABLED === "true"
      ? await evaluateLegalCorpusAlerts(env, { now: new Date(now) })
      : { created: 0, failedRuns: 0, staleSources: 0 };
    failureCode = "SCHEDULE_COMPLETION_FAILED";
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
      taskRemindersEnqueued: taskReminders.enqueued,
      memoryRetentionEligible: memoryRetention.eligible,
      memoryRetentionPurged: memoryRetention.purged,
      guestAiRetentionEligible: guestAiRetention.eligible,
      guestAiRetentionPurged: guestAiRetention.purged,
      guestAiReservationsReleased: guestAiRetention.reservationsReleased,
      voiceRetentionEligible: voiceRetention.eligible,
      voiceRetentionPurged: voiceRetention.purged,
      analysisVersionObjectsEligible: analysisVersionObjects.eligible,
      analysisVersionObjectsClaimed: analysisVersionObjects.claimed,
      analysisVersionObjectsAttached: analysisVersionObjects.attached,
      analysisVersionObjectsDeleted: analysisVersionObjects.deleted,
      analysisVersionObjectsRetrying: analysisVersionObjects.retrying,
      providerProbeAttempted: providerProbe?.attempted ?? 0,
      providerProbeSucceeded: providerProbe?.succeeded ?? 0,
      providerProbeFailed: providerProbe?.failed ?? 0,
      providerProbeSkipped: providerProbe?.skipped ?? 0,
      corpusRunsCompleted,
      corpusAlertsCreated: corpusAlerts.created,
      corpusFailedRunAlerts: corpusAlerts.failedRuns,
      corpusStaleSourceAlerts: corpusAlerts.staleSources,
    });
  } catch {
    try {
      await finishSchedule(env, run, "failed", failureCode);
    } catch {
      // The expiring lock allows recovery when bookkeeping also fails.
    }
    throw new Error(failureCode);
  }
}
