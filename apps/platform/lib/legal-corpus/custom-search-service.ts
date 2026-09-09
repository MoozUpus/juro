import { z } from "zod";

import { queryCustomBm25Runtime, parseCustomBm25RuntimeDescriptor,
  resolveCustomBm25RuntimeItemKeys }
  from "./custom-bm25-runtime";
import { queryCustomDenseLane, buildCustomVectorizeFilter, type CustomVectorSearchIndex }
  from "./custom-candidate-index";
import { fuseCustomRankedLanes } from "./custom-bm25";
import { customCurrentSha256 } from "./custom-current-build";
import { CUSTOM_EMBEDDING_DIMENSIONS, CUSTOM_EMBEDDING_MODEL, normalizeCustomEmbedding }
  from "./custom-hybrid-index";
import { acceptsPrivateServiceRequest, declaredRequestBodyWithinLimit, privateServiceJson }
  from "./private-service-boundary";
import { legalEnvironmentSchema, searchReleaseIdSchema, sha256Schema, utcInstantSchema }
  from "./target-domain-schemas";

export const CUSTOM_SEARCH_PATH = "/internal/legal-corpus/custom-search";
export const CUSTOM_SEARCH_SERVICE_MARKER = "custom-search-runtime-v1";
const QUERY_RESERVATION_USD_MICROS = 1_065;
let customSearchTail: Promise<void> = Promise.resolve();

function serializeCustomSearch<T>(operation: () => Promise<T>): Promise<T> {
  const result = customSearchTail.then(operation);
  customSearchTail = result.then(() => undefined, () => undefined);
  return result;
}

const endpointSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("current") }).strict(),
  z.object({ kind: z.literal("timestamp"), instant: utcInstantSchema }).strict(),
]);
const requestBaseSchema = z.object({
  releaseId: searchReleaseIdSchema,
  instanceIds: z.array(z.string().min(1).max(64)).length(1),
  endpoint: endpointSchema,
  currentAt: utcInstantSchema,
  maxResults: z.literal(50),
  vectorThreshold: z.literal(0),
}).strict();
const singleRequestSchema = requestBaseSchema.extend({
  query: z.string().trim().min(1).max(900),
}).strict();
const batchRequestSchema = requestBaseSchema.extend({
  queries: z.array(z.string().trim().min(1).max(900)).min(1).max(6),
}).strict();
const requestSchema = z.union([singleRequestSchema, batchRequestSchema]);
const hitSchema = z.object({
  itemKey: z.string().min(1).max(700),
  instanceId: z.string().min(1).max(64),
  shardId: z.string().min(1).max(64),
  vectorRank: z.number().int().positive(),
  vectorScore: z.number().finite(),
  keywordRank: z.number().int().positive(),
  keywordScore: z.number().finite(),
  fusionScore: z.number().finite(),
}).strict();
export const customSearchResponseSchema = z.object({
  hits: z.array(hitSchema).max(50),
  errors: z.array(z.object({ code: z.string(), instanceId: z.string().optional() }).strict()),
  searchedInstanceIds: z.array(z.string()).length(1),
  tokenUsage: z.number().int().nonnegative(),
}).strict();
export const customSearchBatchResponseSchema = z.object({
  results: z.array(z.object({
    queryIndex: z.number().int().nonnegative().max(5),
    hits: z.array(hitSchema).max(50),
  }).strict()).min(1).max(6),
  errors: z.array(z.object({ code: z.string(), instanceId: z.string().optional() }).strict()),
  searchedInstanceIds: z.array(z.string()).length(1),
  tokenUsage: z.number().int().nonnegative(),
}).strict();

export type CustomSearchEnv = {
  APP_ENV: string;
  AI: Ai;
  AI_GATEWAY_ID: string;
  DENSE: CustomVectorSearchIndex;
  ARTIFACTS: R2Bucket;
  CATALOG_DB: D1Database;
  CUSTOM_SEARCH_CAPABILITY: "current" | "history";
  CUSTOM_SEARCH_RELEASE_ID: string;
  CUSTOM_SEARCH_PHYSICAL_RELEASE_ID?: string;
  CUSTOM_SEARCH_INSTANCE_ID: string;
  CUSTOM_SEARCH_SHARD_ID: string;
  CUSTOM_RUNTIME_DESCRIPTOR_KEY: string;
  CUSTOM_RUNTIME_DESCRIPTOR_SHA256: string;
};

