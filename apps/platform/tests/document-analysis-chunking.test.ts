import assert from "node:assert/strict";
import test from "node:test";

import { chunkDocumentForAnalysis } from "../lib/document-analysis/chunking";

test("long document analysis chunks deterministically with overlap and full ordered coverage", () => {
  const text = ["A".repeat(4_500), "\n\n", "B".repeat(4_500), "\n\n", "C".repeat(4_500)].join("");
  const chunks = chunkDocumentForAnalysis(text, { chunkSize: 5_000, overlap: 300, maxChunks: 8 });
  assert.equal(chunks.length >= 3, true);
  assert.deepEqual(chunks.map((chunk) => chunk.index), chunks.map((_chunk, index) => index + 1));
  assert.equal(chunks.every((chunk) => chunk.total === chunks.length), true);
  assert.equal(chunks[0]!.text.startsWith("A"), true);
  assert.equal(chunks.at(-1)!.text.endsWith("C"), true);
  assert.equal(chunks.slice(1).every((chunk, index) => {
    const previous = chunks[index]!.text;
    return previous.slice(-200) === chunk.text.slice(0, 200);
  }), true);
});

test("document analysis chunking rejects unsafe limits instead of silently misconfiguring a provider request", () => {
  assert.throws(() => chunkDocumentForAnalysis("x".repeat(5_000), { chunkSize: 3_999 }));
  assert.throws(() => chunkDocumentForAnalysis("x".repeat(5_000), { chunkSize: 5_000, overlap: 5_000 }));
});
