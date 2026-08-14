import { z } from "zod";

import type { DenseCorpusCandidate } from "./retrieval";
import type { LegalCorpusLanguage } from "./trust";

const RESPONSE_LIMIT = 1_000_000;
const REQUEST_TIMEOUT_MS = 8_000;
const COLLECTION_PATTERN = /^[A-Za-z0-9_-]{1,80}$/u;
const POINT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const VECTOR_DIMENSIONS = 1_536;

export type QdrantCorpusEnv = {
  APP_ENV: "development" | "staging" | "production";
  QDRANT_URL?: string;
  QDRANT_API_KEY?: string;
  QDRANT_COLLECTION?: string;
};

export type QdrantSparseVector = {
  indices: number[];
  values: number[];
};

export type QdrantCorpusPoint = {
  id: string;
  chunkId: string;
  documentId: string;
  variantId: string;
  versionId: string;
  language: LegalCorpusLanguage;
  status: "active" | "repealed" | "historical" | "unknown";
  isCurrent: boolean;
  articleNumber: string | null;
  dense: number[];
  sparse: QdrantSparseVector;
};

const pointSchema = z.object({
  id: z.union([z.string(), z.number()]),
  score: z.number().finite(),
  payload: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

const queryResponseSchema = z.object({
  status: z.string(),
  result: z.union([
    z.object({ points: z.array(pointSchema) }).passthrough(),
    z.array(pointSchema),
  ]),
}).passthrough();

const mutationResponseSchema = z.object({
  status: z.string(),
  result: z.unknown(),
}).passthrough();

const collectionResponseSchema = z.object({
  status: z.string(),
  result: z.object({
    config: z.object({
      params: z.object({
        vectors: z.record(z.string(), z.unknown()),
        sparse_vectors: z.record(z.string(), z.unknown()).optional(),
      }).passthrough(),
    }).passthrough(),
  }).passthrough(),
}).passthrough();

export class QdrantCorpusError extends Error {
  constructor(
    readonly code:
      | "QDRANT_CONFIGURATION_REJECTED"
      | "QDRANT_REQUEST_FAILED"
      | "QDRANT_RESPONSE_REJECTED"
      | "QDRANT_COLLECTION_INCOMPATIBLE",
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = "QdrantCorpusError";
  }
}

function configuredBaseUrl(env: QdrantCorpusEnv): URL {
  let url: URL;
  try {
    url = new URL(env.QDRANT_URL ?? "");
  } catch {
    throw new QdrantCorpusError("QDRANT_CONFIGURATION_REJECTED", false);
  }
  const localDevelopment = env.APP_ENV === "development"
    && url.protocol === "http:"
    && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  if (
    (!localDevelopment && url.protocol !== "https:")
    || url.username
    || url.password
    || url.search
    || url.hash
    || (url.pathname !== "/" && url.pathname !== "")
    || (env.APP_ENV !== "development" && !env.QDRANT_API_KEY?.trim())
  ) {
    throw new QdrantCorpusError("QDRANT_CONFIGURATION_REJECTED", false);
  }
  return url;
}

function collectionName(env: QdrantCorpusEnv): string {
  const collection = env.QDRANT_COLLECTION?.trim() ?? "";
  if (!COLLECTION_PATTERN.test(collection)) {
    throw new QdrantCorpusError("QDRANT_CONFIGURATION_REJECTED", false);
  }
  return collection;
}

function endpoint(env: QdrantCorpusEnv, suffix: string): URL {
  const base = configuredBaseUrl(env);
  const collection = encodeURIComponent(collectionName(env));
  return new URL(`/collections/${collection}${suffix}`, base);
}

async function limitedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > RESPONSE_LIMIT) {
    await response.body?.cancel().catch(() => undefined);
    throw new QdrantCorpusError("QDRANT_RESPONSE_REJECTED", false);
  }
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    if (total > RESPONSE_LIMIT) {
      await reader.cancel().catch(() => undefined);
      throw new QdrantCorpusError("QDRANT_RESPONSE_REJECTED", false);
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new QdrantCorpusError("QDRANT_RESPONSE_REJECTED", false);
  }
}

