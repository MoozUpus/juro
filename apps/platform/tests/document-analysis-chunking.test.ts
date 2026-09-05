import assert from "node:assert/strict";
import test from "node:test";

import {
  QUICK_DOCUMENT_ANALYSIS_INPUT_SIZE,
  chunkDocumentForAnalysis,
  planDocumentAnalysis,
} from "../lib/document-analysis/chunking";

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

test("quick analysis uses one deterministic bounded representative request for a large document", () => {
  const text = ["A".repeat(40_000), "B".repeat(40_000), "C".repeat(40_000)].join("");
  const first = planDocumentAnalysis(text, "quick");
  const second = planDocumentAnalysis(text, "quick");

  assert.deepEqual(first, second);
  assert.equal(first.representativeSample, true);
  assert.equal(first.chunks.length, 1);
  assert.equal(first.chunks[0]!.text.length <= QUICK_DOCUMENT_ANALYSIS_INPUT_SIZE, true);
  assert.equal(first.chunks[0]!.text.includes("A"), true);
  assert.equal(first.chunks[0]!.text.includes("B"), true);
  assert.equal(first.chunks[0]!.text.includes("C"), true);
  assert.equal(first.chunks[0]!.text.includes("JURO_REPRESENTATIVE_SAMPLE_BOUNDARY"), true);
});

test("quick analysis keeps a short document complete while full mode retains ordinary chunking", () => {
  const short = "complete short contract";
  const quick = planDocumentAnalysis(short, "quick");
  assert.equal(quick.representativeSample, false);
  assert.equal(quick.chunks.length, 1);
  assert.equal(quick.chunks[0]!.text, short);

  const long = "x".repeat(QUICK_DOCUMENT_ANALYSIS_INPUT_SIZE + 1);
  const full = planDocumentAnalysis(long, "full");
  assert.equal(full.representativeSample, false);
  assert.equal(full.chunks[0]!.text, long);
});
