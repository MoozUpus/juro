import assert from "node:assert/strict";
import test from "node:test";
import { verifyPublicCitation } from "../evaluation/legal-citation-live-check";
import {
  LEGAL_EVALUATION_ACCOUNT_TYPES,
  LEGAL_EVALUATION_AREAS,
  legalEvaluationCorpus,
  legalEvaluationResultsSchema,
  MIN_CRITICAL_DEADLINE_DETECTION_RATE,
  MIN_REVIEWED_LANGUAGE_QUALITY,
  type LegalEvaluationResult,
  validateLegalEvaluationResults,
} from "../evaluation/legal-evaluation-corpus";

const unitCitationUrl = "https://lex.uz/ru/docs/-424242";
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
      url: "https://lex.uz/ru/docs/-999999999",
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

test("internal evaluation citations require separate staging evidence", () => {
  const scenario = legalEvaluationCorpus[0]!;
  const internalUrl = "internal://materials/reviewer-approved-001";
  const result: LegalEvaluationResult = {
    ...reviewedResult(scenario),
    citations: [{
      sourceId: "internal-source-001",
      sourceType: "internal",
      url: internalUrl,
      exists: true,
      httpStatus: null,
      checkedAt: "2026-08-04T00:00:00.000Z",
      sourceHash: "c".repeat(64),
      verificationMethod: "staging_db",
    }],
  };
  const unproven = validateLegalEvaluationResults([result], [scenario]);
  assert.equal(unproven.passed, false);
  assert.ok(unproven.failures.includes(
    `CITATION_SOURCE_EVIDENCE_INVALID:${scenario.id}:internal-source-001`,
  ));
  const proven = validateLegalEvaluationResults(
    [result],
    [scenario],
    new Map([[internalUrl, true]]),
  );
  assert.equal(proven.passed, true);
});

test("live citation verifier is HTTPS allowlisted and refuses off-host redirects", async () => {
  const ok = await verifyPublicCitation(unitCitationUrl, async (_url, init) => {
    assert.equal(init.redirect, "manual");
    assert.equal(init.credentials, "omit");
    assert.equal(init.cache, "no-store");
    return new Response("fixture", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  });
  assert.equal(ok, true);

  const redirectedOffHost = await verifyPublicCitation(unitCitationUrl, async () => new Response(null, {
    status: 302,
    headers: { Location: "http://127.0.0.1/internal" },
  }));
  assert.equal(redirectedOffHost, false);

  const untrustedHost = await verifyPublicCitation("https://example.com/fake", async () => new Response("fixture"));
  assert.equal(untrustedHost, false);

  for (const invalid of [
    "https://www.lex.uz/ru/docs/-424242",
    "https://lex.uz/ru/docs/-424242?print=1",
    "https://lex.uz/ru/docs/not-a-number",
    "https://advice.uz/uz/documents/21",
  ]) {
    assert.equal(await verifyPublicCitation(invalid, async () => {
      throw new Error("network must not be reached");
    }), false);
  }

  const changedDocument = await verifyPublicCitation(unitCitationUrl, async () => new Response(null, {
    status: 302,
    headers: { Location: "https://lex.uz/ru/docs/-424243" },
  }));
  assert.equal(changedDocument, false);

  let redirectCount = 0;
  const sameDocument = await verifyPublicCitation(unitCitationUrl, async () => {
    redirectCount += 1;
    return redirectCount === 1
      ? new Response(null, {
        status: 302,
        headers: { Location: "https://www.lex.uz/ru/docs/-424242/" },
      })
      : new Response("fixture", {
        status: 200,
        headers: { "content-type": "application/xhtml+xml" },
      });
  });
  assert.equal(sameDocument, true);

  assert.equal(await verifyPublicCitation(unitCitationUrl, async () => new Response("{}", {
    status: 200,
    headers: { "content-type": "application/json" },
  })), false);
});

test("legal evaluation input schema is bounded, strict, and fail-closed", () => {
  const valid = reviewedResult(legalEvaluationCorpus[0]!);
  assert.equal(legalEvaluationResultsSchema.safeParse([valid]).success, true);
  assert.equal(legalEvaluationResultsSchema.safeParse([{ ...valid, unexpected: "field" }]).success, false);
  assert.equal(legalEvaluationResultsSchema.safeParse([{
    ...valid,
    citations: [{ ...valid.citations[0]!, sourceHash: "not-a-hash" }],
  }]).success, false);
  assert.equal(legalEvaluationResultsSchema.safeParse([{
    ...valid,
    citations: Array.from({ length: 51 }, () => valid.citations[0]),
  }]).success, false);
  assert.equal(legalEvaluationResultsSchema.safeParse([{
    ...valid,
    observedBehaviors: ["invent_a_source"],
  }]).success, false);
});
