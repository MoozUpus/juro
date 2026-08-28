import assert from "node:assert/strict";
import test from "node:test";

import {
  encodeQdrantSparseTerms,
  encodeQdrantSparseQuery,
  qdrantPointId,
  QdrantCorpusError,
  QdrantLegalCorpusClient,
} from "../lib/legal-corpus/qdrant";

const configured = {
  APP_ENV: "staging" as const,
  QDRANT_URL: "https://qdrant.internal.example",
  QDRANT_API_KEY: "test-secret",
  QDRANT_COLLECTION: "juro_legal_staging",
};

const denseVector = (first = 0.1): number[] => [first, ...Array<number>(1535).fill(0)];

function response(points: Array<{ chunkId: string; score: number }>) {
  return Response.json({
    status: "ok",
    result: {
      points: points.map((point, index) => ({
        id: index + 1,
        score: point.score,
        payload: { chunk_id: point.chunkId },
      })),
    },
  });
}

test("Qdrant configuration rejects public-stage HTTP, credentials in URLs and missing API keys", () => {
  for (const env of [
    { ...configured, QDRANT_URL: "http://qdrant.example" },
    { ...configured, QDRANT_URL: "https://user:pass@qdrant.example" },
    { ...configured, QDRANT_API_KEY: "" },
    { ...configured, QDRANT_COLLECTION: "../other" },
  ]) {
    assert.throws(() => new QdrantLegalCorpusClient(env), (error: unknown) =>
      error instanceof QdrantCorpusError && error.code === "QDRANT_CONFIGURATION_REJECTED");
  }
  assert.doesNotThrow(() => new QdrantLegalCorpusClient({
    APP_ENV: "development",
    QDRANT_URL: "http://127.0.0.1:6333",
    QDRANT_COLLECTION: "juro_legal_dev",
  }));
});

test("dense queries use only the configured collection, server API key and global-current filter", async () => {
  const capturedRequests: Array<{ url: string; init: RequestInit }> = [];
  const client = new QdrantLegalCorpusClient(configured, async (input, init) => {
    capturedRequests.push({ url: String(input), init: init ?? {} });
    return response([{ chunkId: "chunk:1", score: 0.9 }]);
  });
  const result = await client.queryDense(denseVector(), 9);
  assert.deepEqual(result, [{ chunkId: "chunk:1", score: 0.9 }]);
  const captured = capturedRequests[0];
  assert.ok(captured);
  assert.equal(captured.url, "https://qdrant.internal.example/collections/juro_legal_staging/points/query");
  const headers = new Headers(captured.init.headers);
  assert.equal(headers.get("api-key"), "test-secret");
  const body = JSON.parse(String(captured.init.body)) as {
    filter: { must: Array<{ key: string; match: { value: unknown } }> };
    with_payload: string[];
  };
  assert.deepEqual(body.with_payload, ["chunk_id"]);
  assert.deepEqual(body.filter.must.map((condition) => [condition.key, condition.match.value]), [
    ["environment", "staging"],
    ["scope", "global"],
    ["status", "active"],
    ["is_current", true],
  ]);
  assert.doesNotMatch(String(captured.init.body), /test-secret/u);
});

test("Qdrant requests prefer the private service binding over public fetch", async () => {
  const serviceRequests: Request[] = [];
  let directCalls = 0;
  const service = {
    async fetch(input: RequestInfo | URL, init?: RequestInit) {
      const request = input instanceof Request ? input : new Request(input, init);
      serviceRequests.push(request);
      return response([{ chunkId: "chunk:service", score: 0.88 }]);
    },
  } as unknown as Fetcher;
  const client = new QdrantLegalCorpusClient({
    ...configured,
    QDRANT_URL: "https://qdrant.internal",
    QDRANT_SERVICE: service,
  }, async () => {
    directCalls += 1;
    return new Response();
  });
  assert.deepEqual(await client.queryDense(denseVector(), 3), [
    { chunkId: "chunk:service", score: 0.88 },
  ]);
  assert.equal(directCalls, 0);
  assert.equal(serviceRequests[0]?.url,
    "https://qdrant.internal/collections/juro_legal_staging/points/query");
  assert.equal(serviceRequests[0]?.headers.get("api-key"), "test-secret");
});

