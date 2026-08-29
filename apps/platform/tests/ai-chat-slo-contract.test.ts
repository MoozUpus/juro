import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function source(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("SSE keeps source verification content-free and reserves preliminary output for a grounded claim", async () => {
  const route = await source("../app/api/platform/ai/route.ts");
  const retrieval = route.indexOf("const sources = [...retrieval.sources, ...privateDocuments.sources, ...secondaryInternet.sources];");
  const sourceVerified = route.indexOf('await emitProgress({ stage: "source_verified" });');
  const memory = route.indexOf("const { memoryEncryption, memories } = await memoryContext;");
  const groundedPreliminary = route.indexOf("onGroundedPreliminary: async (preliminary)");

  assert.ok(retrieval >= 0);
  assert.ok(sourceVerified > retrieval);
  assert.ok(memory > sourceVerified);
  assert.ok(groundedPreliminary > memory);
  assert.match(route, /enforceOverallTimeout:\s*false/);
  assert.match(route, /retrieveCorpusAwareLegalSources/);
  assert.match(route, /retrieveTrustedUserDocumentSources/);
  assert.match(route, /retrieveSecondaryInternetSources/);
  assert.ok(route.indexOf('stage: "document_search_started"') < route.indexOf('stage: "lex_search_started"'));
  assert.ok(route.indexOf('stage: "lex_search_started"') < route.indexOf('stage: "internet_search_started"'));
  assert.match(route, /retrieval\.sourceValidationStatus !== "validated"/);
  assert.match(route, /freshness\.status !== "fresh"/);
  assert.match(route, /let preliminaryAtMs: number \| null = null/);
  assert.doesNotMatch(route, /kind: "research_progress"/);
  assert.doesNotMatch(route, /kind: "lex_excerpt"|firstExcerpt/u);
  assert.doesNotMatch(route, /retrieveInteractiveVerifiedLegalSources/);
  assert.doesNotMatch(route, /budget\.remainingMs < AI_INTERACTIVE_FINALIZATION_RESERVE_MS/);
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

test("registered and guest paths rely on bounded operation/provider timeouts, not a route-wide deadline", async () => {
  const [registered, guest] = await Promise.all([
    source("../app/api/platform/ai/route.ts"),
    source("../app/api/guest/ai/route.ts"),
  ]);
  assert.match(registered, /enforceOverallTimeout:\s*false/);
  assert.match(guest, /enforceOverallTimeout:\s*false/);
  assert.doesNotMatch(registered, /budget\.remainingMs < AI_INTERACTIVE_FINALIZATION_RESERVE_MS/);
  assert.doesNotMatch(guest, /budget\.remainingMs < AI_INTERACTIVE_FINALIZATION_RESERVE_MS/);
  assert.match(registered, /if \(budget\.signal\.aborted\)/);
  assert.match(guest, /if \(budget\.signal\.aborted\)/);
});

test("chat keeps bounded resource and provider safeguards after removing the route-wide cutoff", async () => {
  const [registered, guest, provider, anthropic, timeoutPolicy] = await Promise.all([
    source("../app/api/platform/ai/route.ts"),
    source("../app/api/guest/ai/route.ts"),
    source("../lib/ai/provider.ts"),
    source("../lib/ai/anthropic-provider.ts"),
    source("../lib/ai/legal-chat-timeout.ts"),
  ]);

  assert.match(registered, /submittedQuestion\.length > 8_000/);
  assert.match(guest, /\.max\(4_000\)/);
  assert.match(provider, /maxOutputTokens:/);
  assert.match(anthropic, /maxTokens:/);
  assert.match(timeoutPolicy, /FAST_LEGAL_CHAT_PROVIDER_TIMEOUT_MS = 25_500/);
  assert.match(timeoutPolicy, /DEEP_LEGAL_CHAT_PROVIDER_TIMEOUT_MS = 120_000/);
  assert.match(registered, /assertProviderCallAllowed/);
  assert.match(guest, /validateTurnstile/);
});
