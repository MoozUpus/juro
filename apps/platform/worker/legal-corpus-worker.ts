import {
  runNextLegalCorpusIngestionJob,
  seedLexCorpusJobsFromMetadata,
  type LegalCorpusIngestionEnv,
} from "../lib/legal-corpus/ingestion";
import {
  runNextLexCatalogDiscoveryPage,
  seedLexCatalogDiscoveryCheckpoints,
} from "../lib/legal-corpus/lex-catalog-discovery";
import { featureEnabled } from "../lib/legal-corpus/trust";
import { runNextLegalCorpusQdrantBackfillBatch } from "../lib/legal-corpus/qdrant-indexing";
import type { QdrantCorpusEnv } from "../lib/legal-corpus/qdrant";
import { createLegalCorpusQdrantSnapshot } from "../lib/legal-corpus/qdrant-snapshots";
import { createPacedLexFetch } from "../lib/legal-corpus/lex-request-pacer";
import { scheduleLegalCorpusMaintenance } from "../lib/legal-corpus/maintenance";
import { compactLegacySparseJsonBatch } from "../lib/legal-corpus/sparse-index";

export const LEGAL_CORPUS_PROCESS_CRON = "*/5 * * * *";
export const LEGAL_CORPUS_STAGING_PROCESS_CRON = "*/4 * * * *";
export const LEGAL_CORPUS_SEED_CRON = "5 19 * * *";

const LOCK_NAME = "legal-corpus-worker";
const LOCK_MS = 7 * 60_000;
const SCHEDULED_RUN_STALE_AFTER_MS = LOCK_MS;
// Coverage completion is gated on every category-language checkpoint, so give
// catalogue discovery three of the same nine paced request slots. This takes
// one slot from document ingestion rather than increasing Lex.uz traffic.
const DISCOVERY_PAGES_PER_RUN = 3;
// An earlier staging run with two catalogue pages plus eight ingestion fetches
// lasted from 17:55:28.188 to 18:00:28.323 UTC and lost the next cron tick.
// Six ingestion jobs keep the shared 20-second Lex host pacer authoritative
// while leaving enough margin for provider and D1 overhead. Reallocating one
// slot to discovery is cheaper than delaying category coverage for a large
// already-queued ingestion backlog.
const INGESTION_JOBS_PER_RUN = 6;
// Two of the six existing ingestion slots may prefer the primary legislative
// catalogues once discovery has durably recorded them. The other four remain
// FIFO and runNextLegalCorpusIngestionJob always claims a due retry first.
// This advances the raised provision target without starving official source
// categories that yield shorter acts or without increasing Lex.uz traffic.
const PREFERRED_INGESTION_SLOTS_PER_RUN = 2;
const PREFERRED_INGESTION_CATALOGUES = ["laws", "oliy_majlis", "president"] as const;
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
  // remains nine (3 discovery + 6 ingestion, or 0 + 9); the elapsed-time
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
    let ingestionStartCutoffReached = false;
    if (ingestionEnabled(env)) {
      catalog = await seedLexCatalogDiscoveryCheckpoints(env);
      const wait = (delayMs: number) => scheduler.wait(delayMs);
      const fetchImpl = createPacedLexFetch({ db: env.DB, wait });
      for (let index = 0; index < DISCOVERY_PAGES_PER_RUN; index += 1) {
        const result = await runNextLexCatalogDiscoveryPage(env, { wait, fetchImpl });
        discoveries.push(result);
        if (result.status === "empty" || result.status === "disabled" || result.status === "failed") break;
      }
      const ingestionBudget = legalCorpusIngestionJobBudget(discoveries);
      for (let index = 0; index < ingestionBudget; index += 1) {
        if (!legalCorpusIngestionStartAllowed(controller.scheduledTime, Date.now())) {
          ingestionStartCutoffReached = true;
          break;
        }
        const result = await runNextLegalCorpusIngestionJob(env, {
          wait,
          fetchImpl,
          preferredCatalogCategories: index < PREFERRED_INGESTION_SLOTS_PER_RUN
            ? PREFERRED_INGESTION_CATALOGUES
            : undefined,
          preferredCatalogLanguages: index < PREFERRED_INGESTION_SLOTS_PER_RUN
            ? [PREFERRED_INGESTION_LANGUAGE_ROTATION[
              (Math.floor(controller.scheduledTime / (4 * 60_000))
                * PREFERRED_INGESTION_SLOTS_PER_RUN + index)
                % PREFERRED_INGESTION_LANGUAGE_ROTATION.length
            ]]
            : undefined,
        });
        ingestions.push(result);
        if (result.status === "empty" || result.status === "disabled") break;
      }
    }
    const qdrantBackfills: Awaited<ReturnType<typeof runNextLegalCorpusQdrantBackfillBatch>>[] = [];
    const compactedSparseJsonChunks = ingestionEnabled(env)
      ? await compactLegacySparseJsonBatch(env.DB)
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
    const errorCode = discoveries.find((result) => result.safeErrorCode)?.safeErrorCode
      ?? ingestions.find((result) => result.safeErrorCode)?.safeErrorCode
      ?? null;
    const failed = discoveries.some((result) => result.status === "failed")
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
      ingestionJobs: ingestions.length,
      ingestionClaimed: ingestions.filter((result) => result.claimed).length,
      ingestionStartCutoffReached,
      compactedSparseJsonChunks,
      qdrantBackfillBatches: qdrantBackfills.filter((result) => result.status === "indexed").length,
      qdrantBackfillChunks: qdrantBackfills.reduce((sum, result) => sum + result.chunkCount, 0),
      qdrantSnapshotStatus: qdrantSnapshot?.status ?? "not_attempted",
      errorCode,
    });
  } catch {
    try {
      await finishRun(env, run, "failed", "LEGAL_CORPUS_WORKER_FAILED");
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
      errorCode: "LEGAL_CORPUS_WORKER_FAILED",
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
