import assert from "node:assert/strict";
import test from "node:test";

import { createRuntimeAiSearchProvider } from "../lib/legal-corpus/target-runtime";

const configuration = {
  identity: "ai-search-governed-v1",
  metadataSchema: ["language", "document_type", "valid_from", "valid_to"],
  fifthMetadataFieldReserved: true,
  embeddingModel: "openai/text-embedding-3-large",
  dimensions: 1_536,
  keywordTokenizer: "porter",
  gatewayIdentity: "juro-ai-search-development",
  providerProjectIdentity: "juro-openai-development",
  providerNamespaceIdentity: "juro-legal-development",
  sourcePrefix: "search-releases/release-development/current/",
  serviceBindingIdentity: "LEGAL_CORPUS_SERVICE",
  gatewayPayloadLogging: false,
  gatewayCaching: false,
  similarityCaching: false,
  queryRewriting: false,
  providerReranking: false,
  providerGeneration: false,
  contextExpansion: false,
};

function runtimeDatabase(options: { missingMapping?: boolean } = {}): D1Database {
  return {
    prepare(sql: string) {
      return {
        bind() {
          return {
            async first() {
              return {
                governanceId: "governance-development-v1",
                evidenceJson: JSON.stringify({ configuration }),
                recordedAt: "2026-09-02T00:00:00.000Z",
                providerNamespace: "juro-legal-development",
              };
            },
            async all() {
              return { results: [{
                shardId: "00",
                syncState: "complete",
                instanceId: options.missingMapping ? null : "juro-current-development-00",
                providerNamespace: options.missingMapping ? null : "juro-legal-development",
                scheduledIndexingPaused: options.missingMapping ? null : 1,
              }] };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

function runtimeNamespace(searchCalls: unknown[]): AiSearchNamespace {
  return {
    get(instanceId: string) {
      return {
        async info() {
          return {
            id: instanceId,
            namespace: "juro-legal-development",
            type: "r2",
            source: "juro-legal-ai-search-development",
            paused: true,
            modified_at: "2026-09-01T00:00:00.000Z",
            embedding_model: "openai/text-embedding-3-large",
            ai_gateway_id: "juro-ai-search-development",
            rewrite_query: false,
            reranking: false,
            index_method: { vector: true, keyword: true },
            fusion_method: "rrf",
            indexing_options: { keyword_tokenizer: "porter" },
            retrieval_options: { keyword_match_mode: "or" },
            max_num_results: 50,
            score_threshold: 0,
            cache: false,
            chunk: true,
            chunk_size: 4_096,
            chunk_overlap: 0,
            public_endpoint_params: { enabled: false },
            sync_interval: 86_400,
            source_params: { prefix: configuration.sourcePrefix },
            custom_metadata: [
              { field_name: "language", data_type: "text" },
              { field_name: "document_type", data_type: "text" },
              { field_name: "valid_from", data_type: "datetime" },
              { field_name: "valid_to", data_type: "datetime" },
            ],
          };
        },
      };
    },
    async search(input: unknown) {
      searchCalls.push(input);
      return { search_query: "test", chunks: [], errors: [] };
    },
  } as unknown as AiSearchNamespace;
}

test("runtime AI Search provider resolves exact governed identities through the native binding", async () => {
  const searchCalls: unknown[] = [];
  const provider = createRuntimeAiSearchProvider({
    db: runtimeDatabase(),
    namespace: runtimeNamespace(searchCalls),
    namespaceName: "juro-legal-development",
    sourceBucketName: "juro-legal-ai-search-development",
  });
  const instanceId = "juro-current-development-00";
  assert.deepEqual(await provider.attest(instanceId), {
    identity: configuration.identity,
    embeddingModel: configuration.embeddingModel,
    dimensions: configuration.dimensions,
    keywordTokenizer: configuration.keywordTokenizer,
    metadataSchema: configuration.metadataSchema,
    gatewayIdentity: configuration.gatewayIdentity,
    providerProjectIdentity: configuration.providerProjectIdentity,
    gatewayPayloadLogging: false,
    gatewayCaching: false,
    similarityCaching: false,
  });
  const result = await provider.search({
    instanceIds: [instanceId],
    query: "тест",
    endpoint: { kind: "current" },
    maxResults: 50,
    vectorThreshold: 0,
  });
  assert.deepEqual(result, {
    hits: [], errors: [], searchedInstanceIds: [instanceId],
  });
  assert.equal(searchCalls.length, 1);
});

test("runtime AI Search provider rejects a governed shard without a provider mapping", async () => {
  const provider = createRuntimeAiSearchProvider({
    db: runtimeDatabase({ missingMapping: true }),
    namespace: runtimeNamespace([]),
    namespaceName: "juro-legal-development",
    sourceBucketName: "juro-legal-ai-search-development",
  });
  await assert.rejects(
    () => provider.attest("juro-current-development-00"),
    /AI_SEARCH_PROVIDER_SHARD_MAPPING_INCOMPLETE/u,
  );
});
