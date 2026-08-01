import { createLegalSourceFetchRequest, type LegalSourceAcquisitionEnv } from "./source-acquisition";

export const LEGAL_CORPUS_SYNC_CRON = "0 19 * * *";
const MAX_SOURCES_PER_KIND = 100;

type SourceKind = "lex" | "advice";
type Candidate = { officialUrl: string; locale: "ru" | "uz"; canonicalId: string };

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
  env: LegalSourceAcquisitionEnv,
  options: { now?: Date } = {},
): Promise<ScheduledCorpusSyncSummary> {
  const now = options.now ?? new Date();
  const timestamp = now.toISOString();
  let started = 0;
  let busy = 0;
  let empty = 0;
  for (const kind of ["lex", "advice"] as const) {
    const candidates = await env.DB.prepare(`
      SELECT official_url AS officialUrl,locale,canonical_id AS canonicalId
      FROM legal_sources
      WHERE source_type=? AND canonical_id IS NOT NULL
        AND official_url IS NOT NULL
      ORDER BY last_checked_at ASC
      LIMIT ?
    `).bind(kind, MAX_SOURCES_PER_KIND).all<Candidate>();
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
      lockKey, candidates.results.length, timestamp, timestamp, timestamp,
    ).run();
    if (Number(created.meta.changes ?? 0) !== 1) {
      busy += 1;
      continue;
    }
    if (candidates.results.length === 0) {
      await env.DB.prepare(`
        UPDATE source_sync_runs
        SET status='failed',finished_at=?,error_count=1,error_summary='LEGAL_SOURCE_CORPUS_EMPTY',updated_at=?
        WHERE id=? AND status='running'
      `).bind(timestamp, timestamp, runId).run();
      empty += 1;
      continue;
    }
    for (const source of candidates.results) {
      await createLegalSourceFetchRequest(env, {
        url: source.officialUrl,
        idempotencyKey: `scheduled_${dayKey(now)}_${kind}_${source.locale}_${source.canonicalId}`,
        requestedByUserId: null,
        correlationId: runId,
      }, { now: () => now });
    }
    started += 1;
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
        sum(CASE WHEN request.status IN ('queued','retrying','running') THEN 1 ELSE 0 END) AS pending
      FROM job_outbox outbox
      INNER JOIN legal_source_fetch_requests request ON request.id=outbox.subject_id
      WHERE outbox.correlation_id=? AND outbox.job_type='legal.sync'
    `).bind(run.id).first<{ total: number; completed: number | null; failed: number | null; pending: number | null }>();
    const total = Number(status?.total ?? 0);
    const succeeded = Number(status?.completed ?? 0);
    const failed = Number(status?.failed ?? 0);
    const pending = Number(status?.pending ?? 0);
    if (total !== run.discoveredCount || pending > 0) continue;
    const finalStatus = failed === 0 && succeeded === run.discoveredCount ? "success" : "failed";
    const result = await env.DB.prepare(`
      UPDATE source_sync_runs
      SET status=?,fetched_count=?,changed_count=0,verified_count=0,error_count=?,
          finished_at=?,error_summary=?,updated_at=?
      WHERE id=? AND status='running'
    `).bind(
      finalStatus, succeeded, failed, now,
      finalStatus === "success" ? null : "LEGAL_SOURCE_CORPUS_INCOMPLETE", now, run.id,
    ).run();
    if (Number(result.meta.changes ?? 0) === 1) completed += 1;
  }
  return completed;
}
