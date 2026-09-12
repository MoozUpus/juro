import {
  enqueueOfficialLexCorpusDocument,
  officialLexCorpusFetchJobId,
  type LegalCorpusQueueEnv,
} from "./ingestion";
import { fetchLexCatalogPage } from "./lex-catalog-discovery";
import {
  discoverExactLexNpaTargetDocument,
  lexNpaTargetSearchUrl,
  parseLexDocumentUrl,
} from "./lex-discovery";
import {
  NPA_FUTURE_TARGETS,
  NPA_MASTER_TARGETS,
  type NpaTarget,
} from "./npa-master-registry";
import { npaCorpusAsOfDate, seedNpaMasterTargets } from "./npa-registry";
import { featureEnabled, type LegalCorpusFeatureFlag } from "./trust";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type NpaDiscoveryEnv = LegalCorpusQueueEnv & Partial<Record<LegalCorpusFeatureFlag, string | undefined>>;
const MAX_NPA_TITLE_SEARCH_PAGES = 12;
// Increment only for a deliberately reviewed NPA card recheck change. It
// preserves immutable ingestion rows while allowing a bounded re-validation
// of already discovered cards after the reporting/parser contract changes.
// v4 adds the official same-document LexUZ information-card metadata fallback
// for Code readers whose consolidated-text header has no adoption requisites.
// v5 replays those cards so an exact historical AS_OF revision can receive its
// own P0 job instead of waiting behind generic version backlog.
// v6 replaces legacy arbitrary-ONDATE AS_OF jobs with an exact LexUZ-picker
// revision lane and replays completed cards through that repaired contract.
const NPA_CURRENT_CARD_QUEUE_SCHEMA_VERSION = "6";

type TargetRow = {
  documentKey: string;
  status: "queued" | "retrying" | "candidate" | "verified" | "future" | "repealed" | "manual_review";
  candidateSourceUrl: string | null;
  candidateLexuzDocId: string | null;
  attemptCount: number;
  nextAttemptAt: string | null;
  pageNumber: number;
  nextEventTarget: string | null;
  viewState: string | null;
  viewStateGenerator: string | null;
  sourceSessionCookie: string | null;
  sourceSessionExpiresAt: string | null;
};

export type NpaTargetDiscoveryResult = Readonly<{
  status: "disabled" | "all_settled" | "queued" | "not_found" | "failed";
  documentKey: string | null;
  canonicalDocumentId: string | null;
  queued: boolean;
  safeErrorCode: string | null;
}>;

function enabled(env: NpaDiscoveryEnv): boolean {
  return featureEnabled(env, "LEGAL_CORPUS_ENABLED")
    && featureEnabled(env, "LEGAL_CORPUS_AUTO_INGEST_ENABLED");
}

function allTargets(): readonly NpaTarget[] {
  return [...NPA_MASTER_TARGETS, ...NPA_FUTURE_TARGETS];
}

function pickTarget(targets: readonly NpaTarget[], now: Date): NpaTarget {
  const slot = Math.floor(now.getTime() / (5 * 60_000));
  return targets[((slot % targets.length) + targets.length) % targets.length]!;
}

function canResumePager(row: TargetRow): boolean {
  return row.pageNumber > 0 && Boolean(row.nextEventTarget && row.viewState && row.sourceSessionCookie);
}

async function rows(db: D1Database): Promise<TargetRow[]> {
  const result = await db.prepare(`SELECT document_key AS documentKey,status,
      candidate_source_url AS candidateSourceUrl,candidate_lexuz_doc_id AS candidateLexuzDocId,
      attempt_count AS attemptCount,next_attempt_at AS nextAttemptAt,page_number AS pageNumber,
      next_event_target AS nextEventTarget,view_state AS viewState,
      view_state_generator AS viewStateGenerator,source_session_cookie AS sourceSessionCookie,
      source_session_expires_at AS sourceSessionExpiresAt
    FROM npa_discovery_state`).all<TargetRow>();
  return result.results;
}

async function queueCandidate(input: {
  env: NpaDiscoveryEnv;
  target: NpaTarget;
  sourceUrl: string;
  now: Date;
}): Promise<{ queued: boolean; canonicalDocumentId: string }> {
  const parsed = parseLexDocumentUrl(input.sourceUrl);
  if (!parsed) throw new TypeError("NPA_CANDIDATE_URL_REJECTED");
  const current = await queueCurrentNpaCard({
    env: input.env,
    target: input.target,
    parsed,
    now: input.now,
  });
  const timestamp = input.now.toISOString();
  await input.env.DB.prepare(`UPDATE npa_discovery_state
    SET status='candidate',candidate_source_url=?,candidate_lexuz_doc_id=?,
      attempt_count=MIN(attempt_count+1,24),next_attempt_at=NULL,last_error_code=NULL,
      page_number=0,next_event_target=NULL,view_state=NULL,view_state_generator=NULL,
      source_session_cookie=NULL,source_session_expires_at=NULL,last_checked_at=?,updated_at=?
    WHERE document_key=? AND status IN ('queued','retrying','candidate')`).bind(
    parsed.sourceUrl, parsed.canonicalDocumentId.replace(/^lexuz:/u, ""), timestamp, timestamp,
    input.target.documentKey,
  ).run();
  return current;
}

