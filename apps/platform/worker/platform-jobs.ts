import { z } from "zod";
import {
  AccountDeletionPurgeError,
  executeAccountDeletionPurge,
} from "../lib/auth/account-deletion-purge";
import {
  executeSecurityEmailJob,
  SecurityEmailError,
} from "../lib/auth/security-email";
import {
  LegalSourceAcquisitionError,
  executeLegalSourceFetchRequest,
} from "../lib/legal/source-acquisition";
import {
  LegalSourceNormalizationError,
  executeLegalSourceNormalization,
} from "../lib/legal/source-normalization";
import {
  isStagingDeletionProbe,
  prepareStagingDeletionProbe,
  StagingDeletionProbeError,
} from "./staging-account-deletion-probe";

export const JOB_KINDS = [
  "document.analyze",
  "ocr.process",
  "document.export",
  "email.send",
  "legal.sync",
  "legal.parse",
  "cleanup.run",
  "notification.dispatch",
  "malware.scan",
] as const;

export const LEGACY_JOB_KINDS = [
  "platform.probe",
  "ai.request",
  "file.process",
  "backup.run",
] as const;

export type JobKind = (typeof JOB_KINDS)[number];

const jobKindSchema = z.enum(JOB_KINDS);
const identifierSchema = z
  .string()
  .min(1)
  .max(180)
  .regex(/^[A-Za-z0-9:_-]+$/);

/**
 * Queue bodies intentionally contain opaque identifiers only. Consumers must
 * reload tenant-scoped state from D1/R2; user content and object keys never
 * cross the queue boundary.
 */
const tenantJobKinds = new Set<JobKind>([
  "document.analyze",
  "ocr.process",
  "document.export",
  "email.send",
  "notification.dispatch",
  "malware.scan",
]);

export const jobEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  jobId: identifierSchema,
  kind: jobKindSchema,
  idempotencyKey: identifierSchema,
  subjectId: identifierSchema,
  workspaceId: identifierSchema.nullable().optional(),
  correlationId: identifierSchema,
  enqueuedAt: z.iso.datetime({ offset: true }),
}).strict().superRefine((value, context) => {
  if (tenantJobKinds.has(value.kind) && !value.workspaceId) {
    context.addIssue({
      code: "custom",
      message: "Tenant-scoped jobs require workspaceId.",
      path: ["workspaceId"],
    });
  }
});

export type JobEnvelope = z.infer<typeof jobEnvelopeSchema>;

type JobErrorCode =
  | "ACCOUNT_DELETION_D1_FAILED"
  | "ACCOUNT_DELETION_NOT_DUE"
  | "ACCOUNT_DELETION_PURGE_DISABLED"
  | "ACCOUNT_DELETION_R2_FAILED"
  | "ACCOUNT_DELETION_REQUEST_INVALID"
  | "ACCOUNT_DELETION_STATE_CONFLICT"
  | "ASYNC_RUNTIME_DISABLED"
  | "EMAIL_CONFIGURATION_UNAVAILABLE"
  | "EMAIL_JOB_INVALID"
  | "EMAIL_PROVIDER_REJECTED"
  | "EMAIL_PROVIDER_UNAVAILABLE"
  | "JOB_HANDLER_NOT_ENABLED"
  | "JOB_IDEMPOTENCY_CONFLICT"
  | "JOB_LEASE_LOST"
  | "JOB_QUEUE_MISMATCH"
  | "JOB_SCHEMA_VERSION_MISMATCH"
  | "JOB_TRANSIENT_FAILURE"
  | "JOB_VALIDATION_FAILED"
  | "LEGAL_SOURCE_SYNC_FAILED"
  | "LEGAL_SOURCE_PARSE_FAILED"
  | "PRIVILEGED_ACCOUNT_REVIEW_REQUIRED"
  | "STAGING_SYNTHETIC_PROBE_DISABLED"
  | "STAGING_SYNTHETIC_PROBE_D1_FAILED"
  | "STAGING_SYNTHETIC_PROBE_IDENTITY_FAILED"
  | "STAGING_SYNTHETIC_PROBE_R2_FAILED"
  | "WORKSPACE_OWNERSHIP_TRANSFER_REQUIRED";

