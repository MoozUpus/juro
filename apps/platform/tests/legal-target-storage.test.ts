import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createLegalTargetReadinessClient,
  handleLegalTargetReadinessRequest,
  LEGAL_TARGET_READINESS_PATH,
  type LegalTargetReadinessEnv,
} from "../lib/legal-corpus/target-storage";
import { sqliteD1FixtureFromDirectory } from "./helpers/sqlite-d1";

function targetEnv(
  environment: "development" | "staging" | "production" = "staging",
  suffix = "",
):
LegalTargetReadinessEnv {
  const bucketName = `juro-legal-evidence-${environment}${suffix}`;
  const aiSearchNamespace = {
    get() { throw new Error("not used by readiness"); },
    async list() {
      return { result: [], result_info: { count: 0, page: 1, per_page: 100, total_count: 0 } };
    },
    async create() { throw new Error("not used by readiness"); },
    async delete() { throw new Error("not used by readiness"); },
    async search() { throw new Error("not used by readiness"); },
    async chatCompletions() { throw new Error("not used by readiness"); },
  } satisfies AiSearchNamespace;
  return {
    APP_ENV: environment,
    LEGAL_EVIDENCE_BUCKET_NAME: bucketName,
    LEGAL_AI_SEARCH_NAMESPACE_NAME: `juro-legal-${environment}`,
    LEGAL_AI_SEARCH_CONFIGURATION_ID: `ai-search-${environment}-v1`,
    LEGAL_AI_GATEWAY_ID: `juro-ai-search-${environment}`,
    LEGAL_AI_PROVIDER_PROJECT_ID: `juro-openai-${environment}`,
    LEGAL_AI_SEARCH_EMBEDDING_MODEL: "openai/text-embedding-3-large",
    LEGAL_AI_SEARCH_DIMENSIONS: "1536",
    LEGAL_AI_SEARCH_KEYWORD_TOKENIZER: "porter",
    LEGAL_AI_SEARCH_METADATA_SCHEMA: "language:text,document_type:text,valid_from:datetime,valid_to:datetime",
    LEGAL_AI_SEARCH_SOURCE_PREFIX: "search-releases/",
    LEGAL_AI_SEARCH_MAX_RESULTS: "50",
    LEGAL_AI_SEARCH_MAX_INSTANCES_PER_QUERY: "10",
    LEGAL_AI_SEARCH_PAUSED: "true",
    LEGAL_AI_SEARCH_GATEWAY_PAYLOAD_LOGGING: "false",
    LEGAL_AI_SEARCH_GATEWAY_CACHE: "false",
    LEGAL_AI_SEARCH_SIMILARITY_CACHE: "false",
    LEGAL_AI_SEARCH_NAMESPACE: aiSearchNamespace,
    LEGAL_DB: {
      prepare() {
        return {
          async first() {
            return {
              environment,
              migrationState: "initialized",
              evidenceBucketName: bucketName,
            };
          },
        };
      },
    },
    LEGAL_EVIDENCE_BUCKET: {
      async head(key: string) {
        assert.equal(key, `control/environments/${environment}.json`);
        return {
          customMetadata: {
            environment,
            bucketName,
            schemaVersion: "1",
          },
        };
      },
    },
  };
}

function inProcessReadinessService(env: LegalTargetReadinessEnv): Fetcher {
  return {
    fetch(input: RequestInfo | URL, init?: RequestInit) {
      return handleLegalTargetReadinessRequest(new Request(input, init), env);
    },
  } as Fetcher;
}

test("private service-binding readiness proves the isolated legal D1 and R2 stores", async () => {
  const result = await createLegalTargetReadinessClient({
    service: inProcessReadinessService(targetEnv()),
    environment: "staging",
  }).readiness();

  assert.deepEqual(result, {
    environment: "staging",
    database: "ready",
    evidenceBucket: "ready",
    migrationState: "initialized",
    aiSearchNamespace: "ready",
    aiSearchInstanceCount: 0,
    declaredConfigurationIdentity: "ai-search-staging-v1",
    controlPlaneAttestation: "required",
  });
});

