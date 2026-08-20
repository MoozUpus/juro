import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import {
  encodeQdrantSparseTerms,
  qdrantPointId,
  QdrantLegalCorpusClient,
  type QdrantCorpusPoint,
} from "../lib/legal-corpus/qdrant";

const QDRANT_URL = new URL(process.env.QDRANT_GATE_URL ?? "http://127.0.0.1:6333");
const API_KEY = process.env.QDRANT_GATE_API_KEY?.trim() || undefined;
const COLLECTION = `juro_legal_corpus_gate_${(process.env.GITHUB_RUN_ID ?? "local").replace(/[^A-Za-z0-9_-]/gu, "_")}`;
const VECTOR_DIMENSIONS = 1_536;
const REQUEST_TIMEOUT_MS = 30_000;
const READY_TIMEOUT_MS = 90_000;

type JsonObject = Record<string, unknown>;

function endpoint(path: string): URL {
  return new URL(path, QDRANT_URL);
}

async function rawRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(endpoint(path), {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      ...(API_KEY ? { "api-key": API_KEY } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const message = (await response.text()).slice(0, 1_000);
    throw new Error(`QDRANT_GATE_HTTP_${response.status}:${message}`);
  }
  return response;
}

async function jsonRequest(path: string, init: RequestInit = {}): Promise<JsonObject> {
  const headers = new Headers(init.headers);
  if (typeof init.body === "string" && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const value = await (await rawRequest(path, { ...init, headers })).json() as unknown;
  assert.ok(value && typeof value === "object" && !Array.isArray(value), "QDRANT_GATE_JSON_REJECTED");
  return value as JsonObject;
}

async function waitUntilReady(): Promise<JsonObject> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      return await jsonRequest("/");
    } catch (error) {
      lastError = error;
      await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
    }
  }
  throw new Error("QDRANT_GATE_READY_TIMEOUT", { cause: lastError });
}

function denseVector(index: number): number[] {
  const vector = new Array<number>(VECTOR_DIMENSIONS).fill(0);
  vector[index] = 1;
  return vector;
}

async function makePoint(input: {
  chunkId: string;
  documentId: string;
  vectorIndex: number;
  term: string;
}): Promise<QdrantCorpusPoint> {
  return {
    id: await qdrantPointId(input.chunkId),
    chunkId: input.chunkId,
    documentId: input.documentId,
    variantId: `${input.documentId}:ru`,
    versionId: `${input.documentId}:v1`,
    language: "ru",
    status: "active",
    isCurrent: true,
    articleNumber: String(input.vectorIndex + 1),
    dense: denseVector(input.vectorIndex),
    sparse: await encodeQdrantSparseTerms([{ term: input.term, weight: 4 }]),
  };
}

async function exactPointCount(): Promise<number> {
  const response = await jsonRequest(`/collections/${COLLECTION}/points/count`, {
    method: "POST",
    body: JSON.stringify({ exact: true }),
  });
  const result = response.result;
  assert.ok(result && typeof result === "object" && !Array.isArray(result), "QDRANT_GATE_COUNT_REJECTED");
  const count = Number((result as JsonObject).count);
  assert.ok(Number.isInteger(count) && count >= 0, "QDRANT_GATE_COUNT_REJECTED");
  return count;
}

async function deleteCollection(): Promise<void> {
  try {
    await rawRequest(`/collections/${COLLECTION}?timeout=30`, { method: "DELETE" });
  } catch (error) {
    if (!String(error).includes("QDRANT_GATE_HTTP_404")) throw error;
  }
}

