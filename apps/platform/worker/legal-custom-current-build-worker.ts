import {
  DurableObject,
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { Container, getContainer } from "@cloudflare/containers";

import {
  customCurrentSha256,
  materializeCustomCurrentItem,
  partitionCustomBm25IntermediateRecords,
  serializeCustomCurrentArtifact,
  type CustomCurrentDenseItem,
  type CustomCurrentSourcePlanItem,
} from "../lib/legal-corpus/custom-current-build";
import {
  CUSTOM_EMBEDDING_DIMENSIONS,
  CUSTOM_EMBEDDING_MODEL,
  deserializeNormalizedEmbedding,
  putImmutableCustomArtifact,
} from "../lib/legal-corpus/custom-hybrid-index";
import {
  CustomIndexPipelineError,
  assertOfflineEmbeddingArtifactsAvailable,
  authorizeProviderRateWindow,
  contentFreePipelineTelemetry,
} from "../lib/legal-corpus/custom-index-pipeline";
import {
  reconcileCustomReleasePages,
  type CustomReleasePageReceipt,
} from "../lib/legal-corpus/custom-release-manifest";
import { stableSourceSnapshotJson } from "../lib/legal-corpus/source-snapshot";
import { CUSTOM_CURRENT_REDUCER_PROGRAM } from "./legal-custom-bm25-reducer-program";

const RELEASE_ID = "release:staging:current:custom-v1:2026-09-03";
const SOURCE_SNAPSHOT_ID = "snapshot:staging:current:source-snapshot-v1";
const SOURCE_RELEASE_ID = "release:staging:current:source-snapshot-v1";
const SOURCE_BUILD_ID = "build:staging:current:source-snapshot-qualification-v2";
const SOURCE_ROOT_SHA256 = "7af8b19bdb27a719d47f9d9522129e69d7b61b3a75cc8a1f54ba80d76b3ade4b";
const EXPECTED_SOURCE_COUNT = 160_978;
const PLAN_PAGE_SIZE = 500;
const MATERIALIZE_BATCH_SIZE = 10;
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
  items: CustomCurrentSourcePlanItem[];
};

type ReusePointer = {
  schemaVersion: 1;
  inputSha256: string;
  artifactKey: string;
  vectorSha256: string;
  sizeBytes: number;
};

type CurrentBuildEnv = {
  APP_ENV: "staging";
  AUTHORIZED_PROVIDER_TOKENS: string;
  LEGAL_DB: D1Database;
  EVIDENCE: R2Bucket;
  ARTIFACTS: R2Bucket;
  DENSE: Vectorize;
  BUILD_QUEUE: Queue<MaterializeMessage>;
  BUILD_WORKFLOW: Workflow<BuildWorkflowPayload>;
  REDUCE_WORKFLOW: Workflow<ReduceWorkflowPayload>;
  COORDINATOR: DurableObjectNamespace<CustomCurrentBuildCoordinator>;
  REDUCER: DurableObjectNamespace<CustomCurrentBm25ReducerContainer>;
};

function planPageKey(sourceOrdinalStart: number): string {
  return `search-releases/${RELEASE_ID}/plan/pages/${String(sourceOrdinalStart).padStart(6, "0")}.json`;
}

