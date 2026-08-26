import {
  reconcileLegalCorpusTitleUiNoise,
  runNextLegalCorpusIngestionJob,
  seedLexCorpusJobsFromMetadata,
  type LegalCorpusIngestionEnv,
} from "../lib/legal-corpus/ingestion";
import {
  runNextLexCatalogDiscoveryPage,
  seedLexCatalogDiscoveryCheckpoints,
} from "../lib/legal-corpus/lex-catalog-discovery";
import {
  LEX_CORPUS_CATEGORY_PRIORITY,
  LEX_CORPUS_LANGUAGES,
  type LexCorpusCategoryKey,
} from "../lib/legal-corpus/lex-discovery";
import {
  LEX_CORE_CODE_SEED_IDS,
  runNextLexCoreCodeDiscovery,
  seedLexCoreCodeJobs,
} from "../lib/legal-corpus/lex-core-code-discovery";
import { featureEnabled, type LegalCorpusLanguage } from "../lib/legal-corpus/trust";
import { runNextLegalCorpusQdrantBackfillBatch } from "../lib/legal-corpus/qdrant-indexing";
import type { QdrantCorpusEnv } from "../lib/legal-corpus/qdrant";
import { createLegalCorpusQdrantSnapshot } from "../lib/legal-corpus/qdrant-snapshots";
import { createPacedLexFetch } from "../lib/legal-corpus/lex-request-pacer";
import { scheduleLegalCorpusMaintenance } from "../lib/legal-corpus/maintenance";
import {
  backfillCompressedSparseIndexBatch,
  compactLegacySparseJsonBatch,
  LegalCorpusSparseIndexError,
} from "../lib/legal-corpus/sparse-index";

export const LEGAL_CORPUS_PROCESS_CRON = "*/5 * * * *";
export const LEGAL_CORPUS_STAGING_PROCESS_CRON = "*/4 * * * *";
export const LEGAL_CORPUS_SEED_CRON = "5 19 * * *";

const LOCK_NAME = "legal-corpus-worker";
// A paced ingestion run can continue with bounded D1/index maintenance after
// the last Lex request. The previous seven-minute lease expired during a
// healthy eight-minute staging run, causing a false terminal scheduler
// failure. Keep one lease for the whole bounded batch and leave the next
// invocation to the durable lock; the start fence still bounds source work.
export const LEGAL_CORPUS_SCHEDULE_LEASE_MS = 15 * 60_000;
const LOCK_MS = LEGAL_CORPUS_SCHEDULE_LEASE_MS;
const SCHEDULED_RUN_STALE_AFTER_MS = LOCK_MS;
// Staging uses the remaining wall-clock budget of the 15-minute Cron
// invocation to drain more already-queued, sequential jobs. Production keeps
// the historical short fence and its acquisition flags remain disabled.
export const LEGAL_CORPUS_STAGING_INGESTION_START_CUTOFF_MS = 12 * 60_000;
// Once all core codes are settled, four catalogue pages advance the durable
// discovery checkpoints per staging tick. The shared 20-second host pacer
// permits ten sequential Lex.uz request windows per four-minute invocation
// without increasing concurrency. Until all core codes have an
// exact official title match, the catalogue phase remains paused in favour of
// the bounded code-title lookup.
const DISCOVERY_PAGES_PER_RUN = 4;
// Five sequential document jobs plus the four catalogue pages above use ten
// bounded source windows when a network robots policy is required. `createPacedLexFetch` fetches
// robots.txt once per bounded Worker invocation, and its D1-backed host
// limiter remains authoritative for every real Lex.uz request. The 195-second start fence remains
// authoritative: a document requiring a second official representation simply
// leaves a later durable job queued rather than overlapping the next tick.
const INGESTION_JOBS_PER_RUN = 5;
// Live staging cadence showed that both 24-job and 22-job batches cross the
// twelve-minute scheduler slot (about 12m15s), so the next usable four-minute
// cron tick is missed and effective throughput falls below the 20-job
// baseline. Keep the proven 20-job cap so the bounded batch finishes before
// that slot while preserving the same single-stream Lex pacing.
const MAX_STAGING_INGESTION_JOBS_PER_RUN = 20;
// Four of the five ingestion slots may prefer already-discovered official
// catalogues. The order is the current operational legal-source policy:
// enacted laws first; Cabinet of Ministers acts (ПКМ) second; then the
// President catalogue, which is the official source family for both
// presidential resolutions (ПП) and decrees (УП); then acts of the other
// public authorities. Lex does not expose a trustworthy PP/UP discriminator
// before a document header is fetched, so the Worker must not invent one from
// a URL or source order.
//
// Reserve the first three sequential slots for current-corpus fetches, then
// interleave bounded historical version slots through the remaining batch.
// This keeps current-corpus coverage moving while ensuring the version debt is
// reached before the staging start fence expires. Ordinary priority fetching
// resumes automatically below the debt threshold. This is back-pressure, not
// a new crawl stream: the shared 20-second host pacer and start fence still
// govern every source request.
const PREFERRED_INGESTION_SLOTS_PER_RUN = 4;
const VERSION_INGESTION_SLOT_INDEX = 3;
const VERSION_CATCHUP_QUEUE_THRESHOLD = 500;
const VERSION_CATCHUP_MINIMUM_FETCH_SLOTS = 3;
// Keep the historical debt share bounded while the current-corpus floor is
// already above the release document target. At least three current fetch
// slots remain reserved; the existing 20-second host pacer and start fence
// still govern every source request, so this does not add concurrency.
const VERSION_CATCHUP_MAX_SLOTS = 8;
export const LEGAL_CORPUS_PREFERRED_INGESTION_CATALOGUES = LEX_CORPUS_CATEGORY_PRIORITY;
const PREFERRED_INGESTION_LANGUAGE_ROTATION = ["uz-Cyrl", "ru", "uz-Latn", "en"] as const;
// Production retains a short start fence so its disabled acquisition path
// remains conservative. Staging uses the explicit twelve-minute fence above;
// the 15-minute distributed lease leaves three minutes for sparse-index and
// D1 finalization while allowing several already-queued jobs to run in one
// sequential invocation. The shared robots policy and 20-second host pacer
// remain authoritative for every source request.
const INGESTION_START_CUTOFF_MS = 195_000;
// Dense activation happens only after the source queue is frozen. Four
// 64-chunk batches cap one invocation at eight embedding calls while allowing
// the complete current corpus to resume from D1 after a Worker restart.
const QDRANT_BACKFILL_BATCHES_PER_IDLE_RUN = 4;

