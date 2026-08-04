import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  DOCUMENT_EVALUATION_FORMATS,
  documentEvaluationCorpus,
  MIN_CLEAN_SCAN_OCR_ACCURACY,
  MIN_CRITICAL_RISK_DETECTION_RATE,
  MIN_DATES_SUMS_EXTRACTION_RATE,
  MIN_DOCUMENT_TYPE_ACCURACY,
  MIN_USER_SIDE_DETECTION_RATE,
  type DocumentEvaluationResult,
  validateDocumentEvaluationResults,
} from "../evaluation/document-evaluation-corpus";

function reviewedResult(item: (typeof documentEvaluationCorpus)[number]): DocumentEvaluationResult {
  return {
    packageId: item.id,
    artifactSha256: createHash("sha256").update(`unit-artifact:${item.id}`).digest("hex"),
    artifactBytes: 1024,
    actualFormat: item.format,
    actualDocumentType: item.expectedDocumentType,
    criticalRisksDetected: item.expectedCriticalRiskCount,
    datesAndSumsVerified: item.tags.includes("dates_sums") || undefined,
    ocrCharacterAccuracy: item.format === "scanned_pdf" && !item.tags.includes("low_quality") ? 0.99 : undefined,
    userSideDetected: item.tags.includes("selected_side") || undefined,
    userSideConfirmed: item.tags.includes("selected_side") || undefined,
    comparisonPeerId: item.expectedComparisonPeerId,
    comparisonReviewed: item.expectedComparisonPeerId ? true : undefined,
    promptInjectionResisted: item.tags.includes("prompt_injection") || undefined,
    humanReviewerId: "unit_reviewer_fixture",
  };
}

test("document evaluation manifest covers 100 packages, real evidence requirements, and 30 comparison pairs", () => {
  assert.equal(documentEvaluationCorpus.length, 100);
  assert.equal(new Set(documentEvaluationCorpus.map(({ id }) => id)).size, 100);
  for (const format of DOCUMENT_EVALUATION_FORMATS) {
    assert.ok(documentEvaluationCorpus.some((item) => item.format === format));
  }
  for (const tag of ["table", "bilingual", "low_quality", "annexes", "prompt_injection", "renumbered_clauses", "hidden_risk", "dates_sums", "selected_side"]) {
    assert.ok(documentEvaluationCorpus.some((item) => item.tags.includes(tag)), tag);
  }
  assert.equal(documentEvaluationCorpus.filter((item) => item.tags.includes("comparison")).length, 60);
  assert.equal(new Set(documentEvaluationCorpus
    .filter((item) => item.tags.includes("comparison"))
    .map((item) => [item.id, item.expectedComparisonPeerId].sort().join(":"))).size, 30);
});

test("document evaluation validator passes only a complete reviewed evidence set", () => {
  const results = documentEvaluationCorpus.map(reviewedResult);
  const verdict = validateDocumentEvaluationResults(results);
  assert.equal(verdict.passed, true);
  assert.equal(verdict.metrics.artifactEvidenceRate, 1);
  assert.equal(verdict.metrics.documentTypeAccuracy, 1);
  assert.equal(verdict.metrics.criticalRiskDetectionRate, 1);
  assert.equal(verdict.metrics.reviewedComparisonPairCount, 30);
  assert.equal(MIN_DOCUMENT_TYPE_ACCURACY, 0.95);
  assert.equal(MIN_CRITICAL_RISK_DETECTION_RATE, 0.95);
  assert.equal(MIN_USER_SIDE_DETECTION_RATE, 0.9);
  assert.equal(MIN_DATES_SUMS_EXTRACTION_RATE, 0.98);
  assert.equal(MIN_CLEAN_SCAN_OCR_ACCURACY, 0.95);
});

test("document evaluation validator refuses manifest-only, unreviewed, and unsafe evidence", () => {
  const scanned = documentEvaluationCorpus.find((item) => item.format === "scanned_pdf" && !item.tags.includes("low_quality"))!;
  const result = reviewedResult(scanned);
  const verdict = validateDocumentEvaluationResults([{
    ...result,
    artifactSha256: "not-a-hash",
    artifactBytes: 0,
    ocrCharacterAccuracy: 1.1,
    humanReviewerId: undefined,
  }]);
  assert.equal(verdict.passed, false);
  assert.ok(verdict.failures.includes("RESULT_COUNT_MISMATCH"));
  assert.ok(verdict.failures.includes(`ARTIFACT_EVIDENCE_MISSING:${scanned.id}`));
  assert.ok(verdict.failures.includes(`OCR_ACCURACY_MISSING:${scanned.id}`));
  assert.ok(verdict.failures.includes(`HUMAN_REVIEW_MISSING:${scanned.id}`));
});

test("document evaluation validator enforces aggregate quality thresholds", () => {
  const valid = documentEvaluationCorpus.map(reviewedResult);

  const wrongTypes = valid.map((result) => ({ ...result, actualDocumentType: "application" as const }));
  assert.ok(validateDocumentEvaluationResults(wrongTypes).failures.includes("DOCUMENT_TYPE_ACCURACY_BELOW_THRESHOLD"));

  const missedRisks = valid.map((result) => ({ ...result, criticalRisksDetected: 0 }));
  assert.ok(validateDocumentEvaluationResults(missedRisks).failures.includes("CRITICAL_RISK_DETECTION_BELOW_THRESHOLD"));

  const unconfirmedSides = valid.map((result) => ({ ...result, userSideConfirmed: false }));
  assert.ok(validateDocumentEvaluationResults(unconfirmedSides).failures.includes("USER_SIDE_DETECTION_BELOW_THRESHOLD"));

  const failedInjection = valid.map((result) => ({ ...result, promptInjectionResisted: false }));
  assert.ok(validateDocumentEvaluationResults(failedInjection).failures.includes("PROMPT_INJECTION_RESISTANCE_BELOW_THRESHOLD"));
});
