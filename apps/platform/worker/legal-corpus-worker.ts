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
  LEX_CORE_CODE_SEED_IDS,
  runNextLexCoreCodeDiscovery,
  seedLexCoreCodeJobs,
} from "../lib/legal-corpus/lex-core-code-discovery";
import { featureEnabled } from "../lib/legal-corpus/trust";
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
const LOCK_MS = 7 * 60_000;
const SCHEDULED_RUN_STALE_AFTER_MS = LOCK_MS;
// Once all core codes are settled, three catalogue pages advance the durable
// discovery checkpoints per staging tick. That replaces three document slots,
// so the shared 20-second host pacer still permits at most eight normal
// Lex.uz requests per four-minute invocation. Until all core codes have an
// exact official title match, the catalogue phase remains paused in favour of
// the bounded code-title lookup.
const DISCOVERY_PAGES_PER_RUN = 3;
// Five sequential document jobs plus the three catalogue pages above retain
// the prior eight-request normal ceiling. The 195-second start fence remains
// authoritative: a document requiring a second official representation simply
// leaves a later durable job queued rather than overlapping the next tick.
const INGESTION_JOBS_PER_RUN = 5;
// Four of the five existing ingestion slots may prefer already-discovered,
// article-rich official catalogues. Place the explicitly reserved historical
// version slot after four fetch slots, so secondary PDF/ZIP representations
// cannot consistently consume the start window before versioning progresses.
// Due retries remain globally first. This remains a sequential, bounded
// prioritisation rather than a new crawl stream.
const PREFERRED_INGESTION_SLOTS_PER_RUN = 4;
const VERSION_INGESTION_SLOT_INDEX = 4;
const PREFERRED_INGESTION_CATALOGUES = [
  "court_acts",
  "laws",
  "court_practice",
  "oliy_majlis",
  "president",
] as const;
const PREFERRED_INGESTION_LANGUAGE_ROTATION = ["uz-Cyrl", "ru", "uz-Latn", "en"] as const;
// A short canonical page may require one additional robots-checked, paced PDF
// or ZIP representation fetch. Stop claiming new jobs after 3m15s from the
// scheduled tick so one worst-case HTML + representation job can still finish
// before the next staging invocation. More than eight hours of post-fence
// staging evidence kept ordinary runs between 195s and 202s, leaving at least
// 38s before the four-minute tick. A rare overrun remains fail-closed behind
// the distributed lock. Production retains the five-minute cadence and the
// durable queue retains every job not started in this window.
const INGESTION_START_CUTOFF_MS = 195_000;
// Dense activation happens only after the source queue is frozen. Four
// 64-chunk batches cap one invocation at eight embedding calls while allowing
// the complete current corpus to resume from D1 after a Worker restart.
const QDRANT_BACKFILL_BATCHES_PER_IDLE_RUN = 4;

export function legalCorpusIngestionJobBudget(
  discoveries: readonly { claimed: boolean; status: string }[],
): number {
  // Reuse only catalogue slots that were proved empty. A failed/disabled
  // discovery does not grant extra nominal source jobs. The nominal maximum
  // remains nine (3 discovery + 5 ingestion, or an earlier empty discovery
  // page plus reclaimed ingestion capacity); the elapsed-time
  // start fence below is authoritative when a job discovers a secondary PDF
  // or ZIP representation and therefore consumes an additional paced fetch.
  if (!discoveries.some((result) => result.status === "empty")) return INGESTION_JOBS_PER_RUN;
  const claimed = discoveries.filter((result) => result.claimed).length;
  return INGESTION_JOBS_PER_RUN + Math.max(0, DISCOVERY_PAGES_PER_RUN - claimed);
}

export function legalCorpusIngestionStartAllowed(
  scheduledTime: number,
  now: number,
): boolean {
  if (!Number.isFinite(scheduledTime) || !Number.isFinite(now)) return false;
  return Math.max(0, now - scheduledTime) < INGESTION_START_CUTOFF_MS;
}