type CorpusCoverageBootstrapRow = {
  categoryKey: string;
  language: string;
  currentDocuments: number;
  queuedDocuments: number;
};

export type LegalCorpusCoverageBootstrapTarget = {
  categoryKey: LexCorpusCategoryKey;
  language: LegalCorpusLanguage;
};

const legalCorpusLanguagesInBootstrapOrder = ["uz-Cyrl", "ru", "uz-Latn", "en"] as const;

/**
 * The ordinary preference is intentionally laws -> Cabinet -> President ->
 * other authorities. Once discovery has settled, an unrepresented
 * category/language receives one existing sequential slot so a high-volume
 * catalogue cannot consume every bounded run forever. This never marks a
 * checkpoint complete or suppresses its remaining durable jobs.
 */
export function legalCorpusCoverageBootstrapTarget(
  rows: readonly CorpusCoverageBootstrapRow[],
): LegalCorpusCoverageBootstrapTarget | null {
  const currentDocuments = new Map<string, number>();
  const queuedDocuments = new Map<string, number>();
  for (const row of rows) {
    if (!LEX_CORPUS_CATEGORY_PRIORITY.includes(row.categoryKey as LexCorpusCategoryKey)) continue;
    if (!LEX_CORPUS_LANGUAGES.some(({ language }) => language === row.language)) continue;
    const key = `${row.categoryKey}:${row.language}`;
    currentDocuments.set(key, Math.max(0, Number(row.currentDocuments) || 0));
    queuedDocuments.set(key, Math.max(0, Number(row.queuedDocuments) || 0));
  }
  for (const categoryKey of LEX_CORPUS_CATEGORY_PRIORITY) {
    for (const language of legalCorpusLanguagesInBootstrapOrder) {
      const key = `${categoryKey}:${language}`;
      if ((currentDocuments.get(key) ?? 0) === 0 && (queuedDocuments.get(key) ?? 0) > 0) {
        return { categoryKey, language };
      }
    }
  }
  return null;
}

async function nextLegalCorpusCoverageBootstrapTarget(
  db: D1Database,
): Promise<LegalCorpusCoverageBootstrapTarget | null> {
  // One aggregate D1 read replaces per-category probing. It examines only
  // metadata and identifiers; the actual document remains behind the normal
  // host pacer and parser.
  const rows = await db.prepare(`SELECT cp.category_key AS categoryKey,cp.language,
      count(DISTINCT CASE WHEN job.status IN ('queued','retrying') THEN job.id END) AS queuedDocuments,
      count(DISTINCT variant.document_id) AS currentDocuments
    FROM legal_corpus_discovery_checkpoints cp
    LEFT JOIN legal_corpus_discovery_documents discovery ON discovery.checkpoint_id=cp.id
    LEFT JOIN legal_corpus_ingestion_jobs job
      ON job.canonical_document_id=discovery.provider_source_id
      AND job.language=discovery.language AND job.job_type='fetch'
    LEFT JOIN legal_corpus_source_aliases alias ON alias.source_url=discovery.source_url
    LEFT JOIN legal_corpus_variants variant
      ON variant.document_id=alias.document_id AND variant.language=discovery.language
      AND variant.current_version_id IS NOT NULL
    WHERE cp.status='completed'
    GROUP BY cp.category_key,cp.language`).all<CorpusCoverageBootstrapRow>();
  // Do not turn a partial discovery state into a coverage policy. Ordinary
  // priority remains authoritative until every catalogue/language checkpoint
  // has independently reached its real end.
  if (rows.results.length !== LEX_CORPUS_CATEGORY_PRIORITY.length * LEX_CORPUS_LANGUAGES.length) {
    return null;
  }
  return legalCorpusCoverageBootstrapTarget(rows.results);
}

