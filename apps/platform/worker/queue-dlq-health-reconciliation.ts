import { recordDependencyHealthEvidence } from "./dependency-health-evidence";
import { expectedQueueName, type PlatformJobEnv } from "./platform-jobs";

/**
 * A previous DLQ event is not cleared merely because time passed. The short
 * quiet period gives the source/DLQ consumers one full normal interval to
 * publish any still-in-flight durable state before a fresh zero-backlog
 * observation can be recorded as operational.
 */
export const QUEUE_DLQ_HEALTH_QUIET_WINDOW_MS = 5 * 60_000;

const operationalEvidenceIntervalMs = 10 * 60_000;

type QueueMetricsBinding = Pick<Queue, "metrics">;

type QueueDlqHealthEnv = Pick<PlatformJobEnv, "APP_ENV" | "DB"> & {
  DOCUMENT_ANALYSIS_DLQ?: QueueMetricsBinding;
  OCR_PROCESSING_DLQ?: QueueMetricsBinding;
  DOCUMENT_EXPORT_DLQ?: QueueMetricsBinding;
  MALWARE_SCAN_DLQ?: QueueMetricsBinding;
};

type CountRow = { count: number };
type LatestFailureRow = { checkedAt: string; safeErrorCode: string | null };

export type QueueDlqHealthReconciliationSummary = {
  state:
    | "operational_recorded"
    | "operational_not_recorded"
    | "backlog_present"
    | "durable_work_pending"
    | "invalid_or_unmatched_pending"
    | "quiet_window"
    | "verification_unavailable";
  documentAnalysisBacklog: number | null;
  ocrBacklog: number | null;
  documentExportBacklog: number | null;
  malwareScanBacklog: number | null;
  durableDeadLettered: number | null;
};

function normalizedBacklogCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : null;
}

