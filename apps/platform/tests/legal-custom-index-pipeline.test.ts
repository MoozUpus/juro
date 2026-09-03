import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CustomIndexPipelineError,
  EmbeddingBudget,
  ReleaseCheckpointLedger,
  assertContentAddressedArtifact,
  assertOfflineEmbeddingArtifactsAvailable,
  assertPlanNotExpired,
  assertReleaseSealable,
  authorizeProviderRateWindow,
  buildQueueMessage,
  contentFreePipelineTelemetry,
  parseBuildMessage,
  providerHttpFailureCode,
  providerErrorClassification,
  providerRateLimitTelemetry,
} from "../lib/legal-corpus/custom-index-pipeline";

const releaseId = "release:staging:current:custom-v1:2026-09-03";
const locator = `releases/${releaseId}/inputs/dense-000001.json`;
const inputSha256 = "1".repeat(64);

test("queue messages contain identities and R2 locators but no corpus content", () => {
  const message = buildQueueMessage({
    environment: "staging",
    releaseId,
    lane: "dense",
    batchId: "dense-000001",
    ordinal: 1,
    inputLocator: locator,
    inputSha256,
  });
  assert.deepEqual(Object.keys(message).sort(), [
    "batchId", "environment", "inputLocator", "inputSha256", "lane",
    "ordinal", "releaseId", "schemaVersion",
  ]);
  assert.equal(JSON.stringify(message).includes("officialText"), false);
  assert.deepEqual(parseBuildMessage(message, "staging"), message);
  assert.throws(
    () => parseBuildMessage({ ...message, environment: "production" }, "staging"),
    (error) => error instanceof CustomIndexPipelineError
      && error.code === "CUSTOM_INDEX_CROSS_ENVIRONMENT",
  );
});

test("checkpoint ledger is idempotent under duplicate and unordered delivery", async () => {
  const ledger = new ReleaseCheckpointLedger({
    environment: "staging",
    releaseId,
    expected: ["dense-000001", "dense-000002", "sparse-000001"],
  });
  const second = ledger.complete({
    batchId: "dense-000002", lane: "dense", inputSha256,
    outputLocator: "releases/x/outputs/dense-000002.json", outputSha256: "2".repeat(64),
    vectorizeMutationId: "mutation-2", providerInputTokens: 12,
  });
  assert.equal(second.outOfOrder, true);
  const first = ledger.complete({
    batchId: "dense-000001", lane: "dense", inputSha256,
    outputLocator: "releases/x/outputs/dense-000001.json", outputSha256: "3".repeat(64),
    vectorizeMutationId: "mutation-1", providerInputTokens: 0,
  });
  assert.equal(first.outOfOrder, false);
  assert.equal(ledger.complete(first.checkpoint).duplicate, true);
  assert.throws(
    () => ledger.complete({ ...first.checkpoint, outputSha256: "4".repeat(64) }),
    (error) => error instanceof CustomIndexPipelineError
      && error.code === "CUSTOM_INDEX_CHECKPOINT_CONFLICT",
  );
  assert.equal(ledger.snapshot().boundedReferences.length, 2);
});

test("embedding budget enforces provider ceilings, rate and authorized cost", () => {
  const budget = new EmbeddingBudget({
    maximumInputsPerRequest: 64,
    maximumTokensPerInput: 8192,
    maximumAggregateTokensPerRequest: 100_000,
    maximumRequestsPerMinute: 2,
    authorizedTokens: 10_000,
  });
  budget.authorize({ inputTokenCounts: [2_000, 3_000], nowMs: 1_000 });
  budget.authorize({ inputTokenCounts: [1_000], nowMs: 2_000 });
  assert.throws(
    () => budget.authorize({ inputTokenCounts: [1], nowMs: 3_000 }),
    (error) => error instanceof CustomIndexPipelineError
      && error.code === "CUSTOM_INDEX_RATE_LIMIT",
  );
  assert.throws(
    () => new EmbeddingBudget({ authorizedTokens: 5 }).authorize({ inputTokenCounts: [6], nowMs: 0 }),
    (error) => error instanceof CustomIndexPipelineError
      && error.code === "CUSTOM_INDEX_COST_STOP",
  );
  assert.throws(
    () => new EmbeddingBudget({ authorizedTokens: 20_000 }).authorize({ inputTokenCounts: [8_193], nowMs: 0 }),
    (error) => error instanceof CustomIndexPipelineError
      && error.code === "CUSTOM_INDEX_INPUT_TOKEN_LIMIT",
  );
  assert.throws(
    () => new EmbeddingBudget({ authorizedTokens: 200_000 }).authorize({
      inputTokenCounts: Array.from({ length: 65 }, () => 1), nowMs: 0,
    }),
    (error) => error instanceof CustomIndexPipelineError
      && error.code === "CUSTOM_INDEX_INPUT_COUNT_LIMIT",
  );
  assert.throws(
    () => new EmbeddingBudget({ authorizedTokens: 200_000 }).authorize({
      inputTokenCounts: Array.from({ length: 13 }, () => 8_000), nowMs: 0,
    }),
    (error) => error instanceof CustomIndexPipelineError
      && error.code === "CUSTOM_INDEX_AGGREGATE_TOKEN_LIMIT",
  );
  assert.deepEqual(budget.authorize({ inputTokenCounts: [1], nowMs: 61_001 }), {
    requestTokens: 1,
    usedTokens: 6_001,
    remainingTokens: 3_999,
  });
});

