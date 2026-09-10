import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeLegalRetrievalUnderstanding,
  RETRIEVAL_PLANNER_RESPONSE_LIMITS,
  targetQuestionPlanningHints,
  fallbackLegalRetrievalUnderstanding,
} from "../lib/legal/legal-retrieval-understanding";

test("retrieval planner starts structured output directly with a bounded response budget", () => {
  assert.deepEqual(RETRIEVAL_PLANNER_RESPONSE_LIMITS, {
    maxOutputTokens: 1_024,
    reasoningEffort: "none",
  });
});

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

  assert.equal(plan.corpusQueries[0], plan.standaloneQuestion);
  assert.equal(plan.corpusQueries.length, 3);
  assert.equal(plan.requiredConcepts.length, 6);
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

test("deadline queries retain the question and only their supplied legal concepts", () => {
  const question = "Срок исковой давности по трудовым спорам";
  const concepts = ["срок обращения в комиссию по трудовым спорам", "срок обращения в суд по трудовым спорам"];
  const understanding = normalizeLegalRetrievalUnderstanding({
    standaloneQuestion: question,
    corpusQueries: concepts,
    requiredConcepts: concepts.map(statement => ({ statement, alternatives: [statement] })),
    lexSearchQueries: concepts,
    webSearchQuery: question,
  }, question);
  assert.deepEqual(understanding.corpusQueries, [question, ...concepts]);
  assert.deepEqual(understanding.lexSearchQueries, [question, ...concepts]);
  assert.deepEqual(understanding.requiredConcepts.map(item => item.statement), concepts);
  assert.doesNotMatch(JSON.stringify(understanding), /запрет|гарантии|уголовная/iu);
  const hints = targetQuestionPlanningHints(understanding, "ru")!;
  assert.equal(hints.formulations[0], question);
  assert.deepEqual(hints.requirements.map((item) => item.statement), concepts);
  assert.equal(targetQuestionPlanningHints(fallbackLegalRetrievalUnderstanding(question), "ru"), undefined);
});
