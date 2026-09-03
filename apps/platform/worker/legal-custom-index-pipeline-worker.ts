import { Container, getContainer } from "@cloudflare/containers";
import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";

import {
  CustomIndexPipelineError,
  assertContentAddressedArtifact,
  assertOfflineEmbeddingArtifactsAvailable,
  assertPlanNotExpired,
  assertReleaseSealable,
  authorizeProviderRateWindow,
  contentFreePipelineTelemetry,
  parseBuildMessage,
  type CustomIndexBuildMessage,
  type CustomIndexCheckpoint,
  type CustomIndexEnvironment,
} from "../lib/legal-corpus/custom-index-pipeline";
import {
  CUSTOM_EMBEDDING_DIMENSIONS,
  CUSTOM_EMBEDDING_MODEL,
  deserializeNormalizedEmbedding,
  putImmutableCustomArtifact,
  serializeCustomEmbeddingInput,
  type CustomRetrievalChunk,
} from "../lib/legal-corpus/custom-hybrid-index";
import { fuseCustomRankedLanes } from "../lib/legal-corpus/custom-bm25";

type DenseItem = {
  chunk: CustomRetrievalChunk;
  vectorId: string;
  metadata: Record<string, string | number>;
  metadataSha256: string;
  inputTokens: number;
};

type DenseInput = {
  schemaVersion: 1;
  environment: CustomIndexEnvironment;
  releaseId: string;
  batchId: string;
  items?: DenseItem[];
} & Partial<DenseItem>;

function denseItems(input: DenseInput): DenseItem[] {
  const items = input.items ?? (input.chunk && input.vectorId && input.metadata
    && input.metadataSha256 && input.inputTokens
    ? [{
        chunk: input.chunk,
        vectorId: input.vectorId,
        metadata: input.metadata,
        metadataSha256: input.metadataSha256,
        inputTokens: input.inputTokens,
      }]
    : []);
  if (items.length === 0 || items.length > 64
    || new Set(items.map(({ vectorId }) => vectorId)).size !== items.length) {
    throw new CustomIndexPipelineError("CUSTOM_INDEX_DENSE_INPUT_INVALID");
  }
  return items;
}

type SparseRecord = {
  termHash: string;
  itemOrdinal: number;
  itemKey: string;
  field: string;
  termFrequency: number;
};

type SparseInput = {
  schemaVersion: 1;
  environment: CustomIndexEnvironment;
  releaseId: string;
  batchId: string;
  records: SparseRecord[];
};

type PipelinePlan = {
  schemaVersion: 1;
  environment: CustomIndexEnvironment;
  releaseId: string;
  sourceRootSha256: string;
  messages: CustomIndexBuildMessage[];
  expectedVectorIds: string[];
  expectedVectorMetadata: Record<string, string>;
  authorizedProviderTokens: number;
  expiresAtEpochMs: number;
};

type WorkflowPayload = {
  schemaVersion: 1;
  environment: CustomIndexEnvironment;
  releaseId: string;
  sourceRootSha256: string;
  planLocator: string;
  planSha256: string;
};

type PipelineEnv = {
  APP_ENV: CustomIndexEnvironment;
  ARTIFACTS: R2Bucket;
  DENSE: Vectorize;
  BUILD_QUEUE: Queue<CustomIndexBuildMessage>;
  BUILD_WORKFLOW?: Workflow<WorkflowPayload>;
  REDUCER: DurableObjectNamespace<CustomBm25ReducerContainer>;
  RESTORE_DENSE?: Vectorize;
  PROOF_MODE?: string;
};

