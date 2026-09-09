import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildCustomBm25Artifacts, customBm25TermHash } from "../lib/legal-corpus/custom-bm25";
import { buildCustomBm25RuntimeArtifacts } from "../lib/legal-corpus/custom-bm25-runtime";
import { handleCustomSearchRequest, type CustomSearchEnv }
  from "../lib/legal-corpus/custom-search-service";

const RELEASE_ID = "release:staging:current:custom-v1";
const DENSE_METADATA_RELEASE_ID = "release:staging:current:custom-v0";
const INSTANCE_ID = "custom-current-staging-v1";

class MemoryR2 {
  readonly objects = new Map<string, Uint8Array>();
  async get(key: string, options?: { range?: { offset: number; length: number } }) {
    const source = this.objects.get(key);
    if (!source) return null;
    const bytes = options?.range
      ? source.slice(options.range.offset, options.range.offset + options.range.length)
      : source;
    return { size: bytes.byteLength, body: new ReadableStream({
      start(controller) { controller.enqueue(bytes); controller.close(); },
    }), async arrayBuffer() { return bytes.buffer.slice(
      bytes.byteOffset, bytes.byteOffset + bytes.byteLength); } };
  }
}

for (const { oversizedPosting, physicalAlias } of [
  { oversizedPosting: false, physicalAlias: false },
  { oversizedPosting: true, physicalAlias: false },
  { oversizedPosting: false, physicalAlias: true },
]) {
test(physicalAlias
  ? "private custom search can reuse an immutable physical release behind a logical production release"
  : oversizedPosting
    ? "private custom search treats an oversized matched posting as a sparse stop word"
    : "private custom search reserves budget and fuses verified sparse and dense lanes", async () => {
  const physicalReleaseId = physicalAlias ? DENSE_METADATA_RELEASE_ID : RELEASE_ID;
  const built = await buildCustomBm25Artifacts([{
    segmentId: "current-base-v1", itemKey: "chunk-a", language: "en", documentType: "law",
    validFromEpoch: 1, validToEpoch: null,
    fields: { title: "Work law", hierarchy: "", article: "Article 1", text: "work contract" },
  }], { analyzer: "word-v1" });
  let oversizedLexicon: { key: string; bytes: Uint8Array } | undefined;
  if (oversizedPosting) {
    const termHash = await customBm25TermHash("work");
    const reference = built.manifest.segments[0]!.lexicons[termHash[0]!]!;
    const artifact = built.artifacts.find((entry) => entry.key === reference.key)!;
    const lexicon = JSON.parse(new TextDecoder().decode(artifact.bytes)) as Record<string,
      { length: number; sizeBytes: number }>;
    lexicon[termHash]!.length = 1024 * 1024 + 1;
    lexicon[termHash]!.sizeBytes = lexicon[termHash]!.length;
    const bytes = new TextEncoder().encode(JSON.stringify(lexicon));
    built.manifest.segments[0]!.lexicons[termHash[0]!] = {
      key: reference.key, sizeBytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    oversizedLexicon = { key: reference.key, bytes };
  }
  const runtime = await buildCustomBm25RuntimeArtifacts({ releaseId: physicalReleaseId,
    ...(physicalAlias ? {} : { denseMetadataReleaseId: DENSE_METADATA_RELEASE_ID }),
    sparseManifestSha256: "a".repeat(64), manifest: built.manifest });
  const bucket = new MemoryR2();
  bucket.objects.set(runtime.descriptorReference.key, runtime.descriptorBytes);
  bucket.objects.set(runtime.documentsReference.key, runtime.documentsBytes);
  for (const page of runtime.ordinalMappingPages) bucket.objects.set(page.reference.key, page.bytes);
  for (const artifact of built.artifacts) bucket.objects.set(artifact.key, artifact.bytes);
  if (oversizedLexicon) bucket.objects.set(oversizedLexicon.key, oversizedLexicon.bytes);
  const calls: string[] = [];
  const fullKey = `search-releases/${RELEASE_ID}/chunk-a`;
  const database = {
    prepare(sql: string) {
      return {
        bind() {
          return {
            async first() {
              calls.push(sql.trim().startsWith("UPDATE") ? "reserve" : "component");
              if (sql.includes("runtime_descriptor_r2_key")) return {
                descriptorKey: runtime.descriptorReference.key,
                descriptorSha256: runtime.descriptorReference.sha256,
                sparseManifestSha256: "a".repeat(64),
              };
              return { reservedUsdMicros: 1_065 };
            },
            async run() { calls.push("ledger"); return { success: true }; },
            async all() { return { results: [{ ordinal: 0, itemKey: fullKey }] }; },
          };
        },
      };
    },
  } as unknown as D1Database;
  const observed = { denseOptions: null as VectorizeQueryOptions | null };
  let activeEmbeddingRequests = 0;
  let maximumEmbeddingConcurrency = 0;
  const dense = {
    async query(_vector: number[], options: VectorizeQueryOptions) {
      observed.denseOptions = options;
      return { count: 1, matches: [{ id: "b".repeat(64), score: 0.9,
        metadata: { item_key: "chunk-a", release_id: DENSE_METADATA_RELEASE_ID, language: "en",
          document_type: "law", valid_from_epoch: 1, valid_to_epoch: 253_402_300_799 } }] };
    },
  } as unknown as VectorizeIndex;
  const env = {
    APP_ENV: "staging",
    CUSTOM_SEARCH_CAPABILITY: "current",
    AI_GATEWAY_ID: "juro-ai-search-staging",
    CUSTOM_SEARCH_RELEASE_ID: RELEASE_ID,
    ...(physicalAlias ? { CUSTOM_SEARCH_PHYSICAL_RELEASE_ID: physicalReleaseId } : {}),
    CUSTOM_SEARCH_INSTANCE_ID: INSTANCE_ID,
    CUSTOM_SEARCH_SHARD_ID: "current-base-v1",
    CUSTOM_RUNTIME_DESCRIPTOR_KEY: runtime.descriptorReference.key,
    CUSTOM_RUNTIME_DESCRIPTOR_SHA256: runtime.descriptorReference.sha256,
    ARTIFACTS: bucket as unknown as R2Bucket,
    CATALOG_DB: database,
    AI: { gateway() { return { async run() {
      activeEmbeddingRequests++;
      maximumEmbeddingConcurrency = Math.max(maximumEmbeddingConcurrency, activeEmbeddingRequests);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeEmbeddingRequests--;
      assert.deepEqual(calls.slice(0, 3), ["component", "reserve", "ledger"]);
      return Response.json({ model: "text-embedding-3-large", object: "list",
        data: [{ object: "embedding", index: 0,
          embedding: Array.from({ length: 1_536 }, (_, index) => index === 0 ? 1 : 0) }],
        usage: { prompt_tokens: 1, total_tokens: 1 } });
    } }; } } as unknown as Ai,
    DENSE: dense,
  } satisfies CustomSearchEnv;
  const body = JSON.stringify({ releaseId: RELEASE_ID, instanceIds: [INSTANCE_ID], query: "work",
    currentAt: "2026-09-05T00:00:00.000Z",
    endpoint: { kind: "current" }, maxResults: 50, vectorThreshold: 0 });
  const response = await handleCustomSearchRequest(new Request(
    "http://legal-corpus.internal/internal/legal-corpus/custom-search", {
      method: "POST", headers: { "content-type": "application/json",
        "content-length": String(new TextEncoder().encode(body).byteLength),
        "x-juro-service-binding": "custom-search-runtime-v1",
        "x-juro-legal-environment": "staging" }, body,
    }), env);
  assert.equal(response.status, 200);
  const result = await response.json() as { hits: Array<{ itemKey: string; keywordRank: number;
    vectorRank: number }>; tokenUsage: number };
  assert.deepEqual(result.hits.map((hit) => hit.itemKey), [fullKey]);
  assert.equal(result.hits[0]?.keywordRank, oversizedPosting ? 1 : 1);
  assert.equal(result.hits[0]?.vectorRank, 1);
  assert.equal(result.tokenUsage, 1);
  assert.deepEqual(observed.denseOptions?.filter, {
    valid_from_epoch: { $lte: 1_788_566_400 },
    valid_to_epoch: { $gt: 1_788_566_400 },
  });
  if (!oversizedPosting) {
    activeEmbeddingRequests = 0;
    maximumEmbeddingConcurrency = 0;
    const concurrent = await Promise.all([1, 2].map(() => handleCustomSearchRequest(new Request(
      "http://legal-corpus.internal/internal/legal-corpus/custom-search", {
        method: "POST", headers: { "content-type": "application/json",
          "content-length": String(new TextEncoder().encode(body).byteLength),
          "x-juro-service-binding": "custom-search-runtime-v1",
          "x-juro-legal-environment": "staging" }, body,
      }), env)));
    assert.deepEqual(concurrent.map((entry) => entry.status), [200, 200]);
    assert.equal(maximumEmbeddingConcurrency, 1);
  }
  const driftedCapabilityResponse = await handleCustomSearchRequest(new Request(
    "http://legal-corpus.internal/internal/legal-corpus/custom-search", {
      method: "POST", headers: { "content-type": "application/json",
        "content-length": String(new TextEncoder().encode(body).byteLength),
        "x-juro-service-binding": "custom-search-runtime-v1",
        "x-juro-legal-environment": "staging" }, body,
    }), { ...env, CUSTOM_SEARCH_CAPABILITY: "drifted" } as unknown as CustomSearchEnv);
  assert.equal(driftedCapabilityResponse.status, 503);
  const historyEnv: CustomSearchEnv = { ...env,
    CUSTOM_SEARCH_CAPABILITY: "history",
    CUSTOM_SEARCH_INSTANCE_ID: "custom-history-staging-v1",
    CUSTOM_SEARCH_SHARD_ID: "history-base-v1" };
  const historicalAt = "2026-01-15T00:00:00.000Z";
  const historyBody = JSON.stringify({ releaseId: RELEASE_ID,
    instanceIds: [historyEnv.CUSTOM_SEARCH_INSTANCE_ID], query: "work",
    currentAt: "2026-09-05T00:00:00.000Z",
    endpoint: { kind: "timestamp", instant: historicalAt }, maxResults: 50, vectorThreshold: 0 });
  const historyResponse = await handleCustomSearchRequest(new Request(
    "http://legal-corpus.internal/internal/legal-corpus/custom-search", {
      method: "POST", headers: { "content-type": "application/json",
        "content-length": String(new TextEncoder().encode(historyBody).byteLength),
        "x-juro-service-binding": "custom-search-runtime-v1",
        "x-juro-legal-environment": "staging" }, body: historyBody,
    }), historyEnv);
  assert.equal(historyResponse.status, 200);
  assert.deepEqual(observed.denseOptions?.filter, {
    valid_from_epoch: { $lte: 1_768_435_200 },
    valid_to_epoch: { $gt: 1_768_435_200 },
  });
});
}

test("custom search rejects public requests without reserving provider spend", async () => {
  let prepared = false;
  const response = await handleCustomSearchRequest(new Request(
    "http://legal-corpus.internal/internal/legal-corpus/custom-search", { method: "POST" }), {
      APP_ENV: "staging",
      CATALOG_DB: { prepare() { prepared = true; throw new Error("unexpected"); } } as unknown as D1Database,
    } as CustomSearchEnv);
  assert.equal(response.status, 404);
  assert.equal(prepared, false);
});

test("production history search reuses the accepted physical release without build bindings", async () => {
  const config = JSON.parse(await readFile(
    new URL("../wrangler.legal-custom-history-production.jsonc", import.meta.url), "utf8",
  ));
  assert.equal(config.name, "juro-legal-history-custom-production-20260908");
  assert.equal(config.main, "./worker/legal-custom-search-worker.ts");
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.routes, undefined);
  assert.equal(config.queues, undefined);
  assert.equal(config.workflows, undefined);
  assert.equal(config.vars.APP_ENV, "production");
  assert.equal(config.vars.AI_GATEWAY_ID, "juro-ai-search-production");
  assert.equal(config.vars.CUSTOM_SEARCH_RELEASE_ID,
    "release:production:history:custom-v1:2026-09-08");
  assert.equal(config.vars.CUSTOM_SEARCH_PHYSICAL_RELEASE_ID,
    "release:staging:history:custom-v1:2026-09-06");
  assert.equal(config.r2_buckets[0].bucket_name, "juro-legal-current-custom-20260903");
  assert.equal(config.vectorize[0].index_name, "juro-legal-history-custom-20260906");
  assert.equal(config.d1_databases[0].database_name,
    "juro-legal-catalog-production-green-20260908");
});
