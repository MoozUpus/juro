import assert from "node:assert/strict";
import test from "node:test";
import {
  LEGAL_EVALUATION_AREAS,
  legalEvaluationCorpus,
  MIN_CRITICAL_DEADLINE_DETECTION_RATE,
  MIN_REVIEWED_LANGUAGE_QUALITY,
  type LegalEvaluationResult,
  validateLegalEvaluationResults,
} from "../evaluation/legal-evaluation-corpus";

test("legal evaluation corpus covers the required bilingual release matrix", () => {
  assert.equal(legalEvaluationCorpus.length, 314);
  for (const locale of ["ru", "uz"] as const) {
    const entries = legalEvaluationCorpus.filter((scenario) => scenario.locale === locale);
    assert.ok(entries.length >= 125);
    assert.equal(entries.filter((scenario) => scenario.tags.includes("ambiguous")).length, 25);
    for (const area of LEGAL_EVALUATION_AREAS) {
      assert.ok(entries.some((scenario) => scenario.area === area));
    }
    for (const tag of ["historical", "deadline", "critical_deadline", "urgent", "advice_missing", "advice_lex_conflict", "unofficial_source"]) {
      assert.ok(entries.some((scenario) => scenario.tags.includes(tag)), `${locale}:${tag}`);
    }
  }
});

test("evaluation validator refuses incomplete, fabricated, and unreviewed result sets", () => {
  const one = legalEvaluationCorpus[0]!;
  const result = validateLegalEvaluationResults([{
    scenarioId: one.id,
    citedUrls: ["https://example.com/untrusted"],
    citedSourceTypes: ["lex"],
  }]);
  assert.equal(result.passed, false);
  assert.ok(result.failures.includes("RESULT_COUNT_MISMATCH"));
  assert.ok(result.failures.includes(`UNVERIFIED_CITATION:${one.id}`));
  assert.ok(result.failures.includes(`HUMAN_REVIEW_MISSING:${one.id}`));
  assert.ok(result.failures.includes(`LANGUAGE_QUALITY_BELOW_THRESHOLD:${one.id}`));
});

test("evaluation validator enforces host/type, language, and urgent-deadline release gates", () => {
  const reviewedResults: LegalEvaluationResult[] = legalEvaluationCorpus.map((scenario) => ({
    scenarioId: scenario.id,
    citedUrls: ["https://lex.uz/docs/verified-fixture"],
    citedSourceTypes: ["lex"] as const,
    criticalDeadlineDetected: scenario.tags.includes("critical_deadline"),
    reviewedLanguageQuality: MIN_REVIEWED_LANGUAGE_QUALITY,
    humanReviewerId: "reviewer_fixture",
  }));
  assert.equal(validateLegalEvaluationResults(reviewedResults).passed, true);
  assert.equal(MIN_CRITICAL_DEADLINE_DETECTION_RATE, 0.98);

  const wrongType = [...reviewedResults];
  wrongType[0] = { ...wrongType[0]!, citedSourceTypes: ["advice"] };
  assert.ok(validateLegalEvaluationResults(wrongType).failures.includes(
    `CITATION_SOURCE_TYPE_INVALID:${wrongType[0]!.scenarioId}`,
  ));

  const missedCritical = reviewedResults.map((result) => ({ ...result, criticalDeadlineDetected: false }));
  assert.ok(validateLegalEvaluationResults(missedCritical).failures.includes(
    "CRITICAL_DEADLINE_DETECTION_BELOW_THRESHOLD",
  ));
});