test("private readiness accepts an environment-scoped blue-green storage identity", async () => {
  const result = await createLegalTargetReadinessClient({
    service: inProcessReadinessService(targetEnv("staging", "-green-20260831")),
    environment: "staging",
  }).readiness();

  assert.equal(result.evidenceBucket, "ready");
  assert.equal(result.environment, "staging");
});

test("target control persists one exact lowercase blue-green resource identity", () => {
  const { sqlite } = sqliteD1FixtureFromDirectory(
    new URL("../legal-drizzle/", import.meta.url),
  );
  try {
    const insert = sqlite.prepare(`INSERT INTO legal_target_control
      (control_key,environment,migration_state,evidence_bucket_name,schema_version,
        initialized_at,updated_at) VALUES ('environment','staging','migrating',?,1,?,?)`);
    insert.run(
      "juro-legal-evidence-staging-green-20260831",
      "2026-08-31T10:11:58.807Z",
      "2026-08-31T10:11:58.807Z",
    );
    assert.equal((sqlite.prepare(`SELECT evidence_bucket_name AS bucketName
      FROM legal_target_control`).get() as { bucketName: string }).bucketName,
    "juro-legal-evidence-staging-green-20260831");
  } finally {
    sqlite.close();
  }
});

for (const invalidSuffix of ["-green--20260831", "-green-"]) {
  test(`target control rejects malformed blue-green suffix ${invalidSuffix}`, () => {
    const { sqlite } = sqliteD1FixtureFromDirectory(
      new URL("../legal-drizzle/", import.meta.url),
    );
    try {
      assert.throws(() => sqlite.prepare(`INSERT INTO legal_target_control
        (control_key,environment,migration_state,evidence_bucket_name,schema_version,
          initialized_at,updated_at) VALUES ('environment','staging','migrating',?,1,?,?)`).run(
        `juro-legal-evidence-staging${invalidSuffix}`,
        "2026-08-31T10:11:58.807Z",
        "2026-08-31T10:11:58.807Z",
      ), /constraint/u);
    } finally {
      sqlite.close();
    }
  });
}

test("target readiness rejects unbound, cross-environment, and public requests", async () => {
  const env = targetEnv("staging");
  const unbound = await handleLegalTargetReadinessRequest(
    new Request(`http://legal-corpus.internal${LEGAL_TARGET_READINESS_PATH}`),
    env,
  );
  assert.equal(unbound.status, 404);

  const crossEnvironment = await handleLegalTargetReadinessRequest(
    new Request(`http://legal-corpus.internal${LEGAL_TARGET_READINESS_PATH}`, {
      headers: {
        "x-juro-service-binding": "legal-target-storage-v1",
        "x-juro-legal-environment": "production",
      },
    }),
    env,
  );
  assert.equal(crossEnvironment.status, 404);

  const publicRequest = await handleLegalTargetReadinessRequest(
    new Request(`https://corpus.example.com${LEGAL_TARGET_READINESS_PATH}`, {
      headers: {
        "x-juro-service-binding": "legal-target-storage-v1",
        "x-juro-legal-environment": "staging",
      },
    }),
    env,
  );
  assert.equal(publicRequest.status, 404);
});

test("target readiness reports declared configuration drift without leaking payloads", async () => {
  const env = targetEnv("staging");
  Reflect.set(env, "LEGAL_AI_SEARCH_GATEWAY_CACHE", "true");
  const errors: string[] = [];
  const originalError = console.error;
  console.error = (message?: unknown) => errors.push(String(message));
  try {
    await assert.rejects(() => createLegalTargetReadinessClient({
      service: inProcessReadinessService(env),
      environment: "staging",
    }).readiness(), /LEGAL_TARGET_CONFIGURATION_DRIFT/u);
  } finally {
    console.error = originalError;
  }
  assert.equal(errors.length, 1);
  assert.deepEqual(JSON.parse(errors[0]!) as unknown, {
    service: "legal-corpus-worker",
    event: "legal_target.readiness_unavailable",
    environment: "staging",
    errorCode: "LEGAL_TARGET_CONFIGURATION_DRIFT",
  });
});

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