test("private service errors remain bounded and preserve actionable staging codes", async () => {
  const routeRejected = new QdrantLegalCorpusClient({
    ...configured,
    QDRANT_URL: "https://qdrant.internal",
    QDRANT_SERVICE: { fetch: async () => Response.json({ error: "QDRANT_PRIVATE_ROUTE_REJECTED" }, { status: 404 }) } as Fetcher,
  });
  await assert.rejects(() => routeRejected.queryDense(denseVector(), 1), (error: unknown) =>
    error instanceof QdrantCorpusError && error.code === "QDRANT_PRIVATE_ROUTE_REJECTED");

  const unavailable = new QdrantLegalCorpusClient({
    ...configured,
    QDRANT_URL: "https://qdrant.internal",
    QDRANT_SERVICE: { fetch: async () => Response.json({ error: "QDRANT_PRIVATE_SERVICE_UNAVAILABLE" }, { status: 503 }) } as Fetcher,
  });
  await assert.rejects(() => unavailable.queryDense(denseVector(), 1), (error: unknown) =>
    error instanceof QdrantCorpusError && error.code === "QDRANT_PRIVATE_SERVICE_UNAVAILABLE" && error.retryable);

  const bindingFailure = new QdrantLegalCorpusClient({
    ...configured,
    QDRANT_URL: "https://qdrant.internal",
    QDRANT_SERVICE: { fetch: async () => { throw new Error("service binding unavailable"); } } as Fetcher,
  });
  await assert.rejects(() => bindingFailure.queryDense(denseVector(), 1), (error: unknown) =>
    error instanceof QdrantCorpusError && error.code === "QDRANT_PRIVATE_SERVICE_UNAVAILABLE" && error.retryable);

  const unauthorized = new QdrantLegalCorpusClient({
    ...configured,
    QDRANT_URL: "https://qdrant.internal",
    QDRANT_SERVICE: { fetch: async () => new Response(null, { status: 401 }) } as Fetcher,
  });
  await assert.rejects(() => unauthorized.queryDense(denseVector(), 1), (error: unknown) =>
    error instanceof QdrantCorpusError && error.code === "QDRANT_HTTP_4XX" && !error.retryable);
});

test("platform requests can address the singleton private Container without public DNS", async () => {
  const requests: Request[] = [];
  const names: string[] = [];
  const startOptions: unknown[] = [];
  let starts = 0;
  const client = new QdrantLegalCorpusClient({
    ...configured,
    QDRANT_URL: "https://qdrant.internal",
    QDRANT_CONTAINER: {
      getByName(name: string) {
        names.push(name);
        return {
          async startAndWaitForPorts(options: unknown) {
            startOptions.push(options);
            starts += 1;
          },
          async fetch(request: Request) {
            requests.push(request);
            return response([{ chunkId: "chunk:container", score: 0.91 }]);
          },
        };
      },
    },
  }, async () => {
    throw new Error("public fetch must not run");
  });
  assert.deepEqual(await client.queryDense(denseVector(), 2), [
    { chunkId: "chunk:container", score: 0.91 },
  ]);
  assert.deepEqual(names, ["juro-legal-corpus-qdrant-v1"]);
  assert.equal(starts, 1);
  assert.deepEqual(startOptions, [{}]);
  assert.equal(requests[0]?.url,
    "https://qdrant.internal/collections/juro_legal_staging/points/query");
});

test("collection compatibility requires 1536-dimensional cosine dense plus named sparse vectors", async () => {
  const compatible = new QdrantLegalCorpusClient(configured, async () => Response.json({
    status: "ok",
    result: {
      config: {
        params: {
          vectors: { dense: { size: 1536, distance: "Cosine" } },
          sparse_vectors: { sparse: {} },
        },
      },
    },
  }));
  await compatible.assertCompatible();
  const incompatible = new QdrantLegalCorpusClient(configured, async () => Response.json({
    status: "ok",
    result: {
      config: {
        params: {
          vectors: { dense: { size: 768, distance: "Cosine" } },
          sparse_vectors: {},
        },
      },
    },
  }));
  await assert.rejects(() => incompatible.assertCompatible(), (error: unknown) =>
    error instanceof QdrantCorpusError && error.code === "QDRANT_COLLECTION_INCOMPATIBLE");
});

