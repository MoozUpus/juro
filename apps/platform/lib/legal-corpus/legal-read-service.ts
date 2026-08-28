import { z } from "zod";
import type { LegalSourceSpan } from "../ai/provider";
import {
  findJuroLegalPassages,
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

export const JURO_LEGAL_CORPUS_TOOL_NAMES = {
  findLegalSources: "find_juro_legal_sources",
  inspectLegalAct: "inspect_juro_legal_act",
  readLegalProvisions: "read_juro_legal_provisions",
} as const;

const TOOL_ROOT = "/internal/legal-corpus/read-tools/";
const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const anchorChunkIdSchema = z.string().trim().min(1).max(200)
  .regex(/^[A-Za-z0-9:_-]+$/u);
const publicScopeSchema = z.object({
  includeHistorical: z.boolean().optional(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).nullable().optional(),
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

const optionalText = z.string().max(10_000).nullable();
const legalCorpusRetrievalItemSchema = z.object({
  chunkId: anchorChunkIdSchema,
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

export type JuroLegalCorpusReadServiceEnv = Pick<Env, "DB">;

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
      const input = findLegalSourcesInputSchema.parse(packet);
      const result = await findJuroLegalPassages({
        db: env.DB,
        query: input.query,
        scope: input.scope,
        limit: input.limit,
      });
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
    return serviceResponse({ code: "NOT_FOUND" }, 404);
  } catch (error) {
    if (error instanceof RangeError) return serviceResponse({ code: "PAYLOAD_TOO_LARGE" }, 413);
    if (error instanceof SyntaxError || error instanceof TypeError || error instanceof z.ZodError) {
      return serviceResponse({ code: "INVALID_INPUT" }, 400);
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
    } catch {
      throw new JuroLegalCorpusReadServiceError("INVALID_RESPONSE");
    }
  }

  return {
    findLegalSources: ({ query, locale, scope, limit }) => call<LegalCorpusRetrievalItem[]>(
      JURO_LEGAL_CORPUS_TOOL_NAMES.findLegalSources,
      { query, locale, scope: publicScope(scope), limit },
      z.array(legalCorpusRetrievalItemSchema).max(20),
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
  };
}
