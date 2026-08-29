import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Lex web discovery is domain-restricted and cannot become legal evidence directly", async () => {
  const source = await readFile(new URL("../lib/legal/openai-lex-discovery.ts", import.meta.url), "utf8");
  assert.match(source, /purpose:\s*"official_lex_discovery"/u);
  assert.match(source, /allowedDomains:\s*\["lex\.uz", "www\.lex\.uz"\]/u);
  assert.match(source, /classifyLegalSourceUrl/u);
  assert.match(source, /server-fetch, canonicalize, parse, clean/u);
  assert.doesNotMatch(source, /advice\.uz|google\.|bing\./iu);
});

test("low-level OpenAI adapter emits allowed_domains in the Responses tool payload", async () => {
  const source = await readFile(new URL("../lib/document-builder/ai/openai.ts", import.meta.url), "utf8");
  assert.match(source, /type: "web_search"/u);
  assert.match(source, /filters:\s*\{ allowed_domains:/u);
  assert.match(source, /tool_choice: "required"/u);
  assert.match(source, /max_tool_calls/u);
});

test("authenticated Lex discovery is quota/circuit guarded and separately metered", async () => {
  const route = await readFile(new URL("../app/api/platform/ai/route.ts", import.meta.url), "utf8");
  assert.match(route, /operation: "web_search"/u);
  assert.match(route, /assertProviderCallAllowed\(\{ db, environment: providerEnvironment, provider: "openai" \}\)/u);
  assert.match(route, /usage\.used >= usage\.limit/u);
  assert.match(route, /provider_usage_discovery_/u);
});
