import assert from "node:assert/strict";
import test from "node:test";
import {
  DOCUMENT_EVALUATION_FORMATS,
  documentEvaluationCorpus,
  validateDocumentEvaluationResults,
} from "../evaluation/document-evaluation-corpus";

test("document evaluation manifest covers 100 packages and 30 comparison pairs", () => {
  assert.equal(documentEvaluationCorpus.length, 100);
  for (const format of DOCUMENT_EVALUATION_FORMATS) {
    assert.ok(documentEvaluationCorpus.some((item) => item.format === format));
  }
  for (const tag of ["table", "bilingual", "low_quality", "annexes", "prompt_injection", "renumbered_clauses", "hidden_risk", "dates_sums", "selected_side"]) {
    assert.ok(documentEvaluationCorpus.some((item) => item.tags.includes(tag)), tag);
  }
  assert.equal(documentEvaluationCorpus.filter((item) => item.tags.includes("comparison")).length, 60);
  assert.equal(new Set(documentEvaluationCorpus.filter((item) => item.tags.includes("comparison")).map((item) => [item.id, item.expectedComparisonPeerId].sort().join(":"))).size, 30);
});

test("document evaluation validator refuses missing reviewer, unsafe OCR evidence, and invalid comparison", () => {
  const scanned = documentEvaluationCorpus.find((item) => item.format === "scanned_pdf")!;
  const verdict = validateDocumentEvaluationResults([{
    packageId: scanned.id,
    actualFormat: scanned.format,
    criticalRisksDetected: 0,
    ocrQuality: 1.1,
    comparisonPeerId: "wrong",
  }]);
  assert.equal(verdict.passed, false);
  assert.ok(verdict.failures.includes("RESULT_COUNT_MISMATCH"));
  assert.ok(verdict.failures.includes(`HUMAN_REVIEW_MISSING:${scanned.id}`));
  assert.ok(verdict.failures.includes(`OCR_QUALITY_MISSING:${scanned.id}`));
});
