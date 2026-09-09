import {
  DurableObject,
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { Container, getContainer } from "@cloudflare/containers";
export { ContainerProxy } from "@cloudflare/containers";
import type { CustomHistoryBindings } from "./legal-custom-history-env";
import {
  acceptedHistoricalManifestSchema,
  acceptedHistoricalPageSchema,
  acceptedHistoricalPlanItems,
  readAcceptedHistoricalDocumentTitles,
  readAcceptedHistoricalMetadata,
  readAcceptedObject,
} from "../lib/legal-corpus/accepted-current-inputs";
import { DocumentEmbeddingLedger, ensureDocumentEmbeddings, importDocumentEmbedding,
  readDocumentEmbedding, type DocumentEmbeddingInput } from "../lib/legal-corpus/document-embedding-build";
import { requestGatewayDocumentEmbeddings } from "../lib/legal-corpus/document-embedding-build";
import { reconcileDocumentEmbeddings } from "../lib/legal-corpus/document-embedding-build";

import {
  customCurrentSha256,
  ensureCustomCurrentReduction,
  materializeCustomCurrentItem,
  partitionCustomBm25IntermediateRecords,
  serializeCustomCurrentArtifact,
  type CustomCurrentDenseItem,
} from "../lib/legal-corpus/custom-current-build";
import {
  deserializeNormalizedEmbedding,
  mapCustomArtifactOperations,
  putImmutableCustomArtifact,
} from "../lib/legal-corpus/custom-hybrid-index";
import {
  CustomIndexPipelineError,
  contentFreePipelineTelemetry,
  type CustomMaterializationStage,
} from "../lib/legal-corpus/custom-index-pipeline";
import {
  reconcileCustomReleasePages,
  type CustomReleasePageReceipt,
} from "../lib/legal-corpus/custom-release-manifest";
import { stableSourceSnapshotJson } from "../lib/legal-corpus/source-snapshot";
import { CUSTOM_SEARCH_PATH, handleCustomSearchRequest }
  from "../lib/legal-corpus/custom-search-service";
import { CUSTOM_CURRENT_REDUCER_PROGRAM } from "./legal-custom-bm25-reducer-program";

const RELEASE_ID = "release:staging:history:custom-v1:2026-09-06";
const SOURCE_SNAPSHOT_ID = "ticket29:cutoff-20260831:complete-corpus-v2";
const SOURCE_ROOT_SHA256 = "9d904b7ef4ba3efe6299731ad421e4800a6d12c1ac78db5509f1e6ef58701f33";
const EXPECTED_SOURCE_COUNT = 1_295_149;
const PLAN_PAGE_SIZE = 500;
// The accepted pages bound this at 561 chunks and 334,442 recorded tokens per unit.
// It also keeps 12,952 reducer references below the proven current build's 16,098.
const MATERIALIZE_BATCH_SIZE = 100;
const SEGMENT_ID = "history-base-v1" as const;
const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,299}$/u;
const decoder = new TextDecoder("utf-8", { fatal: true });

type BuildWorkflowPayload = {
  schemaVersion: 1;
  releaseId: typeof RELEASE_ID;
  sourceSnapshotId: typeof SOURCE_SNAPSHOT_ID;
  sourceRootSha256: typeof SOURCE_ROOT_SHA256;
};

type ReduceWorkflowPayload = BuildWorkflowPayload & {
  expectedPageCount: number;
  planInventorySha256: string;
};

type MaterializeMessage = {
  schemaVersion: 1;
  kind: "materialize";
  releaseId: typeof RELEASE_ID;
  batchId: string;
  sourceOrdinalStart: number;
  sourceCount: number;
  planPageKey: string;
  planPageSha256: string;
  planPageOffset: number;
};

type SourcePlanPage = {
  schemaVersion: 1;
  releaseId: typeof RELEASE_ID;
  sourceSnapshotId: typeof SOURCE_SNAPSHOT_ID;
  sourceOrdinalStart: number;
  acceptedInputManifestSha256: string;
  items: ReturnType<typeof acceptedHistoricalPlanItems>;
};

type DispatchCheckpoint = {
  schemaVersion: 1;
  releaseId: typeof RELEASE_ID;
  sourceRootSha256: typeof SOURCE_ROOT_SHA256;
  acceptedPageSha256: string;
  planPage: { key: string; sha256: string; count: number; start: number };
};

type HistoryBuildEnv = Pick<CustomHistoryBindings, "AI" | "AI_GATEWAY_ID" | "DOCUMENT_EMBEDDINGS_ENABLED"
  | "ACCEPTED_INPUT_MANIFEST_KEY" | "ACCEPTED_INPUT_MANIFEST_SHA256" | "OPENAI_REQUESTS_PER_MINUTE"
  | "OPENAI_TOKENS_PER_MINUTE" | "AUTHORIZED_PROVIDER_TOKENS" | "AUTHORIZED_EMBEDDING_RECONCILIATION_SHA256" | "SOURCE_DB" | "REUSABLE_ARTIFACTS"
  | "EVIDENCE" | "ARTIFACTS"> & {
  APP_ENV: "staging";
  // The shared runtime declarations retain the legacy VectorizeIndex name; this index uses asynchronous V2 mutations.
  DENSE: Vectorize;
  BUILD_QUEUE: Queue<MaterializeMessage>;
  BUILD_WORKFLOW: Workflow<BuildWorkflowPayload>;
  REDUCE_WORKFLOW: Workflow<ReduceWorkflowPayload>;
  COORDINATOR: DurableObjectNamespace<CustomHistoryBuildCoordinator>;
  REDUCER: DurableObjectNamespace<CustomHistoryBm25ReducerContainer>;
  CATALOG_DB: D1Database;
  CUSTOM_SEARCH_CAPABILITY: "history";
  CUSTOM_SEARCH_RELEASE_ID: string;
  CUSTOM_SEARCH_INSTANCE_ID: string;
  CUSTOM_SEARCH_SHARD_ID: string;
  CUSTOM_RUNTIME_DESCRIPTOR_KEY: string;
  CUSTOM_RUNTIME_DESCRIPTOR_SHA256: string;
};

function requireBuildEnabled(env: HistoryBuildEnv): void {
  if (env.DOCUMENT_EMBEDDINGS_ENABLED !== "true" || env.APP_ENV !== "staging"
    || env.AI_GATEWAY_ID !== "juro-ai-search-staging") throw new CustomIndexPipelineError("CUSTOM_EMBEDDING_DISABLED");
}

async function loadAcceptedManifest(env: HistoryBuildEnv) {
  const bytes = await readAcceptedObject(env.ARTIFACTS,
    { key: env.ACCEPTED_INPUT_MANIFEST_KEY, sha256: env.ACCEPTED_INPUT_MANIFEST_SHA256 }, 1024 * 1024);
  const manifest = acceptedHistoricalManifestSchema.parse(JSON.parse(decoder.decode(bytes)));
  if (manifest.completeCorpusRunId !== SOURCE_SNAPSHOT_ID
    || manifest.sourceRootSha256 !== SOURCE_ROOT_SHA256 || manifest.sourceCount !== EXPECTED_SOURCE_COUNT
    || manifest.auditReportSha256 !== "96fdd22c289d9ff0f35eb380dcfbb1bb94cf54b9b43b9db0dc0bbb6d2ea6ef4d"
    || manifest.inputInventorySha256 !== "a7e317302c0221e200f73b65a11506e781eae3e782e939d31b96554a19bae90f"
    || manifest.mappingSha256 !== "78b50ad87998cb8b6ccda6dcde28cf17f6a6a3542afd918f7a485edf0d619905"
    || manifest.canonicalSha256 !== "e527fa5221acf6063defa5f944d9ef54ca7e8b2667c47df34ba8135ef879f830"
    || manifest.reconstructionSha256 !== "01a5603aea2b3b20272c53bf72affc5127bf8d63a845be08bd572078b60c09b7"
    || manifest.historyManifestSha256 !== "07c0486d91c64e6a0e1d33b3fce63402063f0ba26a7e32f3558c0a880dfc2997"
    || manifest.chunkCount !== 1_725_068 || manifest.missingTokens !== 15_042_720) {
    throw new CustomIndexPipelineError("CUSTOM_CURRENT_ACCEPTED_ROOT_MISMATCH");
  }
  return manifest;
}

let acceptedManifestPromise: ReturnType<typeof loadAcceptedManifest> | undefined;
function acceptedManifest(env: HistoryBuildEnv) {
  return acceptedManifestPromise ??= loadAcceptedManifest(env);
}