type OperationalError = {
  code: JobErrorCode;
  retryable: boolean;
};

class SafeJobError extends Error {
  constructor(
    readonly code: JobErrorCode,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = "SafeJobError";
  }
}

const queueStemByKind: Record<JobKind, string> = {
  "document.analyze": "document-analysis",
  "ocr.process": "ocr-processing",
  "document.export": "document-export",
  "email.send": "email-notifications",
  "legal.sync": "legal-sources-sync",
  "legal.parse": "legal-sources-sync",
  "cleanup.run": "data-retention-cleanup",
  "notification.dispatch": "notifications",
  "malware.scan": "malware-scan",
};

export const QUEUE_BINDING_BY_KIND = {
  "document.analyze": "DOCUMENT_ANALYSIS_QUEUE",
  "ocr.process": "OCR_PROCESSING_QUEUE",
  "document.export": "DOCUMENT_EXPORT_QUEUE",
  "email.send": "EMAIL_NOTIFICATIONS_QUEUE",
  "legal.sync": "LEGAL_SOURCES_SYNC_QUEUE",
  "legal.parse": "LEGAL_SOURCES_SYNC_QUEUE",
  "cleanup.run": "DATA_RETENTION_CLEANUP_QUEUE",
  "notification.dispatch": "NOTIFICATIONS_QUEUE",
  "malware.scan": "MALWARE_SCAN_QUEUE",
} as const satisfies Record<JobKind, string>;

export const PLATFORM_QUEUE_BINDINGS = [
  "DOCUMENT_ANALYSIS_QUEUE",
  "OCR_PROCESSING_QUEUE",
  "DOCUMENT_EXPORT_QUEUE",
  "EMAIL_NOTIFICATIONS_QUEUE",
  "LEGAL_SOURCES_SYNC_QUEUE",
  "DATA_RETENTION_CLEANUP_QUEUE",
  "NOTIFICATIONS_QUEUE",
  "MALWARE_SCAN_QUEUE",
] as const;

/**
 * Malware scanning stays in the source contract but is deliberately not bound
 * until a real scanner and fail-closed consumer have passed staging review.
 */
export const ATTACHED_PLATFORM_QUEUE_BINDINGS = [
  "DOCUMENT_ANALYSIS_QUEUE",
  "OCR_PROCESSING_QUEUE",
  "DOCUMENT_EXPORT_QUEUE",
  "EMAIL_NOTIFICATIONS_QUEUE",
  "LEGAL_SOURCES_SYNC_QUEUE",
  "DATA_RETENTION_CLEANUP_QUEUE",
  "NOTIFICATIONS_QUEUE",
] as const;

export type PlatformQueueBinding =
  (typeof QUEUE_BINDING_BY_KIND)[JobKind];

type QueueBindingEnv = {
  [Binding in PlatformQueueBinding]?: Queue<JobEnvelope>;
};

export type PlatformJobEnv = Omit<
  Env,
  | "ASYNC_RUNTIME_ENABLED"
  | "CRON_ENABLED"
  | PlatformQueueBinding
> & QueueBindingEnv & {
  ASYNC_RUNTIME_ENABLED: string;
  CRON_ENABLED: string;
  LEGAL_ADVICE_INGESTION_ENABLED: string;
  ACCOUNT_DELETION_PURGE_ENABLED: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  IDENTITY_KEYRING?: string;
  STAGING_SYNTHETIC_PROBES_ENABLED?: string;
};

export function expectedQueueName(
  kind: JobKind,
  environment: PlatformJobEnv["APP_ENV"],
): string {
  const stem = queueStemByKind[kind];
  if (!stem) {
    throw new TypeError("Unsupported job kind.");
  }
  return `${environment}-${stem}`;
}

