import { z } from "zod";

import type { DenseCorpusCandidate } from "./retrieval";
import type { LegalCorpusLanguage } from "./trust";

const RESPONSE_LIMIT = 1_000_000;
const REQUEST_TIMEOUT_MS = 8_000;
const SNAPSHOT_REQUEST_TIMEOUT_MS = 120_000;
const COLLECTION_PATTERN = /^[A-Za-z0-9_-]{1,80}$/u;
const SNAPSHOT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,239}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const POINT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const VECTOR_DIMENSIONS = 1_536;
export const LEGAL_CORPUS_QDRANT_INSTANCE = "juro-legal-corpus-qdrant-v1";
const COLLECTION_CONFIGURATION = {
  vectors: {
    dense: {
      size: VECTOR_DIMENSIONS,
      distance: "Cosine",
      on_disk: true,
    },
  },
  sparse_vectors: {
    sparse: {
      index: { on_disk: true },
    },
  },
  on_disk_payload: true,
} as const;

export type QdrantCorpusEnv = {
  APP_ENV: "development" | "staging" | "production";
  QDRANT_URL?: string;
  QDRANT_API_KEY?: string;
  QDRANT_COLLECTION?: string;
  QDRANT_SERVICE?: Fetcher;
  QDRANT_CONTAINER?: {
    getByName(name: string): {
      startAndWaitForPorts(options?: Record<string, unknown>): Promise<unknown>;
      fetch(request: Request): Promise<Response>;
    };
  };
};