let acceptedTitlesPromise: ReturnType<typeof readAcceptedHistoricalDocumentTitles> | undefined;
async function acceptedTitles(env: HistoryBuildEnv) {
  const manifest = await acceptedManifest(env);
  return acceptedTitlesPromise ??= readAcceptedHistoricalDocumentTitles(
    env.ARTIFACTS, manifest.documentTitles, SOURCE_ROOT_SHA256,
  );
}

function planPageKey(sourceOrdinalStart: number): string {
  return `search-releases/${RELEASE_ID}/plan/pages/${String(sourceOrdinalStart).padStart(6, "0")}.json`;
}

function receiptKey(batchId: string): string {
  return `search-releases/${RELEASE_ID}/receipts/${batchId}.json`;
}

function dispatchCheckpointKey(sourceOrdinalStart: number, acceptedPageSha256: string): string {
  return `search-releases/${RELEASE_ID}/plan/dispatch/${String(sourceOrdinalStart).padStart(7, "0")}-${acceptedPageSha256}.json`;
}

function parsePositiveInteger(value: string, code: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new CustomIndexPipelineError(code);
  return parsed;
}

async function verifiedJson<T>(bucket: R2Bucket, key: string, expectedSha256: string): Promise<T> {
  if (!SHA256.test(expectedSha256)) throw new CustomIndexPipelineError("CUSTOM_CURRENT_HASH_INVALID");
  const object = await bucket.get(key);
  if (!object) throw new CustomIndexPipelineError("CUSTOM_CURRENT_R2_OBJECT_MISSING");
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (object.customMetadata?.sha256 !== expectedSha256
    || await customCurrentSha256(bytes) !== expectedSha256) {
    throw new CustomIndexPipelineError("CUSTOM_CURRENT_R2_OBJECT_CORRUPT");
  }
  return JSON.parse(decoder.decode(bytes)) as T;
}

async function existingDispatchCheckpoint(
  bucket: R2Bucket,
  key: string,
): Promise<DispatchCheckpoint | null> {
  const object = await bucket.get(key);
  if (!object) return null;
  const sha256 = object.customMetadata?.sha256;
  if (!sha256 || !SHA256.test(sha256)) {
    throw new CustomIndexPipelineError("CUSTOM_HISTORY_DISPATCH_CHECKPOINT_CORRUPT");
  }
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (await customCurrentSha256(bytes) !== sha256) {
    throw new CustomIndexPipelineError("CUSTOM_HISTORY_DISPATCH_CHECKPOINT_CORRUPT");
  }
  const checkpoint = JSON.parse(decoder.decode(bytes)) as DispatchCheckpoint;
  if (checkpoint.schemaVersion !== 1 || checkpoint.releaseId !== RELEASE_ID
    || checkpoint.sourceRootSha256 !== SOURCE_ROOT_SHA256) {
    throw new CustomIndexPipelineError("CUSTOM_HISTORY_DISPATCH_CHECKPOINT_CORRUPT");
  }
  return checkpoint;
}

type ReducerArtifactReference = { key: string; sizeBytes: number; sha256: string };
type ReducerRequest = {
  schemaVersion: 1;
  releaseId: typeof RELEASE_ID;
  segmentId: typeof SEGMENT_ID;
  mode: "documents" | "partition" | "manifest";
  outputPrefix: string;
  plan: ReducerArtifactReference;
  partition?: string;
  documents?: ReducerArtifactReference;
};
type ReducerReport = {
  schemaVersion: 1;
  kind: "documents" | "partition" | "manifest";
  releaseId: typeof RELEASE_ID;
  artifact?: ReducerArtifactReference;
  statistics?: { documentCount: number; averageFieldLengths: Record<string, number> };
  partition?: string;
  postings?: ReducerArtifactReference;
  lexicon?: ReducerArtifactReference;
  sourceRecordCount?: number;
  termCount?: number;
  postingCount?: number;
  documentCount?: number;
  partitionCount?: number;
};

function decodeR2Key(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new CustomIndexPipelineError("CUSTOM_CURRENT_REDUCER_KEY_INVALID");
  }
  const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const key = decoder.decode(bytes);
  if (!key.startsWith(`search-releases/${RELEASE_ID}/`)
    || key.includes("..") || key.startsWith("/") || key.length > 1_024) {
    throw new CustomIndexPipelineError("CUSTOM_CURRENT_REDUCER_KEY_INVALID");
  }
  return key;
}

function sha256Bytes(value: string): Uint8Array {
  if (!SHA256.test(value)) throw new CustomIndexPipelineError("CUSTOM_CURRENT_HASH_INVALID");
  return Uint8Array.from(value.match(/../gu)!, (pair) => Number.parseInt(pair, 16));
}

async function reducerR2Outbound(request: Request, untypedEnv: Cloudflare.Env): Promise<Response> {
  const env = untypedEnv as unknown as HistoryBuildEnv;
  const url = new URL(request.url);
  const [operation, encodedKey, extra] = url.pathname.slice(1).split("/");
  if (extra !== undefined || !encodedKey || url.search || url.hash) {
    return new Response(null, { status: 400 });
  }
  let key: string;
  try { key = decodeR2Key(encodedKey); } catch { return new Response(null, { status: 400 }); }
  if (operation === "object" && request.method === "GET") {
    const expectedSha256 = request.headers.get("x-expected-sha256") ?? "";
    if (!SHA256.test(expectedSha256)) return new Response(null, { status: 400 });
    const object = await env.ARTIFACTS.get(key);
    if (!object) return new Response(null, { status: 404 });
    if (object.customMetadata?.sha256 !== expectedSha256) {
      return new Response(null, { status: 409 });
    }
    return new Response(object.body, {
      headers: { "content-type": object.httpMetadata?.contentType ?? "application/octet-stream" },
    });
  }
  if (operation === "output" && request.method === "PUT") {
    const sha256 = request.headers.get("x-content-sha256") ?? "";
    const sizeBytes = Number(request.headers.get("content-length"));
    if (!SHA256.test(sha256) || !Number.isSafeInteger(sizeBytes) || sizeBytes < 1
      || !key.startsWith(`search-releases/${RELEASE_ID}/sparse/word-v1/reduced/`)
      || !key.includes(sha256) || !request.body) {
      return new Response(null, { status: 400 });
    }
    const prior = await env.ARTIFACTS.head(key);
    if (prior) {
      if (prior.size !== sizeBytes || prior.customMetadata?.sha256 !== sha256
        || prior.checksums.sha256 === undefined
        || [...new Uint8Array(prior.checksums.sha256)]
          .map((byte) => byte.toString(16).padStart(2, "0")).join("") !== sha256) {
        return new Response(null, { status: 409 });
      }
    } else {
      const stored = await env.ARTIFACTS.put(key, request.body, {
        onlyIf: { etagDoesNotMatch: "*" },
        sha256: sha256Bytes(sha256),
        httpMetadata: { contentType: "application/json" },
        customMetadata: { sha256, kind: "word-bm25-reduced" },
      });
      if (!stored) {
        const raced = await env.ARTIFACTS.head(key);
        if (!raced || raced.size !== sizeBytes || raced.customMetadata?.sha256 !== sha256) {
          return new Response(null, { status: 409 });
        }
      } else if (stored.size !== sizeBytes) {
        return new Response(null, { status: 409 });
      }
    }
    return Response.json({ key, sizeBytes, sha256 });
  }
  return new Response(null, { status: 405 });
}

export class CustomHistoryBm25ReducerContainer extends Container {
  entrypoint = ["sh", "-c", "while :; do sleep 3600; done"];
  enableInternet = false;
  sleepAfter = "10m";

  async reduce(input: ReducerRequest): Promise<ReducerReport> {
    if (input.schemaVersion !== 1 || input.releaseId !== RELEASE_ID
      || !input.outputPrefix.startsWith(`search-releases/${RELEASE_ID}/sparse/word-v1/reduced`)) {
      throw new CustomIndexPipelineError("CUSTOM_CURRENT_REDUCER_REQUEST_INVALID");
    }
    const runtime = this.ctx.container;
    if (!runtime) throw new CustomIndexPipelineError("CUSTOM_CURRENT_REDUCER_UNAVAILABLE");
    if (!runtime.running) await this.start();
    const bytes = serializeCustomCurrentArtifact(input);
    const process = await runtime.exec([
      "node", "--input-type=module", "-e", CUSTOM_CURRENT_REDUCER_PROGRAM,
    ], { stdin: new ReadableStream({
      start(controller) { controller.enqueue(bytes); controller.close(); },
    }) });
    const output = await process.output();
    if (output.exitCode !== 0 || output.stderr.byteLength > 0) {
      throw new CustomIndexPipelineError("CUSTOM_CURRENT_REDUCER_FAILED");
    }
    const report = JSON.parse(decoder.decode(output.stdout)) as ReducerReport;
    if (report.schemaVersion !== 1 || report.releaseId !== RELEASE_ID || report.kind !== input.mode) {
      throw new CustomIndexPipelineError("CUSTOM_CURRENT_REDUCER_REPORT_INVALID");
    }
    return report;
  }
}

