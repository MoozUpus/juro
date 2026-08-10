import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("AI chat keeps the user question visible and only presents a terminal validated result", async () => {
  const [client, route] = await Promise.all([
    source("app/_platform/AiLawyerClient.tsx"),
    source("app/api/platform/ai/route.ts"),
  ]);
  assert.match(client, /setOptimisticMessage\(/);
  assert.match(client, /<UserMessageBubble/);
  assert.match(client, /<PendingAssistantBubble/);
  assert.match(client, /<PostAnswerClarification/);
  assert.match(client, /Ответа достаточно/);
  assert.match(client, /Показать полностью/);
  assert.match(client, /aria-busy="true"/);
  assert.match(client, /router\.replace\(aiLocation\(nextParams\), \{ scroll: false \}\)/);
  assert.doesNotMatch(client, /window\.location\.assign/);
  assert.match(route, /emit\(result\.ok \? "complete" : "error"/);
  assert.match(route, /parseLegalChatResponse\(aiResult\.data\)/);
  assert.match(route, /enforceLegalChatSourceBoundary/);
  assert.match(route, /answerFirstResult/);
  assert.match(route, /sourceKinds: \["lex"\]/);
  assert.match(route, /findReviewedAdviceScenarioContext/);
  assert.match(route, /await onProgress\?\.\(\{ stage: "persisting" \}\)/);
});

test("AI chat makes one post-answer clarification optional and preserves a branch-safe history", async () => {
  const [client, route, reader, disposition] = await Promise.all([
    source("app/_platform/AiLawyerClient.tsx"),
    source("app/api/platform/ai/route.ts"),
    source("lib/ai/conversation-branch-reader.ts"),
    source("app/api/platform/ai/clarification/route.ts"),
  ]);
  assert.match(client, /answer\.result\.clarificationQuestions\[0\]/);
  assert.match(client, /answers: \[item\]/);
  assert.match(client, /type=\{kind\}/);
  assert.match(client, /role="alert"/);
  assert.match(client, /clarificationSourceMessageId/);
  assert.match(route, /parseClarificationAnswers/);
  assert.match(route, /formatClarificationAnswers/);
  assert.match(route, /remainingClarifications/);
  assert.match(route, /clarificationAnswers: clarificationAnswers \?\? undefined/);
  assert.match(route, /chargeable: result\.responseKind === "answer" && !clarificationAnswers/);
  assert.match(reader, /listAiConversationBranchMessages/);
  assert.match(reader, /parentBranchId/);
  assert.match(reader, /ai_post_answer_clarification_dismissed/);
  assert.match(disposition, /ai_post_answer_clarification_dismissed/);
});

test("dialog motion and accessibility stay bounded and reduced-motion safe", async () => {
  const css = await source("app/_platform/ai-lawyer-phase4.css");
  assert.match(css, /translateY\(4px\)/);
  assert.match(css, /translateY\(6px\)/);
  assert.match(css, /180ms cubic-bezier\(\.23, 1, \.32, 1\)/);
  assert.match(css, /160ms cubic-bezier\(\.23, 1, \.32, 1\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /transition:\s*all/);
});
