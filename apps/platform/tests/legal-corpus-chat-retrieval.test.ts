import assert from "node:assert/strict";
import test from "node:test";

import {
  retrieveCorpusAwareLegalSources,
  shouldRetrieveSecondaryInternet,
} from "../lib/legal-corpus/chat-retrieval";
import type { LiveLexRetrievalResult } from "../lib/legal/live-lex-retrieval";
import { legalDatabaseFreshnessFromAsOf } from "../lib/legal/verified-retrieval";

const now = new Date("2026-08-15T00:00:00.000Z");
const checkedAt = "2026-08-14T23:00:00.000Z";
const contentHash = "a".repeat(64);

function liveResult(): LiveLexRetrievalResult {
  return {
    sources: [{
      id: "direct:lex:ru:777:aaaaaaaaaaaa",
      actTitle: "Закон о live-проверке",
      actIdentifier: "777",
      officialUrl: "https://lex.uz/ru/docs/777",
      revisionDate: "2026-08-14",
      lastCheckedAt: checkedAt,
      locale: "ru",
      publishedAt: null,
      sourceType: "lex",
      status: "verified",
      verificationState: "direct_validated",
      verifiedAt: checkedAt,
      contentSha256: contentHash,
      article: "9",
      excerpt: "Правило из проверенного официального источника.",
      applicabilityStatus: "current",
      spans: [{
        id: "direct-span",
        article: "9",
        paragraph: null,
        text: "Правило из проверенного официального источника.",
        textSha256: contentHash,
        quality: "high",
      }],
      sourceQuality: {
        passed: true,
        title: true,
        sufficientText: true,
        clean: true,
        locale: true,
        canonicalUrl: true,
        structured: true,
      },
    }],
    freshness: legalDatabaseFreshnessFromAsOf(checkedAt, now),
    legalDatabaseAsOf: checkedAt,
    sourceAccessMode: "direct",
    sourcesRetrievedAt: checkedAt,
    sourceValidationStatus: "validated",
    errors: [],
    evidence: [{
      sourceId: "direct:lex:ru:777:aaaaaaaaaaaa",
      sourceKind: "lex",
      canonicalUrl: "https://lex.uz/ru/docs/777",
      contentSha256: contentHash,
      retrievedAt: checkedAt,
      validatedAt: checkedAt,
      validationStatus: "validated",
    }],
  };
}

test("chat retrieval uses the R2-native target service before live Lex", async () => {
  let calls = 0;
  let liveStarted = 0;
  const targetService = {
    async fetch(input: RequestInfo | URL, init?: RequestInit) {
      const request = new Request(input, init);
      assert.equal(new URL(request.url).pathname, "/internal/legal-corpus/target/retrieval/answer");
      assert.equal(request.headers.get("x-juro-service-binding"), "target-legal-answer-v1");
      assert.deepEqual(await request.clone().json(), {
        id: "question-1",
        question: "статья 9",
        contextualQuestion: "Какой срок предусмотрен статьёй 9?",
      });
      return Response.json({
        result: {
          kind: "legal_answer",
          sourceLadder: "indexed_official_corpus",
          mainPoint: "Трудовой договор регулируется законом.",
          whatTheLawSays: [{
            requirementId: "requirement-1",
            provisionConceptId: "concept-1",
            provisionRenditionId: "rendition-1",
            proposition: "Требуется письменная форма.",
            controllingQuotation: "Трудовой договор заключается в письменной форме.",
            officialCitations: [{
              label: "Трудовой кодекс — Article 9",
              url: "https://lex.uz/ru/docs/777",
            }],
            evidenceSha256: contentHash,
          }, {
            requirementId: "requirement-2",
            provisionConceptId: "concept-1",
            provisionRenditionId: "rendition-1",
            proposition: "Та же норма отвечает второму требованию.",
            controllingQuotation: "Трудовой договор заключается в письменной форме.",
            officialCitations: [{
              label: "Трудовой кодекс — Article 9",
              url: "https://lex.uz/ru/docs/777",
            }],
            evidenceSha256: contentHash,
          }],
          whatToDoNext: [],
          focusedQuestions: [],
          formulationsUsed: 2,
          repairQueriesUsed: 0,
          temporalEndpoint: { kind: "current" },
        },
      });
    },
  } as Fetcher;
  const result = await retrieveCorpusAwareLegalSources({
    query: "статья 9",
    locale: "ru",
    targetService,
    targetEnvironment: "staging",
    targetQuestionId: "question-1",
    contextualQuestion: "Какой срок предусмотрен статьёй 9?",
    liveSearch: async () => {
      calls += 1;
      return liveResult();
    },
    onLiveSearchStarted: () => {
      liveStarted += 1;
    },
  });

  assert.equal(calls, 0);
  assert.equal(liveStarted, 0);
  assert.equal(result.sourceAccessMode, "approved_package");
  assert.equal(result.sources[0]?.verificationState, "verified");
  assert.equal(result.coverageStatus, "good_coverage");
  assert.equal(result.retrievalTelemetry?.indexedHitCount, 1);
  assert.equal(result.retrievalTelemetry?.queriesRun, 2);
  assert.equal(result.retrievalTelemetry?.fusionOutcome, "indexed");
});

