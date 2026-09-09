import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  buildRetrievalChunks,
  countCustomEmbeddingTokens,
  createCustomEmbeddingArtifact,
  customVectorId,
  deserializeNormalizedEmbedding,
  putImmutableCustomArtifact,
  readVerifiedCustomArtifactRange,
  serializeCustomEmbeddingInput,
} from "../lib/legal-corpus/custom-hybrid-index";
import {
  analyzeCustomCharacterNgrams,
  analyzeCustomWordTerms,
  buildCustomBm25IntermediateRecords,
  buildCustomBm25Artifacts,
  customBm25TermHash,
  fuseCustomRankedLanes,
  queryCustomBm25,
} from "../lib/legal-corpus/custom-bm25";
import {
  buildCustomVectorizeFilter,
  fuseCustomHybridFormulations,
  queryCustomDenseLane,
  revalidateCustomCandidateIdentities,
} from "../lib/legal-corpus/custom-candidate-index";

class MemoryR2 {
  readonly objects = new Map<string, Uint8Array>();
  puts = 0;
  rangedReads = 0;

  async head(key: string) {
    const bytes = this.objects.get(key);
    return bytes ? { key, size: bytes.byteLength } : null;
  }

  async get(key: string, options?: { range?: { offset: number; length: number } }) {
    const source = this.objects.get(key);
    if (!source) return null;
    const range = options?.range;
    if (range) this.rangedReads += 1;
    const bytes = range
      ? source.slice(range.offset, range.offset + range.length)
      : source.slice();
    return {
      key,
      size: source.byteLength,
      range: range ? { offset: range.offset, length: bytes.byteLength } : undefined,
      async arrayBuffer() {
        return bytes.slice().buffer;
      },
    };
  }

  async put(
    key: string,
    value: Uint8Array,
    options?: { onlyIf?: { etagDoesNotMatch?: string } },
  ) {
    if (options?.onlyIf?.etagDoesNotMatch === "*" && this.objects.has(key)) return null;
    this.puts += 1;
    this.objects.set(key, value.slice());
    return { key, size: value.byteLength };
  }
}

test("word-BM25 intermediate records are deterministic, content-free, and globally ordinal", async () => {
  assert.deepEqual(analyzeCustomWordTerms(" Статья 10 — СУД, суд! "), ["статья", "10", "суд", "суд"]);
  assert.equal(await customBm25TermHash("суд"), await customBm25TermHash("суд"));
  const built = await buildCustomBm25IntermediateRecords({
    segmentId: "current-base-0001",
    itemKey: "retrieval-chunk-v1:" + "a".repeat(64),
    language: "ru",
    documentType: "law",
    validFromEpoch: 1,
    validToEpoch: null,
    fields: { title: "Суд", hierarchy: "", article: "10", text: "Суд и право" },
  }, 42);
  assert.deepEqual(built.fieldLengths, { title: 1, hierarchy: 0, article: 1, text: 3 });
  assert.ok(built.records.length > 0);
  assert.ok(built.records.every((record) => record.itemOrdinal === 42
    && /^[a-f0-9]{64}$/u.test(record.termHash)
    && !("text" in record)));
  assert.deepEqual(built.records, [...built.records].sort((left, right) =>
    left.termHash.localeCompare(right.termHash)
      || left.itemOrdinal - right.itemOrdinal
      || left.field.localeCompare(right.field)));
});

const sourceProvision = {
  snapshotProvisionId: "snapshot-provision-development-1",
  sourceDocumentTitle: "Ўзбекистон Республикасининг Меҳнат кодекси",
  documentType: "Кодекс",
  articleNumber: "161-модда",
  articleTitle: "Меҳнат шартномасини бекор қилиш",
  hierarchy: ["Умумий қисм", "Меҳнат шартномаси"],
  language: "uz-Cyrl" as const,
  script: "Cyrl" as const,
  officialText: Array.from({ length: 180 }, (_, index) =>
    `Банд ${index + 1}. Ходим ва иш берувчи ҳуқуқлари қонунга мувофиқ ҳимоя қилинади.`
  ).join("\n\n"),
  validFromEpoch: 1_672_531_200,
  validToEpoch: null,
};

