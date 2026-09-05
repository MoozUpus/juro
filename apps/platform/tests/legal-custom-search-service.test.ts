import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { buildCustomBm25Artifacts, customBm25TermHash } from "../lib/legal-corpus/custom-bm25";
import { buildCustomBm25RuntimeArtifacts } from "../lib/legal-corpus/custom-bm25-runtime";
import { handleCustomSearchRequest, type CustomSearchEnv }
  from "../lib/legal-corpus/custom-search-service";

const RELEASE_ID = "release:staging:current:custom-v1";
const INSTANCE_ID = "custom-current-staging-v1";

class MemoryR2 {
  readonly objects = new Map<string, Uint8Array>();
  async get(key: string, options?: { range?: { offset: number; length: number } }) {
    const source = this.objects.get(key);
    if (!source) return null;
    const bytes = options?.range
      ? source.slice(options.range.offset, options.range.offset + options.range.length)
      : source;
    return { size: bytes.byteLength, async arrayBuffer() { return bytes.buffer.slice(
      bytes.byteOffset, bytes.byteOffset + bytes.byteLength); } };
  }
}

for (const oversizedPosting of [false, true]) {
test(oversizedPosting
  ? "private custom search rejects an oversized matched posting despite successful dense retrieval"
  : "private custom search reserves budget and fuses verified sparse and dense lanes", async () => {
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
    lexicon[termHash]!.length = 16 * 1024 * 1024 + 1;
    lexicon[termHash]!.sizeBytes = lexicon[termHash]!.length;
    const bytes = new TextEncoder().encode(JSON.stringify(lexicon));
    built.manifest.segments[0]!.lexicons[termHash[0]!] = {
      key: reference.key, sizeBytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    oversizedLexicon = { key: reference.key, bytes };
  }
  const runtime = await buildCustomBm25RuntimeArtifacts({ releaseId: RELEASE_ID,
    sparseManifestSha256: "a".repeat(64), manifest: built.manifest });
  const bucket = new MemoryR2();
  bucket.objects.set(runtime.descriptorReference.key, runtime.descriptorBytes);
  bucket.objects.set(runtime.documentsReference.key, runtime.documentsBytes);
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
  const dense = {
    async query(_vector: number[], options: VectorizeQueryOptions) {
      observed.denseOptions = options;
      return { count: 1, matches: [{ id: "b".repeat(64), score: 0.9,
        metadata: { item_key: "chunk-a", release_id: RELEASE_ID, language: "en",
          document_type: "law", valid_from_epoch: 1, valid_to_epoch: 253_402_300_799 } }] };
    },
  } as unknown as VectorizeIndex;
  const env = {
    APP_ENV: "staging",
    AI_GATEWAY_ID: "juro-ai-search-staging",
    CUSTOM_SEARCH_RELEASE_ID: RELEASE_ID,
    CUSTOM_SEARCH_INSTANCE_ID: INSTANCE_ID,
    CUSTOM_SEARCH_SHARD_ID: "current-base-v1",
    CUSTOM_RUNTIME_DESCRIPTOR_KEY: runtime.descriptorReference.key,
    CUSTOM_RUNTIME_DESCRIPTOR_SHA256: runtime.descriptorReference.sha256,
    ARTIFACTS: bucket as unknown as R2Bucket,
    CATALOG_DB: database,
    AI: { gateway() { return { async run() {
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
  if (oversizedPosting) {
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { code: "CUSTOM_SEARCH_UNAVAILABLE" });
    return;
  }
  assert.equal(response.status, 200);
  const result = await response.json() as { hits: Array<{ itemKey: string; keywordRank: number;
    vectorRank: number }>; tokenUsage: number };
  assert.deepEqual(result.hits.map((hit) => hit.itemKey), [fullKey]);
  assert.equal(result.hits[0]?.keywordRank, 1);
  assert.equal(result.hits[0]?.vectorRank, 1);
  assert.equal(result.tokenUsage, 1);
  assert.deepEqual(observed.denseOptions?.filter, {
    valid_from_epoch: { $lte: 1_788_566_400 },
    valid_to_epoch: { $gt: 1_788_566_400 },
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
