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
import { syncLegalCorpusVersionToQdrant } from "../lib/legal-corpus/qdrant-indexing";
import type { QdrantCorpusEnv } from "../lib/legal-corpus/qdrant";

export const LEGAL_CORPUS_PROCESS_CRON = "*/5 * * * *";
export const LEGAL_CORPUS_SEED_CRON = "5 19 * * *";

const LOCK_NAME = "legal-corpus-worker";
const LOCK_MS = 4 * 60_000;

type LegalCorpusWorkerEnv = LegalCorpusIngestionEnv & QdrantCorpusEnv & {
  OPENAI_API_KEY?: string;
  EMBEDDING_MODEL?: string;
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

function enabled(env: LegalCorpusWorkerEnv): boolean {
  return featureEnabled(env, "LEGAL_CORPUS_ENABLED")
    && featureEnabled(env, "LEGAL_CORPUS_AUTO_INGEST_ENABLED");
}

async function claimRun(
  controller: ScheduledController,
  env: LegalCorpusWorkerEnv,
): Promise<ClaimedRun | null> {
  const now = new Date().toISOString();
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
  if (controller.cron !== LEGAL_CORPUS_PROCESS_CRON && controller.cron !== LEGAL_CORPUS_SEED_CRON) {
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
      const metadata = await seedLexCorpusJobsFromMetadata(env);
      const catalog = await seedLexCatalogDiscoveryCheckpoints(env);
      await finishRun(env, run, "completed", null);
      log("info", {
        event: "legal_corpus.seed_completed",
        environment: env.APP_ENV,
        cron: controller.cron,
        metadataConsidered: metadata.considered,
        metadataQueued: metadata.queued,
        checkpointsConsidered: catalog.considered,
        checkpointsCreated: catalog.created,
      });
      controller.noRetry();
      return;
    }

    const discovery = await runNextLexCatalogDiscoveryPage(env, {
      wait: (delayMs) => scheduler.wait(delayMs),
    });
    const ingestion = await runNextLegalCorpusIngestionJob(env, {
      wait: (delayMs) => scheduler.wait(delayMs),
      afterIngest: async (result) => {
        if (!result.versionId) return;
        await syncLegalCorpusVersionToQdrant(env, result.versionId);
      },
    });
    const errorCode = discovery.safeErrorCode ?? ingestion.safeErrorCode;
    const failed = discovery.status === "failed"
      || ingestion.status === "failed"
      || ingestion.status === "halted_suspicious_change";
    await finishRun(env, run, failed ? "failed" : "completed", errorCode);
    log(failed ? "error" : "info", {
      event: failed ? "legal_corpus.process_failed" : "legal_corpus.process_completed",
      environment: env.APP_ENV,
      cron: controller.cron,
      discoveryStatus: discovery.status,
      discoveryClaimed: discovery.claimed,
      ingestionStatus: ingestion.status,
      ingestionClaimed: ingestion.claimed,
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