test("collection bootstrap creates only the configured dense+sparse collection and validates it", async () => {
  const requests: Array<{ url: string; method: string; body: string }> = [];
  let readCount = 0;
  const client = new QdrantLegalCorpusClient(configured, async (input, init) => {
    requests.push({
      url: String(input),
      method: String(init?.method ?? "GET"),
      body: String(init?.body ?? ""),
    });
    if ((init?.method ?? "GET") === "GET") {
      readCount += 1;
      if (readCount === 1) return new Response(null, { status: 404 });
      return Response.json({
        status: "ok",
        result: {
          config: {
            params: {
              vectors: { dense: { size: 1536, distance: "Cosine" } },
              sparse_vectors: { sparse: {} },
            },
          },
        },
      });
    }
    return Response.json({ status: "ok", result: true });
  });
  assert.equal(await client.ensureCompatible(), "created");
  assert.deepEqual(requests.map((entry) => entry.method), ["GET", "PUT", "GET"]);
  assert.ok(requests.every((entry) => entry.url ===
    "https://qdrant.internal.example/collections/juro_legal_staging"));
  const configuration = JSON.parse(requests[1]!.body) as {
    vectors: { dense: { size: number; distance: string; on_disk: boolean } };
    sparse_vectors: { sparse: { index: { on_disk: boolean } } };
    on_disk_payload: boolean;
  };
  assert.deepEqual(configuration, {
    vectors: { dense: { size: 1536, distance: "Cosine", on_disk: true } },
    sparse_vectors: { sparse: { index: { on_disk: true } } },
    on_disk_payload: true,
  });
});

test("collection bootstrap refuses to replace an incompatible existing collection", async () => {
  const methods: string[] = [];
  const client = new QdrantLegalCorpusClient(configured, async (_input, init) => {
    methods.push(String(init?.method ?? "GET"));
    return Response.json({
      status: "ok",
      result: {
        config: {
          params: {
            vectors: { dense: { size: 768, distance: "Cosine" } },
            sparse_vectors: {},
          },
        },
      },
    });
  });
  await assert.rejects(() => client.ensureCompatible(), (error: unknown) =>
    error instanceof QdrantCorpusError && error.code === "QDRANT_COLLECTION_INCOMPATIBLE");
  assert.deepEqual(methods, ["GET"]);
});

test("snapshot lifecycle preserves Qdrant checksum across download, upload and cleanup", async () => {
  const snapshotBytes = new TextEncoder().encode("verified-qdrant-snapshot");
  const checksum = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", snapshotBytes)),
    (byte) => byte.toString(16).padStart(2, "0")).join("");
  const requests: Array<{ url: string; method: string; contentType: string | null; body: Uint8Array }> = [];
  const client = new QdrantLegalCorpusClient(configured, async (input, init) => {
    const method = String(init?.method ?? "GET");
    const url = String(input);
    const body = init?.body
      ? new Uint8Array(await new Response(init.body as BodyInit).arrayBuffer())
      : new Uint8Array();
    requests.push({ url, method, contentType: new Headers(init?.headers).get("content-type"), body });
    if (method === "POST" && url.endsWith("/snapshots?wait=true")) {
      return Response.json({
        status: "ok",
        result: {
          name: "legal.snapshot",
          size: snapshotBytes.byteLength,
          creation_time: "2026-08-15T16:00:00.000Z",
          checksum,
        },
      });
    }
    if (method === "GET" && url.endsWith("/snapshots/legal.snapshot")) {
      return new Response(snapshotBytes, {
        headers: { "content-length": String(snapshotBytes.byteLength) },
      });
    }
    return Response.json({ status: "ok", result: true });
  });
  const info = await client.createSnapshot();
  assert.deepEqual(info, {
    name: "legal.snapshot",
    size: snapshotBytes.byteLength,
    creationTime: "2026-08-15T16:00:00.000Z",
    checksumSha256: checksum,
  });
  const downloaded = await client.downloadSnapshot(info.name);
  assert.deepEqual(new Uint8Array(await downloaded.arrayBuffer()), snapshotBytes);
  await client.restoreSnapshot({
    name: info.name,
    size: info.size,
    checksumSha256: checksum,
    body: new Blob([snapshotBytes]).stream(),
  });
  await client.deleteSnapshot(info.name);
  const restore = requests.find((entry) => entry.url.includes("/snapshots/upload?"));
  assert.ok(restore);
  assert.equal(restore.method, "POST");
  assert.match(restore.contentType ?? "", /^multipart\/form-data; boundary=juro-/u);
  assert.match(new TextDecoder().decode(restore.body), /verified-qdrant-snapshot/u);
  assert.match(restore.url, new RegExp(`checksum=${checksum}$`, "u"));
  assert.equal(requests.at(-1)?.method, "DELETE");
});