CustomHistoryBm25ReducerContainer.outboundByHost = {
  "artifacts.r2": reducerR2Outbound,
};

function parseMessage(raw: unknown): MaterializeMessage {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new CustomIndexPipelineError("CUSTOM_CURRENT_MESSAGE_INVALID");
  }
  const value = raw as Partial<MaterializeMessage>;
  if (value.schemaVersion !== 1 || value.kind !== "materialize" || value.releaseId !== RELEASE_ID
    || !SAFE_ID.test(value.batchId ?? "") || !Number.isSafeInteger(value.sourceOrdinalStart)
    || Number(value.sourceOrdinalStart) < 0 || !Number.isSafeInteger(value.sourceCount)
    || Number(value.sourceCount) < 1 || Number(value.sourceCount) > MATERIALIZE_BATCH_SIZE
    || !Number.isSafeInteger(value.planPageOffset) || Number(value.planPageOffset) < 0
    || typeof value.planPageKey !== "string" || !SHA256.test(value.planPageSha256 ?? "")) {
    throw new CustomIndexPipelineError("CUSTOM_CURRENT_MESSAGE_INVALID");
  }
  return value as MaterializeMessage;
}

function coordinator(env: HistoryBuildEnv): DurableObjectStub<CustomHistoryBuildCoordinator> {
  return env.COORDINATOR.getByName(RELEASE_ID);
}

export class CustomHistoryBuildCoordinator extends DurableObject<HistoryBuildEnv> {
  async reconcileEmbeddings(input: { decisionJson: string; supplementalInputs: DocumentEmbeddingInput[] }) {
    requireBuildEnabled(this.env);
    return reconcileDocumentEmbeddings({ ...input, authorizedDecisionSha256: this.env.AUTHORIZED_EMBEDDING_RECONCILIATION_SHA256,
      configuration: {
        environment: this.env.APP_ENV, releaseId: RELEASE_ID, manifestSha256: this.env.ACCEPTED_INPUT_MANIFEST_SHA256,
        enabled: true, authorizedTokens: parsePositiveInteger(this.env.AUTHORIZED_PROVIDER_TOKENS, "CUSTOM_EMBEDDING_COST_STOP"),
        requestsPerMinute: parsePositiveInteger(this.env.OPENAI_REQUESTS_PER_MINUTE, "CUSTOM_EMBEDDING_RATE_INVALID"),
        tokensPerMinute: parsePositiveInteger(this.env.OPENAI_TOKENS_PER_MINUTE, "CUSTOM_EMBEDDING_RATE_INVALID"),
      }, storage: this.ctx.storage, bucket: this.env.ARTIFACTS,
      provider: request => requestGatewayDocumentEmbeddings(this.env.AI.gateway(this.env.AI_GATEWAY_ID), this.env.AI_GATEWAY_ID, request) });
  }

  async inspectEmbeddings(inputSha256s: string[]) {
    return new DocumentEmbeddingLedger(this.ctx.storage).inspect(inputSha256s);
  }

  async embed(input: { ownerId: string; items: DocumentEmbeddingInput[] }) {
    requireBuildEnabled(this.env);
    if (!SAFE_ID.test(input.ownerId) || input.items.length < 1 || input.items.length > 64) {
      throw new CustomIndexPipelineError("CUSTOM_EMBEDDING_REQUEST_INVALID");
    }
    const manifest = await acceptedManifest(this.env);
    const authorizedTokens = parsePositiveInteger(this.env.AUTHORIZED_PROVIDER_TOKENS, "CUSTOM_EMBEDDING_COST_STOP");
    if (authorizedTokens !== manifest.missingTokens) throw new CustomIndexPipelineError("CUSTOM_EMBEDDING_COST_STOP");
    for (const reference of manifest.reuse) {
      if (input.items.some(item => item.inputSha256 === reference.inputSha256)) {
        await importDocumentEmbedding(this.env.ARTIFACTS, this.env.REUSABLE_ARTIFACTS, reference);
      }
    }
    return ensureDocumentEmbeddings({ configuration: {
      environment: this.env.APP_ENV, releaseId: RELEASE_ID, manifestSha256: this.env.ACCEPTED_INPUT_MANIFEST_SHA256,
      enabled: true, authorizedTokens,
      requestsPerMinute: parsePositiveInteger(this.env.OPENAI_REQUESTS_PER_MINUTE, "CUSTOM_EMBEDDING_RATE_INVALID"),
      tokensPerMinute: parsePositiveInteger(this.env.OPENAI_TOKENS_PER_MINUTE, "CUSTOM_EMBEDDING_RATE_INVALID"),
    }, ledger: new DocumentEmbeddingLedger(this.ctx.storage), bucket: this.env.ARTIFACTS,
    inputs: input.items, ownerId: input.ownerId, provider: request => requestGatewayDocumentEmbeddings(
      this.env.AI.gateway(this.env.AI_GATEWAY_ID), this.env.AI_GATEWAY_ID, request) });
  }

  async initialize(input: {
    releaseId: string;
    sourceRootSha256: string;
    expectedSourceCount: number;
    expectedPageCount: number;
    authorizedProviderTokens: number;
  }): Promise<void> {
    if (input.releaseId !== RELEASE_ID || input.sourceRootSha256 !== SOURCE_ROOT_SHA256
      || input.expectedSourceCount !== EXPECTED_SOURCE_COUNT
      || !Number.isSafeInteger(input.expectedPageCount) || input.expectedPageCount < 1
      || !Number.isSafeInteger(input.authorizedProviderTokens) || input.authorizedProviderTokens < 1) {
      throw new CustomIndexPipelineError("CUSTOM_CURRENT_COORDINATOR_IDENTITY_INVALID");
    }
    const existing = await this.ctx.storage.get<typeof input>("configuration");
    if (existing && stableSourceSnapshotJson(existing) !== stableSourceSnapshotJson(input)) {
      throw new CustomIndexPipelineError("CUSTOM_CURRENT_COORDINATOR_IDENTITY_CONFLICT");
    }
    if (!existing) await this.ctx.storage.put("configuration", input);
  }

  async finalizePlan(input: { pageCount: number; planInventorySha256: string }): Promise<void> {
    if (!Number.isSafeInteger(input.pageCount) || input.pageCount < 1
      || !SHA256.test(input.planInventorySha256)) {
      throw new CustomIndexPipelineError("CUSTOM_CURRENT_PLAN_ROOT_INVALID");
    }
    const prior = await this.ctx.storage.get<typeof input>("plan");
    if (prior && stableSourceSnapshotJson(prior) !== stableSourceSnapshotJson(input)) {
      throw new CustomIndexPipelineError("CUSTOM_CURRENT_PLAN_ROOT_CONFLICT");
    }
    if (!prior) await this.ctx.storage.put("plan", input);
    await this.scheduleReductionIfReady();
  }


  async completePage(receipt: CustomReleasePageReceipt, key: string): Promise<{ completed: number }> {
    if (receipt.releaseId !== RELEASE_ID || key !== receiptKey(receipt.batchId)) {
      throw new CustomIndexPipelineError("CUSTOM_CURRENT_RECEIPT_IDENTITY_INVALID");
    }
    const storageKey = `receipt:${receipt.batchId}`;
    const digest = await customCurrentSha256(stableSourceSnapshotJson(receipt));
    const completed = await this.ctx.storage.transaction(async (transaction) => {
      const prior = await transaction.get<{ digest: string; key: string }>(storageKey);
      if (prior) {
        if (prior.digest !== digest || prior.key !== key) {
          throw new CustomIndexPipelineError("CUSTOM_CURRENT_RECEIPT_CONFLICT");
        }
        return await transaction.get<number>("completedPages") ?? 0;
      }
      const current = await transaction.get<number>("completedPages") ?? 0;
      await transaction.put({
        [storageKey]: { digest, key },
        completedPages: current + 1,
        lastVectorizeMutationId: receipt.vectorizeMutationId,
      });
      return current + 1;
    });
    await this.scheduleReductionIfReady();
    return { completed };
  }

  async status(): Promise<Record<string, unknown>> {
    const [configuration, plan, completedPages, reductionStarted,
      lastVectorizeMutationId] = await Promise.all([
      this.ctx.storage.get("configuration"),
      this.ctx.storage.get("plan"),
      this.ctx.storage.get<number>("completedPages"),
      this.ctx.storage.get<boolean>("reductionStarted"),
      this.ctx.storage.get<string>("lastVectorizeMutationId"),
    ]);
    const embeddings = await new DocumentEmbeddingLedger(this.ctx.storage).status();
    return { configuration, plan, embeddings, completedPages: completedPages ?? 0,
      reservedProviderTokens: embeddings.reservedTokens, reductionStarted: reductionStarted ?? false,
      lastVectorizeMutationId: lastVectorizeMutationId ?? null };
  }