export function legalCorpusIngestionJobBudget(
  discoveries: readonly { claimed: boolean; status: string }[],
  input: { persistentRobotsPolicy?: boolean; ingestionJobsPerRun?: number } = {},
): number {
  // Reuse only catalogue slots that were proved empty. A failed/disabled
  // discovery does not grant extra nominal source jobs. The nominal maximum
  // remains bounded by the configured ingestion limit (five for the primary
  // Worker, at most 20 for the staging shard) plus four discovery pages and a
  // robots request. An earlier empty discovery page reclaims its capacity; the elapsed-time
  // start fence below is authoritative when a job discovers a secondary PDF
  // or ZIP representation and therefore consumes an additional paced fetch.
  const configuredJobs = Number.isFinite(input.ingestionJobsPerRun)
    ? Math.min(MAX_STAGING_INGESTION_JOBS_PER_RUN, Math.max(INGESTION_JOBS_PER_RUN, Math.floor(input.ingestionJobsPerRun ?? INGESTION_JOBS_PER_RUN)))
    : INGESTION_JOBS_PER_RUN;
  const nominalIngestionJobs = configuredJobs + (input.persistentRobotsPolicy ? 1 : 0);
  if (!discoveries.some((result) => result.status === "empty")) return nominalIngestionJobs;
  const claimed = discoveries.filter((result) => result.claimed).length;
  return nominalIngestionJobs + Math.max(0, DISCOVERY_PAGES_PER_RUN - claimed);
}

export function legalCorpusStagingIngestionJobsPerRun(input: {
  appEnv?: string;
  configured?: string;
}): number {
  if (input.appEnv !== "staging") return INGESTION_JOBS_PER_RUN;
  const parsed = Number(input.configured);
  if (!Number.isFinite(parsed)) return INGESTION_JOBS_PER_RUN;
  return Math.min(MAX_STAGING_INGESTION_JOBS_PER_RUN, Math.max(INGESTION_JOBS_PER_RUN, Math.floor(parsed)));
}

/**
 * An ASP.NET core-code pager carries a short-lived Lex session. A historical
 * ingestion batch can occupy the Worker long enough for the next cron slot to
 * miss that session, so reserve one existing ingestion slot for a continuation
 * request in the same sequential invocation. The total source-request budget
 * stays unchanged: one fewer document slot pays for the extra pager page.
 */
export function legalCorpusCorePagerContinuationRequired(input: {
  status: string;
  targetId: string | null;
  canonicalDocumentId: string | null;
}): boolean {
  return input.status === "queued"
    && input.targetId !== null
    && input.canonicalDocumentId === null;
}

export function legalCorpusIngestionBudgetForCorePager(input: {
  ingestionBudget: number;
  continuePager: boolean;
}): number {
  const budget = Math.max(0, Math.floor(input.ingestionBudget));
  return Math.max(1, budget - (input.continuePager ? 1 : 0));
}

/**
 * Keep historical revision discovery finite. A fetched current document can
 * enqueue many official ONDATE revisions, so a single reserved version slot
 * cannot drain the queue once catalogue discovery has reached broad coverage.
 * This chooses only slots in the existing sequential batch; it never widens
 * the request budget, shortens the host delay, or starts parallel work.
 */
export function legalCorpusVersionSlotIndexes(input: {
  ingestionBudget: number;
  queuedVersionJobs: number;
}): number[] {
  const ingestionBudget = Math.max(0, Math.floor(input.ingestionBudget));
  const queuedVersionJobs = Math.max(0, Math.floor(input.queuedVersionJobs));
  if (ingestionBudget === 0) return [];
  if (queuedVersionJobs < VERSION_CATCHUP_QUEUE_THRESHOLD) {
    return VERSION_INGESTION_SLOT_INDEX < ingestionBudget ? [VERSION_INGESTION_SLOT_INDEX] : [];
  }
  if (ingestionBudget <= VERSION_CATCHUP_MINIMUM_FETCH_SLOTS) {
    return ingestionBudget > 1 ? [ingestionBudget - 1] : [];
  }
  const catchupSlots = Math.min(
    VERSION_CATCHUP_MAX_SLOTS,
    ingestionBudget - VERSION_CATCHUP_MINIMUM_FETCH_SLOTS,
  );
  const firstVersionSlot = Math.min(VERSION_INGESTION_SLOT_INDEX, ingestionBudget - 1);
  const availableSlots = ingestionBudget - firstVersionSlot;
  return Array.from(
    { length: Math.min(catchupSlots, availableSlots) },
    (_unused, index) => firstVersionSlot + Math.floor(index * availableSlots / catchupSlots),
  );
}

