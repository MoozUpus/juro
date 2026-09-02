import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  handleTargetCandidateEvaluationRequest,
  TARGET_CANDIDATE_EVALUATION_PATH,
} from "../lib/legal-corpus/target-evaluation";
import {
  createRuntimeTargetCandidateEvaluationRetriever,
  type TargetRetrievalRuntimeEnv,
} from "../lib/legal-corpus/target-runtime";
import { sqliteD1FixtureFromDirectory } from "./helpers/sqlite-d1";

const releaseId = "release:staging:current:source-snapshot-v1";
const configuration = {
  identity: "ai-search-staging-v1",
  metadataSchema: ["language", "document_type", "valid_from", "valid_to"],
  fifthMetadataFieldReserved: true,
  embeddingModel: "openai/text-embedding-3-large",
  dimensions: 1_536,
  keywordTokenizer: "porter",
  gatewayIdentity: "juro-ai-search-staging",
  providerProjectIdentity: "juro-openai-staging",
  providerNamespaceIdentity: "juro-legal-staging",
  sourcePrefix: `search-releases/${releaseId}/current/`,
  serviceBindingIdentity: "LEGAL_CORPUS_SERVICE",
  gatewayPayloadLogging: false,
  gatewayCaching: false,
  similarityCaching: false,
  queryRewriting: false,
  providerReranking: false,
  providerGeneration: false,
  contextExpansion: false,
};
const configurationJson = JSON.stringify(configuration);
const configurationSha256 = createHash("sha256").update(configurationJson).digest("hex");
const providerReconciliationJson = JSON.stringify({
  instanceId: "juro-cur-porter-v1",
  providerItems: 160_978,
  uniqueItems: 160_978,
  chunks: 170_000,
  mismatches: {},
  verifiedInventorySha256: "a".repeat(64),
  ok: true,
});
const providerReconciliationSha256 = createHash("sha256")
  .update(providerReconciliationJson).digest("hex");

function qualificationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "qualification-porter-v1",
    searchReleaseId: releaseId,
    environment: "staging",
    capability: "current",
    reconciliationRunId: "build:staging:current:source-snapshot-v1",
    providerNamespace: "juro-legal-staging",
    providerInstanceId: "juro-cur-porter-v1",
    shardId: "00",
    configurationJson,
    configurationSha256,
    providerItemCount: 160_978,
    providerChunkCount: 170_000,
    providerInventorySha256: "a".repeat(64),
    providerReconciliationJson,
    providerReconciliationSha256,
    sourcePrefix: `search-releases/${releaseId}/current/`,
    scheduledIndexingPaused: 1,
    status: "qualified",
    recordedAt: "2026-09-02T22:00:00.000Z",
    releaseEnvironment: "staging",
    releaseCapability: "current",
    releaseStatus: "draft",
    releaseItemCount: 160_978,
    releaseConfigurationIdentity: "ai-search-staging-v1",
    reconciliationStatus: "clean",
    reconciliationEnvironment: "staging",
    reconciliationReleaseId: releaseId,
    reconciliationCapability: "current",
    projectionStatus: "complete",
    projectionEnvironment: "staging",
    projectionExpectedItems: 160_978,
    projectionCopiedItems: 160_978,
    projectionBucketName: "juro-legal-ai-search-staging-20260902",
    ...overrides,
  };
}

function evaluationEnv(row = qualificationRow()): TargetRetrievalRuntimeEnv {
  const db = {
    prepare() {
      return {
        bind() {
          return { first: async () => row };
        },
      };
    },
  } as unknown as D1Database;
  return {
    APP_ENV: "staging",
    LEGAL_CORPUS_SHADOW_MODE: "true",
    LEGAL_AI_SEARCH_PAUSED: "true",
    LEGAL_DB: db,
    LEGAL_EVIDENCE_BUCKET: { get: async () => null },
    LEGAL_AI_SEARCH_NAMESPACE: {} as AiSearchNamespace,
    LEGAL_AI_SEARCH_NAMESPACE_NAME: "juro-legal-staging",
    LEGAL_AI_SEARCH_SOURCE_BUCKET_NAME: "juro-legal-ai-search-staging-20260902",
    LEGAL_CORPUS_REASONING_SERVICE: {} as Fetcher,
  };
}

test("candidate qualification storage is immutable and indexed by release", () => {
  const { sqlite } = sqliteD1FixtureFromDirectory(new URL("../legal-drizzle/", import.meta.url));
  try {
    const table = sqlite.prepare(`SELECT sql FROM sqlite_master
      WHERE type='table' AND name='legal_search_candidate_qualifications'`).get() as { sql: string };
    const triggers = sqlite.prepare(`SELECT name FROM sqlite_master
      WHERE type='trigger' AND tbl_name='legal_search_candidate_qualifications'
      ORDER BY name`).all() as Array<{ name: string }>;
    const indexes = sqlite.prepare(`SELECT name FROM sqlite_master
      WHERE type='index' AND tbl_name='legal_search_candidate_qualifications'
      ORDER BY name`).all() as Array<{ name: string }>;
    assert.match(table.sql, /status`='qualified'/u);
    assert.deepEqual(triggers.map(({ name }) => name), [
      "legal_search_candidate_qualifications_no_delete",
      "legal_search_candidate_qualifications_no_update",
    ]);
    assert.equal(indexes.some(({ name }) =>
      name === "legal_search_candidate_qualification_release_idx"), true);
  } finally {
    sqlite.close();
  }
});

test("only an exact staging shadow qualification opens an off-side retriever", async () => {
  const retriever = await createRuntimeTargetCandidateEvaluationRetriever(
    evaluationEnv(),
    "qualification-porter-v1",
  );
  assert.equal(typeof retriever.answer, "function");

  await assert.rejects(
    () => createRuntimeTargetCandidateEvaluationRetriever(
      evaluationEnv(qualificationRow({ providerItemCount: 160_977 })),
      "qualification-porter-v1",
    ),
    /TARGET_CANDIDATE_QUALIFICATION_REJECTED/u,
  );
  await assert.rejects(
    () => createRuntimeTargetCandidateEvaluationRetriever({
      ...evaluationEnv(), APP_ENV: "production",
    }, "qualification-porter-v1"),
    /TARGET_CANDIDATE_EVALUATION_UNAVAILABLE/u,
  );
});

test("candidate evaluation route is private and fail-closed outside staging shadow mode", async () => {
  const publicRequest = new Request(
    `https://example.test${TARGET_CANDIDATE_EVALUATION_PATH}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
  );
  const publicResponse = await handleTargetCandidateEvaluationRequest(publicRequest, evaluationEnv());
  assert.equal(publicResponse.status, 404);

  const privateRequest = new Request(
    `http://legal-corpus.internal${TARGET_CANDIDATE_EVALUATION_PATH}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-juro-service-binding": "target-candidate-evaluation-v1",
        "x-juro-legal-environment": "staging",
      },
      body: JSON.stringify({
        qualificationId: "qualification-porter-v1",
        question: { id: "question-1", question: "What is the current law?" },
      }),
    },
  );
  const disabledResponse = await handleTargetCandidateEvaluationRequest(privateRequest, {
    ...evaluationEnv(), LEGAL_CORPUS_SHADOW_MODE: "false",
  });
  assert.equal(disabledResponse.status, 404);
});
