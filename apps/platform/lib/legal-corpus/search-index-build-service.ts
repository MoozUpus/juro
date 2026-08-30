import { z } from "zod";

import {
  reconcileLegalSearchIndexBuildBatch,
  runNextLegalSearchIndexBuildBatch,
} from "./qdrant-indexing";
import { QdrantCorpusError, QdrantLegalCorpusClient } from "./qdrant";
import {
  finalizeLegalSearchIndexBuild,
  loadLegalSearchIndexBuild,
} from "./search-index-manifest";

const ROOT = "/internal/legal-corpus/search-index-build/";
const advancePath = `${ROOT}advance`;
const reconcilePath = `${ROOT}reconcile`;
const finalizePath = `${ROOT}finalize`;
const inputSchema = z.object({
  manifestId: z.string().regex(/^[A-Za-z0-9:_-]{1,160}$/u),
  maxChunks: z.number().int().min(1).max(256).optional(),
  afterChunkId: z.string().regex(/^[A-Za-z0-9:_-]{1,200}$/u).optional(),
}).strict();

type BuildServiceEnv = {
  DB: D1Database;
  APP_ENV: "development" | "staging" | "production";
  LEGAL_CORPUS_ENABLED?: string;
  LEGAL_CORPUS_DENSE_ENABLED?: string;
  QDRANT_URL?: string;
  QDRANT_API_KEY?: string;
  QDRANT_COLLECTION?: string;
  QDRANT_SERVICE?: Fetcher;
  BACKUP_BUCKET?: R2Bucket;
  OPENAI_API_KEY?: string;
  EMBEDDING_MODEL?: string;
  LEGAL_CORPUS_EMBEDDING_SERVICE?: Fetcher;
};

function reply(body: unknown, status = 200): Response {
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

export function isLegalSearchIndexBuildPath(pathname: string): boolean {
  return pathname === advancePath || pathname === reconcilePath || pathname === finalizePath;
}

/** Private service-binding build plane; the corpus Worker has no public route. */
export async function handleLegalSearchIndexBuildRequest(
  request: Request,
  env: BuildServiceEnv,
): Promise<Response> {
  if (request.method !== "POST") return reply({ code: "METHOD_NOT_ALLOWED" }, 405);
  if (!request.headers.get("content-type")?.toLocaleLowerCase().startsWith("application/json")) {
    return reply({ code: "JSON_REQUIRED" }, 415);
  }
  try {
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > 2_048) return reply({ code: "PAYLOAD_TOO_LARGE" }, 413);
    const input = inputSchema.parse(await request.json());
    const pathname = new URL(request.url).pathname;
    if (pathname === advancePath) {
      return reply({ result: await runNextLegalSearchIndexBuildBatch(env, input.manifestId, {
        maxChunks: input.maxChunks,
      }) });
    }
    if (pathname === reconcilePath) {
      return reply({ result: await reconcileLegalSearchIndexBuildBatch(
        env,
        input.manifestId,
        input.afterChunkId,
        input.maxChunks,
        { wait: (delayMs) => scheduler.wait(delayMs) },
      ) });
    }
    if (pathname === finalizePath) {
      const build = await loadLegalSearchIndexBuild(env.DB, input.manifestId);
      if (!build || build.environment !== env.APP_ENV) {
        return reply({ code: "LEGAL_SEARCH_BUILD_NOT_FOUND" }, 404);
      }
      const client = new QdrantLegalCorpusClient({
        ...env,
        QDRANT_COLLECTION: build.qdrantCollection,
      });
      await client.ensureSearchPayloadIndexes();
      await client.assertCompatible();
      const densePointCount = await client.countPoints(false);
      if (densePointCount !== build.chunkCount) {
        return reply({
          code: "LEGAL_SEARCH_BUILD_COUNT_MISMATCH",
          expectedPointCount: build.chunkCount,
          actualPointCount: densePointCount,
        }, 409);
      }
      const result = await finalizeLegalSearchIndexBuild({
        db: env.DB,
        environment: env.APP_ENV,
        manifestId: input.manifestId,
        densePointCount,
      });
      return reply({ result });
    }
    return reply({ code: "NOT_FOUND" }, 404);
  } catch (error) {
    console.error("Legal search index build request failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown failure",
      statusCode: error instanceof QdrantCorpusError ? error.statusCode : undefined,
    });
    const baseCode = error instanceof Error && /^[A-Z][A-Z0-9_]{2,80}$/u.test(error.message)
      ? error.message
      : "LEGAL_SEARCH_BUILD_FAILED";
    const code = error instanceof QdrantCorpusError && error.statusCode
      ? `${baseCode}_${error.statusCode}`
      : baseCode;
    return reply({ code }, code.endsWith("NOT_FOUND") ? 404 : 409);
  }
}
