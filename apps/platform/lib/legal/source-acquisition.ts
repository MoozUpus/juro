import { z } from "zod";
import {
  LEGAL_SOURCE_FETCH_ERROR_CODES,
  LegalSourceFetchError,
  classifyLegalSourceUrl,
  fetchLegalSource,
  type FetchedLegalSource,
} from "./source-fetch";
import { reserveLegalSourceCrawlWindow } from "./crawl-window";

const environmentSchema = z.enum(["development", "staging", "production"]);
const identifierSchema = z.string().min(1).max(120).regex(/^[A-Za-z0-9:_-]+$/);
const createRequestSchema = z.object({
  url: z.string().min(1).max(2_048),
  idempotencyKey: identifierSchema,
  requestedByUserId: identifierSchema.nullable().optional(),
  correlationId: identifierSchema.optional(),
}).strict();

export const LEGAL_SOURCE_ACQUISITION_ERROR_CODES = [
  ...LEGAL_SOURCE_FETCH_ERROR_CODES,
  "LEGAL_SOURCE_REQUEST_NOT_FOUND",
  "LEGAL_SOURCE_REQUEST_CONFLICT",
  "LEGAL_SOURCE_REQUEST_CANCELLED",
  "LEGAL_SOURCE_REQUEST_TERMINAL",
  "LEGAL_SOURCE_SYNC_BUSY",
  "LEGAL_SOURCE_STORAGE_FAILED",
  "LEGAL_SOURCE_PERSISTENCE_FAILED",
] as const;

export type LegalSourceAcquisitionErrorCode =
  (typeof LEGAL_SOURCE_ACQUISITION_ERROR_CODES)[number];

export class LegalSourceAcquisitionError extends Error {
  constructor(
    readonly code: LegalSourceAcquisitionErrorCode,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = "LegalSourceAcquisitionError";
  }
}

export type LegalSourceAcquisitionEnv = Pick<
  Env,
  "APP_ENV" | "BUCKET" | "DB"
> & {
  LEGAL_ADVICE_INGESTION_ENABLED: string;
};

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type AcquisitionDependencies = {
  fetchImpl?: FetchLike;
  now?: () => Date;
  wait?: (delayMs: number) => Promise<void>;
};
type FetchRequestRow = {
  id: string;
  environment: "development" | "staging" | "production";
  source_kind: "lex" | "advice";
  locale: "ru" | "uz";
  requested_url: string;
  canonical_id: string;
  idempotency_key: string;
  status: string;
  attempt_count: number;
  source_id: string | null;
  version_id: string | null;
};

export type LegalSourceFetchRequest = {
  id: string;
  sourceKind: "lex" | "advice";
  locale: "ru" | "uz";
  canonicalUrl: string;
  status: string;
};

export type LegalSourceAcquisitionResult = {
  requestId: string;
  sourceId: string;
  versionId: string;
  contentSha256: string;
  rawObjectKey: string;
  changed: boolean;
};

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function nowIso(now: (() => Date) | undefined): string {
  return (now ?? (() => new Date()))().toISOString();
}

function nextMillisecond(iso: string, offset: number): string {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) throw new TypeError("Invalid source-sync time.");
  return new Date(timestamp + offset).toISOString();
}

function isCompletedRunTimestampCollision(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("source_sync_runs_lock_uidx")
    || message.includes("source_sync_runs.lock_key, source_sync_runs.started_at");
}

function acquisitionError(error: unknown): LegalSourceAcquisitionError {
  if (error instanceof LegalSourceAcquisitionError) return error;
  if (error instanceof LegalSourceFetchError) {
    return new LegalSourceAcquisitionError(error.code, error.retryable);
  }
  return new LegalSourceAcquisitionError(
    "LEGAL_SOURCE_PERSISTENCE_FAILED",
    true,
  );
}

async function requestRow(
  db: D1Database,
  requestId: string,
  environment: string,
): Promise<FetchRequestRow | null> {
  return db.prepare(`
    SELECT
      id, environment, source_kind, locale, requested_url, canonical_id,
      idempotency_key, status, attempt_count, source_id, version_id
    FROM legal_source_fetch_requests
    WHERE id = ? AND environment = ?
    LIMIT 1
  `).bind(requestId, environment).first<FetchRequestRow>();
}