type ProcessingTelemetry = {
  r2Reads: number;
  r2Bytes: number;
  bm25Traversal?: number;
  providerLatencyMs?: number;
  vectorizeLatencyMs?: number;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const SHA256 = /^[a-f0-9]{64}$/u;
const VECTOR_ID = SHA256;

async function sha256(bytes: ArrayBuffer | Uint8Array | string): Promise<string> {
  const input = typeof bytes === "string"
    ? Uint8Array.from(encoder.encode(bytes)).buffer
    : bytes instanceof Uint8Array
      ? Uint8Array.from(bytes).buffer
      : bytes;
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", input))]
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readVerifiedBytes(bucket: R2Bucket, key: string, expectedSha256: string): Promise<Uint8Array> {
  const object = await bucket.get(key);
  if (!object) throw new CustomIndexPipelineError("CUSTOM_INDEX_R2_INPUT_MISSING");
  const bytes = new Uint8Array(await object.arrayBuffer());
  const actual = await sha256(bytes);
  assertContentAddressedArtifact({
    expectedSha256,
    actualSha256: actual,
    metadataSha256: object.customMetadata?.sha256,
  });
  return bytes;
}

async function readVerifiedJson<T>(bucket: R2Bucket, key: string, expectedSha256: string): Promise<T> {
  return JSON.parse(decoder.decode(await readVerifiedBytes(bucket, key, expectedSha256))) as T;
}

function assertIdentity(
  input: { environment?: unknown; releaseId?: unknown; batchId?: unknown },
  message: CustomIndexBuildMessage,
): void {
  if (input.environment !== message.environment || input.releaseId !== message.releaseId
    || input.batchId !== message.batchId) {
    throw new CustomIndexPipelineError("CUSTOM_INDEX_INPUT_IDENTITY_MISMATCH");
  }
}

function checkpointKey(message: CustomIndexBuildMessage): string {
  return `releases/${message.releaseId}/checkpoints/${message.batchId}.json`;
}

async function existingCheckpoint(
  env: PipelineEnv,
  message: CustomIndexBuildMessage,
): Promise<CustomIndexCheckpoint | null> {
  const object = await env.ARTIFACTS.get(checkpointKey(message));
  if (!object) return null;
  const bytes = new Uint8Array(await object.arrayBuffer());
  const digest = await sha256(bytes);
  if (object.customMetadata?.sha256 !== digest) {
    throw new CustomIndexPipelineError("CUSTOM_INDEX_CHECKPOINT_CORRUPT");
  }
  const checkpoint = JSON.parse(decoder.decode(bytes)) as CustomIndexCheckpoint;
  if (checkpoint.batchId !== message.batchId || checkpoint.lane !== message.lane
    || checkpoint.inputSha256 !== message.inputSha256) {
    throw new CustomIndexPipelineError("CUSTOM_INDEX_CHECKPOINT_CONFLICT");
  }
  return checkpoint;
}

async function writeCheckpoint(
  env: PipelineEnv,
  message: CustomIndexBuildMessage,
  checkpoint: CustomIndexCheckpoint,
): Promise<void> {
  const bytes = encoder.encode(JSON.stringify(checkpoint));
  await putImmutableCustomArtifact(env.ARTIFACTS, checkpointKey(message), bytes, {
    contentType: "application/json",
    customMetadata: {
      environment: message.environment,
      releaseId: message.releaseId,
      lane: message.lane,
      batchId: message.batchId,
    },
  });
}

const REDUCER_PROGRAM = String.raw`
let body="";
process.stdin.setEncoding("utf8");
process.stdin.on("data", value => body += value);
process.stdin.on("end", () => {
  const input=JSON.parse(body);
  if (!Array.isArray(input.records)) process.exit(64);
  input.records.sort((a,b) => a.termHash.localeCompare(b.termHash)
    || a.itemOrdinal-b.itemOrdinal || a.field.localeCompare(b.field)
    || a.termFrequency-b.termFrequency);
  process.stdout.write(JSON.stringify({schemaVersion:1,records:input.records}));
});`;

export class CustomBm25ReducerContainer extends Container {
  entrypoint = ["sh", "-c", "while :; do sleep 3600; done"];
  enableInternet = false;
  // The application is intentionally capped at one active reducer. Release an
  // idle per-batch identity before the Queue's bounded retry window so the next
  // deterministic batch can acquire the only slot.
  sleepAfter = "10s";

  async acquireProviderRequest(nowEpochMs: number, maximumRequestsPerMinute: number): Promise<number> {
    const priorRequestEpochMs = await this.ctx.storage.get<number[]>("providerRequestEpochMs") ?? [];
    const next = authorizeProviderRateWindow({
      priorRequestEpochMs,
      nowEpochMs,
      maximumRequestsPerMinute,
    });
    await this.ctx.storage.put("providerRequestEpochMs", next);
    return next.length;
  }

  async reserveProviderTokens(input: {
    releaseId: string;
    batchId: string;
    attempt: number;
    inputTokens: number;
    authorizedTokens: number;
  }): Promise<{ duplicate: boolean; reservedTokens: number; remainingTokens: number }> {
    if (!/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(input.releaseId)
      || !/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(input.batchId)
      || !Number.isSafeInteger(input.attempt) || input.attempt < 1
      || !Number.isSafeInteger(input.inputTokens) || input.inputTokens < 1
      || !Number.isSafeInteger(input.authorizedTokens) || input.authorizedTokens < 1) {
      throw new CustomIndexPipelineError("CUSTOM_INDEX_PROVIDER_RESERVATION_INVALID");
    }
    const reservationKey = `providerReservation:${input.releaseId}:${input.batchId}:${input.attempt}`;
    return this.ctx.storage.transaction(async (transaction) => {
      const prior = await transaction.get<number>(reservationKey);
      const totalKey = `providerReservedTokens:${input.releaseId}`;
      const reservedTokens = await transaction.get<number>(totalKey) ?? 0;
      if (prior !== undefined) {
        if (prior !== input.inputTokens) {
          throw new CustomIndexPipelineError("CUSTOM_INDEX_PROVIDER_RESERVATION_CONFLICT");
        }
        return {
          duplicate: true,
          reservedTokens,
          remainingTokens: input.authorizedTokens - reservedTokens,
        };
      }
      if (reservedTokens + input.inputTokens > input.authorizedTokens) {
        throw new CustomIndexPipelineError("CUSTOM_INDEX_COST_STOP");
      }
      const next = reservedTokens + input.inputTokens;
      await transaction.put({ [reservationKey]: input.inputTokens, [totalKey]: next });
      return {
        duplicate: false,
        reservedTokens: next,
        remainingTokens: input.authorizedTokens - next,
      };
    });
  }

  async reduce(inputBytes: Uint8Array, expectedSha256: string): Promise<Uint8Array> {
    if (!SHA256.test(expectedSha256) || await sha256(inputBytes) !== expectedSha256) {
      throw new CustomIndexPipelineError("CUSTOM_INDEX_REDUCER_INPUT_CORRUPT");
    }
    const runtime = this.ctx.container;
    if (!runtime) throw new CustomIndexPipelineError("CUSTOM_INDEX_REDUCER_UNAVAILABLE");
    if (!runtime.running) await this.start();
    const process = await runtime.exec(["node", "-e", REDUCER_PROGRAM], {
      stdin: new ReadableStream({ start(controller) { controller.enqueue(inputBytes); controller.close(); } }),
    });
    const output = await process.output();
    if (output.exitCode !== 0 || output.stderr.byteLength > 0) {
      throw new CustomIndexPipelineError("CUSTOM_INDEX_REDUCER_FAILED");
    }
    return new Uint8Array(output.stdout);
  }
}

async function processSparse(env: PipelineEnv, message: CustomIndexBuildMessage): Promise<{
  checkpoint: CustomIndexCheckpoint;
  telemetry: ProcessingTelemetry;
}> {
  const inputBytes = await readVerifiedBytes(env.ARTIFACTS, message.inputLocator, message.inputSha256);
  const input = JSON.parse(decoder.decode(inputBytes)) as SparseInput;
  assertIdentity(input, message);
  if (!Array.isArray(input.records)) throw new CustomIndexPipelineError("CUSTOM_INDEX_SPARSE_INPUT_INVALID");
  const reducer = getContainer(env.REDUCER, `${message.releaseId}-${message.batchId}`);
  const outputBytes = await reducer.reduce(inputBytes, message.inputSha256);
  const outputSha256 = await sha256(outputBytes);
  const outputLocator = `releases/${message.releaseId}/outputs/${message.batchId}-${outputSha256}.json`;
  await putImmutableCustomArtifact(env.ARTIFACTS, outputLocator, outputBytes, {
    contentType: "application/json",
    customMetadata: { reducer: "node22-sort-v1", inputSha256: message.inputSha256 },
  });
  return {
    checkpoint: {
      batchId: message.batchId,
      lane: "sparse",
      inputSha256: message.inputSha256,
      outputLocator,
      outputSha256,
      vectorizeMutationId: null,
      providerInputTokens: 0,
    },
    telemetry: {
      r2Reads: 1,
      r2Bytes: inputBytes.byteLength,
      bm25Traversal: input.records.length,
    },
  };
}

type ReusePointer = {
  schemaVersion: 1;
  inputSha256: string;
  artifactKey: string;
  vectorSha256: string;
  sizeBytes: number;
};

async function processDense(
  env: PipelineEnv,
  message: CustomIndexBuildMessage,
): Promise<{ checkpoint: CustomIndexCheckpoint; telemetry: ProcessingTelemetry }> {
  const input = await readVerifiedJson<DenseInput>(env.ARTIFACTS, message.inputLocator, message.inputSha256);
  assertIdentity(input, message);
  const items = denseItems(input);
  for (const item of items) {
    if (!VECTOR_ID.test(item.vectorId) || !SHA256.test(item.metadataSha256)
      || !Number.isSafeInteger(item.inputTokens) || item.inputTokens <= 0
      || await sha256(JSON.stringify(item.metadata)) !== item.metadataSha256) {
      throw new CustomIndexPipelineError("CUSTOM_INDEX_DENSE_INPUT_INVALID");
    }
  }
  type PreparedDenseItem = {
    item: DenseItem;
    structuredInputSha256: string;
    reuseKey: string;
    pointer?: ReusePointer;
    artifactBytes?: Uint8Array;
  };
  const prepared: PreparedDenseItem[] = await Promise.all(items.map(async (item): Promise<PreparedDenseItem> => {
    const serialized = serializeCustomEmbeddingInput(item.chunk);
    const structuredInputSha256 = await sha256(serialized);
    const reuseKey = `embedding-reuse/${CUSTOM_EMBEDDING_MODEL}/${CUSTOM_EMBEDDING_DIMENSIONS}/${structuredInputSha256}.json`;
    const reuseObject = await env.ARTIFACTS.get(reuseKey);
    if (!reuseObject) return { item, structuredInputSha256, reuseKey };
    const pointerBytes = new Uint8Array(await reuseObject.arrayBuffer());
    if (reuseObject.customMetadata?.sha256 !== await sha256(pointerBytes)) {
      throw new CustomIndexPipelineError("CUSTOM_INDEX_REUSE_POINTER_CORRUPT");
    }
    const pointer = JSON.parse(decoder.decode(pointerBytes)) as ReusePointer;
    if (pointer.inputSha256 !== structuredInputSha256 || !SHA256.test(pointer.vectorSha256)) {
      throw new CustomIndexPipelineError("CUSTOM_INDEX_REUSE_POINTER_CORRUPT");
    }
    const artifactBytes = await readVerifiedBytes(env.ARTIFACTS, pointer.artifactKey, pointer.vectorSha256);
    return { item, structuredInputSha256, reuseKey, pointer, artifactBytes };
  }));
  const missing = prepared.filter((item) => !item.pointer);
  const reusedCount = prepared.length - missing.length;
  const providerInputTokens = 0;
  const providerLatencyMs = 0;
  assertOfflineEmbeddingArtifactsAvailable(missing.length);
  const vectorizeStartedAt = Date.now();
  const mutation = await env.DENSE.upsert(prepared.map(({ item, artifactBytes, pointer }) => ({
    id: item.vectorId,
    values: [...deserializeNormalizedEmbedding(artifactBytes!)],
    metadata: { ...item.metadata, metadata_sha256: item.metadataSha256, embedding_r2_key: pointer!.artifactKey },
  })));
  const vectorizeLatencyMs = Date.now() - vectorizeStartedAt;
  const output = {
    schemaVersion: 1,
    vectors: prepared.map(({ item, pointer }) => ({
      vectorId: item.vectorId,
      metadataSha256: item.metadataSha256,
      embeddingArtifactKey: pointer!.artifactKey,
      embeddingSha256: pointer!.vectorSha256,
    })),
    vectorizeMutationId: mutation.mutationId,
    providerInputTokens,
  };
  const outputBytes = encoder.encode(JSON.stringify(output));
  const outputSha256 = await sha256(outputBytes);
  const outputLocator = `releases/${message.releaseId}/outputs/${message.batchId}-${outputSha256}.json`;
  await putImmutableCustomArtifact(env.ARTIFACTS, outputLocator, outputBytes, {
    contentType: "application/json",
    customMetadata: { inputSha256: message.inputSha256, vectorCount: String(items.length) },
  });
  return {
    checkpoint: {
      batchId: message.batchId,
      lane: "dense",
      inputSha256: message.inputSha256,
      outputLocator,
      outputSha256,
      vectorizeMutationId: mutation.mutationId,
      providerInputTokens,
    },
    telemetry: {
      r2Reads: 1 + items.length + reusedCount,
      r2Bytes: prepared.reduce((sum, { pointer }) => sum + (pointer?.sizeBytes ?? 0), 0),
      providerLatencyMs,
      vectorizeLatencyMs,
    },
  };
}

async function processMessage(env: PipelineEnv, raw: unknown): Promise<void> {
  const message = parseBuildMessage(raw, env.APP_ENV);
  if (await existingCheckpoint(env, message)) {
    console.log(JSON.stringify(contentFreePipelineTelemetry({
      environment: message.environment,
      releaseId: message.releaseId,
      component: message.lane,
      status: "duplicate",
      r2Reads: 1,
      failureCode: null,
    })));
    return;
  }
  const planLocator = `releases/${message.releaseId}/plan.json`;
  const planObject = await env.ARTIFACTS.get(planLocator);
  if (!planObject) throw new CustomIndexPipelineError("CUSTOM_INDEX_PLAN_MISSING");
  const planBytes = new Uint8Array(await planObject.arrayBuffer());
  if (planObject.customMetadata?.sha256 !== await sha256(planBytes)) {
    throw new CustomIndexPipelineError("CUSTOM_INDEX_PLAN_CORRUPT");
  }
  const plan = JSON.parse(decoder.decode(planBytes)) as PipelinePlan;
  assertPlanNotExpired(plan.expiresAtEpochMs, Date.now());
  if (plan.environment !== message.environment || plan.releaseId !== message.releaseId
    || !plan.messages.some((candidate) => candidate.batchId === message.batchId
      && candidate.inputSha256 === message.inputSha256)) {
    throw new CustomIndexPipelineError("CUSTOM_INDEX_PLAN_IDENTITY_MISMATCH");
  }
  const processed = message.lane === "sparse"
    ? await processSparse(env, message)
    : await processDense(env, message);
  await writeCheckpoint(env, message, processed.checkpoint);
  console.log(JSON.stringify(contentFreePipelineTelemetry({
    environment: message.environment,
    releaseId: message.releaseId,
    component: message.lane,
    status: "complete",
    ...processed.telemetry,
    providerTokens: processed.checkpoint.providerInputTokens,
    vectorizeMutations: processed.checkpoint.vectorizeMutationId ? 1 : 0,
    failureCode: null,
  })));
}

async function checkpoints(env: PipelineEnv, plan: PipelinePlan): Promise<CustomIndexCheckpoint[]> {
  const results: CustomIndexCheckpoint[] = [];
  for (const message of plan.messages) {
    const checkpoint = await existingCheckpoint(env, message);
    if (!checkpoint) throw new CustomIndexPipelineError("CUSTOM_INDEX_CHECKPOINTS_INCOMPLETE");
    results.push(checkpoint);
  }
  return results;
}

export class CustomIndexBuildWorkflow extends WorkflowEntrypoint<PipelineEnv, WorkflowPayload> {
  async run(event: Readonly<WorkflowEvent<WorkflowPayload>>, step: WorkflowStep): Promise<unknown> {
    const payload = (typeof event.payload === "string"
      ? JSON.parse(event.payload) as WorkflowPayload
      : event.payload);
    const frozen = await step.do("freeze release identity", async () => {
      if (payload.schemaVersion !== 1 || payload.environment !== this.env.APP_ENV
        || !SHA256.test(payload.sourceRootSha256) || !SHA256.test(payload.planSha256)) {
        throw new CustomIndexPipelineError("CUSTOM_INDEX_WORKFLOW_IDENTITY_INVALID");
      }
      const plan = await readVerifiedJson<PipelinePlan>(this.env.ARTIFACTS, payload.planLocator, payload.planSha256);
      assertPlanNotExpired(plan.expiresAtEpochMs, Date.now());
      if (plan.environment !== payload.environment || plan.releaseId !== payload.releaseId
        || plan.sourceRootSha256 !== payload.sourceRootSha256) {
        throw new CustomIndexPipelineError("CUSTOM_INDEX_WORKFLOW_IDENTITY_INVALID");
      }
      return { releaseId: plan.releaseId, batchCount: plan.messages.length, sourceRootSha256: plan.sourceRootSha256 };
    });
    await step.do("dispatch bounded batches", async () => {
      const plan = await readVerifiedJson<PipelinePlan>(this.env.ARTIFACTS, payload.planLocator, payload.planSha256);
      assertPlanNotExpired(plan.expiresAtEpochMs, Date.now());
      for (let offset = 0; offset < plan.messages.length; offset += 100) {
        await this.env.BUILD_QUEUE.sendBatch(plan.messages.slice(offset, offset + 100).map((body) => ({ body })));
      }
      return { dispatched: plan.messages.length, planSha256: payload.planSha256 };
    });
    const terminal = await step.do("observe terminal checkpoints", {
      retries: { limit: 12, delay: "10 seconds", backoff: "constant" },
      timeout: "1 minute",
    }, async () => {
      const plan = await readVerifiedJson<PipelinePlan>(this.env.ARTIFACTS, payload.planLocator, payload.planSha256);
      const completed = await checkpoints(this.env, plan);
      const dense = completed.filter((item) => item.lane === "dense");
      const info = await this.env.DENSE.describe();
      const finalMutation = dense.at(-1)?.vectorizeMutationId ?? null;
      if (!finalMutation || String(info.processedUpToMutation) !== finalMutation) {
        throw new CustomIndexPipelineError("CUSTOM_INDEX_VECTORIZE_NOT_TERMINAL");
      }
      const listed = await this.env.DENSE.getByIds(plan.expectedVectorIds);
      assertReleaseSealable({
        expectedBatchIds: plan.messages.map(({ batchId }) => batchId),
        checkpoints: completed,
        mutationStatuses: new Map(dense.map(({ vectorizeMutationId }) => [vectorizeMutationId!, "processed"])),
        expectedVectorIds: plan.expectedVectorIds,
        listedVectors: listed.map(({ id, metadata }) => ({ id, metadataSha256: String(metadata?.metadata_sha256 ?? "") })),
        expectedVectorMetadata: new Map(Object.entries(plan.expectedVectorMetadata)),
      });
      if (info.vectorCount !== plan.expectedVectorIds.length) {
        throw new CustomIndexPipelineError("CUSTOM_INDEX_VECTOR_INVENTORY_MISMATCH");
      }
      return {
        completedCount: completed.length,
        vectorCount: info.vectorCount,
        providerTokens: completed.reduce((sum, item) => sum + item.providerInputTokens, 0),
        finalMutation,
      };
    });
    await step.do("seal off-side release", async () => {
      const seal = {
        schemaVersion: 1,
        environment: payload.environment,
        releaseId: payload.releaseId,
        sourceRootSha256: payload.sourceRootSha256,
        planSha256: payload.planSha256,
        completedCount: terminal.completedCount,
        vectorCount: terminal.vectorCount,
        providerTokens: terminal.providerTokens,
        activationAuthorized: false,
      };
      await putImmutableCustomArtifact(
        this.env.ARTIFACTS,
        `releases/${payload.releaseId}/seal.json`,
        encoder.encode(JSON.stringify(seal)),
        { contentType: "application/json" },
      );
      return { sealLocator: `releases/${payload.releaseId}/seal.json`, activationAuthorized: false };
    });
    return { ...frozen, ...terminal, sealed: true, activationAuthorized: false };
  }
}

export default {
  async fetch(request: Request, env: PipelineEnv): Promise<Response> {
    const url = new URL(request.url);
    const noStore = { "cache-control": "private, no-store" };
    if (env.PROOF_MODE !== "true") return new Response(null, { status: 404, headers: noStore });
    if (request.method === "POST" && url.pathname === "/ticket24/seed") {
      const input = await request.json() as {
        objects: Array<{ key: string; bytesBase64: string; sha256: string; contentType: string }>;
      };
      if (!Array.isArray(input.objects) || input.objects.length > 20) {
        return Response.json({ error: "CUSTOM_INDEX_PROOF_SEED_INVALID" }, { status: 400, headers: noStore });
      }
      const stored = [];
      for (const item of input.objects) {
        const bytes = Uint8Array.from(atob(item.bytesBase64), (character) => character.charCodeAt(0));
        if (!SHA256.test(item.sha256) || await sha256(bytes) !== item.sha256) {
          throw new CustomIndexPipelineError("CUSTOM_INDEX_PROOF_SEED_HASH_MISMATCH");
        }
        stored.push(await putImmutableCustomArtifact(env.ARTIFACTS, item.key, bytes, {
          contentType: item.contentType,
          customMetadata: { proof: "ticket24" },
        }));
      }
      return Response.json({ stored }, { headers: noStore });
    }
    if (request.method === "POST" && url.pathname === "/ticket24/start" && env.BUILD_WORKFLOW) {
      const payload = await request.json() as WorkflowPayload;
      const instance = await env.BUILD_WORKFLOW.create({ id: `ticket24-${payload.releaseId}`, params: payload });
      return Response.json({ instanceId: instance.id }, { headers: noStore });
    }
    if (request.method === "POST" && url.pathname === "/ticket24/status" && env.BUILD_WORKFLOW) {
      const input = await request.json() as { instanceId: string };
      const status = await (await env.BUILD_WORKFLOW.get(input.instanceId)).status();
      return Response.json(status, { headers: noStore });
    }
    if (request.method === "POST" && url.pathname === "/ticket24/restore" && env.RESTORE_DENSE) {
      const payload = await request.json() as WorkflowPayload;
      const plan = await readVerifiedJson<PipelinePlan>(env.ARTIFACTS, payload.planLocator, payload.planSha256);
      if (plan.environment !== payload.environment || plan.releaseId !== payload.releaseId
        || plan.sourceRootSha256 !== payload.sourceRootSha256) {
        throw new CustomIndexPipelineError("CUSTOM_INDEX_RESTORE_IDENTITY_INVALID");
      }
      const mutations: string[] = [];
      const restored = new Set<string>();
      for (const message of plan.messages.filter(({ lane }) => lane === "dense")) {
        const input = await readVerifiedJson<DenseInput>(env.ARTIFACTS, message.inputLocator, message.inputSha256);
        assertIdentity(input, message);
        const vectors: VectorizeVector[] = [];
        for (const item of denseItems(input)) {
          if (restored.has(item.vectorId)) continue;
          if (!VECTOR_ID.test(item.vectorId) || !SHA256.test(item.metadataSha256)
            || await sha256(JSON.stringify(item.metadata)) !== item.metadataSha256) {
            throw new CustomIndexPipelineError("CUSTOM_INDEX_DENSE_INPUT_INVALID");
          }
          const structuredInputSha256 = await sha256(serializeCustomEmbeddingInput(item.chunk));
          const reuseKey = `embedding-reuse/${CUSTOM_EMBEDDING_MODEL}/${CUSTOM_EMBEDDING_DIMENSIONS}/${structuredInputSha256}.json`;
          const reuse = await env.ARTIFACTS.get(reuseKey);
          if (!reuse) throw new CustomIndexPipelineError("CUSTOM_INDEX_RESTORE_EMBEDDING_MISSING");
          const reuseBytes = new Uint8Array(await reuse.arrayBuffer());
          if (reuse.customMetadata?.sha256 !== await sha256(reuseBytes)) {
            throw new CustomIndexPipelineError("CUSTOM_INDEX_RESTORE_EMBEDDING_CORRUPT");
          }
          const pointer = JSON.parse(decoder.decode(reuseBytes)) as ReusePointer;
          if (pointer.inputSha256 !== structuredInputSha256 || !SHA256.test(pointer.vectorSha256)) {
            throw new CustomIndexPipelineError("CUSTOM_INDEX_RESTORE_EMBEDDING_CORRUPT");
          }
          const embedding = await readVerifiedBytes(env.ARTIFACTS, pointer.artifactKey, pointer.vectorSha256);
          vectors.push({
            id: item.vectorId,
            values: [...deserializeNormalizedEmbedding(embedding)],
            metadata: { ...item.metadata, metadata_sha256: item.metadataSha256, embedding_r2_key: pointer.artifactKey },
          });
          restored.add(item.vectorId);
        }
        if (vectors.length > 0) {
          const mutation = await env.RESTORE_DENSE.upsert(vectors);
          mutations.push(mutation.mutationId);
        }
      }
      return Response.json({ restored: restored.size, mutationIds: mutations, providerTokens: 0 }, { headers: noStore });
    }
    if (request.method === "POST" && url.pathname === "/ticket24/restore-probe" && env.RESTORE_DENSE) {
      const input = await request.json() as WorkflowPayload & { vectorId: string; termHash: string };
      const plan = await readVerifiedJson<PipelinePlan>(env.ARTIFACTS, input.planLocator, input.planSha256);
      if (plan.environment !== input.environment || plan.releaseId !== input.releaseId
        || plan.sourceRootSha256 !== input.sourceRootSha256) {
        throw new CustomIndexPipelineError("CUSTOM_INDEX_RESTORE_IDENTITY_INVALID");
      }
      const sparseScores = new Map<string, number>();
      for (const message of plan.messages.filter(({ lane }) => lane === "sparse")) {
        const checkpoint = await existingCheckpoint(env, message);
        if (!checkpoint) throw new CustomIndexPipelineError("CUSTOM_INDEX_RESTORE_SPARSE_MISSING");
        const output = await readVerifiedJson<{ records: SparseRecord[] }>(
          env.ARTIFACTS, checkpoint.outputLocator, checkpoint.outputSha256,
        );
        for (const record of output.records.filter(({ termHash }) => termHash === input.termHash)) {
          sparseScores.set(record.itemKey, (sparseScores.get(record.itemKey) ?? 0) + record.termFrequency);
        }
      }
      const sparse = [...sparseScores].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .map(([itemKey]) => itemKey);
      const dense = await env.RESTORE_DENSE.queryById(input.vectorId, { topK: 50, returnMetadata: "all" });
      const denseIds = dense.matches.map(({ id }) => String(id));
      const hybrid = fuseCustomRankedLanes([sparse, denseIds], { k: 60, topK: 50 });
      return Response.json({
        sparseCount: sparse.length,
        denseCount: dense.count,
        hybridCount: hybrid.length,
        topItemKey: hybrid[0]?.itemKey ?? null,
      }, { headers: noStore });
    }
    if (request.method === "GET" && url.pathname === "/ticket24/inventory") {
      const objects: Array<{ key: string; size: number; sha256: string | null }> = [];
      let cursor: string | undefined;
      do {
        const page = await env.ARTIFACTS.list({ ...(cursor ? { cursor } : {}), include: ["customMetadata"] });
        objects.push(...page.objects.map((item) => ({
          key: item.key, size: item.size, sha256: item.customMetadata?.sha256 ?? null,
        })));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      objects.sort((left, right) => left.key.localeCompare(right.key));
      return Response.json({ objects, inventorySha256: await sha256(JSON.stringify(objects)) }, { headers: noStore });
    }
    if (request.method === "GET" && url.pathname === "/ticket24/checkpoints") {
      const releaseId = url.searchParams.get("release") ?? "";
      if (!/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(releaseId)) {
        return Response.json({ error: "CUSTOM_INDEX_RELEASE_ID_INVALID" }, { status: 400, headers: noStore });
      }
      const page = await env.ARTIFACTS.list({ prefix: `releases/${releaseId}/checkpoints/` });
      if (page.truncated) throw new CustomIndexPipelineError("CUSTOM_INDEX_PROOF_CHECKPOINT_PAGE_TRUNCATED");
      const values = [];
      for (const item of page.objects.sort((left, right) => left.key.localeCompare(right.key))) {
        const object = await env.ARTIFACTS.get(item.key);
        if (!object) throw new CustomIndexPipelineError("CUSTOM_INDEX_CHECKPOINT_MISSING");
        values.push(await object.json<CustomIndexCheckpoint>());
      }
      return Response.json({ checkpoints: values }, { headers: noStore });
    }
    return new Response(null, { status: 404, headers: noStore });
  },
  async queue(batch: MessageBatch<unknown>, env: PipelineEnv): Promise<void> {
    for (const message of batch.messages) {
      try {
        await processMessage(env, message.body);
        message.ack();
      } catch (error) {
        const failureCode = error instanceof CustomIndexPipelineError ? error.code : "CUSTOM_INDEX_UNEXPECTED";
        console.error(JSON.stringify(contentFreePipelineTelemetry({
          environment: env.APP_ENV,
          releaseId: "unknown-release",
          component: "consumer",
          status: "failed",
          failureCode,
        })));
        message.retry({ delaySeconds: 10 });
      }
    }
  },
} satisfies ExportedHandler<PipelineEnv, unknown>;