async function reserveQueryBudget(
  env: CustomSearchEnv,
  releaseId: string,
  queryCount: number,
): Promise<string> {
  const environment = legalEnvironmentSchema.parse(env.APP_ENV);
  const period = environment === "staging" ? "evaluation"
    : new Date().toISOString().slice(0, 7);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const reservation = QUERY_RESERVATION_USD_MICROS * queryCount;
  const reserved = await env.CATALOG_DB.prepare(`UPDATE legal_custom_query_budget_periods
    SET reserved_usd_micros=reserved_usd_micros+?,reserved_requests=reserved_requests+?
    WHERE environment=? AND period=?
      AND reserved_usd_micros+?<=authorized_usd_micros
    RETURNING reserved_usd_micros AS reservedUsdMicros`).bind(
    reservation, queryCount, environment, period, reservation,
  ).first<{ reservedUsdMicros: number }>();
  if (!reserved) throw new TypeError("CUSTOM_QUERY_BUDGET_EXHAUSTED");
  await env.CATALOG_DB.prepare(`INSERT INTO legal_custom_query_reservations
    (id,environment,period,release_id,reserved_usd_micros,created_at)
    VALUES (?,?,?,?,?,?)`).bind(
    id, environment, period, releaseId, reservation, now,
  ).run();
  return id;
}

const embeddingResponseSchema = z.object({
  model: z.literal(CUSTOM_EMBEDDING_MODEL),
  data: z.array(z.object({ index: z.number().int().nonnegative(),
    embedding: z.array(z.number().finite()).length(CUSTOM_EMBEDDING_DIMENSIONS) }).passthrough()).min(1).max(6),
  usage: z.object({ prompt_tokens: z.number().int().positive(),
    total_tokens: z.number().int().positive() }).passthrough(),
}).passthrough();

async function queryEmbeddings(env: CustomSearchEnv, queries: string[]): Promise<{
  vectors: number[][]; tokenUsage: number;
}> {
  const response = await env.AI.gateway(env.AI_GATEWAY_ID).run({
    provider: "openai",
    endpoint: "embeddings",
    headers: { "Content-Type": "application/json", "cf-aig-skip-cache": true,
      "cf-aig-collect-log": false, "cf-aig-max-attempts": 1 },
    query: { model: CUSTOM_EMBEDDING_MODEL, dimensions: CUSTOM_EMBEDDING_DIMENSIONS,
      encoding_format: "float", input: queries },
  }, { signal: AbortSignal.timeout(60_000), gateway: { id: env.AI_GATEWAY_ID,
    skipCache: true, collectLog: false, requestTimeoutMs: 55_000, retries: { maxAttempts: 1 } } });
  if (!response.ok) throw new TypeError("CUSTOM_QUERY_EMBEDDING_UNAVAILABLE");
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > 768 * 1024) throw new TypeError("CUSTOM_QUERY_EMBEDDING_RESPONSE_TOO_LARGE");
  const result = embeddingResponseSchema.parse(await response.json());
  const byIndex = new Map(result.data.map((entry) => [entry.index, entry.embedding]));
  if (byIndex.size !== queries.length
    || queries.some((_, index) => !byIndex.has(index))) {
    throw new TypeError("CUSTOM_QUERY_EMBEDDING_RESPONSE_INCOMPLETE");
  }
  return { vectors: queries.map((_, index) => normalizeCustomEmbedding(byIndex.get(index)!)),
    tokenUsage: result.usage.prompt_tokens };
}

