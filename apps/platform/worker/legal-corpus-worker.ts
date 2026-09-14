import {
  reconcileLegalCorpusTitleUiNoise,
  runNextLegalCorpusIngestionJob,
  type LegalCorpusIngestionEnv,
} from "../lib/legal-corpus/ingestion";
import {
  npaPriorityJobIds,
  runNextNpaTargetDiscovery,
  seedNpaTargetJobs,
} from "../lib/legal-corpus/lex-npa-target-discovery";
import { reconcileNpaCanonicalChunkCounts } from "../lib/legal-corpus/npa-registry";
import { featureEnabled } from "../lib/legal-corpus/trust";
import { runNextLegalCorpusQdrantBackfillBatch } from "../lib/legal-corpus/qdrant-indexing";
import type { QdrantCorpusEnv } from "../lib/legal-corpus/qdrant";
import { createLegalCorpusQdrantSnapshot } from "../lib/legal-corpus/qdrant-snapshots";
import { createPacedLexFetch } from "../lib/legal-corpus/lex-request-pacer";
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
  npaDiscovery?: CorpusWorkResult;
  discoveries: readonly CorpusWorkResult[];
  ingestions: readonly CorpusWorkResult[];
}): string | null {
  return (input.npaDiscovery?.status === "failed" ? input.npaDiscovery.safeErrorCode : null)
    ?? (input.coreCode.status === "failed" ? input.coreCode.safeErrorCode : null)
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

/** Operational diagnostics must never serialize source text or request data. */
function safeWorkerFailureDetail(error: unknown): { errorName: string; errorMessage: string } {
  if (!(error instanceof Error)) return { errorName: "NON_ERROR_THROWN", errorMessage: "non-error throw" };
  const message = error.message.replace(/[\r\n\t]+/gu, " ").trim();
  return {
    errorName: error.name.slice(0, 80) || "Error",
    errorMessage: message.slice(0, 240) || "empty error message",
  };
}

function scheduledFailureCode(
  environment: string,
  error: unknown,
  detail: { errorName: string; errorMessage: string },
): string {
  if (error instanceof LegalCorpusSparseIndexError) return error.code;
  // Staging needs a durable diagnostic when tail does not expose cron logs.
  // Production retains a non-descriptive code and never persists source text.
  if (environment !== "staging") return "LEGAL_CORPUS_WORKER_FAILED";
  const compactMessage = detail.errorMessage
    .replace(/[^A-Za-z0-9_:.-]+/gu, "_")
    .slice(0, 120);
  return `LEGAL_CORPUS_WORKER_FAILED:${detail.errorName}:${compactMessage || "UNKNOWN"}`;
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
      const npa = await seedNpaTargetJobs(env, { now: scheduledAt });
      await finishRun(env, run, "completed", null);
      log("info", {
        event: "legal_corpus.seed_completed",
        environment: env.APP_ENV,
        cron: controller.cron,
        npaTargetsConsidered: npa.considered,
        npaCandidateJobsQueued: npa.queued,
      });
      controller.noRetry();
      return;
    }

    // This Worker is the bounded statutory 100-NPA corpus lane. It must not
    // bootstrap or drain the general Lex catalogue: that would turn a P0
    // refresh into an unbounded crawl and let unrelated failures block QA.
    const discoveries: Array<CorpusWorkResult & { claimed: boolean }> = [];
    const ingestions: Awaited<ReturnType<typeof runNextLegalCorpusIngestionJob>>[] = [];
    let npaSeeds = { considered: 0, queued: 0 };
    let npaCanonicalChunkCountsReconciled = 0;
    let npaDiscovery: Awaited<ReturnType<typeof runNextNpaTargetDiscovery>> = {
      status: "disabled", documentKey: null, canonicalDocumentId: null, queued: false, safeErrorCode: null,
    };
    const coreCode = {
      status: "disabled", targetId: null, canonicalDocumentId: null, priorityCanonicalDocumentIds: [], queued: false, safeErrorCode: null,
    };
    let ingestionStartCutoffReached = false;
    // This local D1 reconciliation does not fetch a source. It removes only
    // known Lex reader-control labels that an older parser build could have
    // stored inside a title, keeping source cards and sparse title boosts clean.
    const titleRepairs = await reconcileLegalCorpusTitleUiNoise(env.DB);
    if (ingestionEnabled(env)) {
      const wait = (delayMs: number) => scheduler.wait(delayMs);
      const fetchImpl = createPacedLexFetch({ db: env.DB, wait });
      // One robots-paced P0 card per tick preserves LexUZ source discipline
      // and completes the 101 current/future cards within the daily window.
      npaSeeds = await seedNpaTargetJobs(env, { now: new Date(controller.scheduledTime) });
      npaCanonicalChunkCountsReconciled = await reconcileNpaCanonicalChunkCounts(
        env.DB,
        new Date(controller.scheduledTime),
      );
      const priorityNpaJobIds = await npaPriorityJobIds(
        env.DB,
        new Date(controller.scheduledTime),
      );
      npaDiscovery = await runNextNpaTargetDiscovery(env, {
        now: new Date(controller.scheduledTime), wait, fetchImpl, pacingAlreadyApplied: true,
      });
      const ingestionBudget = priorityNpaJobIds.length > 0 ? 1 : 0;
      for (let index = 0; index < ingestionBudget; index += 1) {
        if (!legalCorpusIngestionStartAllowed(controller.scheduledTime, Date.now())) {
          ingestionStartCutoffReached = true;
          break;
        }
        const result = await runNextLegalCorpusIngestionJob(env, {
          wait,
          fetchImpl,
          priorityJobIds: priorityNpaJobIds,
          strictPriorityOnly: true,
          sourceTimeoutMs: 30_000,
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
    const errorCode = legalCorpusActionableRunErrorCode({ coreCode, npaDiscovery, discoveries, ingestions });
    const failed = npaDiscovery.status === "failed"
      || coreCode.status === "failed"
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
      npaTargetsConsidered: npaSeeds.considered,
      npaCandidateJobsQueued: npaSeeds.queued,
      npaCanonicalChunkCountsReconciled,
      npaDiscoveryStatus: npaDiscovery.status,
      npaDiscoveryDocumentKey: npaDiscovery.documentKey,
      npaDiscoveryCanonicalDocumentId: npaDiscovery.canonicalDocumentId,
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
    const detail = safeWorkerFailureDetail(error);
    const errorCode = scheduledFailureCode(env.APP_ENV, error, detail);
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
      ...detail,
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
