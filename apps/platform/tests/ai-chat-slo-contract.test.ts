import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function source(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("SSE emits only a source-bound preliminary before waiting for optional memory context", async () => {
  const route = await source("../app/api/platform/ai/route.ts");
  const retrieval = route.indexOf("const retrieval = await verifiedRetrieval;");
  const preliminary = route.indexOf("preliminary: preliminaryForVerifiedRetrieval");
  const memory = route.indexOf("const { memoryEncryption, memories } = await memoryContext;");

  assert.ok(retrieval >= 0);
  assert.ok(preliminary > retrieval);
  assert.ok(memory > preliminary);
  assert.match(route, /AI_INTERACTIVE_FINALIZATION_RESERVE_MS/);
  assert.match(route, /budget\.remainingMs < AI_INTERACTIVE_FINALIZATION_RESERVE_MS/);
});

test("the browser never presents an unvalidated provider delta as a legal answer", async () => {
  const client = await source("../app/_platform/AiLawyerClient.tsx");
  const deltaStart = client.indexOf('else if (progress.stage === "provider_delta")');
  const preliminaryStart = client.indexOf('else if (progress.stage === "preliminary" && progress.preliminary)');

  assert.ok(deltaStart >= 0);
  assert.ok(preliminaryStart > deltaStart);
  const deltaBlock = client.slice(deltaStart, preliminaryStart);
  assert.match(deltaBlock, /setStreamStatus/);
  assert.doesNotMatch(deltaBlock, /setPreliminary|setAnswer/);
  assert.match(client, /<strong>\{preliminary\.message\}<\/strong>/);
});

test("providers do not publish a started state when the common deadline is already exhausted", async () => {
  const [openAi, anthropic] = await Promise.all([
    source("../lib/ai/provider.ts"),
    source("../lib/ai/anthropic-provider.ts"),
  ]);

  const openAiAllocated = openAi.indexOf("const providerBudgetMs = legalChatProviderTimeoutMs");
  const openAiBeforeCall = openAi.indexOf('await options.beforeProviderCall?.({ provider: "openai", model });');
  assert.ok(openAiAllocated >= 0);
  assert.ok(openAiBeforeCall > openAiAllocated);

  const anthropicAllocated = anthropic.indexOf("const providerBudgetMs = legalChatProviderTimeoutMs");
  const anthropicBeforeCall = anthropic.indexOf('await options.beforeProviderCall?.({ provider: "anthropic", model });');
  const anthropicStarted = anthropic.indexOf('await options.onProgress?.({ stage: "provider_started", provider: "anthropic", model });');
  assert.ok(anthropicAllocated >= 0);
  assert.ok(anthropicBeforeCall > anthropicAllocated);
  assert.ok(anthropicStarted > anthropicBeforeCall);
});

test("registered and guest paths release late runs instead of persisting a chargeable result", async () => {
  const [registered, guest] = await Promise.all([
    source("../app/api/platform/ai/route.ts"),
    source("../app/api/guest/ai/route.ts"),
  ]);
  assert.match(registered, /errorCode: "PROVIDER_TIMEOUT"/);
  assert.match(registered, /await failAiRun/);
  assert.match(guest, /budget\.remainingMs < AI_INTERACTIVE_FINALIZATION_RESERVE_MS/);
  assert.match(guest, /await failGuestAiRun\(\{ db, run: reservation\.run, errorCode: "PROVIDER_TIMEOUT" \}\)/);
});