async function loadDescriptor(env: CustomSearchEnv, releaseId: string) {
  const physicalReleaseId = env.CUSTOM_SEARCH_PHYSICAL_RELEASE_ID
    ? searchReleaseIdSchema.parse(env.CUSTOM_SEARCH_PHYSICAL_RELEASE_ID)
    : releaseId;
  const expectedKey = z.string().min(1).max(1_024).parse(env.CUSTOM_RUNTIME_DESCRIPTOR_KEY);
  const expectedSha256 = sha256Schema.parse(env.CUSTOM_RUNTIME_DESCRIPTOR_SHA256);
  const component = await env.CATALOG_DB.prepare(`SELECT runtime_descriptor_r2_key AS descriptorKey,
      runtime_descriptor_sha256 AS descriptorSha256,sparse_manifest_sha256 AS sparseManifestSha256
    FROM legal_custom_search_r2_runtime_roots WHERE search_release_id=?
    UNION ALL
    SELECT runtime_descriptor_r2_key,runtime_descriptor_sha256,sparse_manifest_sha256
    FROM legal_custom_search_runtime_components WHERE search_release_id=?
      AND NOT EXISTS (SELECT 1 FROM legal_custom_search_r2_runtime_roots WHERE search_release_id=?)
    LIMIT 1`).bind(releaseId, releaseId, releaseId)
    .first<{ descriptorKey: string; descriptorSha256: string; sparseManifestSha256: string }>();
  if (!component || component.descriptorKey !== expectedKey
    || component.descriptorSha256 !== expectedSha256) {
    throw new TypeError("CUSTOM_SEARCH_RUNTIME_COMPONENT_MISMATCH");
  }
  const object = await env.ARTIFACTS.get(expectedKey);
  if (!object || object.size > 128 * 1024) throw new TypeError("CUSTOM_SEARCH_DESCRIPTOR_MISSING");
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (await customCurrentSha256(bytes) !== expectedSha256) {
    throw new TypeError("CUSTOM_SEARCH_DESCRIPTOR_CORRUPT");
  }
  const descriptor = parseCustomBm25RuntimeDescriptor(JSON.parse(new TextDecoder().decode(bytes)));
  if (descriptor.releaseId !== physicalReleaseId
    || descriptor.sparseManifestSha256 !== component.sparseManifestSha256) {
    throw new TypeError("CUSTOM_SEARCH_DESCRIPTOR_IDENTITY_MISMATCH");
  }
  return descriptor;
}

async function itemKeysForOrdinals(env: CustomSearchEnv, releaseId: string, ordinals: number[]) {
  const result = new Map<number, string>();
  for (let offset = 0; offset < ordinals.length; offset += 80) {
    const group = ordinals.slice(offset, offset + 80);
    const placeholders = group.map(() => "?").join(",");
    const rows = await env.CATALOG_DB.prepare(`SELECT item_ordinal AS ordinal,item_key AS itemKey
      FROM legal_custom_search_runtime_items
      WHERE search_release_id=? AND item_ordinal IN (${placeholders})`).bind(
      releaseId, ...group,
    ).all<{ ordinal: number; itemKey: string }>();
    for (const row of rows.results) result.set(Number(row.ordinal), row.itemKey);
  }
  if (result.size !== ordinals.length) throw new TypeError("CUSTOM_SEARCH_ORDINAL_MAPPING_MISSING");
  return ordinals.map((ordinal) => result.get(ordinal)!);
}