async function queuedLegalCorpusVersionJobs(db: D1Database): Promise<number> {
  const row = await db.prepare(`SELECT count(*) AS count
    FROM legal_corpus_ingestion_jobs
    WHERE job_type='version' AND status IN ('queued','retrying')`).first<{ count: number }>();
  return Math.max(0, Number(row?.count) || 0);
}

export function legalCorpusIngestionStartAllowed(
  scheduledTime: number,
  now: number,
  cutoffMs = INGESTION_START_CUTOFF_MS,
): boolean {
  if (!Number.isFinite(scheduledTime) || !Number.isFinite(now) || !Number.isFinite(cutoffMs)) return false;
  if (cutoffMs <= 0) return false;
  return Math.max(0, now - scheduledTime) < cutoffMs;
}

type LegalCorpusWorkerEnv = LegalCorpusIngestionEnv & QdrantCorpusEnv & {
  BACKUP_BUCKET?: R2Bucket;
  OPENAI_API_KEY?: string;
  EMBEDDING_MODEL?: string;
  LEGAL_CORPUS_EMBEDDING_SERVICE?: Fetcher;
  /** Additive compressed sparse migration remains an explicit capacity gate. */
  LEGAL_CORPUS_SPARSE_COMPRESSION_ENABLED?: string;
  LEGAL_CORPUS_STAGING_INGESTION_JOBS_PER_RUN?: string;
};

type ClaimedRun = {
  id: string;
  holderId: string;
};

type CorpusWorkResult = {
  status: string;
  safeErrorCode: string | null;
};

export function legalCorpusActionableRunErrorCode(input: {
  coreCode: CorpusWorkResult;
  discoveries: readonly CorpusWorkResult[];
  ingestions: readonly CorpusWorkResult[];
}): string | null {
  return (input.coreCode.status === "failed" ? input.coreCode.safeErrorCode : null)
    ?? input.discoveries.find((result) => result.status === "retrying" || result.status === "failed")?.safeErrorCode
    ?? input.ingestions.find((result) => result.status !== "completed" && result.safeErrorCode !== null)?.safeErrorCode
    ?? null;
}

function log(
  level: "info" | "error",
  fields: Record<string, string | number | boolean | null>,
): void {
  const entry = JSON.stringify({ service: "legal-corpus-worker", ...fields });
  if (level === "error") console.error(entry);
  else console.log(entry);
}

/**
 * Preserve an actionable, non-sensitive error code in the durable run ledger.
 * D1/Worker errors often arrive as a longer provider message; only the
 * allow-listed LEGAL_* and SQLITE_* tokens are surfaced so URLs, SQL and
 * source text never enter operational status or logs.
 */
export function legalCorpusWorkerErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  // Cloudflare reports the hard D1 file-size boundary with provider-specific
  // wording. Keep that operational cause explicit without persisting the raw
  // provider message (which may contain SQL, URLs or source text).
  if (/\b(?:exceeded maximum db size|maximum database size|database is full|sqlite_full)\b/iu.test(message)) {
    return "LEGAL_CORPUS_D1_CAPACITY_EXHAUSTED";
  }
  const match = message.match(/\b(?:D1|LEGAL|SQLITE)_[A-Z0-9_]+\b/u);
  return match?.[0] ?? "LEGAL_CORPUS_WORKER_FAILED";
}

function ingestionEnabled(env: LegalCorpusWorkerEnv): boolean {
  return featureEnabled(env, "LEGAL_CORPUS_ENABLED")
    && featureEnabled(env, "LEGAL_CORPUS_AUTO_INGEST_ENABLED");
}

function denseBackfillEnabled(env: LegalCorpusWorkerEnv): boolean {
  return featureEnabled(env, "LEGAL_CORPUS_ENABLED")
    && featureEnabled(env, "LEGAL_CORPUS_DENSE_ENABLED")
    && !ingestionEnabled(env);
}

function sparseCompressionBackfillEnabled(env: LegalCorpusWorkerEnv): boolean {
  return env.APP_ENV === "staging"
    && env.LEGAL_CORPUS_SPARSE_COMPRESSION_ENABLED === "true";
}

function enabled(env: LegalCorpusWorkerEnv): boolean {
  return ingestionEnabled(env) || denseBackfillEnabled(env);
}

function processCron(env: LegalCorpusWorkerEnv): string {
  return env.APP_ENV === "staging"
    ? LEGAL_CORPUS_STAGING_PROCESS_CRON
    : LEGAL_CORPUS_PROCESS_CRON;
}