test("hybrid Qdrant fusion preserves dense-only and sparse-only candidates", async () => {
  const client = new QdrantLegalCorpusClient(configured, async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { using: string };
    return body.using === "dense"
      ? response([{ chunkId: "dense-only", score: 0.95 }, { chunkId: "both", score: 0.7 }])
      : response([{ chunkId: "sparse-only", score: 4.2 }, { chunkId: "both", score: 3.1 }]);
  });
  const result = await client.queryHybrid({
    dense: denseVector(),
    sparse: { indices: [1, 4], values: [1, 0.5] },
    limit: 5,
  });
  assert.deepEqual(result.map((item) => item.chunkId), ["both", "dense-only", "sparse-only"]);
  assert.ok(result.every((item) => item.score > 0));
});

test("sparse hashing and point IDs are deterministic and Qdrant-safe", async () => {
  const first = await encodeQdrantSparseTerms([
    { term: "Mehnat", weight: 1 },
    { term: "mehnat", weight: 2 },
    { term: "шартнома", weight: 1 },
  ]);
  const second = await encodeQdrantSparseTerms([
    { term: "Mehnat", weight: 1 },
    { term: "mehnat", weight: 2 },
    { term: "шартнома", weight: 1 },
  ]);
  assert.deepEqual(first, second);
  assert.equal(first.indices.length, 2);
  assert.ok(first.indices[0]! < first.indices[1]!);
  const point = await qdrantPointId("doc:uz-Latn:v1:p3:c0");
  assert.match(point, /^[0-9a-f-]{36}$/u);
  assert.equal(point, await qdrantPointId("doc:uz-Latn:v1:p3:c0"));
  const query = await encodeQdrantSparseQuery("Mehnat mehnat шартнома");
  assert.equal(query.indices.length, 2);
  assert.deepEqual([...query.values].sort((left, right) => left - right), [1, 2]);
});

test("upsert emits named dense+sparse vectors and no private scope payload", async () => {
  let body: Record<string, unknown> | null = null;
  const client = new QdrantLegalCorpusClient(configured, async (_input, init) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({ status: "ok", result: { status: "completed" } });
  });
  await client.upsert([{
    id: await qdrantPointId("chunk:1"),
    chunkId: "chunk:1",
    documentId: "document:1",
    variantId: "variant:1",
    versionId: "version:1",
    language: "ru",
    status: "active",
    isCurrent: true,
    articleNumber: "12",
    dense: denseVector(),
    sparse: { indices: [3, 7], values: [1, 0.5] },
  }]);
  assert.ok(body);
  const serialized = JSON.stringify(body);
  const points = (body as { points: Array<{ vector: { dense: number[] } }> }).points;
  assert.equal(points[0]?.vector.dense.length, 1536);
  assert.equal(points[0]?.vector.dense[0], 0.1);
  assert.match(serialized, /"sparse":\{"indices":\[3,7\]/u);
  assert.match(serialized, /"scope":"global"/u);
  assert.doesNotMatch(serialized, /tenant_id|owner_user_id|matter_id/u);
});

test("version deactivation updates payload by a bounded environment and version filter", async () => {
  const requests: Array<{ url: string; body: string }> = [];
  const client = new QdrantLegalCorpusClient(configured, async (input, init) => {
    requests.push({ url: String(input), body: String(init?.body) });
    return Response.json({ status: "ok", result: { status: "completed" } });
  });
  await client.setVersionCurrent("lexuz:42:ru:v1", false);
  assert.equal(requests[0]?.url,
    "https://qdrant.internal.example/collections/juro_legal_staging/points/payload?wait=true");
  const payload = JSON.parse(requests[0]!.body) as {
    payload: { is_current: boolean };
    filter: { must: Array<{ key: string; match: { value: unknown } }> };
  };
  assert.equal(payload.payload.is_current, false);
  assert.deepEqual(payload.filter.must.map((item) => [item.key, item.match.value]), [
    ["environment", "staging"],
    ["scope", "global"],
    ["version_id", "lexuz:42:ru:v1"],
  ]);
});
