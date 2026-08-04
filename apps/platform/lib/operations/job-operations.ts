import { z } from "zod";
import type { OperationalEnvironment } from "./operational-feature-flags";

export const operationalJobKinds = [
  "document.analyze",
  "document.index",
  "ocr.process",
  "document.export",
  "email.send",
  "legal.sync",
  "legal.parse",
  "legal.index",
  "cleanup.run",
  "notification.dispatch",
  "malware.scan",
] as const;

export const operationalJobStatuses = [
  "running",
  "retrying",
  "completed",
  "rejected",
  "dead_lettered",
] as const;

export type OperationalJobKind = (typeof operationalJobKinds)[number];
export type OperationalJobStatus = (typeof operationalJobStatuses)[number];

export const operationalJobFiltersSchema = z.object({
  status: z.enum(operationalJobStatuses).optional(),
  kind: z.enum(operationalJobKinds).optional(),
}).strict();

export const requestJobRedriveSchema = z.object({
  jobId: z.string().min(1).max(180).regex(/^[A-Za-z0-9:_-]+$/),
  reason: z.string().trim().min(10).max(500),
}).strict();

const recoverableTerminalErrorCodes = new Set([
  "ASYNC_RUNTIME_DISABLED",
  "JOB_SCHEMA_VERSION_MISMATCH",
  "JOB_HANDLER_NOT_ENABLED",
  "JOB_TRANSIENT_FAILURE",
  "JOB_LEASE_LOST",
  "DOCUMENT_ANALYSIS_PROVIDER_UNAVAILABLE",
  "DOCUMENT_ANALYSIS_PERSISTENCE_FAILED",
  "USER_DOCUMENT_INDEX_FAILED",
  "OCR_PROVIDER_UNAVAILABLE",
  "OCR_PERSISTENCE_FAILED",
  "DOCUMENT_EXPORT_OBJECT_FAILED",
  "EMAIL_CONFIGURATION_UNAVAILABLE",
  "EMAIL_PROVIDER_UNAVAILABLE",
  "OPERATIONAL_ALERT_CONFIGURATION_UNAVAILABLE",
  "OPERATIONAL_ALERT_PROVIDER_UNAVAILABLE",
  "LEGAL_SOURCE_SYNC_FAILED",
  "LEGAL_SOURCE_PARSE_FAILED",
  "LEGAL_SOURCE_INDEX_FAILED",
  "NOTIFICATION_PERSISTENCE_FAILED",
  "MALWARE_SCANNER_UNAVAILABLE",
  "MALWARE_SCAN_OBJECT_FAILED",
  "MALWARE_SCAN_PERSISTENCE_FAILED",
]);

export type OperationalJobView = {
  id: string;
  queueName: string;
  jobType: OperationalJobKind;
  subjectId: string;
  workspaceId: string | null;
  correlationId: string;
  status: OperationalJobStatus;
  attempt: number;
  errorCode: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
  outboxStatus: string | null;
  canRedrive: boolean;
};

export type OperationalJobRedriveEvent = {
  id: string;
  environment: OperationalEnvironment;
  sourceJobId: string;
  outboxId: string;
  version: number;
  reason: string;
  actorUserId: string;
  previousJobStatus: string;
  previousOutboxStatus: string;
  previousErrorCode: string | null;
  previousAttempt: number;
  previousDispatchedAt: string | null;
  previousEventHash: string | null;
  eventHash: string;
  createdAt: string;
};

type StoredJobRow = Omit<OperationalJobView, "canRedrive"> & {
  leaseExpiresAt: string | null;
  outboxId: string | null;
  outboxDispatchedAt: string | null;
};

type StoredRedriveEvent = OperationalJobRedriveEvent;

export class OperationalJobError extends Error {
  constructor(readonly code:
    | "OPERATIONAL_JOB_INVALID"
    | "OPERATIONAL_JOB_NOT_FOUND"
    | "OPERATIONAL_JOB_REDRIVE_NOT_ALLOWED"
    | "OPERATIONAL_JOB_REDRIVE_CONFLICT"
    | "OPERATIONAL_JOB_REDRIVE_INTEGRITY_FAILED") {
    super(code);
    this.name = "OperationalJobError";
  }
}