test("offline document indexing requires Batch-materialized embedding artifacts", () => {
  assert.doesNotThrow(() => assertOfflineEmbeddingArtifactsAvailable(0));
  assert.throws(
    () => assertOfflineEmbeddingArtifactsAvailable(1),
    (error) => error instanceof CustomIndexPipelineError
      && error.code === "CUSTOM_INDEX_BATCH_EMBEDDING_REQUIRED",
  );
  assert.throws(
    () => assertOfflineEmbeddingArtifactsAvailable(-1),
    (error) => error instanceof CustomIndexPipelineError
      && error.code === "CUSTOM_INDEX_BATCH_EMBEDDING_REQUIRED",
  );
});

test("offline workers cannot synchronously call a document-embedding provider", async () => {
  const workers = await Promise.all([
    readFile(new URL("../worker/legal-custom-index-pipeline-worker.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/legal-custom-current-build-worker.ts", import.meta.url), "utf8"),
  ]);
  for (const worker of workers) {
    assert.match(worker, /assertOfflineEmbeddingArtifactsAvailable\(missing\.length\)/u);
    assert.doesNotMatch(worker, /endpoint:\s*["']embeddings["']/u);
    assert.doesNotMatch(worker, /\.gateway\(/u);
  }
});

test("seal requires all lanes, terminal Vectorize mutations and exact inventory", () => {
  const base = {
    expectedBatchIds: ["sparse-1", "dense-1"],
    checkpoints: [
      { batchId: "sparse-1", lane: "sparse" as const, vectorizeMutationId: null },
      { batchId: "dense-1", lane: "dense" as const, vectorizeMutationId: "m1" },
    ],
    expectedVectorIds: ["a".repeat(64)],
    listedVectors: [{ id: "a".repeat(64), metadataSha256: "b".repeat(64) }],
    expectedVectorMetadata: new Map([["a".repeat(64), "b".repeat(64)]]),
  };
  assert.doesNotThrow(() => assertReleaseSealable({ ...base, mutationStatuses: new Map([["m1", "processed"]]) }));
  assert.throws(
    () => assertReleaseSealable({ ...base, mutationStatuses: new Map([["m1", "pending"]]) }),
    (error) => error instanceof CustomIndexPipelineError
      && error.code === "CUSTOM_INDEX_VECTORIZE_NOT_TERMINAL",
  );
  assert.throws(
    () => assertReleaseSealable({ ...base, listedVectors: [], mutationStatuses: new Map([["m1", "processed"]]) }),
    (error) => error instanceof CustomIndexPipelineError
      && error.code === "CUSTOM_INDEX_VECTOR_INVENTORY_MISMATCH",
  );
  assert.throws(
    () => assertReleaseSealable({
      ...base,
      listedVectors: [{ id: "a".repeat(64), metadataSha256: "c".repeat(64) }],
      mutationStatuses: new Map([["m1", "processed"]]),
    }),
    (error) => error instanceof CustomIndexPipelineError
      && error.code === "CUSTOM_INDEX_VECTOR_INVENTORY_MISMATCH",
  );
  assert.throws(
    () => assertReleaseSealable({
      ...base,
      checkpoints: base.checkpoints.slice(0, 1),
      mutationStatuses: new Map([["m1", "processed"]]),
    }),
    (error) => error instanceof CustomIndexPipelineError
      && error.code === "CUSTOM_INDEX_CHECKPOINTS_INCOMPLETE",
  );
});

test("expired plans and corrupt content-addressed R2 state fail closed", () => {
  assert.doesNotThrow(() => assertPlanNotExpired(10_001, 10_000));
  assert.throws(
    () => assertPlanNotExpired(10_000, 10_000),
    (error) => error instanceof CustomIndexPipelineError
      && error.code === "CUSTOM_INDEX_PLAN_EXPIRED",
  );
  assert.doesNotThrow(() => assertContentAddressedArtifact({
    expectedSha256: "a".repeat(64), actualSha256: "a".repeat(64), metadataSha256: "a".repeat(64),
  }));
  for (const corrupt of [
    { expectedSha256: "a".repeat(64), actualSha256: "b".repeat(64), metadataSha256: "a".repeat(64) },
    { expectedSha256: "a".repeat(64), actualSha256: "a".repeat(64), metadataSha256: "b".repeat(64) },
  ]) {
    assert.throws(
      () => assertContentAddressedArtifact(corrupt),
      (error) => error instanceof CustomIndexPipelineError
        && error.code === "CUSTOM_INDEX_R2_INPUT_CORRUPT",
    );
  }
});

test("durable provider rate state rejects a full window and expires old slots", () => {
  assert.deepEqual(authorizeProviderRateWindow({
    priorRequestEpochMs: [1_000], nowEpochMs: 2_000, maximumRequestsPerMinute: 2,
  }), [1_000, 2_000]);
  assert.throws(
    () => authorizeProviderRateWindow({
      priorRequestEpochMs: [1_000, 2_000], nowEpochMs: 3_000, maximumRequestsPerMinute: 2,
    }),
    (error) => error instanceof CustomIndexPipelineError
      && error.code === "CUSTOM_INDEX_RATE_LIMIT",
  );
  assert.deepEqual(authorizeProviderRateWindow({
    priorRequestEpochMs: [1_000, 2_000], nowEpochMs: 62_001, maximumRequestsPerMinute: 2,
  }), [62_001]);
});

test("provider HTTP telemetry exposes status only", () => {
  assert.equal(providerHttpFailureCode(400), "CUSTOM_INDEX_PROVIDER_HTTP_400");
  assert.equal(providerHttpFailureCode(429), "CUSTOM_INDEX_PROVIDER_HTTP_429");
  assert.equal(providerHttpFailureCode(503), "CUSTOM_INDEX_PROVIDER_HTTP_503");
  assert.equal(providerHttpFailureCode(Number.NaN), "CUSTOM_INDEX_PROVIDER_HTTP_INVALID");
  assert.deepEqual(providerRateLimitTelemetry(new Headers({
    "retry-after": "12",
    "x-ratelimit-limit-requests": "5000",
    "x-ratelimit-remaining-requests": "4998",
    "x-ratelimit-limit-tokens": "1000000",
    "x-ratelimit-remaining-tokens": "125000",
  })), {
    providerRetryAfterSeconds: 12,
    providerRateLimitRequests: 5000,
    providerRateRemainingRequests: 4998,
    providerRateLimitTokens: 1_000_000,
    providerRateRemainingTokens: 125_000,
  });
  assert.deepEqual(providerRateLimitTelemetry(new Headers({
    "retry-after": "not-numeric",
    "x-ratelimit-limit-tokens": "secret",
  })), {
    providerRetryAfterSeconds: null,
    providerRateLimitRequests: null,
    providerRateRemainingRequests: null,
    providerRateLimitTokens: null,
    providerRateRemainingTokens: null,
  });
});

test("provider error classification excludes response messages", async () => {
  assert.deepEqual(await providerErrorClassification(new Response(JSON.stringify({
    error: {
      type: "tokens",
      code: "rate_limit_exceeded",
      message: "sensitive provider prose",
    },
  }), { status: 429 })), {
    providerErrorType: "tokens",
    providerErrorCode: "rate_limit_exceeded",
  });
  assert.deepEqual(await providerErrorClassification(new Response("not-json", { status: 429 })), {
    providerErrorType: null,
    providerErrorCode: null,
  });
});

test("telemetry allowlists content-free counters and rejects sensitive fields", () => {
  assert.deepEqual(contentFreePipelineTelemetry({
    environment: "staging",
    releaseId,
    component: "dense",
    status: "complete",
    r2Reads: 3,
    r2Bytes: 6144,
    providerTokens: 122,
    providerLatencyMs: 400,
    failureCode: null,
  }), {
    service: "legal-custom-index",
    environment: "staging",
    releaseId,
    component: "dense",
    status: "complete",
    r2Reads: 3,
    r2Bytes: 6144,
    providerTokens: 122,
    providerLatencyMs: 400,
    failureCode: null,
  });
  assert.throws(
    () => contentFreePipelineTelemetry({ environment: "staging", releaseId, queryText: "secret" } as never),
    (error) => error instanceof CustomIndexPipelineError
      && error.code === "CUSTOM_INDEX_TELEMETRY_FIELD_REJECTED",
  );
  assert.equal(contentFreePipelineTelemetry({
    environment: "staging",
    releaseId: "release:staging:current:custom-v1:2026-09-03",
    component: "materialize",
    status: "failed",
    failureCode: "CUSTOM_CURRENT_PROVIDER_FAILED",
  }).releaseId, "release:staging:current:custom-v1:2026-09-03");
});
