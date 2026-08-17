import { enqueueOfficialLexCorpusDocument, type LegalCorpusQueueEnv } from "./ingestion";
import { fetchLexCatalogPage } from "./lex-catalog-discovery";
import {
  discoverExactLexCoreCodeDocument,
  LEX_CORE_CODE_TARGETS,
  lexCoreCodeSearchUrl,
  parseLexDocumentUrl,
  type LexCoreCodeTarget,
} from "./lex-discovery";
import { featureEnabled, type LegalCorpusFeatureFlag } from "./trust";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type CoreCodeEnv = LegalCorpusQueueEnv & Partial<Record<LegalCorpusFeatureFlag, string | undefined>>;

/** Already verified as stable identifier hints by JURO's direct-live Lex
 * provider. They contain no copied legal text and are still independently
 * fetched and validated before entering the corpus. */
const LEX_CORE_CODE_SEEDS = [
  { targetId: "family", sourceUrl: "https://lex.uz/ru/docs/104723" },
  { targetId: "civil", sourceUrl: "https://lex.uz/ru/docs/111189" },
  { targetId: "tax", sourceUrl: "https://lex.uz/ru/docs/4674902" },
  { targetId: "labor", sourceUrl: "https://lex.uz/ru/docs/6257291" },
] as const;

// A title search can legitimately put the consolidated act behind amendments
// and legislative proposals.  Resume only the site's own bounded pager state;
// never broaden the query or follow arbitrary result links.
const MAX_CORE_CODE_SEARCH_PAGES = 12;

export const LEX_CORE_CODE_SEED_URLS = LEX_CORE_CODE_SEEDS.map((seed) => seed.sourceUrl);

export const LEX_CORE_CODE_SEED_IDS = LEX_CORE_CODE_SEED_URLS.map((url) =>
  `lexuz:${/\/docs\/(\d+)$/u.exec(url)?.[1] ?? "invalid"}`,
);

export type LexCoreCodeDiscoveryResult = {
  status: "disabled" | "all_settled" | "queued" | "not_found" | "failed";
  targetId: string | null;
  canonicalDocumentId: string | null;
  priorityCanonicalDocumentIds: string[];
  queued: boolean;
  safeErrorCode: string | null;
};

type CoreCodeTargetRow = {
  targetId: string;
  status: "queued" | "retrying" | "awaiting_ingestion" | "indexed" | "technically_unavailable";
  sourceUrl: string | null;
  canonicalDocumentId: string | null;
  attemptCount: number;
  nextAttemptAt: string | null;
  pageNumber: number;
  nextEventTarget: string | null;
  viewState: string | null;
  viewStateGenerator: string | null;
};

function pickTarget(targets: readonly LexCoreCodeTarget[], now: Date): LexCoreCodeTarget {
  const slot = Math.floor(now.getTime() / (4 * 60_000));
  return targets[((slot % targets.length) + targets.length) % targets.length]!;
}

function coreCodeSeed(target: LexCoreCodeTarget) {
  return LEX_CORE_CODE_SEEDS.find((seed) => seed.targetId === target.id) ?? null;
}

async function seedLexCoreCodeTargets(env: CoreCodeEnv, now: string): Promise<void> {
  const statements: D1PreparedStatement[] = [];
  for (const target of LEX_CORE_CODE_TARGETS) {
    const seed = coreCodeSeed(target);
    const parsed = seed ? parseLexDocumentUrl(seed.sourceUrl) : null;
    statements.push(env.DB.prepare(`INSERT INTO legal_corpus_core_code_targets
      (target_id,title_ru,status,source_url,canonical_document_id,attempt_count,next_attempt_at,last_error_code,resolved_at,created_at,updated_at)
      VALUES (?,?,?, ?,?,0,NULL,NULL,NULL,?,?) ON CONFLICT(target_id) DO NOTHING`).bind(
      target.id, target.titleRu, seed ? "awaiting_ingestion" : "queued",
      seed?.sourceUrl ?? null, parsed?.canonicalDocumentId ?? null, now, now,
    ));
  }
  await env.DB.batch(statements);
}

