import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { buildCustomBm25Artifacts, customBm25TermHash } from "../lib/legal-corpus/custom-bm25";
import { buildCustomBm25RuntimeArtifacts, queryCustomBm25Runtime,
  resolveCustomBm25RuntimeItemKeys, resolveCustomBm25RuntimeMembership,
  resolveCustomBm25RuntimeMembershipEntries }
  from "../lib/legal-corpus/custom-bm25-runtime";
import { stableSourceSnapshotJson } from "../lib/legal-corpus/source-snapshot";

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

test("runtime BM25 projection preserves durable ordinals without loading the JSON document manifest", async () => {
  const built = await buildCustomBm25Artifacts([{
    segmentId: "base", itemKey: "chunk-a", language: "en", documentType: "law",
    validFromEpoch: 1, validToEpoch: null,
    fields: { title: "Work law", hierarchy: "", article: "Article 1", text: "work contract" },
  }, {
    segmentId: "base", itemKey: "chunk-b", language: "en", documentType: "law",
    validFromEpoch: 3, validToEpoch: null,
    fields: { title: "Tax law", hierarchy: "", article: "Article 2", text: "income tax" },
  }], { analyzer: "word-v1" });
  built.manifest.documents[0]!.ordinal = 1_000;
  built.manifest.documents[1]!.ordinal = 8_000_002;
  const termHash = await customBm25TermHash("work");
  const encode = (value: unknown) => new TextEncoder().encode(`${stableSourceSnapshotJson(value)}\n`);
  const postingBytes = encode({ blockMaximum: 1, documentFrequency: 1,
    postings: [{ ordinal: 1_000, termFrequencies: { title: 1, hierarchy: 0, article: 0, text: 1 } }],
    skip: [{ ordinal: 1_000, postingIndex: 0 }], termHash });
  const postingReference = { key: "runtime-postings", sizeBytes: postingBytes.byteLength,
    sha256: createHash("sha256").update(postingBytes).digest("hex") };
  const lexiconBytes = encode({ [termHash]: { ...postingReference, offset: 0,
    length: postingBytes.byteLength, documentFrequency: 1, blockMaximum: 1 } });
  const lexiconReference = { key: "runtime-lexicon", sizeBytes: lexiconBytes.byteLength,
    sha256: createHash("sha256").update(lexiconBytes).digest("hex") };
  built.manifest.segments = [{ id: "base", postings: { [termHash[0]!]: postingReference },
    lexicons: { [termHash[0]!]: lexiconReference } }];
  const runtime = await buildCustomBm25RuntimeArtifacts({
    releaseId: "release:test:current:custom-v1", sparseManifestSha256: "a".repeat(64),
    manifest: built.manifest,
    resolveLegalIdentitySha256: async (itemKeys) => new Map(itemKeys.map((itemKey, index) =>
      [itemKey, String(index + 1).padStart(64, "0")])),
  });
  const bucket = new MemoryR2();
  bucket.objects.set(runtime.documentsReference.key, runtime.documentsBytes);
  for (const page of runtime.ordinalMappingPages) {
    bucket.objects.set(page.reference.key, page.bytes);
  }
  bucket.objects.set(runtime.membership.reference.key, runtime.membership.bytes);
  for (const page of runtime.membership.pages) bucket.objects.set(page.reference.key, page.bytes);
  bucket.objects.set(postingReference.key, postingBytes);
  bucket.objects.set(lexiconReference.key, lexiconBytes);

  const hits = await queryCustomBm25Runtime(bucket as unknown as R2Bucket, runtime.descriptor,
    { text: "work", atEpoch: 2, topK: 5 });
  assert.deepEqual(hits.map((hit) => hit.ordinal), [1_000]);
  assert.equal(runtime.documentsBytes.byteLength, 16 + 2 * 32);
  assert.equal(runtime.documentsReference.sha256,
    createHash("sha256").update(runtime.documentsBytes).digest("hex"));
  assert.deepEqual(await resolveCustomBm25RuntimeItemKeys(
    bucket as unknown as R2Bucket, runtime.descriptor, [8_000_002, 1_000]),
  ["chunk-b", "chunk-a"]);
  assert.equal(await resolveCustomBm25RuntimeMembership(bucket as unknown as R2Bucket,
    runtime.descriptor.releaseId, runtime.membership.reference.sha256, ["chunk-a"]), true);
  assert.equal(await resolveCustomBm25RuntimeMembership(bucket as unknown as R2Bucket,
    runtime.descriptor.releaseId, runtime.membership.reference.sha256, ["chunk-missing"]), false);
  assert.equal((await resolveCustomBm25RuntimeMembershipEntries(bucket as unknown as R2Bucket,
    runtime.descriptor.releaseId, runtime.membership.reference.sha256,
    ["chunk-a"]))?.get("chunk-a")?.legalIdentitySha256, "1".padStart(64, "0"));
  assert.equal(termHash.length, 64);
});