function receiptKey(batchId: string): string {
  return `search-releases/${RELEASE_ID}/receipts/${batchId}.json`;
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

type ReducerArtifactReference = { key: string; sizeBytes: number; sha256: string };
type ReducerRequest = {
  schemaVersion: 1;
  releaseId: typeof RELEASE_ID;
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
  const env = untypedEnv as unknown as CurrentBuildEnv;
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

export class CustomCurrentBm25ReducerContainer extends Container {
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

CustomCurrentBm25ReducerContainer.outboundByHost = {
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

function coordinator(env: CurrentBuildEnv): DurableObjectStub<CustomCurrentBuildCoordinator> {
  return env.COORDINATOR.getByName(RELEASE_ID);
}

export class CustomCurrentBuildCoordinator extends DurableObject<CurrentBuildEnv> {
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

  async reserveProviderTokens(input: {
    batchId: string;
    attempt: number;
    requestOrdinal: number;
    inputTokens: number;
  }): Promise<{ duplicate: boolean; reservedTokens: number }> {
    if (!SAFE_ID.test(input.batchId) || !Number.isSafeInteger(input.attempt) || input.attempt < 1
      || !Number.isSafeInteger(input.requestOrdinal) || input.requestOrdinal < 0
      || !Number.isSafeInteger(input.inputTokens) || input.inputTokens < 1) {
      throw new CustomIndexPipelineError("CUSTOM_CURRENT_PROVIDER_RESERVATION_INVALID");
    }
    const configuration = await this.ctx.storage.get<{ authorizedProviderTokens: number }>("configuration");
    if (!configuration) throw new CustomIndexPipelineError("CUSTOM_CURRENT_COORDINATOR_NOT_INITIALIZED");
    const key = `reservation:${input.batchId}:${input.attempt}:${input.requestOrdinal}`;
    return this.ctx.storage.transaction(async (transaction) => {
      const prior = await transaction.get<number>(key);
      const reserved = await transaction.get<number>("reservedProviderTokens") ?? 0;
      if (prior !== undefined) {
        if (prior !== input.inputTokens) {
          throw new CustomIndexPipelineError("CUSTOM_CURRENT_PROVIDER_RESERVATION_CONFLICT");
        }
        return { duplicate: true, reservedTokens: reserved };
      }
      if (reserved + input.inputTokens > configuration.authorizedProviderTokens) {
        throw new CustomIndexPipelineError("CUSTOM_INDEX_COST_STOP");
      }
      const next = reserved + input.inputTokens;
      await transaction.put({ [key]: input.inputTokens, reservedProviderTokens: next });
      return { duplicate: false, reservedTokens: next };
    });
  }

  async acquireProviderRequest(nowEpochMs: number, maximumRequestsPerMinute: number): Promise<void> {
    const prior = await this.ctx.storage.get<number[]>("providerRequestEpochMs") ?? [];
    const next = authorizeProviderRateWindow({ priorRequestEpochMs: prior, nowEpochMs, maximumRequestsPerMinute });
    await this.ctx.storage.put("providerRequestEpochMs", next);
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
    const [configuration, plan, completedPages, reservedProviderTokens, reductionStarted,
      lastVectorizeMutationId] = await Promise.all([
      this.ctx.storage.get("configuration"),
      this.ctx.storage.get("plan"),
      this.ctx.storage.get<number>("completedPages"),
      this.ctx.storage.get<number>("reservedProviderTokens"),
      this.ctx.storage.get<boolean>("reductionStarted"),
      this.ctx.storage.get<string>("lastVectorizeMutationId"),
    ]);
    return { configuration, plan, completedPages: completedPages ?? 0,
      reservedProviderTokens: reservedProviderTokens ?? 0, reductionStarted: reductionStarted ?? false,
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
    const [configuration, plan, completedPages, started] = await Promise.all([
      this.ctx.storage.get<{ expectedPageCount: number }>("configuration"),
      this.ctx.storage.get<{ pageCount: number; planInventorySha256: string }>("plan"),
      this.ctx.storage.get<number>("completedPages"),
      this.ctx.storage.get<boolean>("reductionStarted"),
    ]);
    if (!configuration || !plan || started || completedPages !== configuration.expectedPageCount) return;
    try {
      await this.env.REDUCE_WORKFLOW.create({
        id: `reduce-${RELEASE_ID}`,
        params: {
          schemaVersion: 1,
          releaseId: RELEASE_ID,
          sourceSnapshotId: SOURCE_SNAPSHOT_ID,
          sourceRootSha256: SOURCE_ROOT_SHA256,
          expectedPageCount: plan.pageCount,
          planInventorySha256: plan.planInventorySha256,
        },
      });
      await this.ctx.storage.put("reductionStarted", true);
    } catch {
      await this.ctx.storage.setAlarm(Date.now() + 60_000);
      throw new CustomIndexPipelineError("CUSTOM_CURRENT_REDUCTION_START_FAILED");
    }
  }
}

type SourcePlanRow = {
  provisionRenditionId: string;
  snapshotProvisionId: string;
  evidenceR2Key: string;
  evidenceByteCount: number;
  evidenceSha256: string;
  language: "uz-Latn" | "uz-Cyrl" | "ru" | "en";
  documentType: string;
  validFrom: string;
  validTo: string | null;
};

function assertWorkflowPayload(payload: BuildWorkflowPayload): void {
  if (payload.schemaVersion !== 1 || payload.releaseId !== RELEASE_ID
    || payload.sourceSnapshotId !== SOURCE_SNAPSHOT_ID
    || payload.sourceRootSha256 !== SOURCE_ROOT_SHA256) {
    throw new CustomIndexPipelineError("CUSTOM_CURRENT_WORKFLOW_IDENTITY_INVALID");
  }
}

async function sourcePlanRows(env: CurrentBuildEnv, cursor: string): Promise<SourcePlanRow[]> {
  const packet = await env.LEGAL_DB.prepare(`SELECT
      member.provision_rendition_id AS provisionRenditionId,
      provision.id AS snapshotProvisionId,locator.r2_key AS evidenceR2Key,
      locator.byte_count AS evidenceByteCount,locator.sha256 AS evidenceSha256,
      item.language,item.document_type AS documentType,item.valid_from AS validFrom,
      item.valid_to AS validTo
    FROM legal_corpus_snapshot_members member
    JOIN legal_snapshot_provisions provision
      ON provision.legacy_provision_rendition_id=member.provision_rendition_id
    JOIN legal_evidence_locators locator ON locator.id=member.locator_id
    JOIN legal_retrieval_eligibility eligibility
      ON eligibility.snapshot_provision_id=provision.id
      AND eligibility.build_id=? AND eligibility.capability='current'
      AND eligibility.status='eligible'
      AND eligibility.official_source_verified=1
      AND eligibility.d1_r2_integrity_verified=1
      AND eligibility.extraction_verified=1 AND eligibility.identity_stable=1
      AND eligibility.current_pointer_verified=1 AND eligibility.temporal_state_supported=1
      AND eligibility.privacy_verified=1 AND eligibility.quarantine_clear=1
      AND eligibility.canonicalization_clear=1
    JOIN legal_search_release_items item
      ON item.search_release_id=? AND item.provision_rendition_id=member.provision_rendition_id
    WHERE member.corpus_snapshot_id=? AND member.provision_rendition_id>?
    ORDER BY member.provision_rendition_id LIMIT ?`)
    .bind(SOURCE_BUILD_ID, SOURCE_RELEASE_ID, SOURCE_SNAPSHOT_ID, cursor, PLAN_PAGE_SIZE)
    .all<SourcePlanRow>();
  return packet.results;
}

export class CustomCurrentBuildWorkflow extends WorkflowEntrypoint<CurrentBuildEnv, BuildWorkflowPayload> {
  override async run(event: Readonly<WorkflowEvent<BuildWorkflowPayload>>, step: WorkflowStep): Promise<unknown> {
    const payload = typeof event.payload === "string"
      ? JSON.parse(event.payload) as BuildWorkflowPayload
      : event.payload;
    assertWorkflowPayload(payload);
    const frozen = await step.do("verify frozen source and off-side identity", async () => {
      const [snapshot, release] = await Promise.all([
        this.env.LEGAL_DB.prepare(`SELECT id,corpus_hash AS corpusHash,member_count AS memberCount,status
          FROM legal_corpus_snapshots WHERE id=?`).bind(SOURCE_SNAPSHOT_ID)
          .first<{ id: string; corpusHash: string; memberCount: number; status: string }>(),
        this.env.LEGAL_DB.prepare("SELECT id FROM legal_search_releases WHERE id=?")
          .bind(RELEASE_ID).first<{ id: string }>(),
      ]);
      if (!snapshot || snapshot.corpusHash !== SOURCE_ROOT_SHA256
        || snapshot.memberCount !== EXPECTED_SOURCE_COUNT || snapshot.status !== "frozen"
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
      let cursor = "";
      let sourceOrdinal = 0;
      const pageReferences: Array<{ key: string; sha256: string; count: number; start: number }> = [];
      for (;;) {
        const rows = await sourcePlanRows(this.env, cursor);
        if (rows.length === 0) break;
        const items = rows.map((row, index): CustomCurrentSourcePlanItem => ({
          sourceOrdinal: sourceOrdinal + index,
          snapshotProvisionId: row.snapshotProvisionId,
          provisionRenditionId: row.provisionRenditionId,
          evidenceR2Key: row.evidenceR2Key,
          evidenceByteCount: Number(row.evidenceByteCount),
          evidenceSha256: row.evidenceSha256,
          language: row.language,
          documentType: row.documentType,
          validFrom: row.validFrom,
          validTo: row.validTo,
        }));
        const page: SourcePlanPage = {
          schemaVersion: 1,
          releaseId: RELEASE_ID,
          sourceSnapshotId: SOURCE_SNAPSHOT_ID,
          sourceOrdinalStart: sourceOrdinal,
          items,
        };
        const bytes = serializeCustomCurrentArtifact(page);
        const digest = await customCurrentSha256(bytes);
        const key = planPageKey(sourceOrdinal);
        await putImmutableCustomArtifact(this.env.ARTIFACTS, key, bytes, {
          contentType: "application/json",
          customMetadata: { kind: "source-plan-page", sourceRootSha256: SOURCE_ROOT_SHA256 },
        });
        pageReferences.push({ key, sha256: digest, count: items.length, start: sourceOrdinal });
        const messages: Array<{ body: MaterializeMessage }> = [];
        for (let offset = 0; offset < items.length; offset += MATERIALIZE_BATCH_SIZE) {
          const sourceCount = Math.min(MATERIALIZE_BATCH_SIZE, items.length - offset);
          const start = sourceOrdinal + offset;
          messages.push({ body: {
            schemaVersion: 1,
            kind: "materialize",
            releaseId: RELEASE_ID,
            batchId: `source-${String(start).padStart(6, "0")}`,
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
        sourceOrdinal += items.length;
        cursor = rows.at(-1)!.provisionRenditionId;
        if (rows.length < PLAN_PAGE_SIZE) break;
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

async function existingReceipt(env: CurrentBuildEnv, message: MaterializeMessage): Promise<CustomReleasePageReceipt | null> {
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

async function embeddingPointer(
  env: CurrentBuildEnv,
  item: CustomCurrentDenseItem,
): Promise<{ pointer: ReusePointer; bytes: Uint8Array } | null> {
  const key = `embeddings/${CUSTOM_EMBEDDING_MODEL}/${CUSTOM_EMBEDDING_DIMENSIONS}/float32-l2-v1/${item.structuredInputSha256}.json`;
  const object = await env.ARTIFACTS.get(key);
  if (!object) return null;
  const pointerBytes = new Uint8Array(await object.arrayBuffer());
  const pointerSha256 = await customCurrentSha256(pointerBytes);
  if (object.customMetadata?.sha256 !== pointerSha256) {
    throw new CustomIndexPipelineError("CUSTOM_CURRENT_REUSE_POINTER_CORRUPT");
  }
  const pointer = JSON.parse(decoder.decode(pointerBytes)) as ReusePointer;
  if (pointer.schemaVersion !== 1 || pointer.inputSha256 !== item.structuredInputSha256
    || !SHA256.test(pointer.vectorSha256)) {
    throw new CustomIndexPipelineError("CUSTOM_CURRENT_REUSE_POINTER_CORRUPT");
  }
  const artifact = await env.ARTIFACTS.get(pointer.artifactKey);
  if (!artifact) throw new CustomIndexPipelineError("CUSTOM_CURRENT_REUSE_ARTIFACT_MISSING");
  const bytes = new Uint8Array(await artifact.arrayBuffer());
  if (bytes.byteLength !== pointer.sizeBytes || artifact.customMetadata?.sha256 !== pointer.vectorSha256
    || await customCurrentSha256(bytes) !== pointer.vectorSha256) {
    throw new CustomIndexPipelineError("CUSTOM_CURRENT_REUSE_ARTIFACT_CORRUPT");
  }
  return { pointer, bytes };
}

async function embedAndUpsert(
  env: CurrentBuildEnv,
  denseItems: CustomCurrentDenseItem[],
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
  const providerInputTokens = 0;
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
    const prepared = await Promise.all(group.map(async (item) => ({
      item,
      existing: await embeddingPointer(env, item),
    })));
    const missing = prepared.filter(({ existing }) => !existing);
    reusedEmbeddingCount += prepared.length - missing.length;
    assertOfflineEmbeddingArtifactsAvailable(missing.length);
    const vectors = prepared.map(({ item, existing }) => {
      if (!existing) throw new CustomIndexPipelineError("CUSTOM_CURRENT_EMBEDDING_MISSING");
      inventory.push({
        vectorId: item.vectorId,
        metadataSha256: item.metadataSha256,
        embeddingArtifactKey: existing.pointer.artifactKey,
        embeddingSha256: existing.pointer.vectorSha256,
      });
      return {
        id: item.vectorId,
        values: [...deserializeNormalizedEmbedding(existing.bytes)],
        metadata: {
          ...item.metadata,
          metadata_sha256: item.metadataSha256,
          embedding_r2_key: existing.pointer.artifactKey,
        },
      } satisfies VectorizeVector;
    });
    const mutation = await env.DENSE.upsert(vectors);
    finalMutationId = mutation.mutationId;
    mutationCount += 1;
  }
  if (!finalMutationId) throw new CustomIndexPipelineError("CUSTOM_CURRENT_VECTORIZE_MUTATION_MISSING");
  return { inventory, finalMutationId, mutationCount, providerInputTokens, reusedEmbeddingCount };
}

async function processMaterializeMessage(
  env: CurrentBuildEnv,
  raw: unknown,
): Promise<{ duplicate: boolean; receipt: CustomReleasePageReceipt; mutationCount: number }> {
  const message = parseMessage(raw);
  const prior = await existingReceipt(env, message);
  if (prior) {
    await coordinator(env).completePage(prior, receiptKey(message.batchId));
    return { duplicate: true, receipt: prior, mutationCount: 0 };
  }
  const page = await verifiedJson<SourcePlanPage>(env.ARTIFACTS, message.planPageKey, message.planPageSha256);
  if (page.schemaVersion !== 1 || page.releaseId !== RELEASE_ID
    || page.sourceSnapshotId !== SOURCE_SNAPSHOT_ID
    || page.sourceOrdinalStart + message.planPageOffset !== message.sourceOrdinalStart) {
    throw new CustomIndexPipelineError("CUSTOM_CURRENT_PLAN_PAGE_IDENTITY_INVALID");
  }
  const planItems = page.items.slice(message.planPageOffset, message.planPageOffset + message.sourceCount);
  if (planItems.length !== message.sourceCount
    || planItems.some((item, index) => item.sourceOrdinal !== message.sourceOrdinalStart + index)) {
    throw new CustomIndexPipelineError("CUSTOM_CURRENT_PLAN_PAGE_RANGE_INVALID");
  }
  const materialized = [];
  for (const planItem of planItems) {
    const object = await env.EVIDENCE.get(planItem.evidenceR2Key);
    if (!object) throw new CustomIndexPipelineError("CUSTOM_CURRENT_EVIDENCE_MISSING");
    materialized.push(await materializeCustomCurrentItem({
      releaseId: RELEASE_ID,
      planItem,
      evidenceBytes: new Uint8Array(await object.arrayBuffer()),
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
  const chunkInventory = [];
  for (const [index, chunk] of chunks.entries()) {
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
    chunkInventory.push({
      ordinal: documentFieldLengths[index]!.itemOrdinal,
      id: chunk.id,
      key,
      sizeBytes: bytes.byteLength,
      sha256: digest,
      snapshotProvisionId: source.snapshotProvisionId,
      evidenceR2Key: source.evidenceR2Key,
      evidenceSha256: source.evidenceSha256,
    });
  }
  const chunkInventoryBytes = serializeCustomCurrentArtifact({
    schemaVersion: 1, releaseId: RELEASE_ID, batchId: message.batchId, chunks: chunkInventory,
  });
  const chunkInventorySha256 = await customCurrentSha256(chunkInventoryBytes);
  const chunkInventoryKey = `search-releases/${RELEASE_ID}/inventories/chunks/${message.batchId}-${chunkInventorySha256}.json`;
  await putImmutableCustomArtifact(env.ARTIFACTS, chunkInventoryKey, chunkInventoryBytes, {
    contentType: "application/json", customMetadata: { kind: "chunk-inventory-page" },
  });

  const sparseDocuments = documentFieldLengths.map((fieldLengths, index) => {
    const chunk = chunks[index];
    if (!chunk || chunk.id !== fieldLengths.itemKey) {
      throw new CustomIndexPipelineError("CUSTOM_CURRENT_SPARSE_DOCUMENT_ALIGNMENT_FAILED");
    }
    return {
      ordinal: fieldLengths.itemOrdinal,
      itemKey: fieldLengths.itemKey,
      segmentId: "current-base-v1",
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

  const dense = await embedAndUpsert(env, denseItems);
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
  await putImmutableCustomArtifact(env.ARTIFACTS, receiptKey(message.batchId), receiptBytes, {
    contentType: "application/json", customMetadata: { kind: "materialize-receipt" },
  });
  await coordinator(env).completePage(receipt, receiptKey(message.batchId));
  return { duplicate: false, receipt, mutationCount: dense.mutationCount };
}

async function listReceipts(env: CurrentBuildEnv): Promise<CustomReleasePageReceipt[]> {
  const values: CustomReleasePageReceipt[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.ARTIFACTS.list({
      prefix: `search-releases/${RELEASE_ID}/receipts/`,
      ...(cursor ? { cursor } : {}),
      include: ["customMetadata"],
    });
    for (const object of page.objects) {
      const sha256 = object.customMetadata?.sha256;
      if (!sha256) throw new CustomIndexPipelineError("CUSTOM_CURRENT_RECEIPT_HASH_MISSING");
      values.push(await verifiedJson<CustomReleasePageReceipt>(env.ARTIFACTS, object.key, sha256));
    }
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
  env: CurrentBuildEnv,
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
  env: CurrentBuildEnv,
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
  for (const receipt of [...receipts].sort((left, right) =>
    left.sourceOrdinalStart - right.sourceOrdinalStart)) {
    const manifest = await verifiedJson<SparseInputManifest>(
      env.ARTIFACTS, receipt.sparseInputKey, receipt.sparseInputSha256,
    );
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
  const documents = await writeReducerPlan(env, "documents", {
    schemaVersion: 1, releaseId: RELEASE_ID, inputs: documentInputs,
  });
  const partitions = Object.fromEntries(await Promise.all(SPARSE_PARTITIONS.map(async (partition) => [
    partition,
    await writeReducerPlan(env, `partition-${partition}`, {
      schemaVersion: 1, releaseId: RELEASE_ID, partition, inputs: partitionInputs[partition],
    }),
  ])));
  return { documents, partitions, documentCount, recordCount };
}

async function invokeSparseReducer(
  env: CurrentBuildEnv,
  input: ReducerRequest,
): Promise<ReducerReport> {
  const rpcValue = await getContainer(env.REDUCER, RELEASE_ID).reduce(input);
  // Durable Object RPC attaches a transport-only Disposable symbol. Workflows
  // persist only the plain content-free report, never the RPC wrapper.
  return JSON.parse(JSON.stringify(rpcValue)) as ReducerReport;
}

export class CustomCurrentReduceWorkflow extends WorkflowEntrypoint<CurrentBuildEnv, ReduceWorkflowPayload> {
  override async run(event: Readonly<WorkflowEvent<ReduceWorkflowPayload>>, step: WorkflowStep): Promise<unknown> {
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
      };
      const finalMutationId = String(state.lastVectorizeMutationId ?? "");
      if (!finalMutationId || !receipts.some((receipt) => receipt.vectorizeMutationId === finalMutationId)) {
        throw new CustomIndexPipelineError("CUSTOM_CURRENT_FINAL_MUTATION_INVALID");
      }
      const bytes = serializeCustomCurrentArtifact({
        schemaVersion: 1,
        ...result,
        sourceSnapshotId: SOURCE_SNAPSHOT_ID,
        sourceRootSha256: SOURCE_ROOT_SHA256,
        planInventorySha256: payload.planInventorySha256,
        finalVectorizeMutationId: finalMutationId,
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
      return { ...result, finalMutationId, materializationReconciliationSha256: digest };
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
        schemaVersion: 1, releaseId: RELEASE_ID, mode: "partition", partition, outputPrefix,
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
      schemaVersion: 1, releaseId: RELEASE_ID, mode: "manifest", outputPrefix,
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
      next: "fresh-vectorize-full-list-and-restore-preflight",
    };
  }
}

export default {
  async fetch(): Promise<Response> {
    return new Response(null, { status: 404, headers: { "cache-control": "private, no-store" } });
  },
  async queue(batch: MessageBatch<unknown>, env: CurrentBuildEnv): Promise<void> {
    for (const message of batch.messages) {
      let releaseId = RELEASE_ID;
      try {
        const parsed = parseMessage(message.body);
        releaseId = parsed.releaseId;
        const result = await processMaterializeMessage(env, parsed);
        console.log(JSON.stringify(contentFreePipelineTelemetry({
          environment: "staging",
          releaseId,
          component: "materialize",
          status: result.duplicate ? "duplicate" : "complete",
          providerTokens: result.receipt.providerInputTokens,
          vectorizeMutations: result.duplicate ? 0 : result.mutationCount,
          failureCode: null,
        })));
        message.ack();
      } catch (error) {
        const failureCode = error instanceof CustomIndexPipelineError
          ? error.code
          : error instanceof Error && /^CUSTOM_[A-Z0-9_]+$/u.test(error.message)
            ? error.message
            : "CUSTOM_CURRENT_UNEXPECTED";
        console.error(JSON.stringify(contentFreePipelineTelemetry({
          environment: "staging",
          releaseId,
          component: "materialize",
          status: "failed",
          failureCode,
        })));
        message.retry({ delaySeconds: 60 });
      }
    }
  },
} satisfies ExportedHandler<CurrentBuildEnv, unknown>;
