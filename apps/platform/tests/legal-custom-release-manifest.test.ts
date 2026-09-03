import assert from "node:assert/strict";
import test from "node:test";

import {
  CUSTOM_SOURCE_ORDINAL_STRIDE,
  CUSTOM_VECTORIZE_METADATA_INDEXES,
  customItemOrdinal,
  reconcileCustomReleasePages,
  type CustomReleasePageReceipt,
} from "../lib/legal-corpus/custom-release-manifest";

const releaseId = "release:staging:current:custom-v1:2026-09-03";
const hash = "a".repeat(64);

function receipt(start: number, count: number): CustomReleasePageReceipt {
  const batchId = `source-${String(start).padStart(6, "0")}`;
  return {
    schemaVersion: 1,
    releaseId,
    batchId,
    sourceOrdinalStart: start,
    sourceCount: count,
    sourceInventorySha256: hash,
    chunkCount: count + 1,
    chunkInventoryKey: `search-releases/${releaseId}/chunks/${batchId}.json`,
    chunkInventorySha256: hash,
    sparseInputKey: `search-releases/${releaseId}/sparse/word-v1/input/${batchId}.ndjson`,
    sparseInputSha256: hash,
    sparseRecordCount: count * 10,
    denseInventoryKey: `search-releases/${releaseId}/dense/${batchId}.json`,
    denseInventorySha256: hash,
    vectorCount: count + 1,
    vectorizeMutationId: `mutation-${start}`,
    providerInputTokens: count * 100,
    reusedEmbeddingCount: 1,
  };
}

test("page reconciliation proves a complete disjoint source union and both-lane parity", async () => {
  const result = await reconcileCustomReleasePages({
    releaseId,
    expectedSourceCount: 20,
    receipts: [receipt(10, 10), receipt(0, 10)],
  });
  assert.equal(result.sourceCount, 20);
  assert.equal(result.pageCount, 2);
  assert.equal(result.chunkCount, 22);
  assert.equal(result.vectorCount, result.chunkCount);
  assert.equal(result.providerInputTokens, 2_000);
  assert.match(result.pageInventorySha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(CUSTOM_VECTORIZE_METADATA_INDEXES, [
    "document_type", "language", "valid_from_epoch", "valid_to_epoch",
  ]);
});

test("page reconciliation rejects gaps, overlaps, duplicates and wrong releases", async () => {
  for (const receipts of [
    [receipt(0, 10), receipt(11, 9)],
    [receipt(0, 10), receipt(9, 11)],
    [receipt(0, 10), receipt(0, 10)],
    [receipt(0, 10), { ...receipt(10, 10), releaseId: "other-release" }],
  ]) {
    await assert.rejects(reconcileCustomReleasePages({
      releaseId, expectedSourceCount: 20, receipts,
    }), /CUSTOM_RELEASE_/u);
  }
});

test("item ordinals are stable, globally disjoint and provision-bounded", () => {
  assert.equal(customItemOrdinal(42, 7), 42 * CUSTOM_SOURCE_ORDINAL_STRIDE + 7);
  assert.notEqual(customItemOrdinal(42, 999), customItemOrdinal(43, 0));
  assert.throws(() => customItemOrdinal(42, 1_000), /CUSTOM_RELEASE_ITEM_ORDINAL_INVALID/u);
});
