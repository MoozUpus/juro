import { z } from "zod";
import type { LegalSourceSpan } from "../ai/provider";
import {
  findJuroLegalPassages,
  hydrateJuroLegalSources,
  inspectJuroActRecord,
  loadJuroProvisionWindow,
  type JuroActRecord,
  type JuroLegalCorpusReadTools,
} from "./legal-research-loop";
import type {
  LegalCorpusRetrievalItem,
  LegalCorpusSearchScope,
} from "./retrieval";
import {
  legalCorpusLanguageSchema,
  legalCorpusSourceClassSchema,
} from "./trust";
import { createQdrantDenseBatchSearch, createQdrantDenseSearch } from "./qdrant-indexing";
import {
  resolveActiveLegalSearchIndex,
  resolveLegalSearchIndexManifest,
} from "./search-index-manifest";

export const JURO_LEGAL_CORPUS_TOOL_NAMES = {
  findLegalSources: "find_juro_legal_sources",
  findLegalSourcesBatch: "find_juro_legal_sources_batch",
  inspectLegalAct: "inspect_juro_legal_act",
  readLegalProvisions: "read_juro_legal_provisions",
  hydrateLegalSources: "hydrate_juro_legal_sources",
} as const;

const TOOL_ROOT = "/internal/legal-corpus/read-tools/";
const MAX_REQUEST_BYTES = 16 * 1024;
// A five-branch hybrid packet can contain up to 100 bounded public provision
// excerpts. Keep a hard private-boundary ceiling while allowing that one
// batched response to replace five separate service round trips.
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const anchorChunkIdSchema = z.string().trim().min(1).max(200)
  .regex(/^[A-Za-z0-9:_-]+$/u);
const publicScopeSchema = z.object({
  includeHistorical: z.boolean().optional(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).nullable().optional(),
  indexManifestId: z.string().regex(/^[A-Za-z0-9:_-]{1,160}$/u).nullable().optional(),
}).strict();

const findLegalSourcesInputSchema = z.object({
  query: z.string().trim().min(1).max(900),
  locale: z.enum(["ru", "uz"]),
  limit: z.number().int().min(1).max(20).default(8),
  scope: publicScopeSchema.optional(),
}).strict();

const inspectLegalActInputSchema = z.object({
  anchorChunkId: anchorChunkIdSchema,
}).strict();

const readLegalProvisionsInputSchema = z.object({
  anchorChunkId: anchorChunkIdSchema,
  before: z.number().int().min(0).max(12).default(2),
  after: z.number().int().min(0).max(24).default(4),
}).strict();

const hydrateLegalSourcesInputSchema = z.object({
  anchorChunkIds: z.array(anchorChunkIdSchema).min(1).max(12),
  before: z.number().int().min(0).max(12).default(2),
  after: z.number().int().min(0).max(24).default(4),
  includeReferences: z.boolean().optional(),
}).strict();

const findLegalSourcesBatchInputSchema = z.object({
  queries: z.array(z.string().trim().min(1).max(900)).min(1).max(5),
  locale: z.enum(["ru", "uz"]),
  limit: z.number().int().min(1).max(20).default(8),
  scope: publicScopeSchema.optional(),
}).strict();

const optionalText = z.string().max(10_000).nullable();
const legalCorpusRetrievalItemSchema = z.object({
  chunkId: anchorChunkIdSchema,
  provisionId: z.string().trim().min(1).max(240).optional(),
  documentId: z.string().min(1).max(200),
  documentTitle: z.string().min(1).max(2_000),
  documentType: optionalText,
  documentNumber: optionalText,
  adoptingAuthority: optionalText,
  sourceClass: legalCorpusSourceClassSchema,
  articleNumber: optionalText,
  articleTitle: optionalText,
  exactQuote: z.string().min(1).max(100_000),
  sourceUrl: z.string().url().max(2_048).nullable(),
  language: legalCorpusLanguageSchema,
  status: z.enum(["active", "repealed", "historical", "unknown"]),
  validFrom: optionalText,
  validTo: optionalText,
  versionDate: optionalText,
  fetchedAt: z.string().min(1).max(100),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  provider: z.string().max(100).optional(),
  sparseRank: z.number().int().positive().optional(),
  denseRank: z.number().int().positive().optional(),
  semanticScore: z.number().finite().optional(),
  fusionScore: z.number().finite().optional(),
  windowHydrated: z.boolean().optional(),
  candidateExcerptOnly: z.boolean().optional(),
}).strict();

