import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the first legal-D1 migration is control-only and body-free", () => {
  const migration = readFileSync(
    new URL("../legal-drizzle/0001_target_control.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /CREATE TABLE `legal_target_control`/u);
  assert.match(migration, /environment/u);
  assert.match(migration, /migration_state/u);
  assert.doesNotMatch(migration, /content_text|exact_quote|body_text|sparse_postings/iu);
});

test("every target environment is R2-native and has no legacy read or AI Search binding", () => {
  const corpusConfigText = readFileSync(
    new URL("../wrangler.legal-corpus.jsonc", import.meta.url),
    "utf8",
  );
  const corpusConfig = JSON.parse(corpusConfigText) as {
    vars: Record<string, string>;
    ai_search_namespaces?: unknown[];
    env: Record<"staging" | "production", {
      vars: Record<string, string>;
      ai_search_namespaces?: unknown[];
    }>;
  };
  const platformConfig = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  for (const environment of ["development", "staging", "production"] as const) {
    assert.match(corpusConfigText, new RegExp(`juro-legal-catalog-${environment}`, "u"));
    assert.match(corpusConfigText, new RegExp(`juro-legal-evidence-${environment}`, "u"));
  }
  assert.match(corpusConfigText, /"binding": "LEGAL_DB"/u);
  assert.match(corpusConfigText, /"binding": "LEGAL_EVIDENCE_BUCKET"/u);
  const environmentConfigs = {
    development: corpusConfig,
    staging: corpusConfig.env.staging,
    production: corpusConfig.env.production,
  };
  for (const [environment, config] of Object.entries(environmentConfigs)) {
    assert.deepEqual(config.ai_search_namespaces ?? [], []);
    assert.equal(config.vars.LEGAL_AI_GATEWAY_ID, `juro-ai-search-${environment}`);
    assert.equal(config.vars.LEGAL_AI_PROVIDER_PROJECT_ID, `juro-openai-${environment}`);
    for (const key of Object.keys(config.vars)) assert.doesNotMatch(key, /^LEGAL_AI_SEARCH_/u);
  }
  assert.doesNotMatch(platformConfig, /LEGAL_CORPUS_READ_SERVICE/u);
  assert.match(platformConfig, /"binding": "LEGAL_RETRIEVAL_SERVICE"/u);
  assert.doesNotMatch(corpusConfigText, /LEGAL_AI_SEARCH_NAMESPACE|LEGAL_AI_SEARCH_SOURCE_BUCKET/u);
  assert.match(corpusConfigText, /"workers_dev": false/u);
  assert.match(corpusConfigText, /"preview_urls": false/u);
  assert.doesNotMatch(corpusConfigText, /"routes"\s*:\s*\[[^\]]+\]/u);
});
