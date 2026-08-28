import { Container } from "@cloudflare/containers";
import { z } from "zod";

import { LEGAL_CORPUS_EMBEDDING_DIMENSIONS } from "../lib/legal-corpus/embeddings";
import { LEGAL_CORPUS_QDRANT_INSTANCE } from "../lib/legal-corpus/qdrant";

const MAX_EMBEDDING_BATCH = 32;
const MAX_EMBEDDING_INPUT_CHARS = 24_000;
const MAX_EMBEDDING_REQUEST_BYTES = 800_000;
const EMBEDDING_TIMEOUT_MS = 20_000;
const COLLECTION_PATTERN = /^[A-Za-z0-9_-]{1,80}$/u;

type LegalCorpusPrivateServiceEnv = {
  QDRANT_CONTAINER?: DurableObjectNamespace<LegalCorpusQdrantContainer>;
  QDRANT_API_KEY?: string;
  QDRANT_COLLECTION?: string;
  /** Comma-separated, explicitly allow-listed staging collections routed to
   * the same private Qdrant container (for example v2 and shard-3). */
  QDRANT_ALLOWED_COLLECTIONS?: string;
  OPENAI_API_KEY?: string;
};

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

function qdrantRequestAllowed(request: Request, collections: readonly string[]): boolean {
  if (!["GET", "POST", "PUT", "DELETE"].includes(request.method)) return false;
  const url = new URL(request.url);
  if (url.pathname === "/healthz" && request.method === "GET") return true;
  for (const collection of collections) {
    const prefix = `/collections/${encodeURIComponent(collection)}`;
    if (request.method === "DELETE" && !url.pathname.startsWith(`${prefix}/snapshots/`)) {
      continue;
    }
    if (url.pathname === prefix || url.pathname.startsWith(`${prefix}/`)) return true;
  }
  return false;
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
  const collections = [...new Set([
    env.QDRANT_COLLECTION?.trim() ?? "",
    ...(env.QDRANT_ALLOWED_COLLECTIONS ?? "").split(",").map((value) => value.trim()),
  ].filter((value) => value.length > 0))];
  const expectedApiKey = env.QDRANT_API_KEY?.trim() ?? "";
  const providedApiKey = request.headers.get("api-key") ?? "";
  if (
    !env.QDRANT_CONTAINER
    || !expectedApiKey
    || collections.length === 0
    || collections.some((collection) => !COLLECTION_PATTERN.test(collection))
    || !qdrantRequestAllowed(request, collections)
  ) {
    return privateJson("QDRANT_PRIVATE_ROUTE_REJECTED", 404);
  }
  if (!(await secretMatches(providedApiKey, expectedApiKey))) {
    return privateJson("QDRANT_PRIVATE_ROUTE_REJECTED", 404);
  }
  const container = env.QDRANT_CONTAINER.getByName(LEGAL_CORPUS_QDRANT_INSTANCE);
  try {
    await container.startAndWaitForPorts();
  } catch {
    console.error(JSON.stringify({
      service: "legal-corpus-private-qdrant",
      event: "qdrant.container_start_failed",
      errorCode: "QDRANT_CONTAINER_START_FAILED",
    }));
    return privateJson("QDRANT_PRIVATE_SERVICE_UNAVAILABLE", 503);
  }
  try {
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
    console.error(JSON.stringify({
      service: "legal-corpus-private-qdrant",
      event: "qdrant.container_fetch_failed",
      errorCode: "QDRANT_CONTAINER_FETCH_FAILED",
    }));
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
      redirect: "error",
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