test("target comparison citations retain their endpoint applicability", async () => {
  const statement = (suffix: string) => ({
    requirementId: `requirement-${suffix}`,
    provisionConceptId: "concept-1",
    provisionRenditionId: `rendition-${suffix}`,
    proposition: `Rule ${suffix}`,
    controllingQuotation: `Controlling quotation ${suffix}`,
    officialCitations: [{
      label: `Трудовой кодекс — Article ${suffix}`,
      url: `https://lex.uz/ru/docs/${suffix}`,
    }],
    evidenceSha256: contentHash,
  });
  const answer = (suffix: string, temporalEndpoint: { kind: "current" } | { kind: "timestamp"; instant: string }) => ({
    kind: "legal_answer",
    sourceLadder: "indexed_official_corpus",
    mainPoint: `Answer ${suffix}`,
    whatTheLawSays: [statement(suffix)],
    whatToDoNext: [],
    focusedQuestions: [],
    formulationsUsed: 2,
    repairQueriesUsed: 0,
    temporalEndpoint,
  });
  const historicalInstant = "2020-01-01T00:00:00.000Z";
  const result = await retrieveCorpusAwareLegalSources({
    query: "compare",
    locale: "ru",
    targetService: {
      fetch: async () => Response.json({
        result: {
          kind: "comparison_answer",
          sourceLadder: "indexed_official_corpus",
          temporalScope: {
            kind: "comparison",
            left: { kind: "timestamp", instant: historicalInstant },
            right: { kind: "current" },
          },
          left: answer("1", { kind: "timestamp", instant: historicalInstant }),
          right: answer("2", { kind: "current" }),
          transitions: [{
            id: "transition-1",
            predecessorConceptId: "concept-1",
            successorConceptId: "concept-1",
            transition: "modified",
            evidenceUrl: "https://example.com/evidence.json",
            reviewState: "accepted",
          }],
          mainPoint: "The rule changed.",
          endpointFormulationSearches: 4,
        },
      }),
    } as unknown as Fetcher,
    targetEnvironment: "staging",
    targetQuestionId: "question-comparison",
    liveSearch: async () => assert.fail("comparison target coverage must not fall through"),
  });

  assert.deepEqual(result.sources.map((source) => source.applicabilityStatus), ["historical", "current"]);
  assert.equal(result.sources[0]?.effectiveDate, historicalInstant);
  assert.equal(result.sources[1]?.effectiveDate, null);
});

test("an over-cap comparison fails closed instead of publishing one endpoint", async () => {
  const endpointAnswer = (
    prefix: string,
    temporalEndpoint: { kind: "current" } | { kind: "timestamp"; instant: string },
  ) => ({
    kind: "legal_answer",
    sourceLadder: "indexed_official_corpus",
    mainPoint: `Answer ${prefix}`,
    whatTheLawSays: Array.from({ length: 12 }, (_, index) => ({
      requirementId: `requirement-${prefix}-${index}`,
      provisionConceptId: `concept-${prefix}-${index}`,
      provisionRenditionId: `rendition-${prefix}-${index}`,
      proposition: `Rule ${prefix}-${index}`,
      controllingQuotation: `Controlling quotation ${prefix}-${index}`,
      officialCitations: [{
        label: `Code — Article ${index + 1}`,
        url: `https://lex.uz/ru/docs/${prefix}${index}`,
      }],
      evidenceSha256: contentHash,
    })),
    whatToDoNext: [],
    focusedQuestions: [],
    formulationsUsed: 2,
    repairQueriesUsed: 0,
    temporalEndpoint,
  });
  const historicalInstant = "2020-01-01T00:00:00.000Z";
  let liveStarted = 0;
  const result = await retrieveCorpusAwareLegalSources({
    query: "compare",
    locale: "ru",
    targetService: {
      fetch: async () => Response.json({
        result: {
          kind: "comparison_answer",
          sourceLadder: "indexed_official_corpus",
          temporalScope: {
            kind: "comparison",
            left: { kind: "timestamp", instant: historicalInstant },
            right: { kind: "current" },
          },
          left: endpointAnswer("left", { kind: "timestamp", instant: historicalInstant }),
          right: endpointAnswer("right", { kind: "current" }),
          transitions: [{
            id: "transition-over-cap",
            predecessorConceptId: "concept-left-0",
            successorConceptId: "concept-right-0",
            transition: "modified",
            evidenceUrl: "https://example.com/comparison-evidence.json",
            reviewState: "accepted",
          }],
          mainPoint: "The rule changed.",
          endpointFormulationSearches: 4,
        },
      }),
    } as unknown as Fetcher,
    targetEnvironment: "staging",
    targetQuestionId: "question-over-cap-comparison",
    liveSearch: async () => {
      liveStarted += 1;
      return liveResult();
    },
  });

  assert.equal(liveStarted, 0);
  assert.equal(result.sources.length, 0);
  assert.equal(result.sourceValidationStatus, "unavailable");
  assert.deepEqual(result.errors, [{ code: "TARGET_EVIDENCE_CEILING_EXCEEDED" }]);
  assert.equal(result.retrievalTelemetry?.rerankingOutcome, "failed_closed");
});

