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
  assert.match(route, /legalCitationStatements/);
  assert.doesNotMatch(route, /retrieveInteractiveVerifiedLegalSources/);
  assert.match(route, /legalAiProvider\(\)/);
  assert.match(route, /enforceLegalChatSourceBoundary/);
  assert.match(route, /enforceLegalDatabaseFreshness/);
  assert.match(route, /completeGuestAiRun/);
  assert.match(route, /failGuestAiRun/);
  assert.match(route, /assertProviderCallAllowed/);
  assert.match(route, /beforeProviderCall/);
  assert.match(route, /recordProviderUsage/);
  assert.match(route, /feature: "guest_legal_chat"/);
  assert.match(route, /workspaceId: null/);
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