async function main(): Promise<void> {
  const started = performance.now();
  const service = await waitUntilReady();
  await deleteCollection();
  await jsonRequest(`/collections/${COLLECTION}`, {
    method: "PUT",
    body: JSON.stringify({
      vectors: { dense: { size: VECTOR_DIMENSIONS, distance: "Cosine" } },
      sparse_vectors: { sparse: {} },
      on_disk_payload: true,
    }),
  });

  const client = new QdrantLegalCorpusClient({
    APP_ENV: "development",
    QDRANT_URL: QDRANT_URL.origin,
    QDRANT_API_KEY: API_KEY,
    QDRANT_COLLECTION: COLLECTION,
  });
  try {
    await client.assertCompatible();
    const points = await Promise.all([
      makePoint({ chunkId: "chunk-alpha", documentId: "document-alpha", vectorIndex: 0, term: "shartnoma" }),
      makePoint({ chunkId: "chunk-beta", documentId: "document-beta", vectorIndex: 1, term: "soliq" }),
      makePoint({ chunkId: "chunk-gamma", documentId: "document-gamma", vectorIndex: 2, term: "mehnat" }),
    ]);
    await client.upsert(points);
    assert.equal(await exactPointCount(), 3);

    const sparseQuery = await encodeQdrantSparseTerms([{ term: "shartnoma", weight: 4 }]);
    const dense = await client.queryDense(denseVector(0), 3);
    const sparse = await client.querySparse(sparseQuery, 3);
    const hybrid = await client.queryHybrid({ dense: denseVector(0), sparse: sparseQuery, limit: 3 });
    assert.equal(dense[0]?.chunkId, "chunk-alpha", "QDRANT_GATE_DENSE_ORDER_REJECTED");
    assert.equal(sparse[0]?.chunkId, "chunk-alpha", "QDRANT_GATE_SPARSE_ORDER_REJECTED");
    assert.equal(hybrid[0]?.chunkId, "chunk-alpha", "QDRANT_GATE_HYBRID_ORDER_REJECTED");

    const snapshotStarted = performance.now();
    const snapshotResponse = await jsonRequest(`/collections/${COLLECTION}/snapshots`, { method: "POST" });
    const snapshotResult = snapshotResponse.result;
    assert.ok(snapshotResult && typeof snapshotResult === "object" && !Array.isArray(snapshotResult), "QDRANT_GATE_SNAPSHOT_REJECTED");
    const snapshotName = String((snapshotResult as JsonObject).name ?? "");
    assert.match(snapshotName, /^[A-Za-z0-9_.-]+\.snapshot$/u, "QDRANT_GATE_SNAPSHOT_REJECTED");
    const snapshotBytes = new Uint8Array(await (await rawRequest(
      `/collections/${COLLECTION}/snapshots/${encodeURIComponent(snapshotName)}`,
    )).arrayBuffer());
    assert.ok(snapshotBytes.byteLength > 0, "QDRANT_GATE_EMPTY_SNAPSHOT");
    const snapshotSha256 = createHash("sha256").update(snapshotBytes).digest("hex");

    await deleteCollection();
    const form = new FormData();
    form.append("snapshot", new Blob([snapshotBytes], { type: "application/octet-stream" }), snapshotName);
    const restoreResponse = await jsonRequest(
      `/collections/${COLLECTION}/snapshots/upload?priority=snapshot&wait=true`,
      { method: "POST", body: form },
    );
    assert.equal(restoreResponse.status, "ok", "QDRANT_GATE_RESTORE_REJECTED");
    await client.assertCompatible();
    assert.equal(await exactPointCount(), 3, "QDRANT_GATE_RESTORE_COUNT_REJECTED");
    const restored = await client.queryHybrid({ dense: denseVector(0), sparse: sparseQuery, limit: 3 });
    assert.equal(restored[0]?.chunkId, "chunk-alpha", "QDRANT_GATE_RESTORE_QUERY_REJECTED");

    const evidence = {
      schemaVersion: 1,
      status: "pass",
      qdrantVersion: typeof service.version === "string" ? service.version : null,
      image: "qdrant/qdrant:v1.18.2@sha256:da65a06bc75e42702f80c992b99c5144b0fbd675ae7a96d2991de0bf957b7071",
      collection: COLLECTION,
      vectorDimensions: VECTOR_DIMENSIONS,
      pointCount: 3,
      denseFirst: dense[0]?.chunkId ?? null,
      sparseFirst: sparse[0]?.chunkId ?? null,
      hybridFirst: hybrid[0]?.chunkId ?? null,
      restoredHybridFirst: restored[0]?.chunkId ?? null,
      snapshot: {
        name: snapshotName,
        bytes: snapshotBytes.byteLength,
        sha256: snapshotSha256,
        createDownloadDurationMs: Math.round((performance.now() - snapshotStarted) * 100) / 100,
      },
      totalDurationMs: Math.round((performance.now() - started) * 100) / 100,
      generatedAt: new Date().toISOString(),
    };
    const outputPath = resolve(process.env.QDRANT_GATE_EVIDENCE_PATH ?? "artifacts/qdrant-gate.json");
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  } finally {
    await deleteCollection();
  }
}

await main();