async function countDurableDeadLettered(
  env: QueueDlqHealthEnv,
): Promise<number> {
  const documentQueue = expectedQueueName("document.analyze", env.APP_ENV);
  const ocrQueue = expectedQueueName("ocr.process", env.APP_ENV);
  const documentExportQueue = expectedQueueName("document.export", env.APP_ENV);
  const malwareScanQueue = expectedQueueName("malware.scan", env.APP_ENV);
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count
     FROM job_runs
     WHERE status='dead_lettered'
       AND (
         (queue_name=? AND job_type IN ('document.analyze','document.index'))
         OR (queue_name=? AND job_type='ocr.process')
         OR (queue_name=? AND job_type='document.export')
         OR (queue_name=? AND job_type='malware.scan')
       )`,
  ).bind(
    documentQueue,
    ocrQueue,
    documentExportQueue,
    malwareScanQueue,
  ).first<CountRow>();
  return Number(row?.count ?? 0);
}

async function latestDlqFailure(
  env: QueueDlqHealthEnv,
): Promise<LatestFailureRow | null> {
  return env.DB.prepare(
    `SELECT checked_at AS checkedAt,safe_error_code AS safeErrorCode
     FROM dependency_health_checks
     WHERE environment=?
       AND dependency_key='queue_dlq'
       AND state<>'operational'
     ORDER BY checked_at DESC,id DESC
     LIMIT 1`,
  ).bind(env.APP_ENV === "production" || env.APP_ENV === "staging" ? env.APP_ENV : "development")
    .first<LatestFailureRow>();
}

/**
 * A malformed or unmatched DLQ delivery has no durable envelope that can be
 * proven redriven. Keep it visible until a separately audited manual process
 * resolves it; automatically writing a green result would hide possible work
 * loss. A later normal DLQ failure must not mask that unresolved incident.
 */
async function hasUnresolvedInvalidDlqEvidence(
  env: QueueDlqHealthEnv,
): Promise<boolean> {
  const environment = env.APP_ENV === "production" || env.APP_ENV === "staging"
    ? env.APP_ENV
    : "development";
  const row = await env.DB.prepare(
    `SELECT 1 AS value
     FROM dependency_health_checks
     WHERE environment=?
       AND dependency_key='queue_dlq'
       AND state<>'operational'
       AND safe_error_code IN ('DLQ_INVALID_MESSAGE','DLQ_UNMATCHED_MESSAGE')
       AND checked_at>COALESCE((
         SELECT MAX(checked_at)
         FROM dependency_health_checks
         WHERE environment=?
           AND dependency_key='queue_dlq'
           AND state='operational'
           AND evidence_kind='manual_verification'
       ),'')
     ORDER BY checked_at DESC,id DESC
     LIMIT 1`,
  ).bind(environment, environment).first<{ value: number }>();
  return row?.value === 1;
}

function emptySummary(
  state: QueueDlqHealthReconciliationSummary["state"],
  documentAnalysisBacklog: number | null,
  ocrBacklog: number | null,
  documentExportBacklog: number | null,
  malwareScanBacklog: number | null,
  durableDeadLettered: number | null,
): QueueDlqHealthReconciliationSummary {
  return {
    state,
    documentAnalysisBacklog,
    ocrBacklog,
    documentExportBacklog,
    malwareScanBacklog,
    durableDeadLettered,
  };
}

/**
 * Reconciles queue DLQ health from three independent facts:
 *
 * 1. Cloudflare's current backlog metrics for all implemented document DLQs;
 * 2. the durable `job_runs` ledger has no exhausted document/OCR/export/scan
 *    work; and
 * 3. the most recent DLQ failure has been quiet for one full cron interval.
 *
 * It never mutates a job, requeues work, or clears immutable evidence. If
 * metrics are unavailable or a malformed/orphaned delivery occurred, it
 * deliberately does not record operational health.
 */
export async function reconcileQueueDlqHealth(
  env: QueueDlqHealthEnv,
  input: { now?: Date } = {},
): Promise<QueueDlqHealthReconciliationSummary> {
  const now = input.now ?? new Date();
  const documentDlq = env.DOCUMENT_ANALYSIS_DLQ;
  const ocrDlq = env.OCR_PROCESSING_DLQ;
  const documentExportDlq = env.DOCUMENT_EXPORT_DLQ;
  const malwareScanDlq = env.MALWARE_SCAN_DLQ;
  if (!documentDlq || !ocrDlq || !documentExportDlq || !malwareScanDlq) {
    await recordDependencyHealthEvidence(env, {
      key: "queue_dlq",
      state: "degraded",
      safeErrorCode: "DEPENDENCY_UNAVAILABLE",
      evidenceKind: "scheduled_job",
      startedAt: now.getTime(),
    }, now);
    return emptySummary("verification_unavailable", null, null, null, null, null);
  }

  let documentAnalysisBacklog: number | null = null;
  let ocrBacklog: number | null = null;
  let documentExportBacklog: number | null = null;
  let malwareScanBacklog: number | null = null;
  let durableDeadLettered: number | null = null;
  let lastFailure: LatestFailureRow | null = null;
  let invalidOrUnmatched = false;
  try {
    const [
      documentMetrics,
      ocrMetrics,
      documentExportMetrics,
      malwareScanMetrics,
      durableCount,
      latestFailureRow,
      invalidEvidence,
    ] = await Promise.all([
      documentDlq.metrics(),
      ocrDlq.metrics(),
      documentExportDlq.metrics(),
      malwareScanDlq.metrics(),
      countDurableDeadLettered(env),
      latestDlqFailure(env),
      hasUnresolvedInvalidDlqEvidence(env),
    ]);
    documentAnalysisBacklog = normalizedBacklogCount(documentMetrics.backlogCount);
    ocrBacklog = normalizedBacklogCount(ocrMetrics.backlogCount);
    documentExportBacklog = normalizedBacklogCount(documentExportMetrics.backlogCount);
    malwareScanBacklog = normalizedBacklogCount(malwareScanMetrics.backlogCount);
    durableDeadLettered = durableCount;
    lastFailure = latestFailureRow;
    invalidOrUnmatched = invalidEvidence;
  } catch {
    await recordDependencyHealthEvidence(env, {
      key: "queue_dlq",
      state: "degraded",
      safeErrorCode: "DEPENDENCY_UNAVAILABLE",
      evidenceKind: "scheduled_job",
      startedAt: now.getTime(),
    }, now);
    return emptySummary(
      "verification_unavailable",
      documentAnalysisBacklog,
      ocrBacklog,
      documentExportBacklog,
      malwareScanBacklog,
      durableDeadLettered,
    );
  }

  if (
    documentAnalysisBacklog === null
    || ocrBacklog === null
    || documentExportBacklog === null
    || malwareScanBacklog === null
  ) {
    await recordDependencyHealthEvidence(env, {
      key: "queue_dlq",
      state: "degraded",
      safeErrorCode: "DEPENDENCY_UNAVAILABLE",
      evidenceKind: "scheduled_job",
      startedAt: now.getTime(),
    }, now);
    return emptySummary(
      "verification_unavailable",
      documentAnalysisBacklog,
      ocrBacklog,
      documentExportBacklog,
      malwareScanBacklog,
      durableDeadLettered,
    );
  }
  if (
    documentAnalysisBacklog > 0
    || ocrBacklog > 0
    || documentExportBacklog > 0
    || malwareScanBacklog > 0
  ) {
    await recordDependencyHealthEvidence(env, {
      key: "queue_dlq",
      state: "degraded",
      safeErrorCode: "DLQ_BACKLOG",
      evidenceKind: "scheduled_job",
      startedAt: now.getTime(),
    }, now);
    return emptySummary(
      "backlog_present",
      documentAnalysisBacklog,
      ocrBacklog,
      documentExportBacklog,
      malwareScanBacklog,
      durableDeadLettered,
    );
  }
  if ((durableDeadLettered ?? 0) > 0) {
    await recordDependencyHealthEvidence(env, {
      key: "queue_dlq",
      state: "degraded",
      safeErrorCode: "DLQ_BACKLOG",
      evidenceKind: "scheduled_job",
      startedAt: now.getTime(),
    }, now);
    return emptySummary(
      "durable_work_pending",
      documentAnalysisBacklog,
      ocrBacklog,
      documentExportBacklog,
      malwareScanBacklog,
      durableDeadLettered,
    );
  }
  if (invalidOrUnmatched) {
    return emptySummary(
      "invalid_or_unmatched_pending",
      documentAnalysisBacklog,
      ocrBacklog,
      documentExportBacklog,
      malwareScanBacklog,
      durableDeadLettered,
    );
  }

  const lastFailureAt = lastFailure ? Date.parse(lastFailure.checkedAt) : NaN;
  if (Number.isFinite(lastFailureAt) && now.getTime() - lastFailureAt < QUEUE_DLQ_HEALTH_QUIET_WINDOW_MS) {
    return emptySummary(
      "quiet_window",
      documentAnalysisBacklog,
      ocrBacklog,
      documentExportBacklog,
      malwareScanBacklog,
      durableDeadLettered,
    );
  }

  const recorded = await recordDependencyHealthEvidence(env, {
    key: "queue_dlq",
    state: "operational",
    evidenceKind: "scheduled_job",
    startedAt: now.getTime(),
    minimumOperationalIntervalMs: operationalEvidenceIntervalMs,
  }, now);
  return emptySummary(
    recorded ? "operational_recorded" : "operational_not_recorded",
    documentAnalysisBacklog,
    ocrBacklog,
    documentExportBacklog,
    malwareScanBacklog,
    durableDeadLettered,
  );
}