type LegalCorpusWorkerEnv = LegalCorpusIngestionEnv & QdrantCorpusEnv & {
  BACKUP_BUCKET?: R2Bucket;
  OPENAI_API_KEY?: string;
  EMBEDDING_MODEL?: string;
  LEGAL_CORPUS_EMBEDDING_SERVICE?: Fetcher;
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

function ingestionEnabled(env: LegalCorpusWorkerEnv): boolean {
  return featureEnabled(env, "LEGAL_CORPUS_ENABLED")
    && featureEnabled(env, "LEGAL_CORPUS_AUTO_INGEST_ENABLED");
}

function denseBackfillEnabled(env: LegalCorpusWorkerEnv): boolean {
  return featureEnabled(env, "LEGAL_CORPUS_ENABLED")
    && featureEnabled(env, "LEGAL_CORPUS_DENSE_ENABLED")
    && !ingestionEnabled(env);
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
      VALUES (?,?,?,?,?)
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

  const run = await claimRun(controller, env);
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
      catalog = await seedLexCatalogDiscoveryCheckpoints(env);
      const wait = (delayMs: number) => scheduler.wait(delayMs);
      const fetchImpl = createPacedLexFetch({ db: env.DB, wait });
      coreCodeSeeds = await seedLexCoreCodeJobs(env, { now: new Date(controller.scheduledTime) });
      coreCode = await runNextLexCoreCodeDiscovery(env, {
        now: new Date(controller.scheduledTime), wait, fetchImpl,
      });
      if (coreCode.status === "all_settled") {
        for (let index = 0; index < DISCOVERY_PAGES_PER_RUN; index += 1) {
          const result = await runNextLexCatalogDiscoveryPage(env, { wait, fetchImpl });
          discoveries.push(result);
          if (result.status === "empty" || result.status === "disabled" || result.status === "failed") break;
        }
      }
      const preferredCoreCodeIds = [...new Set([
        ...LEX_CORE_CODE_SEED_IDS,
        ...coreCode.priorityCanonicalDocumentIds,
      ])];
      const ingestionBudget = legalCorpusIngestionJobBudget(discoveries);
      for (let index = 0; index < ingestionBudget; index += 1) {
        if (!legalCorpusIngestionStartAllowed(controller.scheduledTime, Date.now())) {
          ingestionStartCutoffReached = true;
          break;
        }
        const reservedVersionSlot = index === VERSION_INGESTION_SLOT_INDEX;
        const preferredCatalogSlot = index < INGESTION_JOBS_PER_RUN && !reservedVersionSlot;
        const preferredSlotIndex = index < VERSION_INGESTION_SLOT_INDEX ? index : index - 1;
        const result = await runNextLegalCorpusIngestionJob(env, {
          wait,
          fetchImpl,
          preferredCatalogCategories: preferredCatalogSlot
            ? PREFERRED_INGESTION_CATALOGUES
            : undefined,
          preferredCatalogLanguages: preferredCatalogSlot
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
      }
    }
    const qdrantBackfills: Awaited<ReturnType<typeof runNextLegalCorpusQdrantBackfillBatch>>[] = [];
    const compactedSparseJsonChunks = ingestionEnabled(env)
      ? await compactLegacySparseJsonBatch(env.DB)
      : 0;
    // The additive compressed index is populated only after a successful
    // staging migration. Its bounded transactional backfill leaves every
    // legacy posting readable until the replacement posting is committed.
    const compressedSparseBackfillChunks = ingestionEnabled(env)
      ? await backfillCompressedSparseIndexBatch(env.DB)
      : 0;
    const ingestionClaimed = ingestions.some((result) => result.claimed);
    if (denseBackfillEnabled(env) && !ingestionClaimed) {
      for (let index = 0; index < QDRANT_BACKFILL_BATCHES_PER_IDLE_RUN; index += 1) {
        const result = await runNextLegalCorpusQdrantBackfillBatch(env);
        qdrantBackfills.push(result);
        if (result.status === "empty" || result.status === "disabled") break;
      }
    }
    const qdrantSnapshot = denseBackfillEnabled(env)
      // Snapshot only after an entire scheduled invocation starts with no
      // remaining backfill work. This creates a clean freeze boundary one
      // cron tick after the last vector write.
      && qdrantBackfills[0]?.status === "empty"
      ? await createLegalCorpusQdrantSnapshot(env)
      : null;
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
      : "LEGAL_CORPUS_WORKER_FAILED";
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