async function reconcileCoreCodeTargetStates(env: CoreCodeEnv, now: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(`UPDATE legal_corpus_core_code_targets AS target
      SET status='indexed',resolved_at=COALESCE(resolved_at,?),next_attempt_at=NULL,
        last_error_code=NULL,updated_at=?
      WHERE status='awaiting_ingestion' AND source_url IS NOT NULL AND EXISTS (
        SELECT 1 FROM legal_corpus_variants variant
        JOIN legal_corpus_documents document ON document.id=variant.document_id
        WHERE variant.source_url=target.source_url AND variant.is_official_language_version=1
          AND document.availability_status='ready'
      )`).bind(now, now),
    env.DB.prepare(`UPDATE legal_corpus_core_code_targets AS target
      SET status='technically_unavailable',resolved_at=COALESCE(resolved_at,?),next_attempt_at=NULL,
        updated_at=?
      WHERE status='awaiting_ingestion' AND source_url IS NOT NULL AND EXISTS (
        SELECT 1 FROM legal_corpus_failures failure
        WHERE failure.source_url=target.source_url AND failure.retry_state='technically_unavailable'
      )`).bind(now, now),
  ]);
}

async function coreCodeTargetRows(env: CoreCodeEnv): Promise<CoreCodeTargetRow[]> {
  const rows = await env.DB.prepare(`SELECT target_id AS targetId,status,source_url AS sourceUrl,
      canonical_document_id AS canonicalDocumentId,attempt_count AS attemptCount,
      next_attempt_at AS nextAttemptAt,page_number AS pageNumber,
      next_event_target AS nextEventTarget,view_state AS viewState,
      view_state_generator AS viewStateGenerator
    FROM legal_corpus_core_code_targets`).all<CoreCodeTargetRow>();
  return rows.results;
}

function priorityCanonicalDocumentIds(rows: readonly CoreCodeTargetRow[]): string[] {
  return [...new Set(rows
    .filter((row) => row.status === "awaiting_ingestion" && row.canonicalDocumentId)
    .map((row) => row.canonicalDocumentId!))];
}

function canResumePager(row: CoreCodeTargetRow): boolean {
  return row.pageNumber > 0 && Boolean(row.nextEventTarget && row.viewState);
}

export async function seedLexCoreCodeJobs(
  env: CoreCodeEnv,
  input: { now?: Date } = {},
): Promise<{ considered: number; queued: number }> {
  if (!featureEnabled(env, "LEGAL_CORPUS_ENABLED") || !featureEnabled(env, "LEGAL_CORPUS_AUTO_INGEST_ENABLED")) {
    return { considered: 0, queued: 0 };
  }
  await seedLexCoreCodeTargets(env, (input.now ?? new Date()).toISOString());
  let queued = 0;
  for (const sourceUrl of LEX_CORE_CODE_SEED_URLS) {
    const result = await enqueueOfficialLexCorpusDocument(env, { sourceUrl, now: input.now });
    if (result.created) queued += 1;
  }
  return { considered: LEX_CORE_CODE_SEED_URLS.length, queued };
}

/**
 * Performs one paced, robots-checked title lookup per staging invocation.
 * The target rotates over unresolved codes, so a temporary Lex search failure
 * cannot starve the remaining codes and the generic catalogue resumes once
 * every exact title has been observed in the corpus.
 */