/**
 * Enqueue an immutable, date-scoped read of the card currently selected by
 * LexUZ. This intentionally does not mutate discovery state: candidates
 * resolved by an earlier Worker version must be repaired into the new P0 lane
 * without treating the repair itself as a fresh search attempt.
 */
async function queueCurrentNpaCard(input: {
  env: NpaDiscoveryEnv;
  target: NpaTarget;
  parsed: NonNullable<ReturnType<typeof parseLexDocumentUrl>>;
  now: Date;
}): Promise<{ queued: boolean; canonicalDocumentId: string }> {
  // LexUZ's ONDATE reader accepts only dates published in its own revision
  // picker, not every calendar date. Read the canonical current card first;
  // its selected official revision date is then compared to AS_OF_DATE and
  // its own history supplies an exact historical picker date when needed.
  const asOfDate = await npaCorpusAsOfDate(input.env.DB, input.now);
  const current = await enqueueOfficialLexCorpusDocument(input.env, {
    sourceUrl: input.parsed.sourceUrl, now: input.now,
    correlationId: `npa:${input.target.documentKey}:current-card:${asOfDate}`,
    idempotencyScope: `npa-current-card:v${NPA_CURRENT_CARD_QUEUE_SCHEMA_VERSION}:${input.target.documentKey}:${asOfDate}`,
  });
  return { queued: current.created, canonicalDocumentId: input.parsed.canonicalDocumentId };
}

/** Seeds fixed target rows and only those verified source hints already in the
 * codebase. Hints remain `candidate`; ingestion rechecks LexUZ metadata. */
export async function seedNpaTargetJobs(
  env: NpaDiscoveryEnv,
  input: { now?: Date } = {},
): Promise<{ considered: number; queued: number }> {
  if (!enabled(env)) return { considered: 0, queued: 0 };
  const now = input.now ?? new Date();
  await seedNpaMasterTargets(env.DB, now);
  let queued = 0;
  for (const target of allTargets()) {
    if (!target.verifiedSourceSeed) continue;
    const result = await queueCandidate({ env, target, sourceUrl: target.verifiedSourceSeed, now });
    if (result.queued) queued += 1;
  }
  // Resolved cards can have been found before a queue/schema repair. Replay
  // only their canonical cards through the separate AS_OF lane, so a formerly
  // completed generic ingestion job cannot suppress required NPA verification.
  const targetsByKey = new Map(allTargets().map((target) => [target.documentKey, target] as const));
  for (const row of await rows(env.DB)) {
    const recheckable = row.status === "candidate"
      || row.status === "verified"
      || row.status === "future"
      || row.status === "repealed"
      || row.status === "manual_review";
    if (!recheckable || !row.candidateSourceUrl) continue;
    const target = targetsByKey.get(row.documentKey);
    const parsed = parseLexDocumentUrl(row.candidateSourceUrl);
    if (!target || !parsed) continue;
    const result = await queueCurrentNpaCard({ env, target, parsed, now });
    if (result.queued) queued += 1;
  }
  return { considered: allTargets().length, queued };
}

/**
 * Schedules a fresh, date-scoped comparison for every already verified master
 * record.  It does not re-enable a future/repealed record and does not update
 * any metadata before the normal immutable ingestion and QA path succeeds.
 */
export async function refreshVerifiedNpaTargetJobs(
  env: NpaDiscoveryEnv,
  input: { now?: Date } = {},
): Promise<{ considered: number; queued: number; date: string }> {
  const now = input.now ?? new Date();
  const date = await npaCorpusAsOfDate(env.DB, now);
  if (!enabled(env)) return { considered: 0, queued: 0, date };
  const result = await env.DB.prepare(`SELECT registry.document_key AS documentKey,
      registry.source_reference AS sourceReference
    FROM npa_master_registry AS registry
    INNER JOIN npa_master_targets AS target ON target.document_key=registry.document_key
    WHERE target.target_set IN ('mandatory','future')
      AND registry.source='LexUZ' AND registry.source_reference LIKE 'https://lex.uz/%'
    ORDER BY registry.document_key`).all<{ documentKey: string; sourceReference: string }>();
  let queued = 0;
  for (const row of result.results) {
    const job = await enqueueOfficialLexCorpusDocument(env, {
      sourceUrl: row.sourceReference,
      now,
      correlationId: `npa:${row.documentKey}:daily:${date}`,
      idempotencyScope: `npa-daily:${row.documentKey}:${date}`,
    });
    if (job.created) queued += 1;
  }
  return { considered: result.results.length, queued, date };
}

