import { createLegalSourceFetchRequest, type LegalSourceAcquisitionEnv } from "./source-acquisition";
import {
  discoverAdviceSitemapDocuments,
  discoverLexRssDocuments,
  LegalSourceDiscoveryError,
} from "./source-discovery";

export const LEGAL_CORPUS_SYNC_CRON = "0 19 * * *";
const MAX_SOURCES_PER_KIND = 100;
const MAX_DISCOVERED_ADVICE_SOURCES = 20;
const STALE_FETCH_RECOVERY_MS = 15 * 60 * 1_000;
const STALE_FETCH_RECOVERY_BATCH_SIZE = 1;

type SourceKind = "lex" | "advice";
type Candidate = { officialUrl: string; locale: "ru" | "uz"; canonicalId: string };
type DiscoveryCandidate = Candidate;

export type ScheduledCorpusSyncSummary = {
  started: number;
  busy: number;
  empty: number;
};

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function sourceRunId(kind: SourceKind, now: Date): string {
  return `lscorpus_${kind}_${dayKey(now).replaceAll("-", "")}`;
}

export async function startScheduledCorpusSync(
  env: LegalSourceAcquisitionEnv & {
    LEGAL_ADVICE_SITEMAP_DISCOVERY_ENABLED?: string;
    LEGAL_LEX_RSS_DISCOVERY_ENABLED?: string;
  },
  options: {
    now?: Date;
    discoverAdvice?: () => Promise<DiscoveryCandidate[]>;
    discoverLex?: () => Promise<DiscoveryCandidate[]>;
    discoveryWait?: (delayMs: number) => Promise<void>;
  } = {},
): Promise<ScheduledCorpusSyncSummary> {
  const now = options.now ?? new Date();
  const timestamp = now.toISOString();
  let started = 0;
  let busy = 0;
  let empty = 0;
  for (const kind of ["lex", "advice"] as const) {
    const runId = sourceRunId(kind, now);
    const lockKey = `${env.APP_ENV}:${kind}:scheduled_corpus`;
    const created = await env.DB.prepare(`
      INSERT INTO source_sync_runs (
        id,environment,source_kind,run_type,status,lock_key,
        discovered_count,fetched_count,changed_count,verified_count,error_count,
        started_at,finished_at,error_summary,created_at,updated_at
      ) VALUES (?,?,?,'scheduled_corpus',?,?,?,0,0,0,0,?,NULL,NULL,?,?)
      ON CONFLICT DO NOTHING
    `).bind(
      runId, env.APP_ENV, kind,
      "running",
      lockKey, 0, timestamp, timestamp, timestamp,
    ).run();
    if (Number(created.meta.changes ?? 0) !== 1) {
      busy += 1;
      continue;
    }
    try {
      const stored = await env.DB.prepare(`
        SELECT official_url AS officialUrl,locale,canonical_id AS canonicalId
        FROM legal_sources
        WHERE source_type=? AND canonical_id IS NOT NULL
          AND official_url IS NOT NULL
        ORDER BY last_checked_at ASC
        LIMIT ?
      `).bind(kind, MAX_SOURCES_PER_KIND).all<Candidate>();
      let discoveryError: string | null = null;
      let discovered: DiscoveryCandidate[] = [];
      const discoveryEnabled = kind === "lex"
        ? env.LEGAL_LEX_RSS_DISCOVERY_ENABLED === "true"
        : env.LEGAL_ADVICE_SITEMAP_DISCOVERY_ENABLED === "true";
      if (discoveryEnabled) {
        try {
          const discovery = kind === "lex"
            ? options.discoverLex
              ? await options.discoverLex()
              : (await discoverLexRssDocuments({
                maxDocuments: 40,
                wait: options.discoveryWait,
              })).candidates.map((candidate) => ({
                officialUrl: candidate.canonicalUrl,
                locale: candidate.locale,
                canonicalId: candidate.canonicalId,
              }))
            : options.discoverAdvice
              ? await options.discoverAdvice()
              : (await discoverAdviceSitemapDocuments({
                maxDocuments: MAX_DISCOVERED_ADVICE_SOURCES,
                wait: options.discoveryWait,
              })).candidates.map((candidate) => ({
                officialUrl: candidate.canonicalUrl,
                locale: candidate.locale,
                canonicalId: candidate.canonicalId,
              }));
          discovered = discovery;
        } catch (error) {
          discoveryError = error instanceof LegalSourceDiscoveryError
            ? error.code
            : "LEGAL_SOURCE_DISCOVERY_UNAVAILABLE";
        }
      }
      const candidates = [...new Map(
        [...discovered, ...stored.results].map((candidate) => [candidate.officialUrl, candidate]),
      ).values()].slice(0, MAX_SOURCES_PER_KIND);
      await env.DB.prepare(`
        UPDATE source_sync_runs SET discovered_count=?,updated_at=?
        WHERE id=? AND status='running'
      `).bind(candidates.length, timestamp, runId).run();
      if (candidates.length === 0) {
        await env.DB.prepare(`
          UPDATE source_sync_runs
          SET status='failed',finished_at=?,error_count=1,error_summary=?,updated_at=?
          WHERE id=? AND status='running'
        `).bind(timestamp, discoveryError ?? "LEGAL_SOURCE_CORPUS_EMPTY", timestamp, runId).run();
        empty += 1;
        continue;
      }
      for (const source of candidates) {
        await createLegalSourceFetchRequest(env, {
          url: source.officialUrl,
          idempotencyKey: `scheduled_${dayKey(now)}_${kind}_${source.locale}_${source.canonicalId}`,
          requestedByUserId: null,
          correlationId: runId,
        }, { now: () => now });
      }
      started += 1;
    } catch (error) {
      await env.DB.prepare(`
        UPDATE source_sync_runs
        SET status='failed',finished_at=?,error_count=1,error_summary=?,updated_at=?
        WHERE id=? AND status='running'
      `).bind(timestamp, "LEGAL_SOURCE_CORPUS_START_FAILED", timestamp, runId).run();
      throw error;
    }
  }
  return { started, busy, empty };
}