  private async scheduleReductionIfReady(): Promise<void> {
    const [configuration, plan, completedPages, started] = await Promise.all([
      this.ctx.storage.get<{ expectedPageCount: number }>("configuration"),
      this.ctx.storage.get<{ pageCount: number; planInventorySha256: string }>("plan"),
      this.ctx.storage.get<number>("completedPages"),
      this.ctx.storage.get<boolean>("reductionStarted"),
    ]);
    if (!configuration || !plan || started || completedPages !== configuration.expectedPageCount) return;
    await this.ctx.storage.setAlarm(Date.now());
  }

  override async alarm(): Promise<void> {
    requireBuildEnabled(this.env);
    const [configuration, plan, completedPages, started] = await Promise.all([
      this.ctx.storage.get<{ expectedPageCount: number }>("configuration"),
      this.ctx.storage.get<{ pageCount: number; planInventorySha256: string }>("plan"),
      this.ctx.storage.get<number>("completedPages"),
      this.ctx.storage.get<boolean>("reductionStarted"),
    ]);
    if (!configuration || !plan || started || completedPages !== configuration.expectedPageCount) return;
    try {
      await ensureCustomCurrentReduction(this.env.REDUCE_WORKFLOW, {
        schemaVersion: 1,
        releaseId: RELEASE_ID,
        sourceSnapshotId: SOURCE_SNAPSHOT_ID,
        sourceRootSha256: SOURCE_ROOT_SHA256,
        expectedPageCount: plan.pageCount,
        planInventorySha256: plan.planInventorySha256,
      });
      await this.ctx.storage.put("reductionStarted", true);
    } catch {
      await this.ctx.storage.setAlarm(Date.now() + 60_000);
      throw new CustomIndexPipelineError("CUSTOM_CURRENT_REDUCTION_START_FAILED");
    }
  }
}

function assertWorkflowPayload(payload: BuildWorkflowPayload): void {
  if (payload.schemaVersion !== 1 || payload.releaseId !== RELEASE_ID
    || payload.sourceSnapshotId !== SOURCE_SNAPSHOT_ID
    || payload.sourceRootSha256 !== SOURCE_ROOT_SHA256) {
    throw new CustomIndexPipelineError("CUSTOM_CURRENT_WORKFLOW_IDENTITY_INVALID");
  }
}

export class CustomHistoryBuildWorkflow extends WorkflowEntrypoint<HistoryBuildEnv, BuildWorkflowPayload> {
  override async run(event: Readonly<WorkflowEvent<BuildWorkflowPayload>>, step: WorkflowStep): Promise<unknown> {
    requireBuildEnabled(this.env);
    const payload = typeof event.payload === "string"
      ? JSON.parse(event.payload) as BuildWorkflowPayload
      : event.payload;
    assertWorkflowPayload(payload);
    const frozen = await step.do("verify frozen source and off-side identity", async () => {
      const [snapshot, release] = await Promise.all([
        this.env.CATALOG_DB.prepare(`SELECT run.status,run.source_canonical_sha256 AS canonicalSha256,
            run.final_reconstruction_sha256 AS reconstructionSha256,
            history.record_count AS memberCount,history.root_sha256 AS corpusHash,
            history.manifest_sha256 AS historyManifestSha256,
            gaps.record_count AS temporalGapCount,acceptance.result_sha256 AS acceptanceSha256,
            selected.current_release_id AS activeCurrentReleaseId
          FROM legal_historical_metadata_acceptances acceptance
          JOIN legal_complete_corpus_runs run ON run.id=acceptance.complete_corpus_run_id
          JOIN legal_complete_corpus_manifests history
            ON history.run_id=run.id AND history.membership='history'
          JOIN legal_complete_corpus_manifests gaps
            ON gaps.run_id=run.id AND gaps.membership='gaps'
          JOIN legal_active_activation_sets active ON active.environment=acceptance.environment
          JOIN legal_activation_sets selected ON selected.id=active.activation_set_id
          WHERE acceptance.environment='staging'`)
          .first<{ status: string; canonicalSha256: string; reconstructionSha256: string;
            memberCount: number; corpusHash: string; historyManifestSha256: string;
            temporalGapCount: number; acceptanceSha256: string; activeCurrentReleaseId: string }>(),
        this.env.CATALOG_DB.prepare("SELECT id FROM legal_search_releases WHERE id=?")
          .bind(RELEASE_ID).first<{ id: string }>(),
      ]);
      if (!snapshot || snapshot.corpusHash !== SOURCE_ROOT_SHA256
        || snapshot.memberCount !== EXPECTED_SOURCE_COUNT || snapshot.status !== "materialized"
        || snapshot.canonicalSha256 !== "e527fa5221acf6063defa5f944d9ef54ca7e8b2667c47df34ba8135ef879f830"
        || snapshot.reconstructionSha256 !== "01a5603aea2b3b20272c53bf72affc5127bf8d63a845be08bd572078b60c09b7"
        || snapshot.historyManifestSha256 !== "07c0486d91c64e6a0e1d33b3fce63402063f0ba26a7e32f3558c0a880dfc2997"
        || snapshot.temporalGapCount !== 4_679
        || snapshot.acceptanceSha256 !== "2fed46f06271c4b71f4e330ef30bf7cbbd4c87d4e3ed4416d27fe39d63e23bcc"
        || snapshot.activeCurrentReleaseId !== "release:staging:current:custom-v2:2026-09-05"
        || release) {
        throw new CustomIndexPipelineError("CUSTOM_CURRENT_SOURCE_NOT_FROZEN_OFFSIDE");
      }
      const expectedPageCount = Math.ceil(EXPECTED_SOURCE_COUNT / MATERIALIZE_BATCH_SIZE);
      await coordinator(this.env).initialize({
        releaseId: RELEASE_ID,
        sourceRootSha256: SOURCE_ROOT_SHA256,
        expectedSourceCount: EXPECTED_SOURCE_COUNT,
        expectedPageCount,
        authorizedProviderTokens: parsePositiveInteger(
          this.env.AUTHORIZED_PROVIDER_TOKENS,
          "CUSTOM_CURRENT_PROVIDER_BUDGET_INVALID",
        ),
      });
      return { expectedSourceCount: EXPECTED_SOURCE_COUNT, expectedPageCount };
    });

    const planned = await step.do("write immutable source plan and dispatch bounded work", {
      retries: { limit: 5, delay: "1 minute", backoff: "exponential" },
      timeout: "30 minutes",
    }, async () => {
      requireBuildEnabled(this.env);
      const accepted = await acceptedManifest(this.env);
      let sourceOrdinal = 0;
      const pageReferences: Array<{ key: string; sha256: string; count: number; start: number }> = [];
      for (const reference of accepted.pages) {
        if (reference.start !== sourceOrdinal
          || reference.count !== Math.min(PLAN_PAGE_SIZE, EXPECTED_SOURCE_COUNT - sourceOrdinal)) {
          throw new CustomIndexPipelineError("CUSTOM_CURRENT_ACCEPTED_PAGE_MISMATCH");
        }
        const dispatchKey = dispatchCheckpointKey(sourceOrdinal, reference.sha256);
        const dispatched = await existingDispatchCheckpoint(this.env.ARTIFACTS, dispatchKey);
        if (dispatched) {
          if (dispatched.acceptedPageSha256 !== reference.sha256
            || dispatched.planPage.start !== sourceOrdinal
            || dispatched.planPage.count !== reference.count
            || dispatched.planPage.key !== planPageKey(sourceOrdinal)
            || !SHA256.test(dispatched.planPage.sha256)) {
            throw new CustomIndexPipelineError("CUSTOM_HISTORY_DISPATCH_CHECKPOINT_CONFLICT");
          }
          pageReferences.push(dispatched.planPage);
          sourceOrdinal += reference.count;
          continue;
        }
        const acceptedPage = acceptedHistoricalPageSchema.parse(JSON.parse(decoder.decode(
          await readAcceptedObject(this.env.ARTIFACTS, reference, 8 * 1024 * 1024))));
        if (acceptedPage.start !== sourceOrdinal || acceptedPage.items.length !== reference.count) {
          throw new CustomIndexPipelineError("CUSTOM_CURRENT_ACCEPTED_PAGE_MISMATCH");
        }
        const items = acceptedHistoricalPlanItems(acceptedPage);
        const page: SourcePlanPage = {
          schemaVersion: 1,
          releaseId: RELEASE_ID,
          sourceSnapshotId: SOURCE_SNAPSHOT_ID,
          sourceOrdinalStart: sourceOrdinal,
          acceptedInputManifestSha256: this.env.ACCEPTED_INPUT_MANIFEST_SHA256,
          items,
        };
        const bytes = serializeCustomCurrentArtifact(page);
        const digest = await customCurrentSha256(bytes);
        const key = planPageKey(sourceOrdinal);
        await putImmutableCustomArtifact(this.env.ARTIFACTS, key, bytes, {
          contentType: "application/json",
          customMetadata: { kind: "source-plan-page", sourceRootSha256: SOURCE_ROOT_SHA256 },
        });
        const planPage = { key, sha256: digest, count: items.length, start: sourceOrdinal };
        pageReferences.push(planPage);
        const messages: Array<{ body: MaterializeMessage }> = [];
        for (let offset = 0; offset < items.length; offset += MATERIALIZE_BATCH_SIZE) {
          const sourceCount = Math.min(MATERIALIZE_BATCH_SIZE, items.length - offset);
          const start = sourceOrdinal + offset;
          messages.push({ body: {
            schemaVersion: 1,
            kind: "materialize",
            releaseId: RELEASE_ID,
            batchId: `source-${String(start).padStart(7, "0")}`,
            sourceOrdinalStart: start,
            sourceCount,
            planPageKey: key,
            planPageSha256: digest,
            planPageOffset: offset,
          } });
        }
        for (let offset = 0; offset < messages.length; offset += 100) {
          await this.env.BUILD_QUEUE.sendBatch(messages.slice(offset, offset + 100));
        }
        const checkpointBytes = serializeCustomCurrentArtifact({
          schemaVersion: 1,
          releaseId: RELEASE_ID,
          sourceRootSha256: SOURCE_ROOT_SHA256,
          acceptedPageSha256: reference.sha256,
          planPage,
        } satisfies DispatchCheckpoint);
        await putImmutableCustomArtifact(this.env.ARTIFACTS, dispatchKey, checkpointBytes, {
          contentType: "application/json",
          customMetadata: { kind: "source-plan-dispatch-checkpoint" },
        });
        sourceOrdinal += items.length;
      }
      if (sourceOrdinal !== frozen.expectedSourceCount) {
        throw new CustomIndexPipelineError("CUSTOM_CURRENT_PLAN_MEMBER_COUNT_MISMATCH");
      }
      const manifest = {
        schemaVersion: 1,
        releaseId: RELEASE_ID,
        sourceSnapshotId: SOURCE_SNAPSHOT_ID,
        sourceRootSha256: SOURCE_ROOT_SHA256,
        sourceCount: sourceOrdinal,
        materializeBatchSize: MATERIALIZE_BATCH_SIZE,
        pages: pageReferences,
      };
      const manifestBytes = serializeCustomCurrentArtifact(manifest);
      const planInventorySha256 = await customCurrentSha256(manifestBytes);
      await putImmutableCustomArtifact(
        this.env.ARTIFACTS,
        `search-releases/${RELEASE_ID}/plan/manifest-${planInventorySha256}.json`,
        manifestBytes,
        { contentType: "application/json", customMetadata: { kind: "source-plan-manifest" } },
      );
      await coordinator(this.env).finalizePlan({
        pageCount: frozen.expectedPageCount,
        planInventorySha256,
      });
      return { sourceCount: sourceOrdinal, planPageCount: pageReferences.length, planInventorySha256 };
    });
    return { ...frozen, ...planned, activationAuthorized: false };
  }
}