/**
 * Bounded P0 lanes are exact source URLs, rather than only document IDs.
 * A document family can have a large generic revision backlog; choosing by
 * ID alone could ingest an unrelated historical revision before the legally
 * required current card. The card's selected revision date is the only
 * reliable LexUZ choice for a date-scoped activation; arbitrary ONDATE
 * calendar values can produce a LexUZ 404.
 */
export async function npaPrioritySourceUrls(
  db: D1Database,
): Promise<string[]> {
  const result = await db.prepare(`SELECT candidate_source_url AS candidateSourceUrl
    FROM npa_discovery_state
    WHERE status IN ('candidate','verified','future','repealed','manual_review') AND candidate_source_url IS NOT NULL
    -- Resolve explicit fail-closed identities before routine refreshes. A
    -- parser/schema repair must not sit behind dozens of otherwise valid
    -- verified cards, because the 100-NPA production gate remains blocked.
    ORDER BY CASE status
      WHEN 'manual_review' THEN 0
      WHEN 'candidate' THEN 1
      WHEN 'repealed' THEN 2
      WHEN 'future' THEN 3
      WHEN 'verified' THEN 4
      ELSE 5
    END,updated_at ASC,document_key ASC LIMIT 32`).all<{ candidateSourceUrl: string }>();
  return [...new Set(result.results.flatMap((row) => {
    const parsed = parseLexDocumentUrl(row.candidateSourceUrl);
    return parsed ? [parsed.sourceUrl] : [];
  }))];
}

/**
 * Resolves the primary keys of the P0 NPA jobs. A scoped historical AS_OF
 * revision takes precedence once the current card has discovered it; otherwise
 * the deterministic current-card job is selected. Unlike source-url filtering,
 * these IDs can be claimed without scanning the generic ingestion backlog.
 */
export async function npaPriorityJobIds(
  db: D1Database,
  now = new Date(),
): Promise<string[]> {
  const asOfDate = await npaCorpusAsOfDate(db, now);
  const result = await db.prepare(`SELECT document_key AS documentKey,candidate_source_url AS candidateSourceUrl
    FROM npa_discovery_state
    WHERE status IN ('candidate','verified','future','repealed','manual_review') AND candidate_source_url IS NOT NULL
    ORDER BY CASE status
      WHEN 'manual_review' THEN 0
      WHEN 'candidate' THEN 1
      WHEN 'repealed' THEN 2
      WHEN 'future' THEN 3
      WHEN 'verified' THEN 4
      ELSE 5
    END,updated_at ASC,document_key ASC LIMIT 32`).all<{ documentKey: string; candidateSourceUrl: string }>();
  const jobs = await Promise.all(result.results.flatMap(async (row) => {
    const parsed = parseLexDocumentUrl(row.candidateSourceUrl);
    if (!parsed) return [];
    const asOfRevision = await db.prepare(`SELECT id
      FROM legal_corpus_ingestion_jobs INDEXED BY legal_corpus_ingestion_document_language_ready_idx
      WHERE canonical_document_id=? AND language=? AND job_type='version'
        AND correlation_id=? AND status IN ('queued','retrying')
        AND (next_attempt_at IS NULL OR next_attempt_at<=?)
      ORDER BY CASE status WHEN 'retrying' THEN 0 ELSE 1 END,
        coalesce(next_attempt_at,created_at) ASC,created_at ASC,id ASC LIMIT 1`)
      .bind(
        parsed.canonicalDocumentId, parsed.language,
        `npa:${row.documentKey}:as-of:v2:${asOfDate}`,
        now.toISOString(),
      ).first<{ id: string }>();
    const currentCardJobId = await officialLexCorpusFetchJobId({
      sourceUrl: parsed.sourceUrl,
      idempotencyScope: `npa-current-card:v${NPA_CURRENT_CARD_QUEUE_SCHEMA_VERSION}:${row.documentKey}:${asOfDate}`,
    });
    return [
      ...(asOfRevision?.id ? [asOfRevision.id] : []),
      currentCardJobId,
    ];
  }));
  return [...new Set(jobs.flat())];
}