export async function reconcileScheduledCorpusSyncRuns(
  env: Pick<LegalSourceAcquisitionEnv, "APP_ENV" | "DB">,
  options: { now?: Date } = {},
): Promise<number> {
  const now = (options.now ?? new Date()).toISOString();
  const runs = await env.DB.prepare(`
    SELECT id,source_kind AS sourceKind,discovered_count AS discoveredCount
    FROM source_sync_runs
    WHERE environment=? AND run_type='scheduled_corpus' AND status='running'
    ORDER BY started_at ASC LIMIT 8
  `).bind(env.APP_ENV).all<{ id: string; sourceKind: SourceKind; discoveredCount: number }>();
  let completed = 0;
  for (const run of runs.results) {
    const status = await env.DB.prepare(`
      SELECT
        count(*) AS total,
        sum(CASE WHEN request.status='completed' THEN 1 ELSE 0 END) AS completed,
        sum(CASE WHEN request.status IN ('failed','cancelled') THEN 1 ELSE 0 END) AS failed,
        sum(CASE WHEN request.status IN ('queued','retrying','running') THEN 1 ELSE 0 END) AS pending,
        sum(CASE WHEN request.status='completed' AND EXISTS (
          SELECT 1
          FROM legal_source_current_activations activation
          INNER JOIN legal_sources source
            ON source.id=activation.source_id
          INNER JOIN legal_source_versions version
            ON version.id=activation.version_id AND version.source_id=source.id
          INNER JOIN legal_source_publications publication
            ON publication.id=activation.publication_id
           AND publication.source_id=source.id
           AND publication.version_id=version.id
          WHERE activation.source_id=request.source_id
            AND activation.version_id=request.version_id
            AND source.source_type=?
            AND source.status='verified'
            AND source.verification_state='verified'
            AND version.status='verified'
        ) THEN 1 ELSE 0 END) AS verified
      FROM job_outbox outbox
      INNER JOIN legal_source_fetch_requests request ON request.id=outbox.subject_id
      WHERE outbox.correlation_id=? AND outbox.job_type='legal.sync'
    `).bind(run.sourceKind, run.id).first<{
      total: number;
      completed: number | null;
      failed: number | null;
      pending: number | null;
      verified: number | null;
    }>();
    const total = Number(status?.total ?? 0);
    const succeeded = Number(status?.completed ?? 0);
    const failed = Number(status?.failed ?? 0);
    const pending = Number(status?.pending ?? 0);
    const verified = Number(status?.verified ?? 0);
    const changed = Math.max(0, succeeded - verified);
    if (total !== run.discoveredCount || pending > 0) continue;
    const complete = failed === 0 && succeeded === run.discoveredCount;
    const fullyVerified = complete && verified === run.discoveredCount && changed === 0;
    const finalStatus = fullyVerified ? "success" : complete ? "partial" : "failed";
    const result = await env.DB.prepare(`
      UPDATE source_sync_runs
      SET status=?,fetched_count=?,changed_count=?,verified_count=?,error_count=?,
          finished_at=?,error_summary=?,updated_at=?
      WHERE id=? AND status='running'
    `).bind(
      finalStatus, succeeded, changed, verified, failed, now,
      finalStatus === "success"
        ? null
        : finalStatus === "partial"
          ? "LEGAL_SOURCE_CORPUS_REVIEW_REQUIRED"
          : "LEGAL_SOURCE_CORPUS_INCOMPLETE",
      now,
      run.id,
    ).run();
    if (Number(result.meta.changes ?? 0) === 1) completed += 1;
  }
  return completed;
}

