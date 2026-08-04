import assert from "node:assert/strict";
import test from "node:test";
import { verifyPublicCitation } from "../evaluation/legal-citation-live-check";
import {
  LEGAL_EVALUATION_ACCOUNT_TYPES,
  LEGAL_EVALUATION_AREAS,
  legalEvaluationCorpus,
  MIN_CRITICAL_DEADLINE_DETECTION_RATE,
  MIN_REVIEWED_LANGUAGE_QUALITY,
  type LegalEvaluationResult,
  validateLegalEvaluationResults,
} from "../evaluation/legal-evaluation-corpus";

const unitCitationUrl = "https://lex.uz/docs/unit-evaluation-fixture";
const unitLiveEvidence = new Map([[unitCitationUrl, true]]);

function reviewedResult(scenario: (typeof legalEvaluationCorpus)[number]): LegalEvaluationResult {
  return {
    scenarioId: scenario.id,
    answerLanguage: scenario.locale,
    jurisdiction: "UZ",
    confirmedFindingCount: 1,
    citations: [{
      sourceId: "unit-source",
      sourceType: "lex",
      url: unitCitationUrl,
      exists: true,
      httpStatus: 200,
      checkedAt: "2026-08-04T00:00:00.000Z",
      sourceHash: "a".repeat(64),
      verificationMethod: "http",
    }],
    observedBehaviors: [...scenario.expectedBehaviors],
    criticalDeadlineDetected: scenario.tags.includes("critical_deadline"),
    reviewedLanguageQuality: MIN_REVIEWED_LANGUAGE_QUALITY,
    humanReviewerId: "unit_reviewer_fixture",
  };
}

test("legal evaluation corpus covers unique bilingual, account-type, and behavior scenarios", () => {
  assert.equal(legalEvaluationCorpus.length, 314);
  assert.equal(new Set(legalEvaluationCorpus.map(({ id }) => id)).size, legalEvaluationCorpus.length);
  assert.equal(new Set(legalEvaluationCorpus.map(({ prompt }) => prompt)).size, legalEvaluationCorpus.length);
  for (const locale of ["ru", "uz"] as const) {
    const entries = legalEvaluationCorpus.filter((scenario) => scenario.locale === locale);
    assert.ok(entries.length >= 125);
    assert.equal(entries.filter((scenario) => scenario.tags.includes("ambiguous")).length, 25);
    for (const accountType of LEGAL_EVALUATION_ACCOUNT_TYPES) {
      assert.ok(entries.some((scenario) => scenario.accountType === accountType), `${locale}:${accountType}`);
    }
    for (const area of LEGAL_EVALUATION_AREAS) {
      assert.ok(entries.some((scenario) => scenario.area === area));
    }
    for (const tag of ["historical", "deadline", "critical_deadline", "urgent", "advice_missing", "advice_lex_conflict", "unofficial_source"]) {
      assert.ok(entries.some((scenario) => scenario.tags.includes(tag)), `${locale}:${tag}`);
    }
  }
});

test("evaluation validator refuses fabricated allowlisted URLs, incomplete results, and missing review", () => {
  const one = legalEvaluationCorpus[0]!;
  const result = validateLegalEvaluationResults([{
    ...reviewedResult(one),
    citations: [{
      sourceId: "fabricated",
      sourceType: "lex",
      url: "https://lex.uz/docs/fabricated-but-allowlisted",
      exists: true,
      httpStatus: 200,
      checkedAt: "2026-08-04T00:00:00.000Z",
      sourceHash: "b".repeat(64),
      verificationMethod: "http",
    }],
    humanReviewerId: undefined,
  }]);
  assert.equal(result.passed, false);
  assert.ok(result.failures.includes("RESULT_COUNT_MISMATCH"));
  assert.ok(result.failures.includes(`CITATION_SOURCE_EVIDENCE_INVALID:${one.id}:fabricated`));
  assert.ok(result.failures.includes(`CITATION_EXISTENCE_UNPROVEN:${one.id}:fabricated`));
  assert.ok(result.failures.includes(`HUMAN_REVIEW_MISSING:${one.id}`));
});

test("evaluation validator enforces live source type, language, expected behaviors, and deadline rates", () => {
  const reviewedResults = legalEvaluationCorpus.map(reviewedResult);
  const valid = validateLegalEvaluationResults(reviewedResults, legalEvaluationCorpus, unitLiveEvidence);
  assert.equal(valid.passed, true);
  assert.equal(valid.metrics.citationExistenceRate, 1);
  assert.equal(valid.metrics.sourceClassificationRate, 1);
  assert.equal(valid.metrics.expectedBehaviorPassRate, 1);
  assert.equal(MIN_CRITICAL_DEADLINE_DETECTION_RATE, 0.98);

  const wrongType = [...reviewedResults];
  wrongType[0] = {
    ...wrongType[0]!,
    citations: [{ ...wrongType[0]!.citations[0]!, sourceType: "advice" }],
  };
  assert.ok(validateLegalEvaluationResults(wrongType, legalEvaluationCorpus, unitLiveEvidence).failures.includes(
    `CITATION_SOURCE_EVIDENCE_INVALID:${wrongType[0]!.scenarioId}:unit-source`,
  ));

  const missingBehavior = [...reviewedResults];
  missingBehavior[0] = { ...missingBehavior[0]!, observedBehaviors: [] };
  assert.ok(validateLegalEvaluationResults(missingBehavior, legalEvaluationCorpus, unitLiveEvidence).failures.some(
    (failure) => failure.startsWith(`EXPECTED_BEHAVIOR_MISSING:${missingBehavior[0]!.scenarioId}:`),
  ));

  const missedCritical = reviewedResults.map((result) => ({ ...result, criticalDeadlineDetected: false }));
  assert.ok(validateLegalEvaluationResults(missedCritical, legalEvaluationCorpus, unitLiveEvidence).failures.includes(
    "CRITICAL_DEADLINE_DETECTION_BELOW_THRESHOLD",
  ));
});

test("live citation verifier is HTTPS allowlisted and refuses off-host redirects", async () => {
  const ok = await verifyPublicCitation(unitCitationUrl, async () => new Response("fixture", { status: 200 }));
  assert.equal(ok, true);

  const redirectedOffHost = await verifyPublicCitation(unitCitationUrl, async () => new Response(null, {
    status: 302,
    headers: { Location: "http://127.0.0.1/internal" },
  }));
  assert.equal(redirectedOffHost, false);

  const untrustedHost = await verifyPublicCitation("https://example.com/fake", async () => new Response("fixture"));
  assert.equal(untrustedHost, false);
});
