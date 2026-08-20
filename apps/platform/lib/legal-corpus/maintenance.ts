import type { LegalCorpusQueueEnv } from "./ingestion";
import { featureEnabled } from "./trust";

export type LegalCorpusMaintenanceCadence = "daily" | "weekly" | "monthly";

export type LegalCorpusMaintenanceResult = {
  localDate: string;
  dailyQueued: number;
  weeklyQueued: number;
  monthlyQueued: number;
  catalogCheckpointsReset: number;
};

function tashkentDateParts(now: Date): { date: string; dayOfMonth: number; weekday: number } {
  const local = new Date(now.getTime() + 5 * 60 * 60_000);
  return {
    date: local.toISOString().slice(0, 10),
    dayOfMonth: local.getUTCDate(),
    weekday: local.getUTCDay(),
  };
}

function periodKey(cadence: LegalCorpusMaintenanceCadence, localDate: string): string {
  if (cadence === "monthly") return localDate.slice(0, 7);
  if (cadence === "weekly") {
    const date = new Date(`${localDate}T00:00:00.000Z`);
    const monday = new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * 86_400_000);
    return monday.toISOString().slice(0, 10);
  }
  return localDate;
}

async function enqueueRefresh(
  env: LegalCorpusQueueEnv,
  input: { cadence: LegalCorpusMaintenanceCadence; now: Date; localDate: string },
): Promise<number> {
  const timestamp = input.now.toISOString();
  const scope = `${input.cadence}:${periodKey(input.cadence, input.localDate)}`;
  const cutoff = new Date(input.now.getTime() - (input.cadence === "daily" ? 24 : 7 * 24) * 60 * 60_000).toISOString();
  const cadenceFilter = input.cadence === "daily"
    ? `AND variant.last_verified_at<=?
       AND (lower(coalesce(document.document_type,'')) LIKE '%code%'
         OR lower(coalesce(document.document_type,'')) LIKE '%kodeks%'
         OR lower(coalesce(document.document_type,'')) LIKE '%кодекс%'
         OR lower(document.title) LIKE '%kodeks%'
         OR lower(document.title) LIKE '%кодекс%'
         OR lower(document.title) LIKE '%konstituts%'
         OR lower(document.title) LIKE '%конституц%')`
    : input.cadence === "weekly"
      ? "AND variant.last_verified_at<=?"
      : "";
  const limit = input.cadence === "daily" ? "LIMIT 75" : "";
  const bindings: Array<string> = [scope, timestamp, scope, timestamp, timestamp];
  if (input.cadence !== "monthly") bindings.push(cutoff);
  const result = await env.DB.prepare(`INSERT INTO legal_corpus_ingestion_jobs
      (id,job_type,status,provider,canonical_document_id,variant_id,source_url,language,
       idempotency_key,attempt_count,max_attempts,next_attempt_at,last_error_code,
       correlation_id,created_at,updated_at)
    SELECT 'legal-refresh:'||lower(hex(randomblob(16))),'verify','queued','lex_uz',
      document.id,variant.id,variant.source_url,variant.language,
      'refresh:'||?||':'||variant.id,0,5,?,NULL,'legal-corpus-maintenance:'||?, ?, ?
    FROM legal_corpus_variants AS variant
    INNER JOIN legal_corpus_documents AS document ON document.id=variant.document_id
    WHERE document.provider='lex_uz' AND document.scope='global'
      AND document.availability_status='ready' AND variant.source_url IS NOT NULL
      ${cadenceFilter}
      AND NOT EXISTS (
        SELECT 1 FROM legal_corpus_ingestion_jobs AS pending
        WHERE pending.source_url=variant.source_url
          AND pending.status IN ('queued','running','retrying')
      )
    ORDER BY variant.last_verified_at ASC,variant.id ASC
    ${limit}
    ON CONFLICT(idempotency_key) DO NOTHING`).bind(...bindings).run();
  return Number(result.meta.changes ?? 0);
}

async function resetCompletedCatalogCheckpoints(
  env: LegalCorpusQueueEnv,
  now: Date,
): Promise<number> {
  const timestamp = now.toISOString();
  const cutoff = new Date(now.getTime() - 6 * 24 * 60 * 60_000).toISOString();
  const candidates = await env.DB.prepare(`SELECT id
    FROM legal_corpus_discovery_checkpoints
    WHERE status='completed' AND completed_at IS NOT NULL AND completed_at<=?
    ORDER BY completed_at,id`).bind(cutoff).all<{ id: string }>();
  let reset = 0;
  for (const candidate of candidates.results) {
    const results = await env.DB.batch([
      env.DB.prepare("DELETE FROM legal_corpus_discovery_documents WHERE checkpoint_id=?")
        .bind(candidate.id),
      env.DB.prepare(`UPDATE legal_corpus_discovery_checkpoints SET
          status='queued',page_number=0,expected_document_count=NULL,
          discovered_document_count=0,next_event_target=NULL,view_state=NULL,
          view_state_generator=NULL,attempt_count=0,next_attempt_at=?,
          last_error_code=NULL,started_at=NULL,completed_at=NULL,updated_at=?
        WHERE id=? AND status='completed' AND completed_at<=?`)
        .bind(timestamp, timestamp, candidate.id, cutoff),
    ]);
    reset += Number(results[1]?.meta?.changes ?? 0);
  }
  return reset;
}

/**
 * Creates only durable queue entries. Network access remains exclusively in
 * the separately locked process cron, so daily/weekly/monthly maintenance can
 * never start a second crawler or bypass the shared Lex host pacer.
 */
export async function scheduleLegalCorpusMaintenance(
  env: LegalCorpusQueueEnv,
  input: { now?: Date } = {},
): Promise<LegalCorpusMaintenanceResult> {
  const now = input.now ?? new Date();
  const local = tashkentDateParts(now);
  const empty = {
    localDate: local.date,
    dailyQueued: 0,
    weeklyQueued: 0,
    monthlyQueued: 0,
    catalogCheckpointsReset: 0,
  };
  if (!featureEnabled(env, "LEGAL_CORPUS_ENABLED") || !featureEnabled(env, "LEGAL_CORPUS_AUTO_INGEST_ENABLED")) {
    return empty;
  }

  // On the first local day of a month every official variant is scheduled for
  // a content-hash verification. Weekly refresh catches missed changes and
  // reopens only completed catalogs. Daily refresh is restricted to priority
  // codes/Constitution documents plus the normal new-document discovery feed.
  const monthlyQueued = local.dayOfMonth === 1
    ? await enqueueRefresh(env, { cadence: "monthly", now, localDate: local.date })
    : 0;
  const weekly = local.weekday === 1;
  const weeklyQueued = weekly
    ? await enqueueRefresh(env, { cadence: "weekly", now, localDate: local.date })
    : 0;
  const catalogCheckpointsReset = weekly
    ? await resetCompletedCatalogCheckpoints(env, now)
    : 0;
  const dailyQueued = await enqueueRefresh(env, { cadence: "daily", now, localDate: local.date });
  return { ...empty, dailyQueued, weeklyQueued, monthlyQueued, catalogCheckpointsReset };
}