async function existingReceipt(env: HistoryBuildEnv, message: MaterializeMessage): Promise<CustomReleasePageReceipt | null> {
  const object = await env.ARTIFACTS.get(receiptKey(message.batchId));
  if (!object) return null;
  const bytes = new Uint8Array(await object.arrayBuffer());
  const digest = await customCurrentSha256(bytes);
  if (object.customMetadata?.sha256 !== digest) {
    throw new CustomIndexPipelineError("CUSTOM_CURRENT_RECEIPT_CORRUPT");
  }
  const receipt = JSON.parse(decoder.decode(bytes)) as CustomReleasePageReceipt;
  if (receipt.releaseId !== RELEASE_ID || receipt.batchId !== message.batchId
    || receipt.sourceOrdinalStart !== message.sourceOrdinalStart
    || receipt.sourceCount !== message.sourceCount) {
    throw new CustomIndexPipelineError("CUSTOM_CURRENT_RECEIPT_CONFLICT");
  }
  return receipt;
}


async function embedAndUpsert(
  env: HistoryBuildEnv,
  denseItems: CustomCurrentDenseItem[],
  ownerId: string,
  reportStage: (stage: CustomMaterializationStage) => void,
): Promise<{
  inventory: Array<{
    vectorId: string;
    metadataSha256: string;
    embeddingArtifactKey: string;
    embeddingSha256: string;
  }>;
  finalMutationId: string;
  mutationCount: number;
  providerInputTokens: number;
  reusedEmbeddingCount: number;
}> {
  let providerInputTokens = 0;
  let reusedEmbeddingCount = 0;
  let finalMutationId = "";
  let mutationCount = 0;
  const inventory: Array<{
    vectorId: string;
    metadataSha256: string;
    embeddingArtifactKey: string;
    embeddingSha256: string;
  }> = [];
  for (let offset = 0; offset < denseItems.length; offset += 64) {
    const group = denseItems.slice(offset, offset + 64);
    reportStage("embeddings");
    const result = await coordinator(env).embed({ ownerId,
      items: group.map(item => ({ chunk: item.chunk, inputSha256: item.structuredInputSha256, inputTokens: item.inputTokens })) });
    providerInputTokens = result.providerInputTokens;
    reusedEmbeddingCount += result.reusedEmbeddingCount;
    reportStage("embedding_artifacts");
    const prepared = await Promise.all(group.map(async (item) => ({
      item,
      pointer: await readDocumentEmbedding(env.ARTIFACTS, item.structuredInputSha256),
    })));
    // Promise.all preserves input order; build the immutable inventory before asynchronous vector reads.
    for (const { item, pointer } of prepared) {
      if (!pointer) throw new CustomIndexPipelineError("CUSTOM_CURRENT_EMBEDDING_MISSING");
      inventory.push({
        vectorId: item.vectorId,
        metadataSha256: item.metadataSha256,
        embeddingArtifactKey: pointer.artifactKey,
        embeddingSha256: pointer.vectorSha256,
      });
    }
    const vectors = await Promise.all(prepared.map(async ({ item, pointer }) => {
      if (!pointer) throw new CustomIndexPipelineError("CUSTOM_CURRENT_EMBEDDING_MISSING");
      const artifact = await env.ARTIFACTS.get(pointer.artifactKey);
      if (!artifact) throw new CustomIndexPipelineError("CUSTOM_CURRENT_EMBEDDING_MISSING");
      const bytes = new Uint8Array(await artifact.arrayBuffer());
      if (await customCurrentSha256(bytes) !== pointer.vectorSha256) throw new CustomIndexPipelineError("CUSTOM_CURRENT_EMBEDDING_CORRUPT");
      return {
        id: item.vectorId,
        values: [...deserializeNormalizedEmbedding(bytes)],
        metadata: {
          ...item.metadata,
          metadata_sha256: item.metadataSha256,
          embedding_r2_key: pointer.artifactKey,
        },
      } satisfies VectorizeVector;
    }));
    reportStage("vectorize");
    const mutation = await env.DENSE.upsert(vectors);
    finalMutationId = mutation.mutationId;
    mutationCount += 1;
  }
  if (!finalMutationId) throw new CustomIndexPipelineError("CUSTOM_CURRENT_VECTORIZE_MUTATION_MISSING");
  return { inventory, finalMutationId, mutationCount, providerInputTokens, reusedEmbeddingCount };
}