async function request(
  env: QdrantCorpusEnv,
  suffix: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(endpoint(env, suffix), {
      ...init,
      redirect: "error",
      signal: timeout,
      headers: {
        "Content-Type": "application/json",
        ...(env.QDRANT_API_KEY ? { "api-key": env.QDRANT_API_KEY } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new QdrantCorpusError("QDRANT_REQUEST_FAILED", true);
  }
  if (!response.ok) {
    const retryable = response.status === 408 || response.status === 409
      || response.status === 429 || response.status >= 500;
    await response.body?.cancel().catch(() => undefined);
    throw new QdrantCorpusError("QDRANT_REQUEST_FAILED", retryable);
  }
  return limitedJson(response);
}

function points(result: z.infer<typeof queryResponseSchema>): Array<z.infer<typeof pointSchema>> {
  return Array.isArray(result.result) ? result.result : result.result.points;
}

function candidates(result: unknown): DenseCorpusCandidate[] {
  const parsed = queryResponseSchema.safeParse(result);
  if (!parsed.success || parsed.data.status !== "ok") {
    throw new QdrantCorpusError("QDRANT_RESPONSE_REJECTED", false);
  }
  const seen = new Set<string>();
  const output: DenseCorpusCandidate[] = [];
  for (const point of points(parsed.data)) {
    const chunkId = point.payload?.chunk_id;
    if (typeof chunkId !== "string" || chunkId.length < 1 || chunkId.length > 300 || seen.has(chunkId)) continue;
    seen.add(chunkId);
    output.push({ chunkId, score: point.score });
  }
  return output;
}

function officialFilter(environment: string) {
  return {
    must: [
      { key: "environment", match: { value: environment } },
      { key: "scope", match: { value: "global" } },
      { key: "status", match: { value: "active" } },
      { key: "is_current", match: { value: true } },
    ],
  };
}

export class QdrantLegalCorpusClient {
  constructor(
    private readonly env: QdrantCorpusEnv,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    configuredBaseUrl(env);
    collectionName(env);
  }

  async assertCompatible(): Promise<void> {
    const parsed = collectionResponseSchema.safeParse(await request(this.env, "", {
      method: "GET",
    }, this.fetchImpl));
    if (!parsed.success || parsed.data.status !== "ok") {
      throw new QdrantCorpusError("QDRANT_RESPONSE_REJECTED", false);
    }
    const dense = parsed.data.result.config.params.vectors.dense;
    const sparse = parsed.data.result.config.params.sparse_vectors?.sparse;
    if (
      !dense
      || typeof dense !== "object"
      || Number((dense as Record<string, unknown>).size) !== VECTOR_DIMENSIONS
      || String((dense as Record<string, unknown>).distance ?? "").toLocaleLowerCase("en") !== "cosine"
      || !sparse
      || typeof sparse !== "object"
    ) {
      throw new QdrantCorpusError("QDRANT_COLLECTION_INCOMPATIBLE", false);
    }
  }

  async queryDense(vector: readonly number[], limit = 20): Promise<DenseCorpusCandidate[]> {
    if (vector.length < 1 || vector.length > 4_096 || vector.some((value) => !Number.isFinite(value))) {
      throw new QdrantCorpusError("QDRANT_CONFIGURATION_REJECTED", false);
    }
    return candidates(await request(this.env, "/points/query", {
      method: "POST",
      body: JSON.stringify({
        query: vector,
        using: "dense",
        filter: officialFilter(this.env.APP_ENV),
        limit: Math.max(1, Math.min(Math.trunc(limit), 50)),
        with_payload: ["chunk_id"],
        with_vector: false,
      }),
    }, this.fetchImpl));
  }

  async querySparse(vector: QdrantSparseVector, limit = 20): Promise<DenseCorpusCandidate[]> {
    if (
      vector.indices.length === 0
      || vector.indices.length !== vector.values.length
      || vector.indices.some((value, index) => !Number.isInteger(value) || value < 0
        || (index > 0 && value <= vector.indices[index - 1]!))
      || vector.values.some((value) => !Number.isFinite(value) || value <= 0)
    ) return [];
    return candidates(await request(this.env, "/points/query", {
      method: "POST",
      body: JSON.stringify({
        query: vector,
        using: "sparse",
        filter: officialFilter(this.env.APP_ENV),
        limit: Math.max(1, Math.min(Math.trunc(limit), 50)),
        with_payload: ["chunk_id"],
        with_vector: false,
      }),
    }, this.fetchImpl));
  }

  async queryHybrid(input: {
    dense: readonly number[];
    sparse: QdrantSparseVector;
    limit?: number;
  }): Promise<DenseCorpusCandidate[]> {
    const limit = Math.max(1, Math.min(Math.trunc(input.limit ?? 20), 50));
    const [dense, sparse] = await Promise.all([
      this.queryDense(input.dense, limit),
      this.querySparse(input.sparse, limit),
    ]);
    const scores = new Map<string, number>();
    for (const ranking of [dense, sparse]) {
      ranking.forEach((item, index) => {
        scores.set(item.chunkId, (scores.get(item.chunkId) ?? 0) + 1 / (60 + index + 1));
      });
    }
    return [...scores.entries()]
      .map(([chunkId, score]) => ({ chunkId, score }))
      .sort((left, right) => right.score - left.score || left.chunkId.localeCompare(right.chunkId))
      .slice(0, limit);
  }

  async upsert(pointsToWrite: readonly QdrantCorpusPoint[]): Promise<void> {
    if (pointsToWrite.length < 1 || pointsToWrite.length > 100) {
      throw new QdrantCorpusError("QDRANT_CONFIGURATION_REJECTED", false);
    }
    for (const point of pointsToWrite) {
      if (!POINT_ID_PATTERN.test(point.id) || point.dense.length < 1
        || point.sparse.indices.length !== point.sparse.values.length) {
        throw new QdrantCorpusError("QDRANT_CONFIGURATION_REJECTED", false);
      }
    }
    const parsed = mutationResponseSchema.safeParse(await request(this.env, "/points?wait=true", {
      method: "PUT",
      body: JSON.stringify({
        points: pointsToWrite.map((point) => ({
          id: point.id,
          vector: { dense: point.dense, sparse: point.sparse },
          payload: {
            environment: this.env.APP_ENV,
            chunk_id: point.chunkId,
            document_id: point.documentId,
            variant_id: point.variantId,
            version_id: point.versionId,
            language: point.language,
            status: point.status,
            is_current: point.isCurrent,
            scope: "global",
            article_number: point.articleNumber ?? "",
          },
        })),
      }),
    }, this.fetchImpl));
    if (!parsed.success || parsed.data.status !== "ok") {
      throw new QdrantCorpusError("QDRANT_RESPONSE_REJECTED", false);
    }
  }

  async setVersionCurrent(versionId: string, isCurrent: boolean): Promise<void> {
    if (!/^[A-Za-z0-9:_-]{1,240}$/u.test(versionId)) {
      throw new QdrantCorpusError("QDRANT_CONFIGURATION_REJECTED", false);
    }
    const parsed = mutationResponseSchema.safeParse(await request(this.env, "/points/payload?wait=true", {
      method: "POST",
      body: JSON.stringify({
        payload: { is_current: isCurrent },
        filter: {
          must: [
            { key: "environment", match: { value: this.env.APP_ENV } },
            { key: "scope", match: { value: "global" } },
            { key: "version_id", match: { value: versionId } },
          ],
        },
      }),
    }, this.fetchImpl));
    if (!parsed.success || parsed.data.status !== "ok") {
      throw new QdrantCorpusError("QDRANT_RESPONSE_REJECTED", false);
    }
  }
}

async function sparseIndex(term: string): Promise<number> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(term));
  return new DataView(digest).getUint32(0, false);
}

export async function encodeQdrantSparseTerms(
  terms: readonly { term: string; weight: number }[],
): Promise<QdrantSparseVector> {
  const combined = new Map<number, number>();
  for (const entry of terms.slice(0, 512)) {
    const term = entry.term.normalize("NFKC").toLocaleLowerCase("und").trim();
    if (!term || !Number.isFinite(entry.weight) || entry.weight <= 0) continue;
    const index = await sparseIndex(term);
    combined.set(index, (combined.get(index) ?? 0) + entry.weight);
  }
  const entries = [...combined.entries()].sort((left, right) => left[0] - right[0]);
  return {
    indices: entries.map(([index]) => index),
    values: entries.map(([, value]) => value),
  };
}

export async function encodeQdrantSparseQuery(query: string): Promise<QdrantSparseVector> {
  const counts = new Map<string, number>();
  const tokens = query.normalize("NFKC").toLocaleLowerCase("und")
    .match(/[\p{L}\p{N}][\p{L}\p{N}._-]{0,80}/gu) ?? [];
  for (const token of tokens.slice(0, 96)) counts.set(token, (counts.get(token) ?? 0) + 1);
  return encodeQdrantSparseTerms([...counts.entries()].map(([term, weight]) => ({ term, weight })));
}

export async function qdrantPointId(chunkId: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`juro-legal-corpus\n${chunkId}`),
  )).slice(0, 16);
  digest[6] = (digest[6]! & 0x0f) | 0x40;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