const juroActRecordSchema = z.object({
  documentId: z.string().min(1).max(200),
  title: z.string().min(1).max(2_000),
  documentType: optionalText,
  documentNumber: optionalText,
  adoptingAuthority: optionalText,
  adoptionDate: optionalText,
  publicationDate: optionalText,
  language: legalCorpusLanguageSchema,
  status: z.enum(["active", "repealed", "historical", "unknown"]),
  validFrom: optionalText,
  validTo: optionalText,
  versionDate: optionalText,
  sourceUrl: z.string().url().max(2_048),
  fetchedAt: z.string().min(1).max(100),
}).strict();

const legalSourceSpanSchema = z.object({
  id: anchorChunkIdSchema,
  article: z.string().max(2_000).nullable(),
  paragraph: z.string().max(2_000).nullable(),
  text: z.string().min(1).max(100_000),
  textSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  quality: z.literal("high"),
  provisionSequence: z.number().int().nonnegative().optional(),
}).strict();

const hydratedLegalSourceSchema = z.object({
  anchorChunkId: anchorChunkIdSchema,
  act: juroActRecordSchema.nullable(),
  spans: z.array(legalSourceSpanSchema).max(64),
}).strict();

export type JuroLegalCorpusReadServiceEnv = Pick<Env, "DB"> & {
  APP_ENV?: "development" | "staging" | "production";
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

type ReadServiceDependencies = {
  denseSearch?: (query: string, limit: number) => Promise<Array<{ chunkId: string; score: number }>>;
  denseBatchSearch?: (
    queries: readonly string[],
    limit: number,
  ) => Promise<Array<Array<{ chunkId: string; score: number }>>>;
  denseSearchIncludesSparse?: boolean;
};

function toolPath(name: (typeof JURO_LEGAL_CORPUS_TOOL_NAMES)[keyof typeof JURO_LEGAL_CORPUS_TOOL_NAMES]): string {
  return `${TOOL_ROOT}${name}`;
}

export function isJuroLegalCorpusReadToolPath(pathname: string): boolean {
  return Object.values(JURO_LEGAL_CORPUS_TOOL_NAMES)
    .some((name) => pathname === toolPath(name));
}

async function readBoundedJson(
  body: ReadableStream<Uint8Array> | null,
  contentLength: string | null,
  maxBytes: number,
): Promise<unknown> {
  const declaredLength = contentLength === null ? null : Number(contentLength);
  if (declaredLength !== null && Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RangeError("LEGAL_CORPUS_READ_PACKET_TOO_LARGE");
  }
  if (!body) throw new TypeError("LEGAL_CORPUS_READ_PACKET_REQUIRED");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw new RangeError("LEGAL_CORPUS_READ_PACKET_TOO_LARGE");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

function serviceResponse(body: unknown, status = 200): Response {
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

/** Private service-binding handler. It intentionally exposes no write operation. */
export async function handleJuroLegalCorpusReadToolRequest(
  request: Request,
  env: JuroLegalCorpusReadServiceEnv,
  dependencies: ReadServiceDependencies = {},
): Promise<Response> {
  if (request.method !== "POST") return serviceResponse({ code: "METHOD_NOT_ALLOWED" }, 405);
  if (!request.headers.get("content-type")?.toLocaleLowerCase().startsWith("application/json")) {
    return serviceResponse({ code: "JSON_REQUIRED" }, 415);
  }
  const pathname = new URL(request.url).pathname;
  try {
    const packet = await readBoundedJson(
      request.body,
      request.headers.get("content-length"),
      MAX_REQUEST_BYTES,
    );
    if (pathname === toolPath(JURO_LEGAL_CORPUS_TOOL_NAMES.findLegalSources)) {
      const startedAt = Date.now();
      const input = findLegalSourcesInputSchema.parse(packet);
      const targetManifestId = input.scope?.indexManifestId ?? null;
      const activeIndex = env.APP_ENV
        ? targetManifestId
          ? await resolveLegalSearchIndexManifest(env.DB, env.APP_ENV, targetManifestId)
          : await resolveActiveLegalSearchIndex(env.DB, env.APP_ENV)
        : null;
      const manifestResolvedAt = Date.now();
      if (targetManifestId && !activeIndex) throw new TypeError("LEGAL_SEARCH_INDEX_VERSION_NOT_FOUND");
      const denseSearch = dependencies.denseSearch ?? (env.APP_ENV
        ? createQdrantDenseSearch({
          ...env,
          APP_ENV: env.APP_ENV,
          QDRANT_COLLECTION: activeIndex?.qdrantCollection ?? env.QDRANT_COLLECTION,
          EMBEDDING_MODEL: activeIndex?.embeddingModel ?? env.EMBEDDING_MODEL,
        }, { expectedPointCount: activeIndex?.densePointCount })
        : undefined);
      if (!denseSearch) throw new TypeError("LEGAL_CORPUS_HYBRID_REQUIRED");
      const result = await findJuroLegalPassages({
        db: env.DB,
        query: input.query,
        scope: {
          ...input.scope,
          indexManifestId: activeIndex?.manifestId ?? input.scope?.indexManifestId ?? null,
        },
        limit: input.limit,
        denseSearch,
        denseSearchIncludesSparse: dependencies.denseSearch
          ? dependencies.denseSearchIncludesSparse === true
          : Boolean(denseSearch),
      }).then((items) => items.map((item) => ({
        ...item,
        // Retrieval hydrated this complete immutable chunk from D1; its text
        // and stored hash can be used directly if the reranker selects it.
        windowHydrated: true,
        candidateExcerptOnly: false,
      })));
      if (env.APP_ENV !== "production") {
        console.log(JSON.stringify({
          event: "legal_corpus.read_timing",
          environment: env.APP_ENV,
          manifestResolutionMs: manifestResolvedAt - startedAt,
          retrievalMs: Date.now() - manifestResolvedAt,
          resultCount: result.length,
        }));
      }
      return serviceResponse({ result });
    }
    if (pathname === toolPath(JURO_LEGAL_CORPUS_TOOL_NAMES.inspectLegalAct)) {
      const input = inspectLegalActInputSchema.parse(packet);
      const result = await inspectJuroActRecord({ db: env.DB, ...input });
      return serviceResponse({ result });
    }
    if (pathname === toolPath(JURO_LEGAL_CORPUS_TOOL_NAMES.readLegalProvisions)) {
      const input = readLegalProvisionsInputSchema.parse(packet);
      const result = await loadJuroProvisionWindow({ db: env.DB, ...input });
      return serviceResponse({ result });
    }
    if (pathname === toolPath(JURO_LEGAL_CORPUS_TOOL_NAMES.hydrateLegalSources)) {
      const startedAt = Date.now();
      const input = hydrateLegalSourcesInputSchema.parse(packet);
      const anchorChunkIds = [...new Set(input.anchorChunkIds)];
      const result = await hydrateJuroLegalSources({
        db: env.DB,
        anchorChunkIds,
        before: input.before,
        after: input.after,
        includeReferences: input.includeReferences,
      });
      if (env.APP_ENV !== "production") {
        console.log(JSON.stringify({
          event: "legal_corpus.hydration_timing",
          environment: env.APP_ENV,
          anchorCount: anchorChunkIds.length,
          includeReferences: input.includeReferences === true,
          elapsedMs: Date.now() - startedAt,
          spanCount: result.reduce((count, packet) => count + packet.spans.length, 0),
        }));
      }
      return serviceResponse({ result });
    }
    if (pathname === toolPath(JURO_LEGAL_CORPUS_TOOL_NAMES.findLegalSourcesBatch)) {
      const startedAt = Date.now();
      const input = findLegalSourcesBatchInputSchema.parse(packet);
      const targetManifestId = input.scope?.indexManifestId ?? null;
      const activeIndex = env.APP_ENV
        ? targetManifestId
          ? await resolveLegalSearchIndexManifest(env.DB, env.APP_ENV, targetManifestId)
          : await resolveActiveLegalSearchIndex(env.DB, env.APP_ENV)
        : null;
      if (targetManifestId && !activeIndex) throw new TypeError("LEGAL_SEARCH_INDEX_VERSION_NOT_FOUND");
      const denseBatchSearch = dependencies.denseBatchSearch ?? (env.APP_ENV
        ? createQdrantDenseBatchSearch({
          ...env,
          APP_ENV: env.APP_ENV,
          QDRANT_COLLECTION: activeIndex?.qdrantCollection ?? env.QDRANT_COLLECTION,
          EMBEDDING_MODEL: activeIndex?.embeddingModel ?? env.EMBEDDING_MODEL,
        }, { expectedPointCount: activeIndex?.densePointCount })
        : undefined);
      if (!denseBatchSearch) throw new TypeError("LEGAL_CORPUS_HYBRID_REQUIRED");
      const denseResults = await denseBatchSearch(input.queries, input.limit * 2);
      const result = await Promise.all(input.queries.map((query, index) => findJuroLegalPassages({
        db: env.DB,
        query,
        scope: {
          ...input.scope,
          indexManifestId: activeIndex?.manifestId ?? input.scope?.indexManifestId ?? null,
        },
        limit: input.limit,
        denseSearch: async () => denseResults[index] ?? [],
        denseSearchIncludesSparse: true,
      }).then((items) => items.map((item) => {
        const candidateExcerptOnly = item.exactQuote.length > 3_000;
        return {
          ...item,
          // Candidate ranking reads at most 3,000 characters. Short chunks
          // remain exact D1 evidence; only a truncated chunk must be hydrated
          // again if the reranker selects it.
          exactQuote: item.exactQuote.slice(0, 3_000),
          candidateExcerptOnly,
          windowHydrated: !candidateExcerptOnly,
        };
      }))));
      if (env.APP_ENV !== "production") {
        console.log(JSON.stringify({
          event: "legal_corpus.read_batch_timing",
          environment: env.APP_ENV,
          queryCount: input.queries.length,
          elapsedMs: Date.now() - startedAt,
          resultCount: result.reduce((count, items) => count + items.length, 0),
        }));
      }
      return serviceResponse({ result });
    }
    return serviceResponse({ code: "NOT_FOUND" }, 404);
  } catch (error) {
    if (error instanceof RangeError) return serviceResponse({ code: "PAYLOAD_TOO_LARGE" }, 413);
    if (error instanceof SyntaxError || error instanceof TypeError || error instanceof z.ZodError) {
      return serviceResponse({ code: "INVALID_INPUT" }, 400);
    }
    if (env.APP_ENV !== "production") {
      const reportedCode = (error as { code?: unknown } | null)?.code;
      const safeCode = typeof reportedCode === "string" && /^[A-Z][A-Z0-9_]{2,80}$/u.test(reportedCode)
        ? reportedCode
        : error instanceof Error && /^[A-Z][A-Z0-9_]{2,80}$/u.test(error.message)
          ? error.message
          : "LEGAL_CORPUS_READ_FAILED";
      console.error(JSON.stringify({
        event: "legal_corpus.read_failed",
        environment: env.APP_ENV,
        tool: pathname.slice(TOOL_ROOT.length, TOOL_ROOT.length + 80),
        errorName: error instanceof Error ? error.name : "UnknownError",
        code: safeCode,
      }));
    }
    return serviceResponse({ code: "LEGAL_CORPUS_READ_FAILED" }, 500);
  }
}

export class JuroLegalCorpusReadServiceError extends Error {
  constructor(readonly code: "UNAVAILABLE" | "INVALID_RESPONSE") {
    super(`JURO_LEGAL_CORPUS_READ_SERVICE_${code}`);
    this.name = "JuroLegalCorpusReadServiceError";
  }
}

function publicScope(scope: LegalCorpusSearchScope | undefined) {
  if (!scope) return undefined;
  return {
    includeHistorical: scope.includeHistorical,
    asOfDate: scope.asOfDate,
    indexManifestId: scope.indexManifestId,
  };
}

/** Creates the local app's strictly read-only client for the staging corpus. */
export function createJuroLegalCorpusReadServiceTools(input: {
  service: Fetcher;
  signal?: AbortSignal;
}): JuroLegalCorpusReadTools {
  async function call<T>(
    name: (typeof JURO_LEGAL_CORPUS_TOOL_NAMES)[keyof typeof JURO_LEGAL_CORPUS_TOOL_NAMES],
    body: unknown,
    schema: z.ZodType<T>,
  ): Promise<T> {
    let response: Response;
    try {
      response = await input.service.fetch(`http://legal-corpus.internal${toolPath(name)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: input.signal,
      });
    } catch {
      throw new JuroLegalCorpusReadServiceError("UNAVAILABLE");
    }
    if (!response.ok) throw new JuroLegalCorpusReadServiceError("UNAVAILABLE");
    try {
      const packet = await readBoundedJson(
        response.body,
        response.headers.get("content-length"),
        MAX_RESPONSE_BYTES,
      );
      return z.object({ result: schema }).strict().parse(packet).result;
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(JSON.stringify({
          event: "legal_corpus.read_client_response_rejected",
          tool: name,
          errorName: error instanceof Error ? error.name : "unknown",
          errorMessage: error instanceof Error ? error.message.slice(0, 160) : "unknown",
        }));
      }
      throw new JuroLegalCorpusReadServiceError("INVALID_RESPONSE");
    }
  }

  return {
    supportsHybrid: true,
    findLegalSources: ({ query, locale, scope, limit }) => call<LegalCorpusRetrievalItem[]>(
      JURO_LEGAL_CORPUS_TOOL_NAMES.findLegalSources,
      { query, locale, scope: publicScope(scope), limit },
      z.array(legalCorpusRetrievalItemSchema).max(20),
    ),
    findLegalSourcesBatch: ({ queries, locale, scope, limit }) => call<LegalCorpusRetrievalItem[][]>(
      JURO_LEGAL_CORPUS_TOOL_NAMES.findLegalSourcesBatch,
      { queries, locale, scope: publicScope(scope), limit },
      z.array(z.array(legalCorpusRetrievalItemSchema).max(20)).max(5),
    ),
    inspectLegalAct: ({ anchorChunkId }) => call<JuroActRecord | null>(
      JURO_LEGAL_CORPUS_TOOL_NAMES.inspectLegalAct,
      { anchorChunkId },
      juroActRecordSchema.nullable(),
    ),
    readLegalProvisions: ({ anchorChunkId, before, after }) => call<LegalSourceSpan[]>(
      JURO_LEGAL_CORPUS_TOOL_NAMES.readLegalProvisions,
      { anchorChunkId, before, after },
      z.array(legalSourceSpanSchema).max(64),
    ),
    hydrateLegalSources: ({ anchorChunkIds, before, after, includeReferences }) => call(
      JURO_LEGAL_CORPUS_TOOL_NAMES.hydrateLegalSources,
      { anchorChunkIds: [...new Set(anchorChunkIds)].slice(0, 12), before, after, includeReferences },
      z.array(hydratedLegalSourceSchema).max(12),
    ),
  };
}
