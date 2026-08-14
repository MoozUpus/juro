// Scheduled legal monitoring is a Lex.uz-only user-facing service. Advice.uz
// may inform internal editorial work but must never affect monitoring health.
const SOURCE_KINDS = ["lex"] as const;
const STALE_AFTER_HOURS = 7 * 24;

type SourceKind = (typeof SOURCE_KINDS)[number];
type Environment = "development" | "staging" | "production";
type CorpusRun = {
  id: string;
  status: string;
  finishedAt: string | null;
};

export type LegalCorpusAlertEnv = {
  APP_ENV: Environment;
  DB: D1Database;
};

export type LegalCorpusAlertSummary = {
  created: number;
  failedRuns: number;
  staleSources: number;
};

function canonicalNow(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new TypeError("Invalid corpus alert time.");
  return value.toISOString();
}

async function latestSuccessfulRun(
  db: D1Database,
  environment: Environment,
  sourceKind: SourceKind,
): Promise<CorpusRun | null> {
  return db.prepare(`
    SELECT id,status,finished_at AS finishedAt
    FROM source_sync_runs
    WHERE environment=? AND source_kind=?
      AND run_type IN ('scheduled_corpus','manual_corpus')
      AND status='success'
      AND discovered_count>0
      AND fetched_count=discovered_count
      AND verified_count=discovered_count
      AND changed_count=0
      AND error_count=0
    ORDER BY finished_at DESC LIMIT 1
  `).bind(environment, sourceKind).first<CorpusRun>();
}

async function unalertedFailedRuns(
  db: D1Database,
  environment: Environment,
  sourceKind: SourceKind,
): Promise<CorpusRun[]> {
  const rows = await db.prepare(`
    SELECT run.id,run.status,run.finished_at AS finishedAt
    FROM source_sync_runs run
    WHERE run.environment=? AND run.source_kind=?
      AND run.run_type IN ('scheduled_corpus','manual_corpus')
      AND run.status='failed'
      AND NOT EXISTS (
        SELECT 1 FROM legal_corpus_alert_jobs alert
        WHERE alert.environment=run.environment
          AND alert.source_kind=run.source_kind
          AND alert.alert_type='legal_corpus_sync_failed'
          AND alert.alert_key=run.id
      )
    ORDER BY run.started_at ASC LIMIT 20
  `).bind(environment, sourceKind).all<CorpusRun>();
  return rows.results;
}

async function createAlert(input: {
  db: D1Database;
  environment: Environment;
  sourceKind: SourceKind;
  sourceSyncRunId: string | null;
  alertType: "legal_corpus_sync_failed" | "legal_corpus_stale";
  alertKey: string;
  severity: "warning" | "critical";
  reason: "run_failed" | "never_succeeded" | "stale_success";
  observedValue: number | null;
  thresholdValue: number | null;
  now: string;
}): Promise<boolean> {
  const alertId = crypto.randomUUID();
  const outboxId = crypto.randomUUID();
  const result = await input.db.batch([
    input.db.prepare(`
      INSERT INTO legal_corpus_alert_jobs
      (id,environment,source_kind,source_sync_run_id,alert_type,alert_key,severity,reason,
       observed_value,threshold_value,status,attempt_count,provider_message_id,sent_at,error_code,
       created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,'pending',0,NULL,NULL,NULL,?,?)
      ON CONFLICT(environment,source_kind,alert_type,alert_key) DO NOTHING
    `).bind(
      alertId,
      input.environment,
      input.sourceKind,
      input.sourceSyncRunId,
      input.alertType,
      input.alertKey,
      input.severity,
      input.reason,
      input.observedValue,
      input.thresholdValue,
      input.now,
      input.now,
    ),
    input.db.prepare(`
      INSERT INTO job_outbox
      (id,queue_binding,job_type,schema_version,idempotency_key,subject_id,workspace_id,
       correlation_id,enqueued_at,available_at,status,dispatch_attempts,created_at,updated_at)
      SELECT ?,'EMAIL_NOTIFICATIONS_QUEUE','email.send',1,?,?,NULL,?,?,?,'pending',0,?,?
      WHERE EXISTS (SELECT 1 FROM legal_corpus_alert_jobs WHERE id=? AND status='pending')
    `).bind(
      outboxId,
      `legal_corpus_alert_${alertId}`,
      alertId,
      `legal_corpus_${input.environment}_${input.sourceKind}_${input.alertType}_${input.alertKey}`,
      input.now,
      input.now,
      input.now,
      input.now,
      alertId,
    ),
  ]);
  return Number(result[0]?.meta.changes ?? 0) === 1;
}

export async function evaluateLegalCorpusAlerts(
  env: LegalCorpusAlertEnv,
  options: { now?: Date } = {},
): Promise<LegalCorpusAlertSummary> {
  const nowDate = options.now ?? new Date();
  const now = canonicalNow(nowDate);
  let created = 0;
  let failedRuns = 0;
  let staleSources = 0;

  for (const sourceKind of SOURCE_KINDS) {
    const [failures, success] = await Promise.all([
      unalertedFailedRuns(env.DB, env.APP_ENV, sourceKind),
      latestSuccessfulRun(env.DB, env.APP_ENV, sourceKind),
    ]);
    for (const failed of failures) {
      const inserted = await createAlert({
        db: env.DB,
        environment: env.APP_ENV,
        sourceKind,
        sourceSyncRunId: failed.id,
        alertType: "legal_corpus_sync_failed",
        alertKey: failed.id,
        severity: "critical",
        reason: "run_failed",
        observedValue: null,
        thresholdValue: null,
        now,
      });
      if (inserted) {
        created += 1;
        failedRuns += 1;
      }
    }

    const successTime = success?.finishedAt ? Date.parse(success.finishedAt) : Number.NaN;
    const observedHours = Number.isFinite(successTime)
      ? Math.max(0, Math.floor((nowDate.getTime() - successTime) / 3_600_000))
      : 0;
    if (success && observedHours < STALE_AFTER_HOURS) continue;
    const inserted = await createAlert({
      db: env.DB,
      environment: env.APP_ENV,
      sourceKind,
      sourceSyncRunId: null,
      alertType: "legal_corpus_stale",
      alertKey: success ? `success_${success.id}` : "never",
      severity: "warning",
      reason: success ? "stale_success" : "never_succeeded",
      observedValue: observedHours,
      thresholdValue: STALE_AFTER_HOURS,
      now,
    });
    if (inserted) {
      created += 1;
      staleSources += 1;
    }
  }
  return { created, failedRuns, staleSources };
}