test("Retrieval Chunks are deterministic, provision-owned, zero-overlap, and embedding-safe", async () => {
  const first = await buildRetrievalChunks(sourceProvision, { targetTokens: 512 });
  const repeated = await buildRetrievalChunks(sourceProvision, { targetTokens: 512 });

  assert.deepEqual(repeated, first);
  assert.equal(first.length > 1, true);
  assert.equal(first.map((chunk) => chunk.officialText).join(""), sourceProvision.officialText);
  assert.deepEqual(first.map((chunk) => chunk.ordinal), first.map((_, index) => index));
  assert.equal(new Set(first.map((chunk) => chunk.id)).size, first.length);
  for (const [index, chunk] of first.entries()) {
    assert.equal(chunk.snapshotProvisionId, sourceProvision.snapshotProvisionId);
    assert.equal(chunk.targetTokens, 512);
    assert.equal(chunk.officialText.length > 0, true);
    assert.equal(chunk.embeddingTokenCount <= 8_192, true);
    assert.equal(chunk.embeddingTokenCount, countCustomEmbeddingTokens(
      serializeCustomEmbeddingInput(chunk),
    ));
    assert.doesNotMatch(serializeCustomEmbeddingInput(chunk), /https?:|release|provider|validFrom|validTo/iu);
    if (index < first.length - 1) assert.equal(chunk.officialText.endsWith("\n\n"), true);
  }
});

test("long provision chunking bounds tokenizer work while preserving accepted identities", async () => {
  const source = { ...sourceProvision, officialText: Array.from({ length: 1200 }, (_, index) =>
    `Section ${index}. Workers retain their rights. Қонун ҳуқуқларни ҳимоя қилади. Закон защищает права. 🏛️`
  ).join("\n\n") };
  const referenceStart = process.cpuUsage();
  for (let index = 0; index < 50; index++) countCustomEmbeddingTokens(source.officialText);
  const reference = process.cpuUsage(referenceStart);
  const started = process.cpuUsage();
  const chunks = await buildRetrievalChunks(source, { targetTokens: 512 });
  const used = process.cpuUsage(started);
  const root = createHash("sha256").update(JSON.stringify(chunks.map(chunk => [
    chunk.id, chunk.officialTextSha256, chunk.embeddingTokenCount,
  ]))).digest("hex");
  assert.equal(chunks.map(chunk => chunk.officialText).join(""), source.officialText);
  assert.equal(root, "d87e9babdf0deff55bcee3aa669ba10b4351e4aec0f2f1af58b90678c74a4fed");
  const budget = 2 * (reference.user + reference.system);
  assert.ok(used.user + used.system < budget,
    `chunk CPU ${used.user + used.system}; bounded reference ${budget}; root ${root}`);
});

