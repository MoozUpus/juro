import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/guest/ai/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/[locale]/guest/ai-lawyer/page.tsx", import.meta.url), "utf8");
const client = readFileSync(new URL("../app/_guest/GuestAiClient.tsx", import.meta.url), "utf8");

test("guest AI route is server-only, same-origin protected, provider-backed, and source bounded", () => {
  assert.match(route, /assertSafeWrite\(request\)/);
  assert.match(route, /validateTurnstile/);
  assert.match(route, /guestAiTurnstileAction/);
  assert.match(route, /retrieveCorpusAwareLegalSources/);
  assert.match(route, /understandLegalRetrievalQuery/);
  assert.match(route, /rerankLegalCorpusCandidates/);
  assert.match(route, /shouldRetrieveSecondaryInternet\(retrieval\)/);
  assert.match(route, /retrieveSecondaryInternetSources/);
  assert.match(route, /indexQueries: retrievalUnderstanding\.corpusQueries/);
  assert.match(route, /lexSearchQueries: retrievalUnderstanding\.lexSearchQueries/);
  const official = route.indexOf("retrieval = await retrieveCorpusAwareLegalSources");
  const secondaryGate = route.indexOf("shouldRetrieveSecondaryInternet(retrieval)");
  const secondary = route.indexOf("await retrieveSecondaryInternetSources", secondaryGate);
  assert.ok(official >= 0 && secondaryGate > official && secondary > secondaryGate);
  assert.match(route, /const authoritativeSources = retrieval\.sources;/);
  assert.match(route, /sources:\s*authoritativeSources,/);
  assert.match(route, /validateLegalGatewayAnswer\(\{/);
  assert.match(route, /sources:\s*allRetrievedSources,/);
  assert.match(route, /function rethrowGuestCancellation/);
  assert.equal(route.match(/rethrowGuestCancellation\(error, budget\.signal\)/gu)?.length, 3);
  assert.match(route, /legalCitationStatements/);
  assert.doesNotMatch(route, /retrieveInteractiveVerifiedLegalSources/);
  assert.match(route, /legalAiProvider\(\)/);
  assert.match(route, /enforceLegalDatabaseFreshness/);
  assert.match(route, /completeGuestAiRun/);
  assert.match(route, /failGuestAiRun/);
  assert.match(route, /assertProviderCallAllowed/);
  assert.match(route, /beforeProviderCall/);
  assert.match(route, /recordProviderUsage/);
  assert.match(route, /feature: "guest_legal_chat"/);
  assert.match(route, /workspaceId: null/);
  const validation = route.indexOf("const validated = validateLegalGatewayAnswer");
  const invalidOutput = route.indexOf('errorCode: "INVALID_AI_OUTPUT"', validation);
  const successfulUsage = route.indexOf('status: "succeeded"', validation);
  assert.ok(validation >= 0 && invalidOutput > validation && successfulUsage > invalidOutput);
  assert.match(route.slice(validation, successfulUsage), /status: "failed"[\s\S]*errorCode: "INVALID_AI_OUTPUT"/);
  assert.match(route, /GUEST_AI_DISABLED/);
  assert.doesNotMatch(route, /(?:mock|fake)(?:Answer|Response|Result)/i);
  assert.doesNotMatch(route, /OPENAI_API_KEY[^\n]+(?:json|Response)/);
});

test("guest AI page is noindex, RU/UZ localized, and exposes no fake success path", () => {
  assert.match(page, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false/);
  assert.match(page, /guestAiEnabled\(runtimeEnv\(\)\)/);
  assert.match(client, /\/api\/guest\/ai/);
  assert.match(client, /action="guest_ai"/);
  assert.match(client, /Гостевые данные удаляются через 24 часа/);
  assert.match(client, /Mehmon ma’lumotlari 24 soatdan keyin o‘chiriladi/);
  assert.doesNotMatch(client, /setTimeout\([^)]*(?:success|result)/i);
});