async function claimRun(
  controller: ScheduledController,
  env: LegalCorpusWorkerEnv,
): Promise<ClaimedRun | null> {
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.parse(now) - SCHEDULED_RUN_STALE_AFTER_MS).toISOString();
  // A deployment or runtime interruption can leave a durable `running` row
  // behind after its holder lease has expired. Preserve that evidence as an
  // explicit failed run before attempting the next slot; never overwrite a
  // holder whose lock is still current.
  await env.DB.prepare(`UPDATE scheduled_runs
    SET status='failed',error_code='LEGAL_CORPUS_SCHEDULE_LEASE_EXPIRED',
      finished_at=?,updated_at=?
    WHERE schedule_name=? AND status='running' AND started_at<=?
      AND NOT EXISTS (
        SELECT 1 FROM scheduled_locks
        WHERE name=? AND holder_id=scheduled_runs.holder_id AND expires_at>?
      )`)
    .bind(now, now, LOCK_NAME, staleBefore, LOCK_NAME, now)
    .run();
  const scheduledFor = new Date(controller.scheduledTime).toISOString();
  const expiresAt = new Date(Date.parse(now) + LOCK_MS).toISOString();
  const holderId = crypto.randomUUID();
  const id = crypto.randomUUID();
  const idempotencyKey = `${env.APP_ENV}:legal-corpus-worker:${controller.cron}:${controller.scheduledTime}`;
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO scheduled_locks
        (name,holder_id,acquired_at,expires_at,updated_at)
      SELECT ?,?,?,?,?
      WHERE EXISTS (
        SELECT 1 FROM legal_corpus_shard_control
        WHERE singleton_id=1 AND acquisition_state='active'
      )
      ON CONFLICT(name) DO UPDATE SET
        holder_id=excluded.holder_id,
        acquired_at=excluded.acquired_at,
        expires_at=excluded.expires_at,
        updated_at=excluded.updated_at
      WHERE scheduled_locks.expires_at<=excluded.acquired_at`)
      .bind(LOCK_NAME, holderId, now, expiresAt, now),
    env.DB.prepare(`INSERT INTO scheduled_runs
        (id,schedule_name,cron,scheduled_for,idempotency_key,holder_id,status,error_code,started_at,finished_at,created_at,updated_at)
      SELECT ?,?,?,?,?,?,'running',NULL,?,NULL,?,?
      WHERE EXISTS (
        SELECT 1 FROM scheduled_locks
        WHERE name=? AND holder_id=? AND expires_at>?
      ) AND EXISTS (
        SELECT 1 FROM legal_corpus_shard_control
        WHERE singleton_id=1 AND acquisition_state='active'
      )
      ON CONFLICT(idempotency_key) DO NOTHING`)
      .bind(
        id,
        "legal-corpus-worker",
        controller.cron,
        scheduledFor,
        idempotencyKey,
        holderId,
        now,
        now,
        now,
        LOCK_NAME,
        holderId,
        now,
      ),
  ]);
  if (Number(results[1]?.meta?.changes ?? 0) !== 1) {
    await env.DB.prepare("DELETE FROM scheduled_locks WHERE name=? AND holder_id=?")
      .bind(LOCK_NAME, holderId)
      .run();
    return null;
  }
  return { id, holderId };
}

async function finishRun(
  env: LegalCorpusWorkerEnv,
  run: ClaimedRun,
  status: "completed" | "failed",
  errorCode: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE scheduled_runs
      SET status=?,error_code=?,finished_at=?,updated_at=?
      WHERE id=? AND holder_id=? AND status='running'`)
      .bind(status, errorCode, now, now, run.id, run.holderId),
    env.DB.prepare("DELETE FROM scheduled_locks WHERE name=? AND holder_id=?")
      .bind(LOCK_NAME, run.holderId),
  ]);
  if (Number(results[0]?.meta?.changes ?? 0) !== 1) {
    throw new Error("LEGAL_CORPUS_SCHEDULE_LEASE_LOST");
  }
}

/**
 * Keep the durable scheduler fence alive while a bounded source operation is
 * waiting on Lex's robots delay or finishing D1/R2 maintenance. Without a
 * heartbeat, a slow but still live revision could outlive the fifteen-minute
 * lease and let the next cron tick start a second crawler against the same
 * host and queue.
 */