type ScheduledCorpusRunRow = { id: string };

async function scheduledCorpusRunId(
  db: D1Database,
  requestId: string,
  environment: string,
): Promise<string | null> {
  const row = await db.prepare(`
    SELECT run.id
    FROM job_outbox AS outbox
    INNER JOIN source_sync_runs AS run ON run.id = outbox.correlation_id
    WHERE outbox.subject_id = ?
      AND outbox.job_type = 'legal.sync'
      AND run.environment = ?
      AND run.run_type = 'scheduled_corpus'
      AND run.status = 'running'
    ORDER BY outbox.created_at DESC
    LIMIT 1
  `).bind(requestId, environment).first<ScheduledCorpusRunRow>();
  return row?.id ?? null;
}


export async function createLegalSourceFetchRequest(
  env: LegalSourceAcquisitionEnv,
  input: z.input<typeof createRequestSchema>,
  dependencies: Pick<AcquisitionDependencies, "now"> = {},
): Promise<LegalSourceFetchRequest> {
  const parsed = createRequestSchema.parse(input);
  const environment = environmentSchema.parse(env.APP_ENV);
  const reference = classifyLegalSourceUrl(parsed.url);
  if (reference.sourceKind === "advice") {
    throw new LegalSourceAcquisitionError(
      "LEGAL_SOURCE_POLICY_DISABLED",
      false,
    );
  }

  const stableHash = await sha256Text(
    `${environment}\n${parsed.idempotencyKey}`,
  );
  const requestId = `lsfetch_${stableHash.slice(0, 32)}`;
  const outboxId = `lsjob_${stableHash.slice(0, 32)}`;
  const outboxIdempotencyKey = `legal_sync_${stableHash.slice(0, 40)}`;
  const timestamp = nowIso(dependencies.now);
  const correlationId = parsed.correlationId
    ?? `lscorr_${stableHash.slice(0, 32)}`;

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO legal_source_fetch_requests (
        id, environment, source_kind, locale, requested_url, canonical_id,
        idempotency_key, status, attempt_count, requested_by_user_id,
        source_id, version_id, error_code, started_at, finished_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, NULL, NULL, NULL, NULL, NULL, ?, ?)
      ON CONFLICT(idempotency_key) DO NOTHING
    `).bind(
      requestId,
      environment,
      reference.sourceKind,
      reference.locale,
      reference.canonicalUrl,
      reference.canonicalId,
      parsed.idempotencyKey,
      parsed.requestedByUserId ?? null,
      timestamp,
      timestamp,
    ),
    env.DB.prepare(`
      INSERT INTO job_outbox (
        id, queue_binding, job_type, schema_version, idempotency_key,
        subject_id, workspace_id, correlation_id, enqueued_at,
        available_at, status, dispatch_attempts, lease_owner,
        lease_expires_at, next_attempt_at, dispatched_at, error_code,
        created_at, updated_at
      ) SELECT
        ?, 'LEGAL_SOURCES_SYNC_QUEUE', 'legal.sync', 1, ?,
        ?, NULL, ?, ?, ?, 'pending', 0, NULL, NULL, NULL, NULL, NULL, ?, ?
      WHERE EXISTS (
        SELECT 1
        FROM legal_source_fetch_requests
        WHERE id = ? AND environment = ?
          AND source_kind = ? AND locale = ?
          AND requested_url = ? AND canonical_id = ?
          AND idempotency_key = ? AND requested_by_user_id IS ?
      )
      ON CONFLICT(idempotency_key) DO NOTHING
    `).bind(
      outboxId,
      outboxIdempotencyKey,
      requestId,
      correlationId,
      timestamp,
      timestamp,
      timestamp,
      timestamp,
      requestId,
      environment,
      reference.sourceKind,
      reference.locale,
      reference.canonicalUrl,
      reference.canonicalId,
      parsed.idempotencyKey,
      parsed.requestedByUserId ?? null,
    ),
  ]);

  const stored = await env.DB.prepare(`
    SELECT id, source_kind, locale, requested_url, requested_by_user_id, status
    FROM legal_source_fetch_requests
    WHERE idempotency_key = ?
    LIMIT 1
  `).bind(parsed.idempotencyKey).first<{
    id: string;
    source_kind: "lex" | "advice";
    locale: "ru" | "uz";
    requested_url: string;
    requested_by_user_id: string | null;
    status: string;
  }>();
  if (
    !stored
    || stored.id !== requestId
    || stored.source_kind !== reference.sourceKind
    || stored.locale !== reference.locale
    || stored.requested_url !== reference.canonicalUrl
    || stored.requested_by_user_id !== (parsed.requestedByUserId ?? null)
  ) {
    throw new LegalSourceAcquisitionError(
      "LEGAL_SOURCE_REQUEST_CONFLICT",
      false,
    );
  }
  return {
    id: stored.id,
    sourceKind: stored.source_kind,
    locale: stored.locale,
    canonicalUrl: stored.requested_url,
    status: stored.status,
  };
}

async function storeRawSource(
  bucket: R2Bucket,
  fetched: FetchedLegalSource,
): Promise<string> {
  const rawObjectKey = [
    "legal-sources",
    "raw",
    fetched.sourceKind,
    fetched.locale,
    fetched.contentSha256.slice(0, 2),
    `${fetched.contentSha256}.html`,
  ].join("/");
  try {
    const existing = await bucket.head(rawObjectKey);
    if (!existing) {
      const stored = await bucket.put(rawObjectKey, fetched.bytes, {
        httpMetadata: {
          contentType: "text/html; charset=utf-8",
          cacheControl: "private, no-store",
        },
        customMetadata: {
          sourceKind: fetched.sourceKind,
          locale: fetched.locale,
          canonicalId: fetched.canonicalId,
          contentSha256: fetched.contentSha256,
          fetchedAt: fetched.fetchedAt,
        },
      });
      if (!stored) {
        throw new TypeError("R2 put did not persist the legal source object.");
      }
    }
    return rawObjectKey;
  } catch {
    throw new LegalSourceAcquisitionError(
      "LEGAL_SOURCE_STORAGE_FAILED",
      true,
    );
  }
}

async function persistFetchedSource(
  env: LegalSourceAcquisitionEnv,
  input: {
    request: FetchRequestRow;
    runId: string;
    scheduledCorpus: boolean;
    fetched: FetchedLegalSource;
    rawObjectKey: string;
    now: string;
  },
): Promise<LegalSourceAcquisitionResult> {
  const sourceStableHash = await sha256Text(
    `${input.fetched.canonicalUrl}\n${input.fetched.locale}`,
  );
  const proposedSourceId = `lsource_${sourceStableHash.slice(0, 32)}`;
  const title = input.fetched.sourceKind === "lex"
    ? `Lex.uz — document ${input.fetched.canonicalId}`
    : `Advice.uz — scenario ${input.fetched.canonicalId}`;

  const existingSource = await env.DB.prepare(`
    SELECT id, canonical_id, source_type
    FROM legal_sources
    WHERE official_url = ? AND locale = ?
    LIMIT 1
  `).bind(
    input.fetched.canonicalUrl,
    input.fetched.locale,
  ).first<{
    id: string;
    canonical_id: string | null;
    source_type: string;
  }>();
  if (
    existingSource
    && (
      existingSource.source_type !== input.fetched.sourceKind
      || (
        existingSource.canonical_id !== null
        && existingSource.canonical_id !== input.fetched.canonicalId
      )
    )
  ) {
    throw new LegalSourceAcquisitionError(
      "LEGAL_SOURCE_REQUEST_CONFLICT",
      false,
    );
  }

  await env.DB.prepare(`
    INSERT INTO legal_sources (
      id, canonical_id, official_url, act_title, act_identifier,
      published_at, revision_date, locale, source_type, status,
      verification_state, content_sha256, fetched_at, verified_at,
      verified_by_user_id, verification_notes, effective_at, expires_at,
      last_checked_at, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, NULL, NULL, ?, ?, 'pending_review',
      'fetched', ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, ?
    )
    ON CONFLICT(official_url, locale) DO UPDATE SET
      canonical_id = CASE
        WHEN legal_sources.verification_state = 'verified'
          THEN legal_sources.canonical_id
        ELSE excluded.canonical_id
      END,
      act_identifier = CASE
        WHEN legal_sources.verification_state = 'verified'
          THEN legal_sources.act_identifier
        ELSE excluded.act_identifier
      END,
      source_type = CASE
        WHEN legal_sources.verification_state = 'verified'
          THEN legal_sources.source_type
        ELSE excluded.source_type
      END,
      verification_state = CASE
        WHEN legal_sources.verification_state = 'verified'
          THEN legal_sources.verification_state
        ELSE 'fetched'
      END,
      content_sha256 = CASE
        WHEN legal_sources.verification_state = 'verified'
          THEN legal_sources.content_sha256
        ELSE excluded.content_sha256
      END,
      fetched_at = excluded.fetched_at,
      last_checked_at = excluded.last_checked_at,
      updated_at = excluded.updated_at
  `).bind(
    proposedSourceId,
    input.fetched.canonicalId,
    input.fetched.canonicalUrl,
    title,
    input.fetched.canonicalId,
    input.fetched.locale,
    input.fetched.sourceKind,
    input.fetched.contentSha256,
    input.fetched.fetchedAt,
    input.now,
    input.now,
    input.now,
  ).run();

  const storedSource = await env.DB.prepare(`
    SELECT id
    FROM legal_sources
    WHERE official_url = ? AND locale = ?
    LIMIT 1
  `).bind(
    input.fetched.canonicalUrl,
    input.fetched.locale,
  ).first<{ id: string }>();
  if (!storedSource) {
    throw new LegalSourceAcquisitionError(
      "LEGAL_SOURCE_PERSISTENCE_FAILED",
      true,
    );
  }

  const versionStableHash = await sha256Text(
    `${storedSource.id}\n${input.fetched.locale}\n${input.fetched.contentSha256}`,
  );
  const proposedVersionId = `lsversion_${versionStableHash.slice(0, 32)}`;
  const metadataJson = JSON.stringify({
    canonicalUrl: input.fetched.canonicalUrl,
    robotsUrl: input.fetched.robotsUrl,
    contentType: input.fetched.contentType,
    bytes: input.fetched.bytes.byteLength,
    etag: input.fetched.etag,
    lastModified: input.fetched.lastModified,
  });
  const versionWrite = await env.DB.prepare(`
    INSERT INTO legal_source_versions (
      id, source_id, external_version_id, language, status,
      content_sha256, raw_object_key, parsed_object_key,
      published_at, effective_at, expires_at, fetched_at,
      verified_at, verified_by_user_id, metadata_json,
      created_at, updated_at
    ) VALUES (
      ?, ?, NULL, ?, 'pending_review', ?, ?, NULL,
      NULL, NULL, NULL, ?, NULL, NULL, ?, ?, ?
    )
    ON CONFLICT(source_id, language, content_sha256) DO NOTHING
  `).bind(
    proposedVersionId,
    storedSource.id,
    input.fetched.locale,
    input.fetched.contentSha256,
    input.rawObjectKey,
    input.fetched.fetchedAt,
    metadataJson,
    input.now,
    input.now,
  ).run();
  const changed = Number(versionWrite.meta.changes ?? 0) === 1;

  const storedVersion = await env.DB.prepare(`
    SELECT id, status, parsed_object_key
    FROM legal_source_versions
    WHERE source_id = ? AND language = ? AND content_sha256 = ?
    LIMIT 1
  `).bind(
    storedSource.id,
    input.fetched.locale,
    input.fetched.contentSha256,
  ).first<{ id: string; status: string; parsed_object_key: string | null }>();
  if (!storedVersion) {
    throw new LegalSourceAcquisitionError(
      "LEGAL_SOURCE_PERSISTENCE_FAILED",
      true,
    );
  }

  const reviewStableHash = await sha256Text(
    `${storedVersion.id}\nnew_source_version`,
  );
  const reviewId = `lsreview_${reviewStableHash.slice(0, 32)}`;
  const finalStatements: D1PreparedStatement[] = [];
  if (storedVersion.status === "pending_review") {
    finalStatements.push(env.DB.prepare(`
      INSERT INTO legal_review_queue (
        id, source_id, version_id, reason_code, confidence,
        status, assigned_to_user_id, decision, decided_at,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, 'new_source_version', 'low',
        'pending', NULL, NULL, NULL, ?, ?
      )
      ON CONFLICT(version_id, reason_code) DO NOTHING
    `).bind(
      reviewId,
      storedSource.id,
      storedVersion.id,
      input.now,
      input.now,
    ));
  }
  if (
    storedVersion.status === "pending_review"
    && storedVersion.parsed_object_key === null
  ) {
    const parseStableHash = await sha256Text(
      `${storedVersion.id}\nlegal.parse\njuro-legal-blocks-v1`,
    );
    finalStatements.push(env.DB.prepare(`
      INSERT INTO job_outbox (
        id, queue_binding, job_type, schema_version, idempotency_key,
        subject_id, workspace_id, correlation_id, enqueued_at,
        available_at, status, dispatch_attempts, lease_owner,
        lease_expires_at, next_attempt_at, dispatched_at, error_code,
        created_at, updated_at
      ) VALUES (
        ?, 'LEGAL_SOURCES_SYNC_QUEUE', 'legal.parse', 1, ?,
        ?, NULL, ?, ?, ?, 'pending', 0, NULL, NULL, NULL, NULL, NULL, ?, ?
      )
      ON CONFLICT(idempotency_key) DO NOTHING
    `).bind(
      `lsparsejob_${parseStableHash.slice(0, 32)}`,
      `legal_parse_${parseStableHash.slice(0, 40)}`,
      storedVersion.id,
      `lsparsecorr_${parseStableHash.slice(0, 32)}`,
      input.now,
      input.now,
      input.now,
      input.now,
    ));
  }
  const requestResultIndex = finalStatements.length;
  finalStatements.push(env.DB.prepare(`
    UPDATE legal_source_fetch_requests
    SET status = 'completed',
        source_id = ?,
        version_id = ?,
        error_code = NULL,
        finished_at = ?,
        updated_at = ?
    WHERE id = ? AND environment = ? AND status = 'running'
  `).bind(
    storedSource.id,
    storedVersion.id,
    input.now,
    input.now,
    input.request.id,
    env.APP_ENV,
  ));
  const runResultIndex = input.scheduledCorpus ? null : finalStatements.length;
  if (!input.scheduledCorpus) {
    finalStatements.push(env.DB.prepare(`
      UPDATE source_sync_runs
      SET status = 'success',
          discovered_count = 1,
          fetched_count = 1,
          changed_count = ?,
          verified_count = 0,
          error_count = 0,
          finished_at = ?,
          error_summary = NULL,
          updated_at = ?
      WHERE id = ? AND status = 'running'
    `).bind(
      changed ? 1 : 0,
      input.now,
      input.now,
      input.runId,
    ));
  }
  const finalResults = await env.DB.batch(finalStatements);
  if (
    Number(finalResults[requestResultIndex]?.meta.changes ?? 0) !== 1
    || (runResultIndex !== null
      && Number(finalResults[runResultIndex]?.meta.changes ?? 0) !== 1)
  ) {
    throw new LegalSourceAcquisitionError(
      "LEGAL_SOURCE_PERSISTENCE_FAILED",
      true,
    );
  }

  return {
    requestId: input.request.id,
    sourceId: storedSource.id,
    versionId: storedVersion.id,
    contentSha256: input.fetched.contentSha256,
    rawObjectKey: input.rawObjectKey,
    changed,
  };
}

async function recordFailure(
  env: LegalSourceAcquisitionEnv,
  input: {
    request: FetchRequestRow;
    runId: string;
    scheduledCorpus: boolean;
    error: LegalSourceAcquisitionError;
    now: string;
  },
): Promise<void> {
  const errorId = `lserror_${crypto.randomUUID().replaceAll("-", "")}`;
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO source_sync_errors (
        id, run_id, source_url, external_id, error_code,
        retryable, safe_summary, occurred_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      errorId,
      input.runId,
      input.request.requested_url,
      input.request.canonical_id,
      input.error.code,
      input.error.retryable ? 1 : 0,
      input.error.code,
      input.now,
    ),
    ...(input.scheduledCorpus ? [] : [env.DB.prepare(`
      UPDATE source_sync_runs
      SET status = 'failed',
          discovered_count = 1,
          fetched_count = 0,
          changed_count = 0,
          verified_count = 0,
          error_count = 1,
          finished_at = ?,
          error_summary = ?,
          updated_at = ?
      WHERE id = ? AND status = 'running'
    `).bind(
      input.now,
      input.error.code,
      input.now,
      input.runId,
    )]),
    env.DB.prepare(`
      UPDATE legal_source_fetch_requests
      SET status = ?,
          error_code = ?,
          finished_at = CASE WHEN ? = 'failed' THEN ? ELSE NULL END,
          updated_at = ?
      WHERE id = ? AND environment = ?
    `).bind(
      input.error.retryable ? "retrying" : "failed",
      input.error.code,
      input.error.retryable ? "retrying" : "failed",
      input.now,
      input.now,
      input.request.id,
      env.APP_ENV,
    ),
  ]);
}

export async function executeLegalSourceFetchRequest(
  env: LegalSourceAcquisitionEnv,
  requestId: string,
  dependencies: AcquisitionDependencies = {},
): Promise<LegalSourceAcquisitionResult> {
  identifierSchema.parse(requestId);
  const environment = environmentSchema.parse(env.APP_ENV);
  const request = await requestRow(env.DB, requestId, environment);
  if (!request) {
    throw new LegalSourceAcquisitionError(
      "LEGAL_SOURCE_REQUEST_NOT_FOUND",
      false,
    );
  }
  if (request.status === "completed" && request.source_id && request.version_id) {
    const existingVersion = await env.DB.prepare(`
      SELECT content_sha256, raw_object_key
      FROM legal_source_versions
      WHERE id = ? AND source_id = ?
      LIMIT 1
    `).bind(request.version_id, request.source_id).first<{
      content_sha256: string;
      raw_object_key: string;
    }>();
    if (!existingVersion) {
      throw new LegalSourceAcquisitionError(
        "LEGAL_SOURCE_PERSISTENCE_FAILED",
        true,
      );
    }
    try {
      if (!await env.BUCKET.head(existingVersion.raw_object_key)) {
        throw new TypeError("Completed legal source object is missing.");
      }
    } catch {
      throw new LegalSourceAcquisitionError(
        "LEGAL_SOURCE_STORAGE_FAILED",
        true,
      );
    }
    return {
      requestId: request.id,
      sourceId: request.source_id,
      versionId: request.version_id,
      contentSha256: existingVersion.content_sha256,
      rawObjectKey: existingVersion.raw_object_key,
      changed: false,
    };
  }
  if (request.status === "cancelled") {
    throw new LegalSourceAcquisitionError(
      "LEGAL_SOURCE_REQUEST_CANCELLED",
      false,
    );
  }
  if (request.status === "failed") {
    throw new LegalSourceAcquisitionError(
      "LEGAL_SOURCE_REQUEST_TERMINAL",
      false,
    );
  }

  const initialStartedAt = nowIso(dependencies.now);
  let startedAt = initialStartedAt;
  const scheduledRunId = await scheduledCorpusRunId(env.DB, request.id, environment);
  const scheduledCorpus = scheduledRunId !== null;
  const runId = scheduledRunId ?? `lsrun_${crypto.randomUUID().replaceAll("-", "")}`;
  try {
    let started = false;
    for (let offset = 0; offset < 4; offset += 1) {
      const startStatements: D1PreparedStatement[] = [env.DB.prepare(`
      UPDATE legal_source_fetch_requests
      SET status = 'running',
          attempt_count = attempt_count + 1,
          error_code = NULL,
          started_at = ?,
          finished_at = NULL,
          updated_at = ?
      WHERE id = ? AND environment = ?
        AND status IN ('queued','retrying','running')
    `).bind(startedAt, startedAt, request.id, environment)];
    if (!scheduledCorpus) {
      startStatements.push(env.DB.prepare(`
        INSERT INTO source_sync_runs (
          id, environment, source_kind, run_type, status, lock_key,
          discovered_count, fetched_count, changed_count, verified_count,
          error_count, started_at, finished_at, error_summary,
          created_at, updated_at
        ) VALUES (
          ?, ?, ?, 'single_source_fetch', 'running', ?,
          0, 0, 0, 0, 0, ?, NULL, NULL, ?, ?
        )
      `).bind(
        runId,
        environment,
        request.source_kind,
        `${environment}:${request.source_kind}`,
        startedAt,
        startedAt,
        startedAt,
      ));
      }
      try {
        const startResults = await env.DB.batch(startStatements);
        if (Number(startResults[0]?.meta.changes ?? 0) !== 1) {
          if (!scheduledCorpus) {
            const failedAt = nowIso(dependencies.now);
            await env.DB.prepare(`
          UPDATE source_sync_runs
          SET status = 'failed', finished_at = ?, error_count = 1,
              error_summary = 'LEGAL_SOURCE_REQUEST_TERMINAL', updated_at = ?
          WHERE id = ? AND status = 'running'
        `).bind(failedAt, failedAt, runId).run();
          }
          throw new LegalSourceAcquisitionError(
            "LEGAL_SOURCE_REQUEST_TERMINAL",
            false,
          );
        }
        started = true;
        break;
      } catch (error) {
        if (
          !scheduledCorpus
          && offset < 3
          && isCompletedRunTimestampCollision(error)
        ) {
          startedAt = nextMillisecond(initialStartedAt, offset + 1);
          continue;
        }
        throw error;
      }
    }
    if (!started) {
      throw new LegalSourceAcquisitionError("LEGAL_SOURCE_SYNC_BUSY", true);
    }
  } catch (error) {
    if (error instanceof LegalSourceAcquisitionError) throw error;
    throw new LegalSourceAcquisitionError("LEGAL_SOURCE_SYNC_BUSY", true);
  }

  try {
    const reserve = dependencies.wait ?? (async (delayMs: number) => {
      const reference = classifyLegalSourceUrl(request.requested_url);
      const reserved = await reserveLegalSourceCrawlWindow({
        db: env.DB,
        environment,
        host: reference.host,
        delayMs,
        now: nowIso(dependencies.now),
      });
      if (!reserved) {
        throw new LegalSourceFetchError("LEGAL_SOURCE_CRAWL_WINDOW_BUSY", true);
      }
    });
    const fetched = await fetchLegalSource(request.requested_url, {
      adviceEnabled: false,
      fetchImpl: dependencies.fetchImpl,
      now: dependencies.now,
      wait: reserve,
    });
    if (
      fetched.sourceKind !== request.source_kind
      || fetched.locale !== request.locale
      || fetched.canonicalId !== request.canonical_id
    ) {
      throw new LegalSourceAcquisitionError(
        "LEGAL_SOURCE_REQUEST_CONFLICT",
        false,
      );
    }
    const rawObjectKey = await storeRawSource(env.BUCKET, fetched);
    return await persistFetchedSource(env, {
      request,
      runId,
      scheduledCorpus,
      fetched,
      rawObjectKey,
      now: nowIso(dependencies.now),
    });
  } catch (error) {
    const safeError = acquisitionError(error);
    try {
      await recordFailure(env, {
        request,
        runId,
        scheduledCorpus,
        error: safeError,
        now: nowIso(dependencies.now),
      });
    } catch {
      // The job lease remains retryable if failure bookkeeping is unavailable.
    }
    throw safeError;
  }
}