/** Resolves one non-seeded target by an exact, allow-listed Lex title search. */
export async function runNextNpaTargetDiscovery(
  env: NpaDiscoveryEnv,
  input: {
    now?: Date;
    wait?: (delayMs: number) => Promise<void>;
    fetchImpl?: FetchLike;
    pacingAlreadyApplied?: boolean;
  } = {},
): Promise<NpaTargetDiscoveryResult> {
  if (!enabled(env)) return { status: "disabled", documentKey: null, canonicalDocumentId: null, queued: false, safeErrorCode: null };
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();
  await seedNpaMasterTargets(env.DB, now);
  const targetRows = await rows(env.DB);
  const byKey = new Map(targetRows.map((row) => [row.documentKey, row]));
  const unresolved = allTargets().filter((target) => {
    const row = byKey.get(target.documentKey);
    return row?.status === "queued"
      || (row?.status === "retrying" && (row.nextAttemptAt === null || row.nextAttemptAt <= timestamp));
  });
  if (unresolved.length === 0) {
    return { status: "all_settled", documentKey: null, canonicalDocumentId: null, queued: false, safeErrorCode: null };
  }
  const paged = unresolved.filter((target) => canResumePager(byKey.get(target.documentKey)!));
  const target = pickTarget(paged.length > 0 ? paged : unresolved, now);
  const row = byKey.get(target.documentKey);
  if (!row) throw new TypeError("NPA_TARGET_STATE_MISSING");
  const resumePager = canResumePager(row);
  try {
    const page = await fetchLexCatalogPage({
      searchUrl: lexNpaTargetSearchUrl(target),
      eventTarget: resumePager ? row.nextEventTarget : null,
      viewState: resumePager ? row.viewState : null,
      viewStateGenerator: resumePager ? row.viewStateGenerator : null,
      sourceSessionCookie: resumePager ? row.sourceSessionCookie : null,
      fetchImpl: input.fetchImpl, wait: input.wait, pacingAlreadyApplied: input.pacingAlreadyApplied,
    });
    const discovered = discoverExactLexNpaTargetDocument(page.html, target, lexNpaTargetSearchUrl(target));
    if (discovered) {
      const queued = await queueCandidate({ env, target, sourceUrl: discovered.sourceUrl, now });
      return { status: "queued", documentKey: target.documentKey, canonicalDocumentId: queued.canonicalDocumentId, queued: queued.queued, safeErrorCode: null };
    }
    const canAdvance = page.currentPage < MAX_NPA_TITLE_SEARCH_PAGES
      && Boolean(page.nextEventTarget && page.viewState);
    if (canAdvance) {
      const sessionCookie = page.sourceSessionCookie ?? row.sourceSessionCookie;
      const expiresAt = page.sourceSessionCookie
        ? new Date(now.getTime() + 15 * 60_000).toISOString()
        : row.sourceSessionExpiresAt;
      await env.DB.prepare(`UPDATE npa_discovery_state SET status='retrying',
        attempt_count=MIN(attempt_count+1,24),page_number=?,next_event_target=?,
        view_state=?,view_state_generator=?,source_session_cookie=?,source_session_expires_at=?,
        next_attempt_at=?,last_error_code=NULL,last_checked_at=?,updated_at=?
        WHERE document_key=? AND status IN ('queued','retrying')`).bind(
        page.currentPage, page.nextEventTarget, page.viewState, page.viewStateGenerator,
        sessionCookie, expiresAt, timestamp, timestamp, timestamp, target.documentKey,
      ).run();
      return { status: "queued", documentKey: target.documentKey, canonicalDocumentId: null, queued: false, safeErrorCode: null };
    }
    const next = new Date(now.getTime() + 60 * 60_000).toISOString();
    await env.DB.prepare(`UPDATE npa_discovery_state SET status='retrying',
      attempt_count=MIN(attempt_count+1,24),next_attempt_at=?,last_error_code='LEXUZ_CARD_NOT_FOUND',
      page_number=0,next_event_target=NULL,view_state=NULL,view_state_generator=NULL,
      source_session_cookie=NULL,source_session_expires_at=NULL,last_checked_at=?,updated_at=?
      WHERE document_key=? AND status IN ('queued','retrying')`).bind(next, timestamp, timestamp, target.documentKey).run();
    return { status: "not_found", documentKey: target.documentKey, canonicalDocumentId: null, queued: false, safeErrorCode: "LEXUZ_CARD_NOT_FOUND" };
  } catch (error) {
    const code = error instanceof Error && /^LEX_CATALOG_[A-Z_]+$/u.test(error.message)
      ? error.message : "NPA_TARGET_DISCOVERY_FAILED";
    await env.DB.prepare(`UPDATE npa_discovery_state SET status='retrying',
      attempt_count=MIN(attempt_count+1,24),next_attempt_at=?,last_error_code=?,last_checked_at=?,updated_at=?
      WHERE document_key=? AND status IN ('queued','retrying')`).bind(
      new Date(now.getTime() + 15 * 60_000).toISOString(), code, timestamp, timestamp, target.documentKey,
    ).run();
    return { status: "failed", documentKey: target.documentKey, canonicalDocumentId: null, queued: false, safeErrorCode: code };
  }
}