test("immutable BM25 segments share global scores, filter before top-K, and use ranged postings", async () => {
  const documents = [
    {
      segmentId: "base",
      itemKey: "chunk-a",
      language: "uz-Cyrl" as const,
      documentType: "Кодекс",
      validFromEpoch: 100,
      validToEpoch: null,
      fields: {
        title: "Меҳнат кодекси",
        hierarchy: "Меҳнат шартномаси",
        article: "161-модда",
        text: "Меҳнат шартномаси тарафларнинг келишувига кўра бекор қилинади.",
      },
    },
    {
      segmentId: "base",
      itemKey: "chunk-expired",
      language: "uz-Cyrl" as const,
      documentType: "Кодекс",
      validFromEpoch: 10,
      validToEpoch: 90,
      fields: {
        title: "Меҳнат шартномаси меҳнат шартномаси",
        hierarchy: "Меҳнат шартномаси",
        article: "эски",
        text: "Меҳнат шартномаси меҳнат шартномаси меҳнат шартномаси.",
      },
    },
    {
      segmentId: "delta-1",
      itemKey: "chunk-b",
      language: "uz-Cyrl" as const,
      documentType: "Қонун",
      validFromEpoch: 100,
      validToEpoch: null,
      fields: {
        title: "Бандлик тўғрисидаги қонун",
        hierarchy: "Ходим ҳуқуқлари",
        article: "20-модда",
        text: "Ходимнинг меҳнат ҳуқуқлари кафолатланади.",
      },
    },
    {
      segmentId: "delta-1",
      itemKey: "chunk-c",
      language: "ru" as const,
      documentType: "Кодекс",
      validFromEpoch: 100,
      validToEpoch: null,
      fields: {
        title: "Трудовой кодекс",
        hierarchy: "Трудовой договор",
        article: "статья 161",
        text: "Трудовой договор прекращается по соглашению сторон.",
      },
    },
  ];
  const first = await buildCustomBm25Artifacts(documents, { analyzer: "word-v1" });
  const repeated = await buildCustomBm25Artifacts([...documents].reverse(), { analyzer: "word-v1" });
  assert.deepEqual(repeated, first);
  const compactedDocuments = documents.map((document) => ({ ...document, segmentId: "base-compacted" }));
  const compacted = await buildCustomBm25Artifacts(compactedDocuments, { analyzer: "word-v1" });
  const repeatedCompaction = await buildCustomBm25Artifacts(
    [...compactedDocuments].reverse(), { analyzer: "word-v1" },
  );
  assert.deepEqual(repeatedCompaction, compacted);
  assert.equal(first.manifest.statistics.documentCount, documents.length);
  assert.equal(first.manifest.segments.length, 2);
  assert.equal(JSON.stringify(first.manifest).includes("positions"), false);
  assert.equal(first.artifacts.every((artifact) => artifact.key.includes(artifact.sha256)), true);
  assert.equal(first.artifacts.some((artifact) => {
    const decoded = new TextDecoder().decode(artifact.bytes);
    return decoded.includes("меҳнат") || decoded.includes("трудовой");
  }), false);

  const bucket = new MemoryR2();
  for (const artifact of first.artifacts) {
    await putImmutableCustomArtifact(
      bucket as unknown as R2Bucket,
      artifact.key,
      artifact.bytes,
      { contentType: "application/octet-stream" },
    );
  }
  const hits = await queryCustomBm25(bucket as unknown as R2Bucket, first.manifest, {
    text: "меҳнат шартномаси",
    language: "uz-Cyrl",
    documentTypes: ["Кодекс"],
    atEpoch: 150,
    topK: 1,
  });
  assert.deepEqual(hits.map((hit) => hit.itemKey), ["chunk-a"]);
  assert.equal(hits[0]?.score && hits[0].score > 0, true);
  assert.equal(bucket.rangedReads > 0, true);

  const compactedBucket = new MemoryR2();
  for (const artifact of compacted.artifacts) {
    await putImmutableCustomArtifact(
      compactedBucket as unknown as R2Bucket,
      artifact.key,
      artifact.bytes,
      { contentType: "application/octet-stream" },
    );
  }
  const compactedHits = await queryCustomBm25(
    compactedBucket as unknown as R2Bucket,
    compacted.manifest,
    { text: "меҳнат шартномаси", language: "uz-Cyrl", documentTypes: ["Кодекс"], atEpoch: 150, topK: 1 },
  );
  assert.deepEqual(compactedHits, hits);
});

test("character n-grams remain a separate challenger and rank fusion is deterministic", () => {
  const exact = analyzeCustomCharacterNgrams("шартномаси", 3);
  const typo = analyzeCustomCharacterNgrams("шартномасй", 3);
  assert.equal(exact.filter((term) => typo.includes(term)).length >= 6, true);

  const fused = fuseCustomRankedLanes([
    ["chunk-a", "chunk-b"],
    ["chunk-a", "chunk-c"],
  ], { k: 60, topK: 3 });
  assert.deepEqual(fused.map((hit) => hit.itemKey), ["chunk-a", "chunk-b", "chunk-c"]);
  assert.equal(fused[1]?.score, fused[2]?.score);
});