export async function executeCustomSearch(env: CustomSearchEnv, raw: unknown) {
  const input = requestSchema.parse(raw);
  if (env.APP_ENV !== "staging" && env.APP_ENV !== "production") {
    throw new TypeError("CUSTOM_SEARCH_ENVIRONMENT_REJECTED");
  }
  const capability = z.enum(["current", "history"]).safeParse(env.CUSTOM_SEARCH_CAPABILITY);
  if (!capability.success) throw new TypeError("CUSTOM_SEARCH_CAPABILITY_REJECTED");
  if (input.releaseId !== env.CUSTOM_SEARCH_RELEASE_ID
    || input.instanceIds[0] !== env.CUSTOM_SEARCH_INSTANCE_ID
    || (capability.data === "current" && input.endpoint.kind !== "current")
    || (capability.data === "history" && input.endpoint.kind !== "timestamp")) {
    throw new TypeError("CUSTOM_SEARCH_RELEASE_REJECTED");
  }
  const descriptor = await loadDescriptor(env, input.releaseId);
  const denseMetadataReleaseId = descriptor.denseMetadataReleaseId ?? descriptor.releaseId;
  const queries = "query" in input ? [input.query] : input.queries;
  await reserveQueryBudget(env, input.releaseId, queries.length);
  const atEpoch = Math.floor(new Date(input.endpoint.kind === "timestamp"
    ? input.endpoint.instant : input.currentAt).getTime() / 1_000);
  const embedding = await queryEmbeddings(env, queries);
  const results = await Promise.all(queries.map(async (query, queryIndex) => {
    const [sparse, dense] = await Promise.all([
      queryCustomBm25Runtime(env.ARTIFACTS, descriptor,
        { text: query, atEpoch, topK: input.maxResults }),
      queryCustomDenseLane(env.DENSE, {
        releaseId: denseMetadataReleaseId,
        vector: embedding.vectors[queryIndex]!,
        filter: buildCustomVectorizeFilter({ releaseId: denseMetadataReleaseId, atEpoch }),
        topK: input.maxResults,
      }),
    ]);
    const sparseOrdinals = sparse.map((entry) => entry.ordinal);
    const runtimeKeys = await resolveCustomBm25RuntimeItemKeys(env.ARTIFACTS, descriptor,
      sparseOrdinals);
    const sparseKeys = runtimeKeys
      ? runtimeKeys.map((key) => `search-releases/${input.releaseId}/${key}`)
      : await itemKeysForOrdinals(env, input.releaseId, sparseOrdinals);
    const denseKeys = dense.map((entry) =>
      `search-releases/${input.releaseId}/${entry.itemKey}`);
    const fused = fuseCustomRankedLanes([sparseKeys, denseKeys], { k: 60, topK: input.maxResults });
    const sparseByKey = new Map(sparseKeys.map((key, index) => [key, {
      rank: index + 1, score: sparse[index]!.score,
    }]));
    const denseByKey = new Map(denseKeys.map((key, index) => [key, {
      rank: index + 1, score: dense[index]!.score,
    }]));
    return {
      queryIndex,
      hits: fused.map((entry) => ({
        itemKey: entry.itemKey,
        instanceId: env.CUSTOM_SEARCH_INSTANCE_ID,
        shardId: env.CUSTOM_SEARCH_SHARD_ID,
        vectorRank: denseByKey.get(entry.itemKey)?.rank ?? dense.length + 1,
        vectorScore: denseByKey.get(entry.itemKey)?.score ?? 0,
        keywordRank: sparseByKey.get(entry.itemKey)?.rank ?? sparse.length + 1,
        keywordScore: sparseByKey.get(entry.itemKey)?.score ?? 0,
        fusionScore: entry.score,
      })),
    };
  }));
  const batch = customSearchBatchResponseSchema.parse({
    results,
    errors: [],
    searchedInstanceIds: input.instanceIds,
    tokenUsage: embedding.tokenUsage,
  });
  if (!("query" in input)) return batch;
  return customSearchResponseSchema.parse({
    hits: batch.results[0]!.hits,
    errors: batch.errors,
    searchedInstanceIds: batch.searchedInstanceIds,
    tokenUsage: batch.tokenUsage,
  });
}

export async function handleCustomSearchRequest(request: Request, env: CustomSearchEnv): Promise<Response> {
  const environment = legalEnvironmentSchema.safeParse(env.APP_ENV);
  if (!environment.success || !acceptsPrivateServiceRequest(request, {
    environment: environment.data,
    marker: CUSTOM_SEARCH_SERVICE_MARKER,
    method: "POST",
    path: CUSTOM_SEARCH_PATH,
    requireJson: true,
  })) return privateServiceJson({ code: "CUSTOM_SEARCH_PRIVATE_ROUTE_REJECTED" }, 404);
  try {
    if (!declaredRequestBodyWithinLimit(request, 8_192)) {
      throw new TypeError("CUSTOM_SEARCH_REQUEST_TOO_LARGE");
    }
    const body = await request.json();
    return privateServiceJson(await serializeCustomSearch(() => executeCustomSearch(env, body)));
  } catch {
    return privateServiceJson({ code: "CUSTOM_SEARCH_UNAVAILABLE" }, 503);
  }
}