/**
 * Cloudflare Queues can exhaust a message's delivery budget while a source host
 * is still enforcing a robots.txt crawl window. The request remains retryable,
 * but its outbox row is already marked dispatched, so ordinary dispatch cannot
 * deliver it again. Requeue one stale, fenced job per scheduled invocation.
 *
 * The original job id and idempotency key are retained. A late Queue delivery
 * therefore races safely through the existing job lease rather than fetching a
 * source twice. Limiting recovery to one item keeps every retry behind the
 * host's declared crawl window.
 */
export async function recoverStaleScheduledCorpusFetchRequests(
  env: Pick<LegalSourceAcquisitionEnv, "APP_ENV" | "DB">,
  options: {
    now?: Date;
    staleAfterMs?: number;
    limit?: number;
  } = {},
): Promise<number> {
  const now = options.now ?? new Date();
  const staleAfterMs = Math.max(60_000, Math.trunc(
    options.staleAfterMs ?? STALE_FETCH_RECOVERY_MS,
  ));
  const limit = Math.max(1, Math.min(
    STALE_FETCH_RECOVERY_BATCH_SIZE,
    Math.trunc(options.limit ?? STALE_FETCH_RECOVERY_BATCH_SIZE),
  ));
  const timestamp = now.toISOString();
  const cutoff = new Date(now.getTime() - staleAfterMs).toISOString();
  const candidates = await env.DB.prepare(`
    SELECT outbox.id AS outboxId
    FROM job_outbox AS outbox
    INNER JOIN legal_source_fetch_requests AS request
      ON request.id=outbox.subject_id
    INNER JOIN source_sync_runs AS run
      ON run.id=outbox.correlation_id
    INNER JOIN job_runs AS job
      ON job.idempotency_key=outbox.idempotency_key
    WHERE outbox.job_type='legal.sync'
      AND outbox.queue_binding='LEGAL_SOURCES_SYNC_QUEUE'
      AND outbox.status='dispatched'
      AND outbox.updated_at<=?
      AND request.environment=?
      AND request.status='retrying'
      AND request.updated_at<=?
      AND run.environment=?
      AND run.run_type='scheduled_corpus'
      AND run.status='running'
      AND job.status='retrying'
      AND job.next_attempt_at IS NOT NULL
      AND job.next_attempt_at<=?
    ORDER BY request.updated_at ASC, outbox.created_at ASC
    LIMIT ?
  `).bind(
    cutoff,
    env.APP_ENV,
    cutoff,
    env.APP_ENV,
    timestamp,
    limit,
  ).all<{ outboxId: string }>();

  let recovered = 0;
  for (const candidate of candidates.results) {
    const result = await env.DB.prepare(`
      UPDATE job_outbox
      SET status='pending',
          lease_owner=NULL,
          lease_expires_at=NULL,
          next_attempt_at=NULL,
          error_code='LEGAL_SOURCE_RETRY_RECOVERY',
          updated_at=?
      WHERE id=?
        AND status='dispatched'
        AND updated_at<=?
    `).bind(timestamp, candidate.outboxId, cutoff).run();
    recovered += Number(result.meta.changes ?? 0);
  }
  return recovered;
}