export function canRedriveOperationalJob(input: {
  status: string;
  errorCode: string | null;
  outboxStatus: string | null;
  leaseExpiresAt: string | null;
  now?: Date;
}): boolean {
  if (!["dispatched", "retrying", "rejected"].includes(input.outboxStatus ?? "")) return false;
  if (input.leaseExpiresAt && Date.parse(input.leaseExpiresAt) > (input.now ?? new Date()).getTime()) return false;
  if (input.status === "retrying") return true;
  if (!["rejected", "dead_lettered"].includes(input.status)) return false;
  return Boolean(input.errorCode && recoverableTerminalErrorCodes.has(input.errorCode));
}

function canonicalRedriveEvent(value: Omit<OperationalJobRedriveEvent, "eventHash">): string {
  return JSON.stringify(value);
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function storedRedriveEvents(
  db: D1Database,
  environment: OperationalEnvironment,
  sourceJobId?: string,
): Promise<StoredRedriveEvent[]> {
  const where = sourceJobId ? "environment=? AND source_job_id=?" : "environment=?";
  const result = await db.prepare(
    `SELECT id,environment,source_job_id AS sourceJobId,outbox_id AS outboxId,
      version,reason,actor_user_id AS actorUserId,
      previous_job_status AS previousJobStatus,
      previous_outbox_status AS previousOutboxStatus,
      previous_error_code AS previousErrorCode,previous_attempt AS previousAttempt,
      previous_dispatched_at AS previousDispatchedAt,
      previous_event_hash AS previousEventHash,event_hash AS eventHash,
      created_at AS createdAt
     FROM operational_job_redrive_events WHERE ${where}
     ORDER BY source_job_id,version LIMIT 5001`,
  ).bind(...(sourceJobId ? [environment, sourceJobId] : [environment])).all<StoredRedriveEvent>();
  return result.results;
}

export async function verifyOperationalJobRedriveHistory(
  db: D1Database,
  environment: OperationalEnvironment,
  sourceJobId?: string,
): Promise<{ valid: boolean; checked: number }> {
  const rows = await storedRedriveEvents(db, environment, sourceJobId);
  if (rows.length > 5_000) return { valid: false, checked: rows.length };
  const previousByJob = new Map<string, StoredRedriveEvent>();
  for (const row of rows) {
    const previous = previousByJob.get(row.sourceJobId);
    if (
      row.version !== (previous?.version ?? 0) + 1
      || row.previousEventHash !== (previous?.eventHash ?? null)
      || !row.actorUserId
      || !row.createdAt
    ) return { valid: false, checked: rows.length };
    const canonical: Omit<OperationalJobRedriveEvent, "eventHash"> = {
      id: row.id,
      environment: row.environment,
      sourceJobId: row.sourceJobId,
      outboxId: row.outboxId,
      version: row.version,
      reason: row.reason,
      actorUserId: row.actorUserId,
      previousJobStatus: row.previousJobStatus,
      previousOutboxStatus: row.previousOutboxStatus,
      previousErrorCode: row.previousErrorCode,
      previousAttempt: row.previousAttempt,
      previousDispatchedAt: row.previousDispatchedAt,
      previousEventHash: row.previousEventHash,
      createdAt: row.createdAt,
    };
    if (await sha256Hex(canonicalRedriveEvent(canonical)) !== row.eventHash) {
      return { valid: false, checked: rows.length };
    }
    previousByJob.set(row.sourceJobId, row);
  }
  return { valid: true, checked: rows.length };
}

async function jobById(
  db: D1Database,
  environment: OperationalEnvironment,
  jobId: string,
): Promise<StoredJobRow | null> {
  return db.prepare(
    `SELECT j.id,j.queue_name AS queueName,j.job_type AS jobType,
      j.subject_id AS subjectId,j.workspace_id AS workspaceId,
      j.correlation_id AS correlationId,j.status,j.attempt,
      j.error_code AS errorCode,j.started_at AS startedAt,
      j.finished_at AS finishedAt,j.next_attempt_at AS nextAttemptAt,
      j.lease_expires_at AS leaseExpiresAt,j.created_at AS createdAt,
      j.updated_at AS updatedAt,o.id AS outboxId,o.status AS outboxStatus,
      o.dispatched_at AS outboxDispatchedAt
     FROM job_runs AS j
     LEFT JOIN job_outbox AS o ON o.idempotency_key=j.idempotency_key
     WHERE j.id=? AND j.queue_name LIKE ? LIMIT 1`,
  ).bind(jobId, `${environment}-%`).first<StoredJobRow>();
}

export async function readOperationalJobsDashboard(input: {
  db: D1Database;
  environment: OperationalEnvironment;
  filters?: z.input<typeof operationalJobFiltersSchema>;
  now?: Date;
}): Promise<{
  environment: OperationalEnvironment;
  integrity: { valid: boolean; checked: number };
  filters: z.output<typeof operationalJobFiltersSchema>;
  jobs: OperationalJobView[];
  redrives: OperationalJobRedriveEvent[];
  jobCounts: Array<{ status: string; count: number }>;
  outboxCounts: Array<{ status: string; count: number }>;
  scheduledRuns: Array<{ id: string; scheduleName: string; cron: string; status: string; errorCode: string | null; startedAt: string; finishedAt: string | null }>;
}> {
  const parsed = operationalJobFiltersSchema.safeParse(input.filters ?? {});
  if (!parsed.success) throw new OperationalJobError("OPERATIONAL_JOB_INVALID");
  const where = ["j.queue_name LIKE ?"];
  const bindings: Array<string> = [`${input.environment}-%`];
  if (parsed.data.status) { where.push("j.status=?"); bindings.push(parsed.data.status); }
  if (parsed.data.kind) { where.push("j.job_type=?"); bindings.push(parsed.data.kind); }
  const [jobsResult, jobCountsResult, outboxCountsResult, scheduledResult] = await input.db.batch([
    input.db.prepare(
      `SELECT j.id,j.queue_name AS queueName,j.job_type AS jobType,
        j.subject_id AS subjectId,j.workspace_id AS workspaceId,
        j.correlation_id AS correlationId,j.status,j.attempt,
        j.error_code AS errorCode,j.started_at AS startedAt,
        j.finished_at AS finishedAt,j.next_attempt_at AS nextAttemptAt,
        j.lease_expires_at AS leaseExpiresAt,j.created_at AS createdAt,
        j.updated_at AS updatedAt,o.id AS outboxId,o.status AS outboxStatus,
        o.dispatched_at AS outboxDispatchedAt
       FROM job_runs AS j
       LEFT JOIN job_outbox AS o ON o.idempotency_key=j.idempotency_key
       WHERE ${where.join(" AND ")}
       ORDER BY j.created_at DESC,j.id DESC LIMIT 100`,
    ).bind(...bindings),
    input.db.prepare(
      "SELECT status,COUNT(*) AS count FROM job_runs WHERE queue_name LIKE ? GROUP BY status ORDER BY status",
    ).bind(`${input.environment}-%`),
    input.db.prepare(
      "SELECT status,COUNT(*) AS count FROM job_outbox GROUP BY status ORDER BY status",
    ),
    input.db.prepare(
      `SELECT id,schedule_name AS scheduleName,cron,status,error_code AS errorCode,
        started_at AS startedAt,finished_at AS finishedAt
       FROM scheduled_runs ORDER BY started_at DESC,id DESC LIMIT 20`,
    ),
  ]);
  const storedJobs = jobsResult.results as unknown as StoredJobRow[];
  const redrives = (await storedRedriveEvents(input.db, input.environment)).slice(-100).reverse();
  return {
    environment: input.environment,
    integrity: await verifyOperationalJobRedriveHistory(input.db, input.environment),
    filters: parsed.data,
    jobs: storedJobs.map((row) => ({
      id: row.id,
      queueName: row.queueName,
      jobType: row.jobType,
      subjectId: row.subjectId,
      workspaceId: row.workspaceId,
      correlationId: row.correlationId,
      status: row.status,
      attempt: row.attempt,
      errorCode: row.errorCode,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      nextAttemptAt: row.nextAttemptAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      outboxStatus: row.outboxStatus,
      canRedrive: canRedriveOperationalJob({
        status: row.status,
        errorCode: row.errorCode,
        outboxStatus: row.outboxStatus,
        leaseExpiresAt: row.leaseExpiresAt,
        now: input.now,
      }),
    })),
    redrives,
    jobCounts: jobCountsResult.results as unknown as Array<{ status: string; count: number }>,
    outboxCounts: outboxCountsResult.results as unknown as Array<{ status: string; count: number }>,
    scheduledRuns: scheduledResult.results as unknown as Array<{ id: string; scheduleName: string; cron: string; status: string; errorCode: string | null; startedAt: string; finishedAt: string | null }>,
  };
}

export async function requestOperationalJobRedrive(input: {
  db: D1Database;
  environment: OperationalEnvironment;
  actorUserId: string;
  value: z.input<typeof requestJobRedriveSchema>;
  now?: Date;
}): Promise<OperationalJobRedriveEvent> {
  const parsed = requestJobRedriveSchema.safeParse(input.value);
  if (!parsed.success) throw new OperationalJobError("OPERATIONAL_JOB_INVALID");
  const now = input.now ?? new Date();
  const row = await jobById(input.db, input.environment, parsed.data.jobId);
  if (!row) throw new OperationalJobError("OPERATIONAL_JOB_NOT_FOUND");
  if (!row.outboxId || !row.outboxStatus || !canRedriveOperationalJob({
    status: row.status,
    errorCode: row.errorCode,
    outboxStatus: row.outboxStatus,
    leaseExpiresAt: row.leaseExpiresAt,
    now,
  })) throw new OperationalJobError("OPERATIONAL_JOB_REDRIVE_NOT_ALLOWED");
  const existingEvents = await storedRedriveEvents(input.db, input.environment, row.id);
  const integrity = await verifyOperationalJobRedriveHistory(input.db, input.environment, row.id);
  if (!integrity.valid) throw new OperationalJobError("OPERATIONAL_JOB_REDRIVE_INTEGRITY_FAILED");
  const previous = existingEvents.at(-1);
  const eventWithoutHash: Omit<OperationalJobRedriveEvent, "eventHash"> = {
    id: crypto.randomUUID(),
    environment: input.environment,
    sourceJobId: row.id,
    outboxId: row.outboxId,
    version: (previous?.version ?? 0) + 1,
    reason: parsed.data.reason,
    actorUserId: input.actorUserId,
    previousJobStatus: row.status,
    previousOutboxStatus: row.outboxStatus,
    previousErrorCode: row.errorCode,
    previousAttempt: row.attempt,
    previousDispatchedAt: row.outboxDispatchedAt,
    previousEventHash: previous?.eventHash ?? null,
    createdAt: now.toISOString(),
  };
  const event: OperationalJobRedriveEvent = {
    ...eventWithoutHash,
    eventHash: await sha256Hex(canonicalRedriveEvent(eventWithoutHash)),
  };
  try {
    await input.db.prepare(
      `INSERT INTO operational_job_redrive_events
       (id,environment,source_job_id,outbox_id,version,reason,actor_user_id,
        previous_job_status,previous_outbox_status,previous_error_code,
        previous_attempt,previous_dispatched_at,previous_event_hash,event_hash,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      event.id, event.environment, event.sourceJobId, event.outboxId,
      event.version, event.reason, event.actorUserId, event.previousJobStatus,
      event.previousOutboxStatus, event.previousErrorCode, event.previousAttempt,
      event.previousDispatchedAt, event.previousEventHash, event.eventHash,
      event.createdAt,
    ).run();
  } catch {
    throw new OperationalJobError("OPERATIONAL_JOB_REDRIVE_CONFLICT");
  }
  return event;
}
