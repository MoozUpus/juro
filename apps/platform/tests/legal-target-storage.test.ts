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
  return {
    APP_ENV: environment,
    LEGAL_EVIDENCE_BUCKET_NAME: bucketName,
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
  const corpusConfig = readFileSync(
    new URL("../wrangler.legal-corpus.jsonc", import.meta.url),
    "utf8",
  );
  const platformConfig = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  for (const environment of ["development", "staging", "production"] as const) {
    assert.match(corpusConfig, new RegExp(`juro-legal-catalog-${environment}`, "u"));
    assert.match(corpusConfig, new RegExp(`juro-legal-evidence-${environment}`, "u"));
  }
  assert.match(platformConfig, /juro-legal-corpus-development/u);
  assert.match(platformConfig, /juro-legal-corpus-staging/u);
  assert.match(platformConfig, /"service": "juro-legal-corpus"/u);
  assert.match(corpusConfig, /"binding": "LEGAL_DB"/u);
  assert.match(corpusConfig, /"binding": "LEGAL_EVIDENCE_BUCKET"/u);
  assert.match(platformConfig, /"binding": "LEGAL_CORPUS_READ_SERVICE"/u);
  assert.match(corpusConfig, /"workers_dev": false/u);
  assert.match(corpusConfig, /"preview_urls": false/u);
  assert.doesNotMatch(corpusConfig, /"routes"\s*:\s*\[[^\]]+\]/u);
});