async function processMaterializeMessage(
  env: HistoryBuildEnv,
  raw: unknown,
  reportStage: (stage: CustomMaterializationStage) => void,
): Promise<{ duplicate: boolean; receipt: CustomReleasePageReceipt; mutationCount: number }> {
  requireBuildEnabled(env);
  const message = parseMessage(raw);
  const prior = await existingReceipt(env, message);
  if (prior) {
    reportStage("coordinator");
    await coordinator(env).completePage(prior, receiptKey(message.batchId));
    return { duplicate: true, receipt: prior, mutationCount: 0 };
  }
  reportStage("plan");
  const page = await verifiedJson<SourcePlanPage>(env.ARTIFACTS, message.planPageKey, message.planPageSha256);
  if (page.schemaVersion !== 1 || page.releaseId !== RELEASE_ID
    || page.acceptedInputManifestSha256 !== env.ACCEPTED_INPUT_MANIFEST_SHA256
    || page.sourceSnapshotId !== SOURCE_SNAPSHOT_ID
    || page.sourceOrdinalStart + message.planPageOffset !== message.sourceOrdinalStart) {
    throw new CustomIndexPipelineError("CUSTOM_CURRENT_PLAN_PAGE_IDENTITY_INVALID");
  }
  const planItems = page.items.slice(message.planPageOffset, message.planPageOffset + message.sourceCount);
  if (planItems.length !== message.sourceCount
    || planItems.some((item, index) => item.sourceOrdinal !== message.sourceOrdinalStart + index)) {
    throw new CustomIndexPipelineError("CUSTOM_CURRENT_PLAN_PAGE_RANGE_INVALID");
  }
  reportStage("evidence");
  const acceptedSources = planItems.map(item => {
    if (!item.accepted) throw new CustomIndexPipelineError("CUSTOM_CURRENT_ACCEPTED_SOURCE_MISSING");
    return item.accepted;
  });
  const acceptedMetadata = await readAcceptedHistoricalMetadata(
    acceptedSources, await acceptedTitles(env), env.SOURCE_DB,
  );
  const materialized: Awaited<ReturnType<typeof materializeCustomCurrentItem>>[] = [];
  for (const planItem of planItems) {
    if (!planItem.accepted) throw new CustomIndexPipelineError("CUSTOM_CURRENT_ACCEPTED_SOURCE_MISSING");
    const evidenceBytes = await readAcceptedObject(env.EVIDENCE, planItem.accepted.provision, 8 * 1024 * 1024);
    materialized.push(await materializeCustomCurrentItem({
      releaseId: RELEASE_ID,
      segmentId: SEGMENT_ID,
      planItem,
      evidenceBytes,
      acceptedMetadata: acceptedMetadata.get(planItem.accepted.sourceId),
    }));
  }
  const chunks = materialized.flatMap((item) => item.chunks);
  const denseItems = materialized.flatMap((item) => item.denseItems);
  const sparseRecords = materialized.flatMap((item) => item.sparseRecords);
  const documentFieldLengths = materialized.flatMap((item) => item.documentFieldLengths);
  if (new Set(chunks.map(({ id }) => id)).size !== chunks.length
    || new Set(denseItems.map(({ vectorId }) => vectorId)).size !== denseItems.length) {
    throw new CustomIndexPipelineError("CUSTOM_CURRENT_BATCH_DUPLICATE_IDENTITY");
  }
  reportStage("chunks");
  const chunkInventory = await mapCustomArtifactOperations(chunks, async (chunk, index) => {
    const source = materialized.find((item) => item.chunks.includes(chunk))?.source;
    if (!source) throw new CustomIndexPipelineError("CUSTOM_CURRENT_CHUNK_PARENT_MISSING");
    const artifact = {
      schemaVersion: 1,
      releaseId: RELEASE_ID,
      chunk,
      evidence: {
        snapshotProvisionId: source.snapshotProvisionId,
        provisionRenditionId: source.provisionRenditionId,
        r2Key: source.evidenceR2Key,
        byteCount: source.evidenceByteCount,
        sha256: source.evidenceSha256,
      },
    };
    const bytes = serializeCustomCurrentArtifact(artifact);
    const digest = await customCurrentSha256(bytes);
    const key = `search-releases/${RELEASE_ID}/chunks/${chunk.id}.json`;
    await putImmutableCustomArtifact(env.ARTIFACTS, key, bytes, {
      contentType: "application/json",
      customMetadata: { kind: "retrieval-chunk", snapshotProvisionId: source.snapshotProvisionId },
    });
    return {
      ordinal: documentFieldLengths[index]!.itemOrdinal,
      id: chunk.id,
      key,
      sizeBytes: bytes.byteLength,
      sha256: digest,
      snapshotProvisionId: source.snapshotProvisionId,
      evidenceR2Key: source.evidenceR2Key,
      evidenceSha256: source.evidenceSha256,
    };
  });
  const chunkInventoryBytes = serializeCustomCurrentArtifact({
    schemaVersion: 1, releaseId: RELEASE_ID, batchId: message.batchId, chunks: chunkInventory,
  });
  const chunkInventorySha256 = await customCurrentSha256(chunkInventoryBytes);
  const chunkInventoryKey = `search-releases/${RELEASE_ID}/inventories/chunks/${message.batchId}-${chunkInventorySha256}.json`;
  await putImmutableCustomArtifact(env.ARTIFACTS, chunkInventoryKey, chunkInventoryBytes, {
    contentType: "application/json", customMetadata: { kind: "chunk-inventory-page" },
  });

  reportStage("sparse");
  const sparseDocuments = documentFieldLengths.map((fieldLengths, index) => {
    const chunk = chunks[index];
    if (!chunk || chunk.id !== fieldLengths.itemKey) {
      throw new CustomIndexPipelineError("CUSTOM_CURRENT_SPARSE_DOCUMENT_ALIGNMENT_FAILED");
    }
    return {
      ordinal: fieldLengths.itemOrdinal,
      itemKey: fieldLengths.itemKey,
      segmentId: fieldLengths.segmentId,
      language: chunk.language,
      documentType: chunk.documentType,
      validFromEpoch: chunk.validFromEpoch,
      validToEpoch: chunk.validToEpoch,
      fieldLengths: {
        title: fieldLengths.title,
        hierarchy: fieldLengths.hierarchy,
        article: fieldLengths.article,
        text: fieldLengths.text,
      },
    };
  });
  const documentBytes = serializeCustomCurrentArtifact({
    schemaVersion: 1, releaseId: RELEASE_ID, batchId: message.batchId,
    documents: sparseDocuments,
  });
  const documentSha256 = await customCurrentSha256(documentBytes);
  const documentKey = `search-releases/${RELEASE_ID}/sparse/word-v1/documents/${message.batchId}-${documentSha256}.json`;
  await putImmutableCustomArtifact(env.ARTIFACTS, documentKey, documentBytes, {
    contentType: "application/json", customMetadata: { kind: "word-bm25-documents" },
  });
  const sparsePartitions = partitionCustomBm25IntermediateRecords(sparseRecords);
  const partitionReferences = Object.fromEntries(await Promise.all(
    Object.entries(sparsePartitions).map(async ([partition, records]) => {
      const bytes = serializeCustomCurrentArtifact({
        schemaVersion: 1, releaseId: RELEASE_ID, batchId: message.batchId,
        analyzer: "word-v1", partition, records,
      });
      const sha256 = await customCurrentSha256(bytes);
      const key = `search-releases/${RELEASE_ID}/sparse/word-v1/input/${partition}/${message.batchId}-${sha256}.json`;
      await putImmutableCustomArtifact(env.ARTIFACTS, key, bytes, {
        contentType: "application/json",
        customMetadata: { kind: "word-bm25-partition-input", partition },
      });
      return [partition, { key, sha256, sizeBytes: bytes.byteLength, recordCount: records.length }];
    }),
  ));
  const sparseBytes = serializeCustomCurrentArtifact({
    schemaVersion: 1, releaseId: RELEASE_ID, batchId: message.batchId,
    analyzer: "word-v1", recordCount: sparseRecords.length,
    documents: {
      key: documentKey, sha256: documentSha256, sizeBytes: documentBytes.byteLength,
      count: sparseDocuments.length,
    },
    partitions: partitionReferences,
  });
  const sparseInputSha256 = await customCurrentSha256(sparseBytes);
  const sparseInputKey = `search-releases/${RELEASE_ID}/sparse/word-v1/manifests/${message.batchId}-${sparseInputSha256}.json`;
  await putImmutableCustomArtifact(env.ARTIFACTS, sparseInputKey, sparseBytes, {
    contentType: "application/json", customMetadata: { kind: "word-bm25-input-manifest" },
  });

  const dense = await embedAndUpsert(env, denseItems, message.batchId, reportStage);
  reportStage("dense_inventory");
  const denseBytes = serializeCustomCurrentArtifact({
    schemaVersion: 1,
    releaseId: RELEASE_ID,
    batchId: message.batchId,
    vectors: dense.inventory,
  });
  const denseInventorySha256 = await customCurrentSha256(denseBytes);
  const denseInventoryKey = `search-releases/${RELEASE_ID}/dense/inventory/${message.batchId}-${denseInventorySha256}.json`;
  await putImmutableCustomArtifact(env.ARTIFACTS, denseInventoryKey, denseBytes, {
    contentType: "application/json", customMetadata: { kind: "dense-inventory-page" },
  });

  const sourceInventorySha256 = await customCurrentSha256(`${planItems
    .map((item) => stableSourceSnapshotJson(item)).join("\n")}\n`);
  const receipt: CustomReleasePageReceipt = {
    schemaVersion: 1,
    releaseId: RELEASE_ID,
    batchId: message.batchId,
    sourceOrdinalStart: message.sourceOrdinalStart,
    sourceCount: message.sourceCount,
    sourceInventorySha256,
    chunkCount: chunks.length,
    chunkInventoryKey,
    chunkInventorySha256,
    sparseInputKey,
    sparseInputSha256,
    sparseRecordCount: sparseRecords.length,
    denseInventoryKey,
    denseInventorySha256,
    vectorCount: dense.inventory.length,
    vectorizeMutationId: dense.finalMutationId,
    providerInputTokens: dense.providerInputTokens,
    reusedEmbeddingCount: dense.reusedEmbeddingCount,
  };
  // Validate all count, policy and locator invariants before the receipt becomes
  // the durable completion marker.
  await reconcileCustomReleasePages({
    releaseId: RELEASE_ID,
    expectedSourceCount: message.sourceCount,
    receipts: [{ ...receipt, sourceOrdinalStart: 0 }],
  });
  const receiptBytes = serializeCustomCurrentArtifact(receipt);
  reportStage("receipt");
  await putImmutableCustomArtifact(env.ARTIFACTS, receiptKey(message.batchId), receiptBytes, {
    contentType: "application/json", customMetadata: { kind: "materialize-receipt" },
  });
  reportStage("coordinator");
  await coordinator(env).completePage(receipt, receiptKey(message.batchId));
  return { duplicate: false, receipt, mutationCount: dense.mutationCount };
}