test("every environment declares a route-free, isolated target storage and binding identity", () => {
  const corpusConfigText = readFileSync(
    new URL("../wrangler.legal-corpus.jsonc", import.meta.url),
    "utf8",
  );
  const corpusConfig = JSON.parse(corpusConfigText) as {
    vars: Record<string, string>;
    ai_search_namespaces: Array<{ binding: string; namespace: string }>;
    env: Record<"staging" | "production", {
      vars: Record<string, string>;
      ai_search_namespaces: Array<{ binding: string; namespace: string }>;
    }>;
  };
  const platformConfig = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  for (const environment of ["development", "staging", "production"] as const) {
    assert.match(corpusConfigText, new RegExp(`juro-legal-catalog-${environment}`, "u"));
    assert.match(corpusConfigText, new RegExp(`juro-legal-evidence-${environment}`, "u"));
  }
  assert.match(platformConfig, /juro-legal-corpus-development/u);
  assert.match(platformConfig, /juro-legal-corpus-staging/u);
  assert.match(platformConfig, /"service": "juro-legal-corpus"/u);
  assert.match(corpusConfigText, /"binding": "LEGAL_DB"/u);
  assert.match(corpusConfigText, /"binding": "LEGAL_EVIDENCE_BUCKET"/u);
  const environmentConfigs = {
    development: corpusConfig,
    staging: corpusConfig.env.staging,
    production: corpusConfig.env.production,
  };
  for (const [environment, config] of Object.entries(environmentConfigs)) {
    assert.deepEqual(config.ai_search_namespaces, [{
      binding: "LEGAL_AI_SEARCH_NAMESPACE",
      namespace: `juro-legal-${environment}`,
    }]);
    assert.equal(config.vars.LEGAL_AI_SEARCH_NAMESPACE_NAME, `juro-legal-${environment}`);
    assert.equal(config.vars.LEGAL_AI_GATEWAY_ID, `juro-ai-search-${environment}`);
    assert.equal(config.vars.LEGAL_AI_PROVIDER_PROJECT_ID, `juro-openai-${environment}`);
    assert.equal(config.vars.LEGAL_AI_SEARCH_GATEWAY_PAYLOAD_LOGGING, "false");
    assert.equal(config.vars.LEGAL_AI_SEARCH_GATEWAY_CACHE, "false");
    assert.equal(config.vars.LEGAL_AI_SEARCH_SIMILARITY_CACHE, "false");
    assert.equal(config.vars.LEGAL_AI_SEARCH_EMBEDDING_MODEL, "openai/text-embedding-3-large");
    assert.equal(config.vars.LEGAL_AI_SEARCH_DIMENSIONS, "1536");
    assert.equal(config.vars.LEGAL_AI_SEARCH_KEYWORD_TOKENIZER, "porter");
    assert.equal(config.vars.LEGAL_AI_SEARCH_PAUSED, "true");
  }
  for (const key of [
    "LEGAL_AI_SEARCH_NAMESPACE_NAME",
    "LEGAL_AI_GATEWAY_ID",
    "LEGAL_AI_PROVIDER_PROJECT_ID",
  ]) {
    assert.equal(new Set(Object.values(environmentConfigs).map((config) => config.vars[key])).size, 3);
  }
  assert.match(platformConfig, /"binding": "LEGAL_CORPUS_READ_SERVICE"/u);
  assert.match(corpusConfigText, /"workers_dev": false/u);
  assert.match(corpusConfigText, /"preview_urls": false/u);
  assert.doesNotMatch(corpusConfigText, /"routes"\s*:\s*\[[^\]]+\]/u);
});
