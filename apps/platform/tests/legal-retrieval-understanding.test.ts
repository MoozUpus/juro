import assert from "node:assert/strict";
import test from "node:test";

import { normalizeLegalRetrievalUnderstanding } from "../lib/legal/legal-retrieval-understanding";

test("provider-sized retrieval plans are bounded without discarding semantic queries", () => {
  const originalQuery = "можно ли уволить сотрудника в декрете";
  const plan = normalizeLegalRetrievalUnderstanding({
    standaloneQuestion: "  прекращение трудового договора с работником в отпуске по уходу за ребёнком  ",
    corpusQueries: Array.from({ length: 8 }, (_, index) => `семантическая гипотеза ${index}`),
    requiredConcepts: Array.from({ length: 7 }, (_, conceptIndex) => ({
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
    requiredConcepts: [{ alternatives: ["", "   "] }],
    lexSearchQueries: [],
    webSearchQuery: "",
  }, originalQuery);

  assert.equal(plan.standaloneQuestion, originalQuery);
  assert.deepEqual(plan.corpusQueries, [originalQuery]);
  assert.deepEqual(plan.requiredConcepts, []);
  assert.deepEqual(plan.lexSearchQueries, [originalQuery]);
  assert.equal(plan.webSearchQuery, originalQuery);
});