async function listReceipts(env: HistoryBuildEnv): Promise<CustomReleasePageReceipt[]> {
  const values: CustomReleasePageReceipt[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.ARTIFACTS.list({
      prefix: `search-releases/${RELEASE_ID}/receipts/`,
      ...(cursor ? { cursor } : {}),
      include: ["customMetadata"],
    });
    const receipts = await mapCustomArtifactOperations(page.objects, async object => {
      const sha256 = object.customMetadata?.sha256;
      if (!sha256) throw new CustomIndexPipelineError("CUSTOM_CURRENT_RECEIPT_HASH_MISSING");
      return verifiedJson<CustomReleasePageReceipt>(env.ARTIFACTS, object.key, sha256);
    });
    values.push(...receipts);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return values;
}

const SPARSE_PARTITIONS = "0123456789abcdef".split("");

type SparseInputManifest = {
  schemaVersion: 1;
  releaseId: typeof RELEASE_ID;
  batchId: string;
  analyzer: "word-v1";
  recordCount: number;
  documents: ReducerArtifactReference & { count: number };
  partitions: Record<string, ReducerArtifactReference & { recordCount: number }>;
};

function assertReducerReference(value: unknown): asserts value is ReducerArtifactReference {
  const reference = value as Partial<ReducerArtifactReference> | null;
  if (!reference || typeof reference.key !== "string" || !reference.key.startsWith(
    `search-releases/${RELEASE_ID}/`,
  ) || !Number.isSafeInteger(reference.sizeBytes) || Number(reference.sizeBytes) < 1
    || !SHA256.test(reference.sha256 ?? "")) {
    throw new CustomIndexPipelineError("CUSTOM_CURRENT_REDUCER_REFERENCE_INVALID");
  }
}

async function writeReducerPlan(
  env: HistoryBuildEnv,
  identity: string,
  value: unknown,
): Promise<ReducerArtifactReference> {
  const bytes = serializeCustomCurrentArtifact(value);
  const sha256 = await customCurrentSha256(bytes);
  const key = `search-releases/${RELEASE_ID}/sparse/word-v1/reducer-plans/${identity}-${sha256}.json`;
  await putImmutableCustomArtifact(env.ARTIFACTS, key, bytes, {
    contentType: "application/json", customMetadata: { kind: "word-bm25-reducer-plan" },
  });
  return { key, sizeBytes: bytes.byteLength, sha256 };
}

async function prepareSparseReducerPlans(
  env: HistoryBuildEnv,
  receipts: readonly CustomReleasePageReceipt[],
): Promise<{
  documents: ReducerArtifactReference;
  partitions: Record<string, ReducerArtifactReference>;
  documentCount: number;
  recordCount: number;
}> {
  const documentInputs: ReducerArtifactReference[] = [];
  const partitionInputs = Object.fromEntries(SPARSE_PARTITIONS.map((partition) => [partition, []])) as
    Record<string, ReducerArtifactReference[]>;
  let documentCount = 0;
  let recordCount = 0;
  const ordered = [...receipts].sort((left, right) => left.sourceOrdinalStart - right.sourceOrdinalStart);
  for (let offset = 0; offset < ordered.length; offset += 6) {
    const batch = await mapCustomArtifactOperations(ordered.slice(offset, offset + 6), async receipt => ({
      receipt, manifest: await verifiedJson<SparseInputManifest>(env.ARTIFACTS, receipt.sparseInputKey, receipt.sparseInputSha256),
    }));
    for (const { receipt, manifest } of batch) {
      if (manifest.schemaVersion !== 1 || manifest.releaseId !== RELEASE_ID
        || manifest.batchId !== receipt.batchId || manifest.analyzer !== "word-v1"
        || !Number.isSafeInteger(manifest.recordCount) || manifest.recordCount !== receipt.sparseRecordCount
        || manifest.documents.count !== receipt.chunkCount) {
        throw new CustomIndexPipelineError("CUSTOM_CURRENT_SPARSE_MANIFEST_INVALID");
      }
      assertReducerReference(manifest.documents);
      documentInputs.push(manifest.documents);
      documentCount += manifest.documents.count;
      let batchRecordCount = 0;
      for (const partition of SPARSE_PARTITIONS) {
        const reference = manifest.partitions[partition];
        assertReducerReference(reference);
        if (!Number.isSafeInteger(reference.recordCount) || reference.recordCount < 0) {
          throw new CustomIndexPipelineError("CUSTOM_CURRENT_SPARSE_MANIFEST_INVALID");
        }
        partitionInputs[partition]!.push(reference);
        batchRecordCount += reference.recordCount;
      }
      if (batchRecordCount !== manifest.recordCount) {
        throw new CustomIndexPipelineError("CUSTOM_CURRENT_SPARSE_MANIFEST_INVALID");
      }
      recordCount += batchRecordCount;
    }
  }
  const documents = await writeReducerPlan(env, "documents", {
    schemaVersion: 1, releaseId: RELEASE_ID, inputs: documentInputs,
  });
  const partitions: Record<string, ReducerArtifactReference> = {};
  for (const partition of SPARSE_PARTITIONS) {
    partitions[partition] = await writeReducerPlan(env, `partition-${partition}`, {
      schemaVersion: 1, releaseId: RELEASE_ID, partition, inputs: partitionInputs[partition],
    });
    delete partitionInputs[partition];
  }
  return { documents, partitions, documentCount, recordCount };
}

async function invokeSparseReducer(
  env: HistoryBuildEnv,
  input: ReducerRequest,
): Promise<ReducerReport> {
  const rpcValue = await getContainer(env.REDUCER, RELEASE_ID).reduce(input);
  // Durable Object RPC attaches a transport-only Disposable symbol. Workflows
  // persist only the plain content-free report, never the RPC wrapper.
  return JSON.parse(JSON.stringify(rpcValue)) as ReducerReport;
}

export class CustomHistoryReduceWorkflow extends WorkflowEntrypoint<HistoryBuildEnv, ReduceWorkflowPayload> {
  override async run(event: Readonly<WorkflowEvent<ReduceWorkflowPayload>>, step: WorkflowStep): Promise<unknown> {
    requireBuildEnabled(this.env);
    const payload = typeof event.payload === "string"
      ? JSON.parse(event.payload) as ReduceWorkflowPayload
      : event.payload;
    assertWorkflowPayload(payload);
    if (!Number.isSafeInteger(payload.expectedPageCount) || payload.expectedPageCount < 1
      || !SHA256.test(payload.planInventorySha256)) {
      throw new CustomIndexPipelineError("CUSTOM_CURRENT_REDUCE_PAYLOAD_INVALID");
    }
    const reconciled = await step.do("reconcile complete materialization receipts", {
      retries: { limit: 5, delay: "1 minute", backoff: "exponential" },
      timeout: "30 minutes",
    }, async () => {
      const receipts = await listReceipts(this.env);
      if (receipts.length !== payload.expectedPageCount) {
        throw new CustomIndexPipelineError("CUSTOM_CURRENT_RECEIPTS_INCOMPLETE");
      }
      const result = await reconcileCustomReleasePages({
        releaseId: RELEASE_ID,
        expectedSourceCount: EXPECTED_SOURCE_COUNT,
        receipts,
      });
      const state = await coordinator(this.env).status() as unknown as {
        lastVectorizeMutationId: string | null;
        embeddings: { reservedTokens: number; creditStopped: boolean; retryAfter: number | null };
      };
      const finalMutationId = String(state.lastVectorizeMutationId ?? "");
      if (!finalMutationId || !receipts.some((receipt) => receipt.vectorizeMutationId === finalMutationId)) {
        throw new CustomIndexPipelineError("CUSTOM_CURRENT_FINAL_MUTATION_INVALID");
      }
      const providerAccounting = {
        authorizedTokens: parsePositiveInteger(this.env.AUTHORIZED_PROVIDER_TOKENS, "CUSTOM_EMBEDDING_COST_STOP"),
        inputTokens: result.providerInputTokens,
        ...state.embeddings,
      };
      const bytes = serializeCustomCurrentArtifact({
        schemaVersion: 1,
        ...result,
        sourceSnapshotId: SOURCE_SNAPSHOT_ID,
        sourceRootSha256: SOURCE_ROOT_SHA256,
        planInventorySha256: payload.planInventorySha256,
        finalVectorizeMutationId: finalMutationId,
        providerAccounting,
        sparseReductionComplete: false,
        vectorizeFullListReconciled: false,
        activationAuthorized: false,
      });
      const digest = await customCurrentSha256(bytes);
      await putImmutableCustomArtifact(
        this.env.ARTIFACTS,
        `search-releases/${RELEASE_ID}/reconciliation/materialized-${digest}.json`,
        bytes,
        { contentType: "application/json", customMetadata: { kind: "materialization-reconciliation" } },
      );
      return { ...result, finalMutationId, providerAccounting, materializationReconciliationSha256: digest };
    });
    const prepared = await step.do("prepare exact sparse reducer plans", {
      retries: { limit: 5, delay: "1 minute", backoff: "exponential" },
      timeout: "30 minutes",
    }, async () => {
      const receipts = await listReceipts(this.env);
      const plans = await prepareSparseReducerPlans(this.env, receipts);
      if (plans.documentCount !== reconciled.chunkCount
        || plans.recordCount !== reconciled.sparseRecordCount) {
        throw new CustomIndexPipelineError("CUSTOM_CURRENT_REDUCER_PLAN_COUNT_MISMATCH");
      }
      return plans;
    });
    const outputPrefix = `search-releases/${RELEASE_ID}/sparse/word-v1/reduced`;
    const documents = await step.do("reduce exact sparse documents", {
      retries: { limit: 3, delay: "2 minutes", backoff: "exponential" },
      timeout: "30 minutes",
    }, async () => invokeSparseReducer(this.env, {
      schemaVersion: 1, releaseId: RELEASE_ID, mode: "documents", outputPrefix,
      segmentId: SEGMENT_ID,
      plan: prepared.documents,
    }));
    assertReducerReference(documents.artifact);
    if (documents.statistics?.documentCount !== reconciled.chunkCount) {
      throw new CustomIndexPipelineError("CUSTOM_CURRENT_REDUCER_DOCUMENT_COUNT_MISMATCH");
    }
    const partitions: ReducerReport[] = [];
    for (const partition of SPARSE_PARTITIONS) {
      const report = await step.do(`reduce exact sparse partition ${partition}`, {
        retries: { limit: 3, delay: "2 minutes", backoff: "exponential" },
        timeout: "30 minutes",
      }, async () => invokeSparseReducer(this.env, {
        schemaVersion: 1, releaseId: RELEASE_ID, segmentId: SEGMENT_ID, mode: "partition", partition, outputPrefix,
        plan: prepared.partitions[partition]!, documents: documents.artifact!,
      }));
      assertReducerReference(report.postings);
      assertReducerReference(report.lexicon);
      if (report.partition !== partition || !Number.isSafeInteger(report.sourceRecordCount)
        || Number(report.sourceRecordCount) < 0) {
        throw new CustomIndexPipelineError("CUSTOM_CURRENT_REDUCER_PARTITION_REPORT_INVALID");
      }
      partitions.push(report);
    }
    if (partitions.reduce((sum, report) => sum + Number(report.sourceRecordCount), 0)
      !== reconciled.sparseRecordCount) {
      throw new CustomIndexPipelineError("CUSTOM_CURRENT_REDUCER_RECORD_COUNT_MISMATCH");
    }
    const manifestPlan = await step.do("write sparse manifest reducer plan", async () =>
      writeReducerPlan(this.env, "manifest", {
        schemaVersion: 1, releaseId: RELEASE_ID, documents: documents.artifact, partitions,
      }));
    const manifest = await step.do("seal exact sparse manifest artifact", {
      retries: { limit: 3, delay: "2 minutes", backoff: "exponential" },
      timeout: "30 minutes",
    }, async () => invokeSparseReducer(this.env, {
      schemaVersion: 1, releaseId: RELEASE_ID, segmentId: SEGMENT_ID, mode: "manifest", outputPrefix,
      plan: manifestPlan,
    }));
    assertReducerReference(manifest.artifact);
    if (manifest.documentCount !== reconciled.chunkCount || manifest.partitionCount !== 16
      || manifest.sourceRecordCount !== reconciled.sparseRecordCount) {
      throw new CustomIndexPipelineError("CUSTOM_CURRENT_SPARSE_MANIFEST_REPORT_INVALID");
    }
    const sparseReconciliation = await step.do("write sparse reduction reconciliation", async () => {
      const value = {
        schemaVersion: 1, releaseId: RELEASE_ID,
        materializationReconciliationSha256: reconciled.materializationReconciliationSha256,
        sourceCount: reconciled.sourceCount,
        chunkCount: reconciled.chunkCount,
        sparseRecordCount: reconciled.sparseRecordCount,
        sparseManifest: manifest.artifact,
        documents: documents.artifact,
        partitions: partitions.map((report) => ({
          partition: report.partition, sourceRecordCount: report.sourceRecordCount,
          termCount: report.termCount, postingCount: report.postingCount,
          postings: report.postings, lexicon: report.lexicon,
        })),
        sparseReductionComplete: true,
        vectorizeFullListReconciled: false,
        activationAuthorized: false,
      };
      const bytes = serializeCustomCurrentArtifact(value);
      const sha256 = await customCurrentSha256(bytes);
      const key = `search-releases/${RELEASE_ID}/reconciliation/sparse-${sha256}.json`;
      await putImmutableCustomArtifact(this.env.ARTIFACTS, key, bytes, {
        contentType: "application/json",
        customMetadata: { kind: "sparse-reduction-reconciliation" },
      });
      return { key, sizeBytes: bytes.byteLength, sha256 };
    });
    return {
      ...reconciled,
      sparseManifest: manifest.artifact,
      sparseReconciliation,
      activationAuthorized: false,
      next: "fresh-vectorize-full-list",
    };
  }
}

export default {
  async fetch(request: Request, env: HistoryBuildEnv): Promise<Response> {
    if (new URL(request.url).pathname === CUSTOM_SEARCH_PATH) {
      return handleCustomSearchRequest(request, env);
    }
    return new Response(null, { status: 404, headers: { "cache-control": "private, no-store" } });
  },
  async queue(batch: MessageBatch<unknown>, env: HistoryBuildEnv): Promise<void> {
    for (const message of batch.messages) {
      let releaseId = RELEASE_ID;
      let sourceOrdinalStart: number | undefined;
      let failureStage: CustomMaterializationStage = "receipt";
      try {
        const parsed = parseMessage(message.body);
        releaseId = parsed.releaseId;
        sourceOrdinalStart = parsed.sourceOrdinalStart;
        console.log(JSON.stringify(contentFreePipelineTelemetry({
          environment: "staging", releaseId, component: "materialize",
          sourceOrdinalStart, status: "started", failureCode: null,
        })));
        const result = await processMaterializeMessage(env, parsed, (stage) => { failureStage = stage; });
        console.log(JSON.stringify(contentFreePipelineTelemetry({
          environment: "staging",
          releaseId,
          component: "materialize",
          sourceOrdinalStart,
          status: result.duplicate ? "duplicate" : "complete",
          providerTokens: result.receipt.providerInputTokens,
          vectorizeMutations: result.duplicate ? 0 : result.mutationCount,
          failureCode: null,
        })));
        message.ack();
      } catch (error) {
        console.error(JSON.stringify(contentFreePipelineTelemetry({
          environment: "staging",
          releaseId,
          component: "materialize",
          status: "failed",
          sourceOrdinalStart,
          failureStage,
          error,
        })));
        message.retry({ delaySeconds: 60 });
      }
    }
  },
} satisfies ExportedHandler<HistoryBuildEnv, unknown>;
