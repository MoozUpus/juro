import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function source(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("SSE keeps source verification content-free and reserves preliminary output for a grounded claim", async () => {
  const route = await source("../app/api/platform/ai/route.ts");
  const retrieval = route.indexOf("const [retrieval, privateDocuments] = await Promise.all([liveLexRetrieval, privateDocumentRetrieval]);");
  const sourceVerified = route.indexOf('await emitProgress({ stage: "source_verified" });');
  const memory = route.indexOf("const { memoryEncryption, memories } = await memoryContext;");
  const groundedPreliminary = route.indexOf("onGroundedPreliminary: async (preliminary)");

  assert.ok(retrieval >= 0);
  assert.ok(sourceVerified > retrieval);
  assert.ok(memory > sourceVerified);
  assert.ok(groundedPreliminary > memory);
  assert.match(route, /AI_INTERACTIVE_FINALIZATION_RESERVE_MS/);
  assert.match(route, /retrieveCorpusAwareLegalSources/);
  assert.match(route, /retrieveTrustedUserDocumentSources/);
  assert.match(route, /retrieval\.sourceValidationStatus !== "validated"/);
  assert.match(route, /freshness\.status !== "fresh"/);
  assert.match(route, /let preliminaryAtMs: number \| null = null/);
  assert.doesNotMatch(route, /kind: "research_progress"/);
  assert.doesNotMatch(route, /kind: "lex_excerpt"|firstExcerpt/u);
  assert.doesNotMatch(route, /retrieveInteractiveVerifiedLegalSources/);
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
  assert.match(client, /safeOfficialUrl\(preliminary\.source\.canonicalUrl\)/);
  assert.match(client, /setPreliminary\(null\);[\s\S]*const cancelled = isUserCancelledAiRequest/);
});

test("providers do not publish a started state when the common deadline is already exhausted", async () => {
  const [openAi, anthropic] = await Promise.all([
    source("../lib/ai/provider.ts"),
    source("../lib/ai/anthropic-provider.ts"),
  ]);

  const openAiAllocated = openAi.indexOf("const providerBudgetMs = legalChatProviderTimeoutMs");
  const openAiBeforeCall = openAi.indexOf('onAttempt: ({ attempt }) => options.beforeProviderCall?.({ provider: "openai", model, attempt })');
  assert.ok(openAiAllocated >= 0);
  assert.ok(openAiBeforeCall > openAiAllocated);

  const anthropicAllocated = anthropic.indexOf("const providerBudgetMs = legalChatProviderTimeoutMs");
  const anthropicBeforeCall = anthropic.indexOf('await options.beforeProviderCall?.({ provider: "anthropic", model, attempt: 1 });');
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