export type QdrantSnapshotInfo = {
  name: string;
  size: number;
  creationTime: string;
  checksumSha256: string;
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

const countResponseSchema = z.object({
  status: z.string(),
  result: z.object({ count: z.number().int().nonnegative() }).passthrough(),
}).passthrough();

const snapshotResponseSchema = z.object({
  status: z.string(),
  result: z.object({
    name: z.string().regex(SNAPSHOT_NAME_PATTERN),
    size: z.number().int().positive().safe(),
    creation_time: z.string().datetime({ offset: true }),
    checksum: z.string().regex(SHA256_PATTERN),
  }).passthrough(),
}).passthrough();

export class QdrantCorpusError extends Error {
  constructor(
    readonly code:
      | "QDRANT_CONFIGURATION_REJECTED"
      | "QDRANT_REQUEST_FAILED"
      | "QDRANT_RESPONSE_REJECTED"
      | "QDRANT_COLLECTION_INCOMPATIBLE"
      | "QDRANT_SNAPSHOT_REQUIRED"
      | "QDRANT_SNAPSHOT_INVALID"
      | "QDRANT_PRIVATE_ROUTE_REJECTED"
      | "QDRANT_PRIVATE_SERVICE_UNAVAILABLE"
      | "QDRANT_HTTP_4XX"
      | "QDRANT_HTTP_5XX"
      | "QDRANT_HTTP_OTHER"
      | "QDRANT_DIRECT_FETCH_FAILED"
      | "QDRANT_CONTAINER_UNAVAILABLE",
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

async function requestResponse(
  env: QdrantCorpusEnv,
  suffix: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  options: { allowNotFound?: boolean; timeoutMs?: number } = {},
): Promise<Response | undefined> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS);
  let response: Response;
  let phase = "request-build";
  const transport = env.QDRANT_SERVICE
    ? "service"
    : env.QDRANT_CONTAINER
      ? "container"
      : "direct";
  try {
    const headers = new Headers(init.headers);
    if (env.QDRANT_API_KEY) headers.set("api-key", env.QDRANT_API_KEY);
    if (init.body !== undefined && init.body !== null && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const requestInit: RequestInit = {
      ...init,
      redirect: "error",
      signal: timeout,
      headers,
    };
    if (env.QDRANT_SERVICE) {
      phase = "service-fetch";
      try {
        // Service bindings accept RequestInfo + init directly. Avoiding a
        // cross-runtime Request constructor keeps Cloudflare's private
        // binding path compatible with streaming/body implementations.
        response = await env.QDRANT_SERVICE.fetch(endpoint(env, suffix), requestInit);
      } catch {
        // A failed service binding is distinct from an HTTP response from
        // Qdrant; keep that distinction in the bounded staging run ledger.
        console.error(JSON.stringify({
          service: "legal-corpus-qdrant-client",
          event: "qdrant.transport_failed",
          transport: "service",
          errorCode: "QDRANT_PRIVATE_SERVICE_UNAVAILABLE",
        }));
        throw new QdrantCorpusError("QDRANT_PRIVATE_SERVICE_UNAVAILABLE", true);
      }
    } else if (env.QDRANT_CONTAINER) {
      phase = "container-start";
      try {
        const container = env.QDRANT_CONTAINER.getByName(LEGAL_CORPUS_QDRANT_INSTANCE);
        await container.startAndWaitForPorts({});
        phase = "container-fetch";
        const request = new Request(endpoint(env, suffix), (
          init.body instanceof ReadableStream
            ? { ...requestInit, duplex: "half" as const }
            : requestInit
        ) as RequestInit);
        response = await container.fetch(request);
      } catch {
        console.error(JSON.stringify({
          service: "legal-corpus-qdrant-client",
          event: "qdrant.transport_failed",
          transport: "container",
          errorCode: "QDRANT_CONTAINER_UNAVAILABLE",
        }));
        throw new QdrantCorpusError("QDRANT_CONTAINER_UNAVAILABLE", true);
      }
    } else {
      phase = "direct-fetch";
      try {
        response = await fetchImpl(endpoint(env, suffix), requestInit);
      } catch {
        console.error(JSON.stringify({
          service: "legal-corpus-qdrant-client",
          event: "qdrant.transport_failed",
          transport: "direct",
          errorCode: "QDRANT_DIRECT_FETCH_FAILED",
        }));
        throw new QdrantCorpusError("QDRANT_DIRECT_FETCH_FAILED", true);
      }
    }
  } catch (error) {
    if (error instanceof QdrantCorpusError) throw error;
    console.error(JSON.stringify({
      service: "legal-corpus-qdrant-client",
      event: "qdrant.request_failed",
      transport,
      phase,
      errorType: error instanceof Error ? error.name : typeof error,
      errorCode: "QDRANT_REQUEST_FAILED",
    }));
    throw new QdrantCorpusError("QDRANT_REQUEST_FAILED", true);
  }
  if (options.allowNotFound && response.status === 404) {
    await response.body?.cancel().catch(() => undefined);
    return undefined;
  }
  if (!response.ok) {
    console.error(JSON.stringify({
      service: "legal-corpus-qdrant-client",
      event: "qdrant.http_rejected",
      transport,
      statusClass: response.status >= 500 ? "5xx" : response.status >= 400 ? "4xx" : "other",
    }));
    // The staging service-binding proxy returns a tiny, allow-listed error
    // envelope. Preserve that actionable code while keeping arbitrary
    // upstream response bodies out of logs and user-visible errors.
    try {
      const body = await response.clone().json() as { error?: unknown };
      if (body.error === "QDRANT_PRIVATE_ROUTE_REJECTED") {
        await response.body?.cancel().catch(() => undefined);
        throw new QdrantCorpusError("QDRANT_PRIVATE_ROUTE_REJECTED", false);
      }
      if (body.error === "QDRANT_PRIVATE_SERVICE_UNAVAILABLE") {
        await response.body?.cancel().catch(() => undefined);
        throw new QdrantCorpusError("QDRANT_PRIVATE_SERVICE_UNAVAILABLE", true);
      }
    } catch (error) {
      if (error instanceof QdrantCorpusError) throw error;
      // Ignore malformed or oversized upstream bodies and use the bounded
      // status-based classification below.
    }
    const retryable = response.status === 408 || response.status === 409
      || response.status === 429 || response.status >= 500;
    await response.body?.cancel().catch(() => undefined);
    throw new QdrantCorpusError(
      response.status >= 500
        ? "QDRANT_HTTP_5XX"
        : response.status >= 400
          ? "QDRANT_HTTP_4XX"
          : "QDRANT_HTTP_OTHER",
      retryable,
    );
  }
  return response;
}

async function request(
  env: QdrantCorpusEnv,
  suffix: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  options: { allowNotFound?: boolean; timeoutMs?: number } = {},
): Promise<unknown | undefined> {
  const response = await requestResponse(env, suffix, init, fetchImpl, options);
  return response ? limitedJson(response) : undefined;
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

  async collectionExists(): Promise<boolean> {
    const result = await request(this.env, "", { method: "GET" }, this.fetchImpl, {
      allowNotFound: true,
    });
    if (result === undefined) return false;
    const parsed = collectionResponseSchema.safeParse(result);
    if (!parsed.success || parsed.data.status !== "ok") {
      throw new QdrantCorpusError("QDRANT_RESPONSE_REJECTED", false);
    }
    return true;
  }

  /** Creates only the configured environment-scoped collection when it does
   * not exist, then validates the exact dense+sparse contract. It never
   * replaces or deletes an incompatible collection. */
  async ensureCompatible(): Promise<"created" | "existing"> {
    const existing = await request(this.env, "", {
      method: "GET",
    }, this.fetchImpl, { allowNotFound: true });
    if (existing !== undefined) {
      const parsed = collectionResponseSchema.safeParse(existing);
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
      return "existing";
    }
    const created = mutationResponseSchema.safeParse(await request(this.env, "", {
      method: "PUT",
      body: JSON.stringify(COLLECTION_CONFIGURATION),
    }, this.fetchImpl));
    if (!created.success || created.data.status !== "ok") {
      throw new QdrantCorpusError("QDRANT_RESPONSE_REJECTED", false);
    }
    await this.assertCompatible();
    return "created";
  }

  async queryDense(vector: readonly number[], limit = 20): Promise<DenseCorpusCandidate[]> {
    if (vector.length !== VECTOR_DIMENSIONS || vector.some((value) => !Number.isFinite(value))) {
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

  async countPoints(currentOnly = false): Promise<number> {
    const parsed = countResponseSchema.safeParse(await request(this.env, "/points/count", {
      method: "POST",
      body: JSON.stringify({
        exact: true,
        ...(currentOnly ? { filter: officialFilter(this.env.APP_ENV) } : {}),
      }),
    }, this.fetchImpl));
    if (!parsed.success || parsed.data.status !== "ok") {
      throw new QdrantCorpusError("QDRANT_RESPONSE_REJECTED", false);
    }
    return parsed.data.result.count;
  }

  async createSnapshot(): Promise<QdrantSnapshotInfo> {
    const parsed = snapshotResponseSchema.safeParse(await request(
      this.env,
      "/snapshots?wait=true",
      { method: "POST" },
      this.fetchImpl,
      { timeoutMs: SNAPSHOT_REQUEST_TIMEOUT_MS },
    ));
    if (!parsed.success || parsed.data.status !== "ok") {
      throw new QdrantCorpusError("QDRANT_RESPONSE_REJECTED", false);
    }
    return {
      name: parsed.data.result.name,
      size: parsed.data.result.size,
      creationTime: parsed.data.result.creation_time,
      checksumSha256: parsed.data.result.checksum,
    };
  }

  async downloadSnapshot(snapshotName: string): Promise<Response> {
    if (!SNAPSHOT_NAME_PATTERN.test(snapshotName)) {
      throw new QdrantCorpusError("QDRANT_CONFIGURATION_REJECTED", false);
    }
    const response = await requestResponse(
      this.env,
      `/snapshots/${encodeURIComponent(snapshotName)}`,
      { method: "GET" },
      this.fetchImpl,
      { timeoutMs: SNAPSHOT_REQUEST_TIMEOUT_MS },
    );
    if (!response?.body) {
      throw new QdrantCorpusError("QDRANT_RESPONSE_REJECTED", false);
    }
    return response;
  }

  async deleteSnapshot(snapshotName: string): Promise<void> {
    if (!SNAPSHOT_NAME_PATTERN.test(snapshotName)) {
      throw new QdrantCorpusError("QDRANT_CONFIGURATION_REJECTED", false);
    }
    const parsed = mutationResponseSchema.safeParse(await request(
      this.env,
      `/snapshots/${encodeURIComponent(snapshotName)}?wait=true`,
      { method: "DELETE" },
      this.fetchImpl,
      { timeoutMs: SNAPSHOT_REQUEST_TIMEOUT_MS },
    ));
    if (!parsed.success || parsed.data.status !== "ok") {
      throw new QdrantCorpusError("QDRANT_RESPONSE_REJECTED", false);
    }
  }

  async restoreSnapshot(input: {
    name: string;
    size: number;
    checksumSha256: string;
    body: ReadableStream<Uint8Array>;
  }): Promise<void> {
    if (
      !SNAPSHOT_NAME_PATTERN.test(input.name)
      || !Number.isSafeInteger(input.size)
      || input.size < 1
      || !SHA256_PATTERN.test(input.checksumSha256)
    ) {
      throw new QdrantCorpusError("QDRANT_SNAPSHOT_INVALID", false);
    }
    const boundary = `juro-${crypto.randomUUID()}`;
    const encoder = new TextEncoder();
    const prefix = encoder.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="snapshot"; filename="${input.name}"\r\n`
      + "Content-Type: application/octet-stream\r\n\r\n",
    );
    const suffix = encoder.encode(`\r\n--${boundary}--\r\n`);
    const reader = input.body.getReader();
    let prefixSent = false;
    let suffixSent = false;
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (!prefixSent) {
          prefixSent = true;
          controller.enqueue(prefix);
          return;
        }
        const part = await reader.read();
        if (!part.done) {
          controller.enqueue(part.value);
          return;
        }
        if (!suffixSent) {
          suffixSent = true;
          controller.enqueue(suffix);
        }
        controller.close();
      },
      async cancel(reason) {
        await reader.cancel(reason).catch(() => undefined);
      },
    });
    const parsed = mutationResponseSchema.safeParse(await request(
      this.env,
      `/snapshots/upload?wait=true&priority=snapshot&checksum=${input.checksumSha256}`,
      {
        method: "POST",
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
          "content-length": String(prefix.byteLength + input.size + suffix.byteLength),
        },
        body,
      },
      this.fetchImpl,
      { timeoutMs: SNAPSHOT_REQUEST_TIMEOUT_MS },
    ));
    if (!parsed.success || parsed.data.status !== "ok" || parsed.data.result !== true) {
      throw new QdrantCorpusError("QDRANT_RESPONSE_REJECTED", false);
    }
  }

  async upsert(pointsToWrite: readonly QdrantCorpusPoint[]): Promise<void> {
    if (pointsToWrite.length < 1 || pointsToWrite.length > 100) {
      throw new QdrantCorpusError("QDRANT_CONFIGURATION_REJECTED", false);
    }
    for (const point of pointsToWrite) {
      if (
        !POINT_ID_PATTERN.test(point.id)
        || point.dense.length !== VECTOR_DIMENSIONS
        || point.dense.some((value) => !Number.isFinite(value))
        || point.sparse.indices.length === 0
        || point.sparse.indices.length !== point.sparse.values.length
        || point.sparse.indices.some((value, index) => !Number.isInteger(value) || value < 0
          || (index > 0 && value <= point.sparse.indices[index - 1]!))
        || point.sparse.values.some((value) => !Number.isFinite(value) || value <= 0)
      ) {
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