test("target source unavailability continues to direct validated Lex", async () => {
  let liveStarted = 0;
  const result = await retrieveCorpusAwareLegalSources({
    query: "статья 9",
    locale: "ru",
    targetService: {
      fetch: async () => Response.json({
        result: {
          kind: "source_unavailability",
          sourceLadder: "indexed_official_corpus",
          nextTier: "live_official_search",
          safeErrorCode: "INDEXED_CANDIDATE_UNAVAILABLE",
        },
      }),
    } as unknown as Fetcher,
    targetEnvironment: "staging",
    targetQuestionId: "question-2",
    liveSearch: async () => liveResult(),
    onLiveSearchStarted: () => { liveStarted += 1; },
  });
  assert.equal(liveStarted, 1);
  assert.equal(result.sourceAccessMode, "direct");
  assert.equal(result.retrievalTelemetry?.fusionOutcome, "live");
});

test("a timed-out current target preserves budget for direct validated Lex", async () => {
  let liveStarted = 0;
  const result = await retrieveCorpusAwareLegalSources({
    query: "статья 9",
    locale: "ru",
    targetService: {
      fetch: async () => new Promise<Response>(() => {}),
    } as unknown as Fetcher,
    targetEnvironment: "staging",
    targetQuestionId: "question-timeout",
    targetBudgetMs: 5,
    liveSearch: async () => liveResult(),
    onLiveSearchStarted: () => { liveStarted += 1; },
  });

  assert.equal(liveStarted, 1);
  assert.equal(result.sourceAccessMode, "direct");
  assert.equal(result.retrievalTelemetry?.fusionOutcome, "live");
});

test("historical target unavailability never substitutes a current live page", async () => {
  let liveStarted = 0;
  const applicableAt = "2020-01-01T00:00:00.000Z";
  const result = await retrieveCorpusAwareLegalSources({
    query: "статья 9",
    locale: "ru",
    applicableAt,
    targetService: {
      fetch: async () => Response.json({
        result: {
          kind: "source_unavailability",
          sourceLadder: "indexed_official_corpus",
          nextTier: "live_official_search",
          safeErrorCode: "INDEXED_CANDIDATE_UNAVAILABLE",
        },
      }),
    } as unknown as Fetcher,
    targetEnvironment: "staging",
    targetQuestionId: "question-historical",
    liveSearch: async () => {
      liveStarted += 1;
      return liveResult();
    },
  });

  assert.equal(liveStarted, 0);
  assert.equal(result.sources.length, 0);
  assert.equal(result.legalDatabaseAsOf, applicableAt);
  assert.equal(result.sourceValidationStatus, "unavailable");
  assert.deepEqual(result.errors, [{ code: "HISTORICAL_INDEXED_COVERAGE_UNAVAILABLE" }]);
  assert.equal(result.retrievalTelemetry?.rerankingOutcome, "failed_closed");
});

test("an article mismatch keeps direct official coverage below the answer threshold", async () => {
  const result = await retrieveCorpusAwareLegalSources({
    query: "статья 10",
    locale: "ru",
    liveSearch: async () => liveResult(),
  });
  assert.equal(result.coverageStatus, "partial_coverage");
});

test("secondary internet remains eligible only for weak or empty official coverage", () => {
  const packet = (coverageStatus: "good_coverage" | "partial_coverage" | "weak_coverage" | "no_coverage") => ({
    coverageStatus,
  });
  assert.equal(shouldRetrieveSecondaryInternet(packet("good_coverage")), false);
  assert.equal(shouldRetrieveSecondaryInternet(packet("partial_coverage")), false);
  assert.equal(shouldRetrieveSecondaryInternet(packet("weak_coverage")), true);
  assert.equal(shouldRetrieveSecondaryInternet(packet("no_coverage")), true);
});

test("caller cancellation stops before direct retrieval starts", async () => {
  const controller = new AbortController();
  controller.abort(new DOMException("caller cancelled", "AbortError"));
  let calls = 0;
  await assert.rejects(retrieveCorpusAwareLegalSources({
    query: "статья 9",
    locale: "ru",
    signal: controller.signal,
    liveSearch: async () => {
      calls += 1;
      return liveResult();
    },
  }), (error: unknown) => error instanceof Error && error.name === "AbortError");
  assert.equal(calls, 0);
});