export async function renewRunLease(
  env: LegalCorpusWorkerEnv,
  run: ClaimedRun,
): Promise<void> {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.parse(now) + LOCK_MS).toISOString();
  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE scheduled_locks
      SET expires_at=?,updated_at=?
      WHERE name=? AND holder_id=?`).bind(
      expiresAt, now, LOCK_NAME, run.holderId,
    ),
    env.DB.prepare(`UPDATE scheduled_runs
      SET updated_at=?
      WHERE id=? AND holder_id=? AND status='running'`).bind(
      now, run.id, run.holderId,
    ),
  ]);
  if (Number(results[0]?.meta?.changes ?? 0) !== 1
    || Number(results[1]?.meta?.changes ?? 0) !== 1) {
    throw new Error("LEGAL_CORPUS_SCHEDULE_LEASE_LOST");
  }
}

export async function handleLegalCorpusScheduled(
  controller: ScheduledController,
  env: LegalCorpusWorkerEnv,
): Promise<void> {
  if (controller.cron !== processCron(env) && controller.cron !== LEGAL_CORPUS_SEED_CRON) {
    log("error", {
      event: "legal_corpus.unknown_cron",
      environment: env.APP_ENV,
      cron: controller.cron,
    });
    controller.noRetry();
    return;
  }
  if (!enabled(env)) {
    log("info", {
      event: "legal_corpus.disabled",
      environment: env.APP_ENV,
      cron: controller.cron,
    });
    controller.noRetry();
    return;
  }
  if (controller.cron === LEGAL_CORPUS_SEED_CRON && !ingestionEnabled(env)) {
    log("info", {
      event: "legal_corpus.seed_disabled",
      environment: env.APP_ENV,
      cron: controller.cron,
    });
    controller.noRetry();
    return;
  }

  let run: ClaimedRun | null;
  try {
    run = await claimRun(controller, env);
  } catch (error) {
    // D1 can reject the first write when the database reaches its hard size
    // ceiling. Treat claim failure as a bounded, fail-closed tick: never
    // retry the same write automatically and never start source work without
    // a durable scheduler lease.
    log("error", {
      event: "legal_corpus.claim_failed",
      environment: env.APP_ENV,
      cron: controller.cron,
      errorCode: legalCorpusWorkerErrorCode(error),
    });
    controller.noRetry();
    return;
  }
  if (!run) {
    log("info", {
      event: "legal_corpus.duplicate_or_busy",
      environment: env.APP_ENV,
      cron: controller.cron,
    });
    controller.noRetry();
    return;
  }

  try {
    if (controller.cron === LEGAL_CORPUS_SEED_CRON) {
      const scheduledAt = new Date(controller.scheduledTime);
      const metadata = await seedLexCorpusJobsFromMetadata(env, { now: scheduledAt });
      const catalog = await seedLexCatalogDiscoveryCheckpoints(env, scheduledAt);
      const maintenance = await scheduleLegalCorpusMaintenance(env, { now: scheduledAt });
      await finishRun(env, run, "completed", null);
      log("info", {
        event: "legal_corpus.seed_completed",
        environment: env.APP_ENV,
        cron: controller.cron,
        metadataConsidered: metadata.considered,
        metadataQueued: metadata.queued,
        checkpointsConsidered: catalog.considered,
        checkpointsCreated: catalog.created,
        maintenanceLocalDate: maintenance.localDate,
        dailyRefreshQueued: maintenance.dailyQueued,
        weeklyRefreshQueued: maintenance.weeklyQueued,
        monthlyRefreshQueued: maintenance.monthlyQueued,
        catalogCheckpointsReset: maintenance.catalogCheckpointsReset,
      });
      controller.noRetry();
      return;
    }

    // The process schedule must be self-starting. Requiring a staff member to
    // press the admin seed button would turn a resumable automatic corpus into
    // a manual approval gate. The seed operation is idempotent, so a fresh or
    // partially restored environment can safely recreate only the missing
    // category/language checkpoints before claiming the next page.
    let catalog = { considered: 0, created: 0 };
    const discoveries: Awaited<ReturnType<typeof runNextLexCatalogDiscoveryPage>>[] = [];
    const ingestions: Awaited<ReturnType<typeof runNextLegalCorpusIngestionJob>>[] = [];
    let coreCodeSeeds = { considered: 0, queued: 0 };
    let coreCode: Awaited<ReturnType<typeof runNextLexCoreCodeDiscovery>> = {
      status: "disabled", targetId: null, canonicalDocumentId: null, priorityCanonicalDocumentIds: [], queued: false, safeErrorCode: null,
    };
    let ingestionStartCutoffReached = false;
    // This local D1 reconciliation does not fetch a source. It removes only
    // known Lex reader-control labels that an older parser build could have
    // stored inside a title, keeping source cards and sparse title boosts clean.
    const titleRepairs = await reconcileLegalCorpusTitleUiNoise(env.DB);
    if (ingestionEnabled(env)) {
      await renewRunLease(env, run);
      catalog = await seedLexCatalogDiscoveryCheckpoints(env);
      const wait = async (delayMs: number) => {
        await renewRunLease(env, run);
        await scheduler.wait(delayMs);
        await renewRunLease(env, run);
      };
      const pacerStats = { robotsNetworkRequests: 0, persistentRobotsCacheHits: 0 };
      const fetchImpl = createPacedLexFetch({ db: env.DB, wait, stats: pacerStats });
      await renewRunLease(env, run);
      coreCodeSeeds = await seedLexCoreCodeJobs(env, { now: new Date(controller.scheduledTime) });
      await renewRunLease(env, run);
      coreCode = await runNextLexCoreCodeDiscovery(env, {
        now: new Date(controller.scheduledTime), wait, fetchImpl, pacingAlreadyApplied: true,
      });
      if (coreCode.status === "all_settled") {
        for (let index = 0; index < DISCOVERY_PAGES_PER_RUN; index += 1) {
          await renewRunLease(env, run);
          const result = await runNextLexCatalogDiscoveryPage(env, { wait, fetchImpl, pacingAlreadyApplied: true });
          discoveries.push(result);
          if (result.status === "empty" || result.status === "disabled" || result.status === "failed") break;
        }
      }
      const preferredCoreCodeIds = [...new Set([
        ...LEX_CORE_CODE_SEED_IDS,
        ...coreCode.priorityCanonicalDocumentIds,
      ])];
      const coverageBootstrapTarget = coreCode.status === "all_settled"
        ? await nextLegalCorpusCoverageBootstrapTarget(env.DB)
        : null;
      const nominalIngestionBudget = legalCorpusIngestionJobBudget(discoveries, {
        persistentRobotsPolicy: pacerStats.persistentRobotsCacheHits > 0,
        ingestionJobsPerRun: legalCorpusStagingIngestionJobsPerRun({
          appEnv: env.APP_ENV,
          configured: env.LEGAL_CORPUS_STAGING_INGESTION_JOBS_PER_RUN,
        }),
      });
      let corePagerContinuationRequired = legalCorpusCorePagerContinuationRequired(coreCode);
      let corePagerContinuationAttempted = false;
      const ingestionBudget = legalCorpusIngestionBudgetForCorePager({
        ingestionBudget: nominalIngestionBudget,
        continuePager: corePagerContinuationRequired,
      });
      const versionSlotIndexes = legalCorpusVersionSlotIndexes({
        ingestionBudget,
        queuedVersionJobs: await queuedLegalCorpusVersionJobs(env.DB),
      });
      for (let index = 0; index < ingestionBudget; index += 1) {
        const startCutoffMs = env.APP_ENV === "staging"
          ? LEGAL_CORPUS_STAGING_INGESTION_START_CUTOFF_MS
          : INGESTION_START_CUTOFF_MS;
        if (!legalCorpusIngestionStartAllowed(controller.scheduledTime, Date.now(), startCutoffMs)) {
          ingestionStartCutoffReached = true;
          break;
        }
        await renewRunLease(env, run);
        const reservedVersionSlot = versionSlotIndexes.includes(index);
        const coverageBootstrapSlot = index === 0 && coverageBootstrapTarget !== null;
        const preferredCatalogSlot = index < legalCorpusStagingIngestionJobsPerRun({
          appEnv: env.APP_ENV,
          configured: env.LEGAL_CORPUS_STAGING_INGESTION_JOBS_PER_RUN,
        }) && !reservedVersionSlot;
        const preferredSlotIndex = index - versionSlotIndexes.filter((slot) => slot < index).length;
        const result = await runNextLegalCorpusIngestionJob(env, {
          wait,
          fetchImpl,
          heartbeat: () => renewRunLease(env, run),
          preferredCatalogCategories: coverageBootstrapSlot
            ? [coverageBootstrapTarget.categoryKey]
            : preferredCatalogSlot
              ? LEGAL_CORPUS_PREFERRED_INGESTION_CATALOGUES
              : undefined,
          preferredCatalogLanguages: coverageBootstrapSlot
            ? [coverageBootstrapTarget.language]
            : preferredCatalogSlot
              ? [PREFERRED_INGESTION_LANGUAGE_ROTATION[
                (Math.floor(controller.scheduledTime / (4 * 60_000))
                  * PREFERRED_INGESTION_SLOTS_PER_RUN + preferredSlotIndex)
                % PREFERRED_INGESTION_LANGUAGE_ROTATION.length
              ]]
              : undefined,
          reservedQueuedJobType: reservedVersionSlot
            ? "version"
            : undefined,
          preferredCanonicalDocumentIds: preferredCoreCodeIds,
        });
        ingestions.push(result);
        if (result.status === "empty" || result.status === "disabled") break;
        // Keep a valid Lex pager session alive before a long historical batch
        // can consume the remainder of this Worker invocation. This consumes
        // the reserved slot above and never opens a parallel fetch stream.
        if (!corePagerContinuationAttempted
          && corePagerContinuationRequired
          && ingestions.filter((job) => job.claimed).length >= Math.min(2, ingestionBudget)) {
          corePagerContinuationAttempted = true;
          await renewRunLease(env, run);
          coreCode = await runNextLexCoreCodeDiscovery(env, {
            now: new Date(controller.scheduledTime), wait, fetchImpl, pacingAlreadyApplied: true,
          });
          corePagerContinuationRequired = legalCorpusCorePagerContinuationRequired(coreCode);
        }
      }
    }
    const qdrantBackfills: Awaited<ReturnType<typeof runNextLegalCorpusQdrantBackfillBatch>>[] = [];
    // The additive compressed index is populated only after a successful
    // staging migration. Its bounded transactional backfill leaves every
    // legacy posting readable until the replacement posting is committed.
    await renewRunLease(env, run);
    const sparseCompressionMaintenanceEnabled = ingestionEnabled(env)
      && sparseCompressionBackfillEnabled(env);
    const compactedSparseJsonChunks = sparseCompressionMaintenanceEnabled
      ? await compactLegacySparseJsonBatch(env.DB)
      : 0;
    const compressedSparseBackfillChunks = sparseCompressionMaintenanceEnabled
      ? await backfillCompressedSparseIndexBatch(env.DB)
      : 0;
    const ingestionClaimed = ingestions.some((result) => result.claimed);
    if (denseBackfillEnabled(env) && !ingestionClaimed) {
      for (let index = 0; index < QDRANT_BACKFILL_BATCHES_PER_IDLE_RUN; index += 1) {
        await renewRunLease(env, run);
        const result = await runNextLegalCorpusQdrantBackfillBatch(env);
        qdrantBackfills.push(result);
        if (result.status === "empty" || result.status === "disabled") break;
      }
    }
    // Snapshot only after an entire scheduled invocation starts with no
    // remaining backfill work. This creates a clean freeze boundary one
    // cron tick after the last vector write.
    let qdrantSnapshot: Awaited<ReturnType<typeof createLegalCorpusQdrantSnapshot>> | null = null;
    if (denseBackfillEnabled(env) && qdrantBackfills[0]?.status === "empty") {
      await renewRunLease(env, run);
      qdrantSnapshot = await createLegalCorpusQdrantSnapshot(env);
    }
    // A completed ingestion can still carry a safe source-condition code when
    // Lex has no official text representation. That condition is recorded in
    // the per-document failure ledger as `technically_unavailable` and is
    // included in coverage; it is not a failed scheduled run. Keep the run
    // ledger's error_code for actionable retry/terminal conditions only, so
    // operational status cannot falsely report a successful bounded crawl as
    // failed merely because one unavailable representation was resolved.
    const resolvedSourceConditionCount = ingestions.filter((result) =>
      result.status === "completed" && result.safeErrorCode !== null,
    ).length;
    const errorCode = legalCorpusActionableRunErrorCode({ coreCode, discoveries, ingestions });
    const failed = coreCode.status === "failed"
      || discoveries.some((result) => result.status === "failed")
      || ingestions.some((result) => result.status === "failed"
        || result.status === "halted_suspicious_change");
    await finishRun(env, run, failed ? "failed" : "completed", errorCode);
    log(failed ? "error" : "info", {
      event: failed ? "legal_corpus.process_failed" : "legal_corpus.process_completed",
      environment: env.APP_ENV,
      cron: controller.cron,
      discoveryPages: discoveries.length,
      discoveryClaimed: discoveries.filter((result) => result.claimed).length,
      checkpointsConsidered: catalog.considered,
      checkpointsCreated: catalog.created,
      coreCodeSeedsConsidered: coreCodeSeeds.considered,
      coreCodeSeedsQueued: coreCodeSeeds.queued,
      coreCodeDiscoveryStatus: coreCode.status,
      coreCodeTargetId: coreCode.targetId,
      coreCodeCanonicalDocumentId: coreCode.canonicalDocumentId,
      ingestionJobs: ingestions.length,
      ingestionClaimed: ingestions.filter((result) => result.claimed).length,
      ingestionStartCutoffReached,
      compactedSparseJsonChunks,
      compressedSparseBackfillChunks,
      qdrantBackfillBatches: qdrantBackfills.filter((result) => result.status === "indexed").length,
      qdrantBackfillChunks: qdrantBackfills.reduce((sum, result) => sum + result.chunkCount, 0),
      qdrantSnapshotStatus: qdrantSnapshot?.status ?? "not_attempted",
      titleRepairsDocuments: titleRepairs.documents,
      titleRepairsVariants: titleRepairs.variants,
      resolvedSourceConditionCount,
      errorCode,
    });
  } catch (error) {
    const errorCode = error instanceof LegalCorpusSparseIndexError
      ? error.code
      : legalCorpusWorkerErrorCode(error);
    try {
      await finishRun(env, run, "failed", errorCode);
    } catch {
      log("error", {
        event: "legal_corpus.finish_failed",
        environment: env.APP_ENV,
        cron: controller.cron,
      });
    }
    log("error", {
      event: "legal_corpus.run_failed",
      environment: env.APP_ENV,
      cron: controller.cron,
      errorCode,
    });
  }
  controller.noRetry();
}

function response(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    },
  });
}

const worker = {
  async fetch(request: Request, env: LegalCorpusWorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "GET") return response({ code: "METHOD_NOT_ALLOWED" }, 405);
    if (url.pathname === "/health") {
      return response({
        service: "legal-corpus-worker",
        environment: env.APP_ENV,
        enabled: enabled(env),
        status: "ok",
      });
    }
    if (url.pathname === "/ready") {
      try {
        await env.DB.prepare("SELECT 1 AS ready").first();
        return response({ service: "legal-corpus-worker", status: "ready" });
      } catch {
        return response({ service: "legal-corpus-worker", status: "not_ready" }, 503);
      }
    }
    return response({ code: "NOT_FOUND" }, 404);
  },
  async scheduled(controller: ScheduledController, env: LegalCorpusWorkerEnv): Promise<void> {
    await handleLegalCorpusScheduled(controller, env);
  },
} satisfies ExportedHandler<LegalCorpusWorkerEnv>;

export default worker;
