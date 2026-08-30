import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeLegalRetrievalUnderstanding,
  rerankLegalCorpusCandidates,
} from "../lib/legal/legal-retrieval-understanding";
import type { JuroLegalResearchCandidate } from "../lib/legal-corpus/legal-research-loop";

test("provider-sized retrieval plans are bounded without discarding semantic queries", () => {
  const originalQuery = "можно ли уволить сотрудника в декрете";
  const plan = normalizeLegalRetrievalUnderstanding({
    standaloneQuestion: "  прекращение трудового договора с работником в отпуске по уходу за ребёнком  ",
    corpusQueries: Array.from({ length: 8 }, (_, index) => `семантическая гипотеза ${index}`),
    requiredConcepts: Array.from({ length: 7 }, (_, conceptIndex) => ({
      statement: `требование ${conceptIndex}`,
      alternatives: Array.from({ length: 8 }, (_, alternativeIndex) =>
        `понятие ${conceptIndex} вариант ${alternativeIndex}`),
    })),
    lexSearchQueries: Array.from({ length: 7 }, (_, index) => `поиск ${index}`),
    webSearchQuery: "  увольнение во время отпуска по уходу за ребенком Узбекистан  ",
  }, originalQuery);

  assert.equal(plan.corpusQueries[0], "семантическая гипотеза 0");
  assert.equal(plan.corpusQueries.length, 3);
  assert.equal(plan.requiredConcepts.length, 5);
  assert.ok(plan.requiredConcepts.every((concept) => concept.alternatives.length === 5));
  assert.equal(plan.lexSearchQueries.length, 4);
  assert.match(plan.standaloneQuestion, /прекращение трудового договора/u);
});

test("empty optional planner values degrade to the original query, not an invalid-output failure", () => {
  const originalQuery = "можно ли уволить сотрудника в декрете";
  const plan = normalizeLegalRetrievalUnderstanding({
    standaloneQuestion: "   ",
    corpusQueries: [],
    requiredConcepts: [{ statement: "", alternatives: ["", "   "] }],
    lexSearchQueries: [],
    webSearchQuery: "",
  }, originalQuery);

  assert.equal(plan.standaloneQuestion, originalQuery);
  assert.deepEqual(plan.corpusQueries, [originalQuery]);
  assert.deepEqual(plan.requiredConcepts, []);
  assert.deepEqual(plan.lexSearchQueries, [originalQuery]);
  assert.equal(plan.webSearchQuery, originalQuery);
});

test("reranker never attributes a requirement from authority and graph structure alone", async () => {
  const candidates: JuroLegalResearchCandidate[] = Array.from({ length: 5 }, (_, index) => {
    const sequence = index + 1;
    const provisionId = `lexuz:unrelated:ru:v1:p${sequence}`;
    return {
      provisionId,
      chunkIds: [`${provisionId}:c0`],
      matchedQueries: ["налоговая льгота организации"],
      queryMatches: [{ query: "налоговая льгота организации", resultRank: sequence, denseRank: sequence }],
      passage: {
        chunkId: `${provisionId}:c0`,
        provisionId,
        documentId: "lexuz:unrelated",
        documentTitle: "Кодекс Республики Узбекистан",
        documentType: "code",
        documentNumber: null,
        adoptingAuthority: null,
        sourceClass: "OFFICIAL_LEGISLATION",
        articleNumber: String(sequence),
        articleTitle: "Общие положения",
        exactQuote: sequence === 3
          ? "Настоящее общее положение связано со статьями 1, 2, 4 и 5."
          : "Настоящее общее положение регулирует организационные вопросы.",
        sourceUrl: "https://lex.uz/ru/docs/100",
        language: "ru",
        status: "active",
        validFrom: "2026-01-01",
        validTo: null,
        versionDate: "2026-01-01",
        fetchedAt: "2026-08-30T00:00:00.000Z",
        contentHash: "a".repeat(64),
        denseRank: sequence,
      },
    };
  });

  const decision = await rerankLegalCorpusCandidates({
    question: "Можно ли уволить беременную работницу?",
    locale: "ru",
    requirements: [{
      id: "dismissal",
      statement: "гарантии увольнения беременной работницы",
      alternatives: ["прекращение трудового договора с беременной женщиной"],
    }],
    candidates,
    limit: 12,
    requestId: "rerank-structural-only",
    safetyIdentifier: "test-user",
  });

  assert.deepEqual(decision, { outcome: "rejected", selections: [], discoveredRequirements: [] });
});
