import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildConversationContext } from "../lib/ai/conversation-context";

function structuredResult(summary: string, clarificationQuestions: string[] = []) {
  return JSON.stringify({
    confirmedFindings: [],
    responseKind: clarificationQuestions.length ? "clarification_required" : "answer",
    summary,
    answer: summary,
    language: "ru",
    jurisdiction: "UZ",
    answerMode: "detailed",
    reasoningMode: "balanced",
    clarificationQuestions,
    assumptions: [],
    risks: [],
    sources: [],
    requiredDocuments: [],
    actionPlan: [],
    deadlines: [],
    successOutlook: null,
    urgency: "normal",
    suggestedDocument: null,
    suggestLawyer: false,
    legalDatabaseAsOf: "2026-08-29T00:00:00.000Z",
  });
}

test("short branch history stays exact and needs no compact summary", () => {
  const context = buildConversationContext([
    { question: "Первый вопрос", answer: "Первый ответ" },
    { question: "Второй вопрос", answer: "Второй ответ" },
  ]);

  assert.deepEqual(context.conversationHistory, [
    { user: "Первый вопрос", assistant: "Первый ответ" },
    { user: "Второй вопрос", assistant: "Второй ответ" },
  ]);
  assert.equal(context.conversationSummary, null);
  assert.equal(context.metrics.sourceTurns, 2);
  assert.equal(context.metrics.omittedTurns, 0);
  assert.equal(context.metrics.providerCharacterReductionBps, 0);
});

test("long branch history keeps three recent turns and redacts five compacted turns", () => {
  const turns = Array.from({ length: 12 }, (_, index) => ({
    question: `Правовой вопрос ${index + 1} PINFL 12345678901234`,
    answer: `Полный проверенный ответ ${index + 1}. ${"Детали ответа. ".repeat(90)}`,
    structuredJson: structuredResult(
      `Краткий проверенный итог ${index + 1}`,
      index === 8 ? ["Какова дата события?"] : [],
    ),
  }));
  const context = buildConversationContext(turns);

  assert.deepEqual(
    context.conversationHistory.map((turn) => turn.user.match(/вопрос (\d+)/u)?.[1]),
    ["10", "11", "12"],
  );
  assert.equal(context.conversationSummary?.includedTurns, 5);
  assert.equal(context.conversationSummary?.omittedTurns, 4);
  assert.deepEqual(
    context.conversationSummary?.turns.map((turn) => turn.user.match(/вопрос (\d+)/u)?.[1]),
    ["5", "6", "7", "8", "9"],
  );
  assert.ok(context.conversationSummary?.turns.every((turn) => !turn.user.includes("12345678901234")));
  assert.match(context.conversationSummary?.turns[0]?.user ?? "", /\[REDACTED\]/u);
  assert.equal(context.conversationSummary?.turns.at(-1)?.assistant, "Краткий проверенный итог 9");
  assert.deepEqual(context.conversationSummary?.turns.at(-1)?.openQuestions, ["Какова дата события?"]);
  assert.equal(context.metrics.sourceTurns, 12);
  assert.equal(context.metrics.recentTurns, 3);
  assert.equal(context.metrics.summarizedTurns, 5);
  assert.equal(context.metrics.omittedTurns, 4);
  assert.ok(context.metrics.providerCharacters < context.metrics.legacyProviderCharacters);
  assert.ok(context.metrics.providerCharacterReductionBps >= 3_000);
});

test("malformed older payload falls back to bounded redacted visible text", () => {
  const context = buildConversationContext([
    {
      question: "Напишите на user@example.com о договоре",
      answer: `Ответ для +998 90 123 45 67. ${"Очень длинный текст. ".repeat(40)}`,
      structuredJson: "{not-json",
    },
    { question: "Уточнение 2", answer: "Ответ 2" },
    { question: "Уточнение 3", answer: "Ответ 3" },
    { question: "Уточнение 4", answer: "Ответ 4" },
  ]);

  const compacted = context.conversationSummary?.turns[0];
  assert.ok(compacted);
  assert.doesNotMatch(compacted.user, /user@example\.com/u);
  assert.doesNotMatch(compacted.assistant, /998 90/u);
  assert.ok(compacted.assistant.length <= 360);
});

test("interactive route sends compact context to providers and records content-free metrics", async () => {
  const route = await readFile(new URL("../app/api/platform/ai/route.ts", import.meta.url), "utf8");
  const openAi = await readFile(new URL("../lib/ai/provider.ts", import.meta.url), "utf8");
  const anthropic = await readFile(new URL("../lib/ai/anthropic-provider.ts", import.meta.url), "utf8");

  assert.match(route, /buildConversationContext\(/u);
  assert.match(route, /conversationSummary,/u);
  assert.match(route, /conversationContext: conversationContext\.metrics/u);
  assert.match(openAi, /conversationSummary: input\.conversationSummary/u);
  assert.match(anthropic, /conversationSummary: input\.conversationSummary/u);
});
