import { Container } from "@cloudflare/containers";
import { z } from "zod";

import { LEGAL_CORPUS_EMBEDDING_DIMENSIONS } from "../lib/legal-corpus/embeddings";
import { LEGAL_CORPUS_QDRANT_INSTANCE } from "../lib/legal-corpus/qdrant";

const MAX_EMBEDDING_BATCH = 64;
const MAX_EMBEDDING_INPUT_CHARS = 24_000;
const MAX_EMBEDDING_REQUEST_BYTES = 800_000;
const EMBEDDING_TIMEOUT_MS = 20_000;
const COLLECTION_PATTERN = /^[A-Za-z0-9_-]{1,80}$/u;

type LegalCorpusPrivateServiceEnv = {
  DB?: D1Database;
  APP_ENV?: "development" | "staging" | "production";
  QDRANT_CONTAINER?: DurableObjectNamespace<LegalCorpusQdrantContainer>;
  QDRANT_API_KEY?: string;
  QDRANT_COLLECTION?: string;
  OPENAI_API_KEY?: string;
};

function requestedCollection(request: Request): string | null {
  const match = new URL(request.url).pathname.match(/^\/collections\/([A-Za-z0-9_-]{1,80})(?:\/|$)/u);
  return match?.[1] ?? null;
}

async function collectionBelongsToEnvironment(
  env: LegalCorpusPrivateServiceEnv,
  collection: string,
): Promise<boolean> {
  if (collection === env.QDRANT_COLLECTION?.trim()) return true;
  if (!env.DB || !env.APP_ENV) return false;
  try {
    const row = await env.DB.prepare(`SELECT 1 AS present
      FROM legal_corpus_search_index_builds
      WHERE environment=? AND qdrant_collection=?
      UNION ALL
      SELECT 1 AS present FROM legal_corpus_search_index_manifests
      WHERE environment=? AND qdrant_collection=?
      LIMIT 1`).bind(
      env.APP_ENV,
      collection,
      env.APP_ENV,
      collection,
    ).first<{ present: number }>();
    return row?.present === 1;
  } catch {
    // Before the additive versioned-index migration, only the explicitly
    // configured legacy collection remains reachable.
    return false;
  }
}

const embeddingRequestSchema = z.object({
  model: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._:-]+$/u),
  input: z.array(z.string().trim().min(1).max(MAX_EMBEDDING_INPUT_CHARS))
    .min(1).max(MAX_EMBEDDING_BATCH),
  dimensions: z.literal(LEGAL_CORPUS_EMBEDDING_DIMENSIONS),
  encoding_format: z.literal("float"),
}).strict();

function privateJson(code: string, status: number): Response {
  return Response.json({ error: code }, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
    },
  });
}

function qdrantRequestAllowed(request: Request, collection: string): boolean {
  if (!["GET", "POST", "PUT", "DELETE"].includes(request.method)) return false;
  const url = new URL(request.url);
  if (url.pathname === "/healthz" && request.method === "GET") return true;
  const prefix = `/collections/${encodeURIComponent(collection)}`;
  if (request.method === "DELETE" && !url.pathname.startsWith(`${prefix}/snapshots/`)) {
    return false;
  }
  return url.pathname === prefix || url.pathname.startsWith(`${prefix}/`);
}

async function secretMatches(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(providedHash);
  const right = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
}

export class LegalCorpusQdrantContainer extends Container<LegalCorpusPrivateServiceEnv> {
  defaultPort = 6_333;
  requiredPorts = [6_333];
  pingEndpoint = "/healthz";
  enableInternet = false;
  // The five-minute backfill schedule keeps the singleton active while work
  // remains. It scales to zero shortly after the frozen corpus is complete.
  sleepAfter = "15m";
  envVars: Record<string, string> = {
    QDRANT__SERVICE__HOST: "0.0.0.0",
    QDRANT__SERVICE__HTTP_PORT: "6333",
    QDRANT__SERVICE__GRPC_PORT: "6334",
    QDRANT__SERVICE__API_KEY: this.env.QDRANT_API_KEY ?? "",
    QDRANT__LOG_LEVEL: "WARN",
  };
}

/** Private service-binding proxy. No public hostname is routed to this branch;
 * the API key is still checked by Qdrant and never returned or logged. */
export async function handleLegalCorpusQdrantServiceRequest(
  request: Request,
  env: LegalCorpusPrivateServiceEnv,
): Promise<Response> {
  const requestUrl = new URL(request.url);
  const collection = requestedCollection(request)
    ?? (request.method === "GET" && requestUrl.pathname === "/healthz"
      ? env.QDRANT_COLLECTION?.trim() ?? ""
      : "");
  const expectedApiKey = env.QDRANT_API_KEY?.trim() ?? "";
  const providedApiKey = request.headers.get("api-key") ?? "";
  if (
    !env.QDRANT_CONTAINER
    || !expectedApiKey
    || !COLLECTION_PATTERN.test(collection)
    || !(await collectionBelongsToEnvironment(env, collection))
    || !qdrantRequestAllowed(request, collection)
  ) {
    return privateJson("QDRANT_PRIVATE_ROUTE_REJECTED", 404);
  }
  if (!(await secretMatches(providedApiKey, expectedApiKey))) {
    return privateJson("QDRANT_PRIVATE_ROUTE_REJECTED", 404);
  }
  try {
    const container = env.QDRANT_CONTAINER.getByName(LEGAL_CORPUS_QDRANT_INSTANCE);
    await container.startAndWaitForPorts();
    const response = await container.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("cache-control", "no-store");
    headers.set("x-content-type-options", "nosniff");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    return privateJson("QDRANT_PRIVATE_SERVICE_UNAVAILABLE", 503);
  }
}

/** Private embedding relay. The isolated corpus Worker keeps cost accounting
 * and validation in D1 while this entry point supplies the platform-owned
 * OpenAI credential without copying it to another Worker. */
export async function handleLegalCorpusEmbeddingServiceRequest(
  request: Request,
  env: LegalCorpusPrivateServiceEnv,
): Promise<Response> {
  if (request.method !== "POST" || new URL(request.url).pathname !== "/v1/embeddings") {
    return privateJson("EMBEDDING_PRIVATE_ROUTE_REJECTED", 404);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_EMBEDDING_REQUEST_BYTES || !env.OPENAI_API_KEY?.trim()) {
    return privateJson("EMBEDDING_PRIVATE_SERVICE_UNAVAILABLE", 503);
  }
  let body: z.infer<typeof embeddingRequestSchema>;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_EMBEDDING_REQUEST_BYTES) {
      return privateJson("EMBEDDING_PRIVATE_REQUEST_REJECTED", 413);
    }
    body = embeddingRequestSchema.parse(JSON.parse(text) as unknown);
  } catch {
    return privateJson("EMBEDDING_PRIVATE_REQUEST_REJECTED", 400);
  }
  try {
    const upstream = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      // Workers fetch does not implement `redirect: "error"`; a manual 3xx is
      // relayed as non-OK and the embedding client rejects it.
      redirect: "manual",
      signal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const headers = new Headers({
      "cache-control": "no-store",
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      "x-content-type-options": "nosniff",
    });
    const requestId = upstream.headers.get("x-request-id");
    if (requestId) headers.set("x-request-id", requestId);
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  } catch {
    return privateJson("EMBEDDING_PRIVATE_SERVICE_UNAVAILABLE", 503);
  }
}
