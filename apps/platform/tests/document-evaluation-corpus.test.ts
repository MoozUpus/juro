import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  materializeDocumentEvaluationArtifacts,
  validateResultsAgainstArtifactManifest,
  verifyDocumentArtifactManifest,
} from "../evaluation/document-evaluation-artifacts";
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
    evidenceSchemaVersion: 1,
    packageId: item.id,
    artifactSha256: createHash("sha256").update(`unit-artifact:${item.id}`).digest("hex"),
    artifactBytes: 1024,
    runEnvironment: "staging",
    fileId: `file-${item.id}`,
    analysisId: `analysis-${item.id}`,
    scanStatus: "safe",
    scanProvider: "unit-scanner",
    analysisStatus: "completed",
    provider: "anthropic",
    providerModel: "claude-evaluation-model",
    providerResponseId: `provider-${item.id}`,
    completedAt: "2026-08-04T10:00:00.000Z",
    actualFormat: item.format,
    actualDocumentType: item.expectedDocumentType,
    criticalRisksDetected: item.expectedCriticalRiskCount,
    datesAndSumsVerified: item.tags.includes("dates_sums") || undefined,
    ocrCharacterAccuracy: item.format === "scanned_pdf" && !item.tags.includes("low_quality") ? 0.99 : undefined,
    userSideDetected: item.tags.includes("selected_side") || undefined,
    userSideConfirmed: item.tags.includes("selected_side") || undefined,
    comparisonPeerId: item.expectedComparisonPeerId,
    comparisonId: item.expectedComparisonPeerId
      ? `comparison-${[item.id, item.expectedComparisonPeerId].sort().join("-")}`
      : undefined,
    comparisonReviewed: item.expectedComparisonPeerId ? true : undefined,
    promptInjectionResisted: item.tags.includes("prompt_injection") || undefined,
    humanReviewerId: "unit_reviewer_fixture",
    humanReviewedAt: "2026-08-04T11:00:00.000Z",
    humanReviewDisposition: "pass",
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
  assert.equal(verdict.metrics.stagingExecutionEvidenceRate, 1);
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
    providerResponseId: "",
    humanReviewerId: undefined,
    humanReviewedAt: undefined,
    humanReviewDisposition: undefined,
  }]);
  assert.equal(verdict.passed, false);
  assert.ok(verdict.failures.includes("RESULT_COUNT_MISMATCH"));
  assert.ok(verdict.failures.includes(`ARTIFACT_EVIDENCE_MISSING:${scanned.id}`));
  assert.ok(verdict.failures.includes(`OCR_ACCURACY_MISSING:${scanned.id}`));
  assert.ok(verdict.failures.includes(`STAGING_EXECUTION_EVIDENCE_MISSING:${scanned.id}`));
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

test("document corpus materializer writes deterministic valid binaries for every supported format", async () => {
  const firstDirectory = await mkdtemp(join(tmpdir(), "juro-document-corpus-a-"));
  const secondDirectory = await mkdtemp(join(tmpdir(), "juro-document-corpus-b-"));
  const subset = DOCUMENT_EVALUATION_FORMATS.map((format) =>
    documentEvaluationCorpus.find((item) => item.format === format)!);
  try {
    const first = await materializeDocumentEvaluationArtifacts(firstDirectory, subset);
    const second = await materializeDocumentEvaluationArtifacts(secondDirectory, subset);
    assert.deepEqual(await verifyDocumentArtifactManifest(firstDirectory, first, subset), []);
    assert.deepEqual(await verifyDocumentArtifactManifest(secondDirectory, second, subset), []);
    const unsafeGroundTruth = { ...first, groundTruthRelativePath: "../outside.json" } as unknown as typeof first;
    assert.ok((await verifyDocumentArtifactManifest(firstDirectory, unsafeGroundTruth, subset)).includes("GROUND_TRUTH_PATH_INVALID"));
    assert.equal(first.artifacts.length, DOCUMENT_EVALUATION_FORMATS.length);
    assert.equal(new Set(first.artifacts.map(({ artifactSha256 }) => artifactSha256)).size, DOCUMENT_EVALUATION_FORMATS.length);
    const evidence = subset.map((item) => {
      const artifact = first.artifacts.find(({ packageId }) => packageId === item.id)!;
      return {
        ...reviewedResult(item),
        artifactSha256: artifact.artifactSha256,
        artifactBytes: artifact.artifactBytes,
      };
    });
    assert.deepEqual(validateResultsAgainstArtifactManifest(evidence, first, subset), []);
    assert.deepEqual(validateResultsAgainstArtifactManifest([
      { ...evidence[0]!, artifactBytes: evidence[0]!.artifactBytes + 1 },
      ...evidence.slice(1),
    ], first, subset), [`RESULT_ARTIFACT_EVIDENCE_MISMATCH:${evidence[0]!.packageId}`]);
    assert.deepEqual(
      first.artifacts.map(({ packageId, artifactSha256, artifactBytes }) => ({ packageId, artifactSha256, artifactBytes })),
      second.artifacts.map(({ packageId, artifactSha256, artifactBytes }) => ({ packageId, artifactSha256, artifactBytes })),
    );
    await writeFile(join(firstDirectory, first.artifacts[0]!.relativePath), "tampered");
    const tamperedFailures = await verifyDocumentArtifactManifest(firstDirectory, first, subset);
    assert.ok(tamperedFailures.includes(`ARTIFACT_INTEGRITY_MISMATCH:${first.artifacts[0]!.packageId}`));
    assert.ok(tamperedFailures.includes(`ARTIFACT_MAGIC_MISMATCH:${first.artifacts[0]!.packageId}`));
  } finally {
    await rm(firstDirectory, { recursive: true, force: true });
    await rm(secondDirectory, { recursive: true, force: true });
  }
});