function operationalError(error: unknown): OperationalError {
  if (error instanceof SafeJobError) {
    return { code: error.code, retryable: error.retryable };
  }
  return { code: "JOB_TRANSIENT_FAILURE", retryable: true };
}

function logEvent(
  level: "info" | "error",
  fields: Record<string, string | number | boolean | null>,
): void {
  const entry = JSON.stringify(fields);
  if (level === "error") {
    console.error(entry);
  } else {
    console.log(entry);
  }
}

function writeMetric(
  env: PlatformJobEnv,
  input: {
    queueName: string;
    kind: string;
    status: string;
    durationMs: number;
    correlationId: string;
  },
): void {
  try {
    env.PLATFORM_ANALYTICS.writeDataPoint({
      blobs: [input.queueName, input.kind, input.status],
      doubles: [input.durationMs],
      indexes: [input.correlationId],
    });
  } catch {
    logEvent("error", {
      event: "queue.metric_failed",
      environment: env.APP_ENV,
      queue: input.queueName,
      correlationId: input.correlationId,
    });
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function isoAfter(iso: string, milliseconds: number): string {
  return new Date(new Date(iso).getTime() + milliseconds).toISOString();
}

export function retryDelay(attempts: number): number {
  return Math.min(3_600, 15 * (2 ** Math.max(0, attempts - 1)));
}

async function envelopeHash(envelope: JobEnvelope): Promise<string> {
  return sha256(JSON.stringify({
    schemaVersion: envelope.schemaVersion,
    jobId: envelope.jobId,
    kind: envelope.kind,
    idempotencyKey: envelope.idempotencyKey,
    subjectId: envelope.subjectId,
    workspaceId: envelope.workspaceId ?? null,
    correlationId: envelope.correlationId,
  }));
}

type ClaimResult =
  | { state: "acquired"; leaseOwner: string }
  | { state: "busy" }
  | { state: "conflict" }
  | { state: "terminal" };

async function classifyExistingJob(
  env: PlatformJobEnv,
  envelope: JobEnvelope,
  expectedEnvelopeHash: string,
): Promise<ClaimResult | null> {
  const existing = await env.DB.prepare(`
    SELECT id, idempotency_key, status, envelope_hash
    FROM job_runs
    WHERE idempotency_key = ? OR id = ?
    LIMIT 1
  `).bind(envelope.idempotencyKey, envelope.jobId).first<{
    id: string;
    idempotency_key: string;
    status: string;
    envelope_hash: string;
  }>();

  if (!existing) {
    return null;
  }
  if (
    existing.id !== envelope.jobId ||
    existing.idempotency_key !== envelope.idempotencyKey ||
    existing.envelope_hash !== expectedEnvelopeHash
  ) {
    return { state: "conflict" };
  }
  if (["completed", "rejected", "dead_lettered"].includes(existing.status)) {
    return { state: "terminal" };
  }
  return { state: "busy" };
}

async function claimJob(
  env: PlatformJobEnv,
  input: {
    envelope: JobEnvelope;
    envelopeHash: string;
    messageId: string;
    queueName: string;
    attempts: number;
    now: string;
  },
): Promise<ClaimResult> {
  const leaseOwner = crypto.randomUUID();
  const leaseExpiresAt = isoAfter(input.now, 5 * 60 * 1_000);
  let result: D1Result<unknown>;
  try {
    result = await env.DB.prepare(`
      INSERT INTO job_runs (
        id, queue_name, message_id, job_type, schema_version,
        idempotency_key, subject_id, workspace_id, correlation_id,
        envelope_hash, status, attempt, lease_owner, lease_expires_at,
        next_attempt_at, error_code, started_at, finished_at,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        'running', ?, ?, ?, NULL, NULL, ?, NULL, ?, ?
      )
      ON CONFLICT(idempotency_key) DO UPDATE SET
        queue_name = excluded.queue_name,
        message_id = excluded.message_id,
        attempt = excluded.attempt,
        status = 'running',
        lease_owner = excluded.lease_owner,
        lease_expires_at = excluded.lease_expires_at,
        next_attempt_at = NULL,
        error_code = NULL,
        started_at = excluded.started_at,
        finished_at = NULL,
        updated_at = excluded.updated_at
      WHERE job_runs.envelope_hash = excluded.envelope_hash
        AND job_runs.status NOT IN ('completed', 'rejected', 'dead_lettered')
        AND (
          job_runs.lease_expires_at IS NULL
          OR job_runs.lease_expires_at <= excluded.started_at
        )
        AND (
          job_runs.next_attempt_at IS NULL
          OR job_runs.next_attempt_at <= excluded.started_at
        )
    `).bind(
      input.envelope.jobId,
      input.queueName,
      input.messageId,
      input.envelope.kind,
      input.envelope.schemaVersion,
      input.envelope.idempotencyKey,
      input.envelope.subjectId,
      input.envelope.workspaceId ?? null,
      input.envelope.correlationId,
      input.envelopeHash,
      input.attempts,
      leaseOwner,
      leaseExpiresAt,
      input.now,
      input.now,
      input.now,
    ).run();
  } catch (error) {
    const existing = await classifyExistingJob(
      env,
      input.envelope,
      input.envelopeHash,
    );
    if (existing) {
      return existing;
    }
    throw error;
  }

  if (Number(result.meta.changes ?? 0) > 0) {
    return { state: "acquired", leaseOwner };
  }

  return (
    await classifyExistingJob(env, input.envelope, input.envelopeHash)
  ) ?? { state: "conflict" };
}

async function completeJob(
  env: PlatformJobEnv,
  idempotencyKey: string,
  leaseOwner: string,
  now: string,
): Promise<void> {
  const result = await env.DB.prepare(`
    UPDATE job_runs
    SET status = 'completed',
        lease_owner = NULL,
        lease_expires_at = NULL,
        next_attempt_at = NULL,
        error_code = NULL,
        finished_at = ?,
        updated_at = ?
    WHERE idempotency_key = ?
      AND lease_owner = ?
      AND status = 'running'
  `).bind(now, now, idempotencyKey, leaseOwner).run();

  if (Number(result.meta.changes ?? 0) !== 1) {
    throw new SafeJobError("JOB_LEASE_LOST", true);
  }
}

async function rejectJob(
  env: PlatformJobEnv,
  input: {
    idempotencyKey: string;
    leaseOwner: string;
    errorCode: JobErrorCode;
    now: string;
  },
): Promise<boolean> {
  const result = await env.DB.prepare(`
    UPDATE job_runs
    SET status = 'rejected',
        lease_owner = NULL,
        lease_expires_at = NULL,
        next_attempt_at = NULL,
        error_code = ?,
        finished_at = ?,
        updated_at = ?
    WHERE idempotency_key = ?
      AND lease_owner = ?
      AND status = 'running'
  `).bind(
    input.errorCode,
    input.now,
    input.now,
    input.idempotencyKey,
    input.leaseOwner,
  ).run();
  return Number(result.meta.changes ?? 0) === 1;
}

async function retryJob(
  env: PlatformJobEnv,
  input: {
    idempotencyKey: string;
    leaseOwner: string;
    errorCode: JobErrorCode;
    nextAttemptAt: string;
    now: string;
  },
): Promise<boolean> {
  const result = await env.DB.prepare(`
    UPDATE job_runs
    SET status = 'retrying',
        lease_owner = NULL,
        lease_expires_at = NULL,
        next_attempt_at = ?,
        error_code = ?,
        finished_at = ?,
        updated_at = ?
    WHERE idempotency_key = ?
      AND lease_owner = ?
      AND status = 'running'
  `).bind(
    input.nextAttemptAt,
    input.errorCode,
    input.now,
    input.now,
    input.idempotencyKey,
    input.leaseOwner,
  ).run();
  return Number(result.meta.changes ?? 0) === 1;
}

async function executeJob(
  queueName: string,
  env: PlatformJobEnv,
  envelope: JobEnvelope,
): Promise<void> {
  if (queueName !== expectedQueueName(envelope.kind, env.APP_ENV)) {
    throw new SafeJobError("JOB_QUEUE_MISMATCH", false);
  }
  if (envelope.kind === "email.send") {
    try {
      await executeSecurityEmailJob(env, envelope.subjectId);
      return;
    } catch (error) {
      if (error instanceof SecurityEmailError) {
        throw new SafeJobError(error.code, error.retryable);
      }
      throw error;
    }
  }
  if (envelope.kind === "legal.sync") {
    try {
      await executeLegalSourceFetchRequest(env, envelope.subjectId);
      return;
    } catch (error) {
      if (error instanceof LegalSourceAcquisitionError) {
        throw new SafeJobError(
          "LEGAL_SOURCE_SYNC_FAILED",
          error.retryable,
        );
      }
      throw error;
    }
  }
  if (envelope.kind === "legal.parse") {
    try {
      await executeLegalSourceNormalization(env, envelope.subjectId);
      return;
    } catch (error) {
      if (error instanceof LegalSourceNormalizationError) {
        throw new SafeJobError(
          "LEGAL_SOURCE_PARSE_FAILED",
          error.retryable,
        );
      }
      throw error;
    }
  }
  if (envelope.kind === "cleanup.run") {
    try {
      if (isStagingDeletionProbe(envelope.subjectId)) {
        await prepareStagingDeletionProbe(env, envelope.subjectId);
      }
      await executeAccountDeletionPurge(env, envelope.subjectId);
      return;
    } catch (error) {
      if (error instanceof StagingDeletionProbeError) {
        throw new SafeJobError(error.code, false);
      }
      if (error instanceof AccountDeletionPurgeError) {
        throw new SafeJobError(error.code, error.retryable);
      }
      throw error;
    }
  }
  throw new SafeJobError("JOB_HANDLER_NOT_ENABLED", false);
}

async function processMessage(
  queueName: string,
  message: Message<unknown>,
  env: PlatformJobEnv,
): Promise<void> {
  const parsed = jobEnvelopeSchema.safeParse(message.body);
  if (!parsed.success) {
    logEvent("error", {
      event: "queue.invalid_message",
      environment: env.APP_ENV,
      queue: queueName,
      messageId: message.id,
      errorCode: "JOB_VALIDATION_FAILED",
    });
    message.ack();
    return;
  }

  const envelope = parsed.data;
  const started = Date.now();
  const now = new Date().toISOString();
  let claim: ClaimResult;

  try {
    claim = await claimJob(env, {
      envelope,
      envelopeHash: await envelopeHash(envelope),
      messageId: message.id,
      queueName,
      attempts: message.attempts,
      now,
    });
  } catch {
    logEvent("error", {
      event: "queue.claim_failed",
      environment: env.APP_ENV,
      queue: queueName,
      messageId: message.id,
      correlationId: envelope.correlationId,
      jobId: envelope.jobId,
      errorCode: "JOB_TRANSIENT_FAILURE",
    });
    message.retry({ delaySeconds: retryDelay(message.attempts) });
    return;
  }

  if (claim.state === "terminal") {
    message.ack();
    return;
  }
  if (claim.state === "conflict") {
    logEvent("error", {
      event: "queue.idempotency_conflict",
      environment: env.APP_ENV,
      queue: queueName,
      messageId: message.id,
      correlationId: envelope.correlationId,
      jobId: envelope.jobId,
      errorCode: "JOB_IDEMPOTENCY_CONFLICT",
    });
    message.ack();
    return;
  }
  if (claim.state === "busy") {
    message.retry({ delaySeconds: retryDelay(message.attempts) });
    return;
  }

  try {
    await executeJob(queueName, env, envelope);
    await completeJob(
      env,
      envelope.idempotencyKey,
      claim.leaseOwner,
      new Date().toISOString(),
    );
    writeMetric(env, {
      queueName,
      kind: envelope.kind,
      status: "completed",
      durationMs: Date.now() - started,
      correlationId: envelope.correlationId,
    });
    logEvent("info", {
      event: "queue.completed",
      environment: env.APP_ENV,
      queue: queueName,
      messageId: message.id,
      correlationId: envelope.correlationId,
      jobId: envelope.jobId,
      jobKind: envelope.kind,
      durationMs: Date.now() - started,
    });
    message.ack();
  } catch (error) {
    const failure = operationalError(error);
    const failedAt = new Date().toISOString();

    if (!failure.retryable) {
      try {
        const recorded = await rejectJob(env, {
          idempotencyKey: envelope.idempotencyKey,
          leaseOwner: claim.leaseOwner,
          errorCode: failure.code,
          now: failedAt,
        });
        if (!recorded) {
          message.retry({ delaySeconds: retryDelay(message.attempts) });
          return;
        }
      } catch {
        message.retry({ delaySeconds: retryDelay(message.attempts) });
        return;
      }

      writeMetric(env, {
        queueName,
        kind: envelope.kind,
        status: "rejected",
        durationMs: Date.now() - started,
        correlationId: envelope.correlationId,
      });
      logEvent("error", {
        event: "queue.rejected",
        environment: env.APP_ENV,
        queue: queueName,
        messageId: message.id,
        correlationId: envelope.correlationId,
        jobId: envelope.jobId,
        jobKind: envelope.kind,
        errorCode: failure.code,
      });
      message.ack();
      return;
    }

    const delaySeconds = retryDelay(message.attempts);
    try {
      const recorded = await retryJob(env, {
        idempotencyKey: envelope.idempotencyKey,
        leaseOwner: claim.leaseOwner,
        errorCode: failure.code,
        nextAttemptAt: isoAfter(failedAt, delaySeconds * 1_000),
        now: failedAt,
      });
      if (!recorded) {
        logEvent("error", {
          event: "queue.lease_lost_before_retry",
          environment: env.APP_ENV,
          queue: queueName,
          messageId: message.id,
          correlationId: envelope.correlationId,
          jobId: envelope.jobId,
          errorCode: "JOB_LEASE_LOST",
        });
        message.retry({ delaySeconds });
        return;
      }
    } catch {
      // The queue retry remains the source of truth when bookkeeping is down.
    }
    writeMetric(env, {
      queueName,
      kind: envelope.kind,
      status: "retrying",
      durationMs: Date.now() - started,
      correlationId: envelope.correlationId,
    });
    logEvent("error", {
      event: "queue.retrying",
      environment: env.APP_ENV,
      queue: queueName,
      messageId: message.id,
      correlationId: envelope.correlationId,
      jobId: envelope.jobId,
      jobKind: envelope.kind,
      errorCode: failure.code,
      attempt: message.attempts,
    });
    message.retry({ delaySeconds });
  }
}

export async function handleQueue(
  batch: MessageBatch<unknown>,
  env: PlatformJobEnv,
): Promise<void> {
  if (String(env.ASYNC_RUNTIME_ENABLED) !== "true") {
    logEvent("error", {
      event: "queue.runtime_disabled",
      environment: env.APP_ENV,
      queue: batch.queue,
      errorCode: "ASYNC_RUNTIME_DISABLED",
    });
    batch.retryAll({ delaySeconds: 300 });
    return;
  }
  if (String(env.JOB_SCHEMA_VERSION) !== "1") {
    logEvent("error", {
      event: "queue.schema_version_mismatch",
      environment: env.APP_ENV,
      queue: batch.queue,
      errorCode: "JOB_SCHEMA_VERSION_MISMATCH",
    });
    batch.retryAll({ delaySeconds: 300 });
    return;
  }

  for (const message of batch.messages) {
    try {
      await processMessage(batch.queue, message, env);
    } catch {
      logEvent("error", {
        event: "queue.message_failed",
        environment: env.APP_ENV,
        queue: batch.queue,
        messageId: message.id,
        errorCode: "JOB_TRANSIENT_FAILURE",
      });
      message.retry({ delaySeconds: retryDelay(message.attempts) });
    }
  }
}
