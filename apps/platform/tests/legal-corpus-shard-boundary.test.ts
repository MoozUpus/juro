import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

type WranglerConfig = {
  name: string;
  main: string;
  d1_databases?: Array<{ binding: string; database_name: string; database_id: string }>;
  env?: Record<string, {
    d1_databases?: Array<{ binding: string; database_name: string; database_id: string }>;
    vars?: Record<string, string>;
  }>;
};

function config(file: string): WranglerConfig {
  return JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8")) as WranglerConfig;
}

test("staging corpus shard is isolated and ingestion-only", () => {
  const shard = config("wrangler.legal-corpus-shard.jsonc");
  assert.equal(shard.main, "./worker/legal-corpus-worker.ts");
  assert.equal(shard.name, "juro-legal-corpus-shard-development");
  assert.equal(shard.env?.production, undefined);
  const staging = shard.env?.staging;
  assert.ok(staging);
  assert.deepEqual(staging.d1_databases, [{
    binding: "DB",
    database_name: "juro-staging-corpus-shard-1",
    database_id: "e09e0682-0c2e-4458-a8f3-be9de28117e3",
    migrations_dir: "./drizzle",
  }]);
  assert.equal(staging.vars?.LEGAL_CORPUS_ENABLED, "true");
  assert.equal(staging.vars?.LEGAL_CORPUS_AUTO_INGEST_ENABLED, "true");
  assert.equal(staging.vars?.LEGAL_CORPUS_DENSE_ENABLED, "false");
  assert.equal(staging.vars?.LEGAL_CORPUS_STAGING_INGESTION_JOBS_PER_RUN, "20");
});

test("primary legal-corpus staging binding remains the v2 database", () => {
  const primary = config("wrangler.legal-corpus.jsonc");
  const staging = primary.env?.staging;
  assert.ok(staging);
  const db = staging.d1_databases?.find((binding) => binding.binding === "DB");
  assert.equal(db?.database_name, "juro-staging-corpus-v2");
  assert.equal(db?.database_id, "62620fb3-3da3-4c76-a8e9-aa60858c1063");
});