test("BM25 resolves durable source ordinals independently of manifest array positions", async () => {
  const bucket = new MemoryR2();
  const termHash = await customBm25TermHash("work");
  const store = (key: string, value: unknown) => {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    bucket.objects.set(key, bytes);
    return { key, sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  };
  const fieldLengths = { title: 0, hierarchy: 0, article: 0, text: 1 };
  const posting = store("postings", { termHash, documentFrequency: 1, blockMaximum: 1, skip: [],
    postings: [{ ordinal: 1000, termFrequencies: fieldLengths }] });
  const lexicon = store("lexicon", { [termHash]: { ...posting, offset: 0, length: posting.sizeBytes,
    documentFrequency: 1, blockMaximum: 1 } });
  const manifest = {
    schemaVersion: "custom-bm25-manifest-v1" as const, analyzer: "word-v1" as const,
    statistics: { documentCount: 1, averageFieldLengths: fieldLengths },
    documents: [{ ordinal: 1000, itemKey: "durable-chunk", segmentId: "base", language: "en" as const,
      documentType: "law", validFromEpoch: 1, validToEpoch: null, fieldLengths }],
    segments: [{ id: "base", postings: { [termHash[0]!]: posting }, lexicons: { [termHash[0]!]: lexicon } }],
  };
  const hits = await queryCustomBm25(bucket as unknown as R2Bucket, manifest,
    { text: "work", atEpoch: 2, topK: 1 });
  assert.deepEqual(hits.map(hit => hit.itemKey), ["durable-chunk"]);
});

test("dense filtering precedes top-K and D1 catalog revalidation fails closed", async () => {
  let observedOptions: VectorizeQueryOptions | undefined;
  const vectorize = {
    async query(_vector: number[], options: VectorizeQueryOptions) {
      observedOptions = options;
      return {
        count: 1,
        matches: [{
          id: "a".repeat(64),
          score: 0.93,
          metadata: {
            item_key: "chunk-a",
            release_id: "release-a",
            language: "uz-Cyrl",
            document_type: "Кодекс",
            valid_from_epoch: 100,
            valid_to_epoch: 253_402_300_799,
          },
        }],
      };
    },
  } as unknown as VectorizeIndex;
  const filter = buildCustomVectorizeFilter({
    releaseId: "release-a",
    language: "uz-Cyrl",
    documentTypes: ["Кодекс"],
    atEpoch: 150,
  });
  assert.deepEqual(filter, {
    valid_from_epoch: { $lte: 150 },
    valid_to_epoch: { $gt: 150 },
    language: { $eq: "uz-Cyrl" },
    document_type: { $in: ["Кодекс"] },
  });
  const dense = await queryCustomDenseLane(vectorize, {
    releaseId: "release-a",
    vector: Array.from({ length: 1_536 }, (_, index) => index === 0 ? 1 : 0),
    filter,
    topK: 50,
  });
  assert.deepEqual(observedOptions?.filter, filter);
  assert.equal(observedOptions?.topK, 50);
  assert.equal(observedOptions?.returnMetadata, "all");
  assert.deepEqual(dense.map((hit) => hit.itemKey), ["chunk-a"]);

  const valid = await revalidateCustomCandidateIdentities({
    async revalidate() {
      return [{
        itemKey: "chunk-a",
        releaseId: "release-a",
        language: "uz-Cyrl" as const,
        documentType: "Кодекс",
        validFromEpoch: 100,
        validToEpoch: null,
        evidenceR2Key: "evidence/chunk-a.json",
        evidenceSha256: "b".repeat(64),
      }];
    },
  }, {
    releaseId: "release-a",
    itemKeys: dense.map((hit) => hit.itemKey),
    language: "uz-Cyrl",
    documentTypes: ["Кодекс"],
    atEpoch: 150,
  });
  assert.equal(valid[0]?.evidenceR2Key, "evidence/chunk-a.json");
  await assert.rejects(revalidateCustomCandidateIdentities({
    async revalidate() { return []; },
  }, {
    releaseId: "release-a",
    itemKeys: ["chunk-a"],
    language: "uz-Cyrl",
    documentTypes: ["Кодекс"],
    atEpoch: 150,
  }), /CUSTOM_CANDIDATE_CATALOG_REVALIDATION_FAILED/u);
});

test("hybrid fusion uses inner sparse, equal sparse/dense, then outer formulation RRF", () => {
  const fused = fuseCustomHybridFormulations([
    {
      formulationId: "f1",
      wordSparse: ["a", "b", "c"],
      characterSparse: ["b", "a", "d"],
      dense: ["c", "a", "b"],
    },
    {
      formulationId: "f2",
      wordSparse: ["d", "a"],
      dense: ["a", "d"],
    },
  ], { k: 60, topK: 4 });
  assert.deepEqual(fused.map((hit) => hit.itemKey), ["a", "d", "c", "b"]);
  assert.equal(fused.every((hit) => Number.isFinite(hit.score)), true);
});

test("document embeddings are validated, Float32-normalized, and content-addressed", async () => {
  const [chunk] = await buildRetrievalChunks({
    ...sourceProvision,
    officialText: "Меҳнат шартномаси тарафларнинг келишувига кўра бекор қилиниши мумкин.",
  }, { targetTokens: 512 });
  assert.ok(chunk);
  const providerVector = Array.from({ length: 1_536 }, (_, index) =>
    index % 2 === 0 ? index + 1 / 3 : -(index + 1 / 7)
  );

  const first = await createCustomEmbeddingArtifact(chunk, providerVector);
  const repeated = await createCustomEmbeddingArtifact(chunk, providerVector);
  assert.equal(first.key, repeated.key);
  assert.equal(first.vectorSha256, repeated.vectorSha256);
  assert.deepEqual(first.bytes, repeated.bytes);
  assert.equal(first.bytes.byteLength, 1_536 * 4);
  assert.match(first.inputSha256, /^[a-f0-9]{64}$/u);
  assert.match(first.vectorSha256, /^[a-f0-9]{64}$/u);
  assert.equal(first.key.includes(first.inputSha256), true);
  assert.equal(first.key.includes(first.vectorSha256), true);

  const normalized = deserializeNormalizedEmbedding(first.bytes);
  const norm = Math.sqrt(normalized.reduce((sum, value) => sum + value * value, 0));
  assert.equal(normalized.length, 1_536);
  assert.equal(normalized.every(Number.isFinite), true);
  assert.equal(Math.abs(norm - 1) < 1e-6, true);
  assert.equal(
    await customVectorId(chunk.id),
    createHash("sha256").update(chunk.id).digest("hex"),
  );

  await assert.rejects(
    createCustomEmbeddingArtifact(chunk, providerVector.slice(1)),
    /CUSTOM_EMBEDDING_DIMENSION_MISMATCH/u,
  );
  await assert.rejects(
    createCustomEmbeddingArtifact(chunk, providerVector.map((value, index) =>
      index === 10 ? Number.NaN : value
    )),
    /CUSTOM_EMBEDDING_NONFINITE/u,
  );
});

test("custom artifacts are create-only, replay-safe, and range-verified", async () => {
  const bucket = new MemoryR2();
  const bytes = new TextEncoder().encode("header\nposting-one\nposting-two\nfooter");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const key = `bm25/release-a/${sha256}.bin`;

  const created = await putImmutableCustomArtifact(
    bucket as unknown as R2Bucket,
    key,
    bytes,
    { contentType: "application/octet-stream", customMetadata: { release: "release-a" } },
  );
  const replay = await putImmutableCustomArtifact(
    bucket as unknown as R2Bucket,
    key,
    bytes,
    { contentType: "application/octet-stream" },
  );
  assert.equal(created.status, "created");
  assert.equal(replay.status, "reused");
  assert.equal(created.sha256, sha256);
  assert.equal(bucket.puts, 1);

  const offset = "header\n".length;
  const expected = new TextEncoder().encode("posting-one\n");
  const ranged = await readVerifiedCustomArtifactRange(
    bucket as unknown as R2Bucket,
    {
      key,
      offset,
      length: expected.byteLength,
      sha256: createHash("sha256").update(expected).digest("hex"),
    },
  );
  assert.deepEqual(ranged, expected);

  await assert.rejects(
    putImmutableCustomArtifact(
      bucket as unknown as R2Bucket,
      key,
      new TextEncoder().encode("different"),
      { contentType: "application/octet-stream" },
    ),
    /CUSTOM_ARTIFACT_IMMUTABILITY_VIOLATION/u,
  );
  await assert.rejects(
    readVerifiedCustomArtifactRange(bucket as unknown as R2Bucket, {
      key,
      offset,
      length: expected.byteLength,
      sha256: "0".repeat(64),
    }),
    /CUSTOM_ARTIFACT_RANGE_HASH_MISMATCH/u,
  );
});