export async function runNextLexCoreCodeDiscovery(
  env: CoreCodeEnv,
  input: { now?: Date; wait?: (delayMs: number) => Promise<void>; fetchImpl?: FetchLike } = {},
): Promise<LexCoreCodeDiscoveryResult> {
  if (!featureEnabled(env, "LEGAL_CORPUS_ENABLED") || !featureEnabled(env, "LEGAL_CORPUS_AUTO_INGEST_ENABLED")) {
    return { status: "disabled", targetId: null, canonicalDocumentId: null, priorityCanonicalDocumentIds: [], queued: false, safeErrorCode: null };
  }
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  await seedLexCoreCodeTargets(env, nowIso);
  await reconcileCoreCodeTargetStates(env, nowIso);
  const rows = await coreCodeTargetRows(env);
  const priorities = priorityCanonicalDocumentIds(rows);
  const byTargetId = new Map(rows.map((row) => [row.targetId, row]));
  const unresolved = LEX_CORE_CODE_TARGETS.filter((target) => {
    const row = byTargetId.get(target.id);
    return row?.status === "queued"
      || (row?.status === "retrying" && (row.nextAttemptAt === null || row.nextAttemptAt <= nowIso));
  });
  if (unresolved.length === 0) {
    const hasUnsettledTarget = rows.some((row) => row.status === "queued"
      || row.status === "retrying" || row.status === "awaiting_ingestion");
    return {
      // A retry can be deliberately paced into the future.  It is not a
      // successful resolution and must not unlock generic catalogue crawling.
      status: hasUnsettledTarget ? "queued" : "all_settled",
      targetId: null,
      canonicalDocumentId: priorities[0] ?? null,
      priorityCanonicalDocumentIds: priorities,
      queued: false,
      safeErrorCode: null,
    };
  }
  // A code whose first result page did not contain the consolidated act must
  // advance its verified ASP.NET pager before a fresh title query. This keeps
  // the code-first phase finite and avoids allowing amendments to starve the
  // current code merely because they occupy page one.
  const paged = unresolved.filter((target) => {
    const row = byTargetId.get(target.id);
    return row ? canResumePager(row) : false;
  });
  const target = pickTarget(paged.length > 0 ? paged : unresolved, now);
  const targetRow = byTargetId.get(target.id);
  if (!targetRow) throw new TypeError("LEX_CORE_CODE_TARGET_STATE_MISSING");
  try {
    const page = await fetchLexCatalogPage({
      searchUrl: lexCoreCodeSearchUrl(target),
      eventTarget: canResumePager(targetRow) ? targetRow.nextEventTarget : null,
      viewState: canResumePager(targetRow) ? targetRow.viewState : null,
      viewStateGenerator: canResumePager(targetRow) ? targetRow.viewStateGenerator : null,
      fetchImpl: input.fetchImpl,
      wait: input.wait,
    });
    const document = discoverExactLexCoreCodeDocument(page.html, target, lexCoreCodeSearchUrl(target));
    if (!document) {
      const canAdvance = page.currentPage < MAX_CORE_CODE_SEARCH_PAGES
        && Boolean(page.nextEventTarget && page.viewState);
      if (canAdvance) {
        await env.DB.prepare(`UPDATE legal_corpus_core_code_targets
          SET status='retrying',attempt_count=MIN(attempt_count+1,12),page_number=?,
            next_event_target=?,view_state=?,view_state_generator=?,next_attempt_at=?,
            last_error_code=NULL,updated_at=?
          WHERE target_id=? AND status IN ('queued','retrying')`).bind(
          page.currentPage, page.nextEventTarget, page.viewState, page.viewStateGenerator,
          nowIso, nowIso, target.id,
        ).run();
        return {
          status: "queued", targetId: target.id, canonicalDocumentId: null,
          priorityCanonicalDocumentIds: priorities, queued: false, safeErrorCode: null,
        };
      }
      const nextAttempt = new Date(now.getTime() + 60 * 60_000).toISOString();
      await env.DB.prepare(`UPDATE legal_corpus_core_code_targets
        SET status='retrying',attempt_count=MIN(attempt_count+1,12),next_attempt_at=?,
          page_number=0,next_event_target=NULL,view_state=NULL,view_state_generator=NULL,
          last_error_code='LEX_CORE_CODE_EXACT_TITLE_NOT_FOUND',updated_at=?
        WHERE target_id=? AND status IN ('queued','retrying')`).bind(nextAttempt, nowIso, target.id).run();
      return { status: "not_found", targetId: target.id, canonicalDocumentId: null, priorityCanonicalDocumentIds: priorities, queued: false, safeErrorCode: null };
    }
    const queued = await enqueueOfficialLexCorpusDocument(env, { sourceUrl: document.sourceUrl, now });
    await env.DB.prepare(`UPDATE legal_corpus_core_code_targets
      SET status='awaiting_ingestion',source_url=?,canonical_document_id=?,attempt_count=MIN(attempt_count+1,12),
        page_number=0,next_event_target=NULL,view_state=NULL,view_state_generator=NULL,
        next_attempt_at=NULL,last_error_code=NULL,updated_at=?
      WHERE target_id=? AND status IN ('queued','retrying')`).bind(
      document.sourceUrl, queued.canonicalDocumentId, nowIso, target.id,
    ).run();
    return {
      status: "queued", targetId: target.id, canonicalDocumentId: queued.canonicalDocumentId,
      priorityCanonicalDocumentIds: [...new Set([...priorities, queued.canonicalDocumentId])],
      queued: queued.created, safeErrorCode: null,
    };
  } catch (error) {
    const safeErrorCode = error instanceof Error && /^LEX_CATALOG_[A-Z_]+$/u.test(error.message)
      ? error.message
      : "LEX_CORE_CODE_DISCOVERY_FAILED";
    const retryAt = new Date(now.getTime() + 15 * 60_000).toISOString();
    await env.DB.prepare(`UPDATE legal_corpus_core_code_targets
      SET status='retrying',attempt_count=MIN(attempt_count+1,12),next_attempt_at=?,last_error_code=?,updated_at=?
      WHERE target_id=? AND status IN ('queued','retrying')`).bind(retryAt, safeErrorCode, nowIso, target.id).run();
    return { status: "failed", targetId: target.id, canonicalDocumentId: null, priorityCanonicalDocumentIds: priorities, queued: false, safeErrorCode };
  }
}
