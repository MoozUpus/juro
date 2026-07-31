import assert from "node:assert/strict";
import test from "node:test";
import {
  LEGAL_EVALUATION_AREAS,
  legalEvaluationCorpus,
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
    for (const tag of ["historical", "deadline", "urgent", "advice_missing", "advice_lex_conflict", "unofficial_source"]) {
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
});
