import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeLegalRetrievalUnderstanding,
  projectLegalRetrievalConcepts,
  RETRIEVAL_PLANNER_RESPONSE_LIMITS,
  targetQuestionPlanningHints,
} from "../lib/legal/legal-retrieval-understanding";

test("retrieval planner starts structured output directly with a bounded response budget", () => {
  assert.deepEqual(RETRIEVAL_PLANNER_RESPONSE_LIMITS, {
    maxOutputTokens: 640,
    reasoningEffort: "none",
  });
});

test("semantic atoms project to six complementary statutory retrieval concepts", () => {
  const concepts = projectLegalRetrievalConcepts({
    formalRequestedActionVariants: [
      "formal action by responsible actor",
      "alternative legal action by responsible actor",
    ],
    independentActionKeyword: "action",
    relationshipOrInstrumentActionKeyword: "relationship-level legal action by responsible actor",
    primaryPersonStatus: "primary protected person",
    alternativePersonStatus: "alternative protected person",
    protectedStatusKeywords: ["primary status", "alternative status"],
  }, "en");

  assert.deepEqual(concepts, [
    "Prohibition of formal action by responsible actor",
    "Prohibition of alternative legal action by responsible actor",
    "Guarantees for primary protected person",
    "Guarantees for alternative protected person; relationship-level legal action by responsible actor",
    "relationship-level legal action by responsible actor",
    "Criminal and administrative liability; action; primary protected person; alternative protected person; primary status; alternative status",
  ]);
});

test("alternative status retrieval keeps the second concrete person category action-scoped", () => {
  const concepts = projectLegalRetrievalConcepts({
    formalRequestedActionVariants: ["direct action", "relationship termination"],
    independentActionKeyword: "action",
    relationshipOrInstrumentActionKeyword: "termination at the initiative of an actor",
    primaryPersonStatus: "people in the first concrete status",
    alternativePersonStatus: "people in the second concrete status with a material qualifier",
    protectedStatusKeywords: ["first condition", "second qualified condition"],
  }, "en");

  assert.equal(
    concepts[3],
    "Guarantees for people in the second concrete status with a material qualifier; termination at the initiative of an actor",
  );
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

  assert.equal(plan.corpusQueries[0], "семантическая гипотеза 0");
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

test("one semantic plan supplies bounded core and supporting hints to indexed retrieval", () => {
  const understanding = normalizeLegalRetrievalUnderstanding({
    standaloneQuestion: "Можно ли прекратить трудовой договор во время отпуска?",
    corpusQueries: ["прекращение трудового договора"],
    requiredConcepts: [
      { statement: "статус отпуска", alternatives: ["статус отпуска"] },
      { statement: "статус беременности", alternatives: ["статус беременности"] },
      { statement: "гарантии работника", alternatives: ["гарантии работника"] },
      { statement: "сохранение права", alternatives: ["сохранение права"] },
      { statement: "основания и исключения прекращения", alternatives: ["основания и исключения прекращения"] },
      { statement: "ответственность за незаконное прекращение", alternatives: ["ответственность за незаконное прекращение"] },
    ],
    lexSearchQueries: ["прекращение трудового договора"],
    webSearchQuery: "увольнение в отпуске",
  }, "Можно ли уволить работника в декрете?");

  const hints = targetQuestionPlanningHints(understanding, "ru");
  assert.deepEqual(hints.requirements.map(({ priority }) => priority), [
    "core", "core", "core", "core", "supporting", "supporting",
  ]);
  assert.equal(hints.formulations.length, 6);
  assert.equal(hints.standaloneQuestion, understanding.standaloneQuestion);
});
