import assert from "node:assert/strict";
import test from "node:test";

import {
  createAiSearchCandidateIndex,
  createCloudflareAiSearchProvider,
  createInMemoryCandidateIndex,
  createQdrantCandidateIndex,
  parseCandidatePacket,
  parsePinnedCandidateRelease,
  runCandidateShadow,
  type CandidatePacket,
  type LegalCandidateIndex,
  type PinnedCandidateRelease,
  type QuestionInterpretation,
} from "../lib/legal-corpus/legal-candidate-index";
import { governedAiSearchInstanceUpdate } from "../lib/legal-corpus/ai-search-management";

const interpretation: QuestionInterpretation = {
  id: "interpretation-1",
  formulations: [{
    id: "formulation-1",
    text: "прекращение трудового договора",
    privateNameSpans: [],
    readingIds: ["reading-termination"],
    requirementIds: ["requirement-governing-rule"],
  }],
};
const endpoint = { kind: "current" as const };
const release: PinnedCandidateRelease = parsePinnedCandidateRelease({
  id: "release-current-v1",
  environment: "development",
  capability: "current",
  instances: [{ id: "current-00", shardId: "current-00" }],
  configuration: {
    identity: "ai-search-current-v1",
    embeddingModel: "openai/text-embedding-3-large",
    dimensions: 1_536,
    keywordTokenizer: "porter",
    metadataSchema: ["language", "document_type", "valid_from", "valid_to"],
    gatewayIdentity: "juro-ai-search-development",
    providerProjectIdentity: "juro-openai-development",
    gatewayPayloadLogging: false,
    gatewayCaching: false,
    similarityCaching: false,
  },
});
const itemKey = `search-releases/${release.id}/current/current-00/rendition-10.md`;
const normalizedCandidate = {
  itemKey,
  instanceId: "current-00",
  shardId: "current-00",
  vectorRank: 1,
  vectorScore: 0.92,
  keywordRank: 2,
  keywordScore: 4.5,
  fusionScore: 0.8,
};
const providerMetadata = {
  language: "ru" as const,
  document_type: "Закон",
  valid_from: "2026-01-01T00:00:00.000Z",
  valid_to: null,
};
const managementAttestation = {
  instanceId: "current-00",
  configuration: release.configuration,
  evidenceSha256: "a".repeat(64),
  observedAt: "2026-09-02T00:00:00.000Z",
};

function aiProvider(overrides: {
  configuration?: PinnedCandidateRelease["configuration"];
  hits?: Array<typeof normalizedCandidate & { candidateText?: string }>;
  errors?: Array<{ code: string; instanceId?: string }>;
  searchedInstanceIds?: string[];
} = {}) {
  return {
    async attest() {
      return overrides.configuration ?? release.configuration;
    },
    async search() {
      return {
        hits: overrides.hits ?? [normalizedCandidate],
        errors: overrides.errors ?? [],
        searchedInstanceIds: overrides.searchedInstanceIds ?? ["current-00"],
      };
    },
  };
}

const knownPrivateNameSpans = [
  "Иван Петров", "Dilshod Karimov", "Jane Doe", "Ivan Petrov", "John", "Ивана", "Ivanga",
] as const;
const completePrivateNameAttestation = {
  async attestPrivateNames(input: { text: string; formulationSha256: string }) {
    return {
      classifierVersion: "juro-local-pii-v1",
      formulationSha256: input.formulationSha256,
      status: "complete",
      privateNameSpans: knownPrivateNameSpans.filter((name) => input.text.includes(name)),
    };
  },
} as const;

async function assertCandidateContract(index: LegalCandidateIndex): Promise<void> {
  const packet = await index.retrieve(interpretation, endpoint, release);
  assert.equal(packet.availability, "available");
  assert.equal(packet.releaseId, release.id);
  assert.deepEqual(packet.endpoint, endpoint);
  assert.deepEqual(packet.requiredInstanceIds, ["current-00"]);
  assert.deepEqual(packet.partialErrors, []);
  assert.deepEqual(packet.candidates, [{
    itemKey,
    instanceId: "current-00",
    shardId: "current-00",
    formulationId: "formulation-1",
    readingIds: ["reading-termination"],
    requirementIds: ["requirement-governing-rule"],
    vectorRank: 1,
    vectorScore: 0.92,
    keywordRank: 2,
    keywordScore: 4.5,
    fusionScore: 0.8,
  }]);
  assert.equal(Object.hasOwn(packet, "legalConclusion"), false);
  assert.equal(Object.hasOwn(packet.candidates[0] ?? {}, "text"), false);
}

test("AI Search, Qdrant/D1, and memory adapters satisfy one LegalCandidateIndex contract", async () => {
  const memory = createInMemoryCandidateIndex(async () => [normalizedCandidate]);
  const qdrant = createQdrantCandidateIndex(async () => [normalizedCandidate]);
  const aiSearch = createAiSearchCandidateIndex({
    async attest(instanceId) {
      assert.equal(instanceId, "current-00");
      return release.configuration;
    },
    async search(request) {
      assert.equal(request.maxResults, 50);
      assert.equal(request.vectorThreshold, 0);
      assert.deepEqual(request.instanceIds, ["current-00"]);
      return {
        hits: [{ ...normalizedCandidate, candidateText: "untrusted provider excerpt" }],
        errors: [],
        searchedInstanceIds: request.instanceIds,
      };
    },
  }, completePrivateNameAttestation);

  await assertCandidateContract(memory);
  await assertCandidateContract(qdrant);
  await assertCandidateContract(aiSearch);
});

test("Cloudflare AI Search namespace adapter attests pinned configuration and preserves hybrid ranks", async () => {
  const calls: unknown[] = [];
  const namespace = {
    get(instanceId: string) {
      assert.equal(instanceId, "current-00");
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
            chunk_size: 4096,
            chunk_overlap: 0,
            public_endpoint_params: {
              enabled: false,
              chat_completions_endpoint: { disabled: true },
              search_endpoint: { disabled: true },
              mcp: { disabled: true },
            },
            sync_interval: 86400,
            source_params: { prefix: `search-releases/${release.id}/current/` },
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
      calls.push(input);
      return {
        search_query: "прекращение трудового договора",
        chunks: [{
          id: "provider-chunk-1",
          instance_id: "current-00",
          type: "text/markdown",
          score: 0.8,
          text: "candidate excerpt must not cross the adapter",
          item: { key: itemKey, metadata: {
            language: "ru", document_type: "Закон",
            valid_from: "2026-01-01T00:00:00.000Z",
          } },
          scoring_details: {
            vector_rank: 1,
            vector_score: 0.92,
            keyword_rank: 2,
            keyword_score: 4.5,
            fusion_method: "rrf",
          },
        }],
        errors: [],
      };
    },
  };
  const provider = createCloudflareAiSearchProvider(namespace as unknown as AiSearchNamespace, {
    namespaceIdentity: "juro-legal-development",
    sourceBucketName: "juro-legal-ai-search-development",
    sourcePrefix: `search-releases/${release.id}/current/`,
    shardByInstance: { "current-00": "current-00" },
    configuration: release.configuration,
    async attestManagement() { return managementAttestation; },
  });

  assert.deepEqual(await provider.attest("current-00"), release.configuration);
  const result = await provider.search({
    instanceIds: ["current-00"],
    query: interpretation.formulations[0]!.text,
    endpoint,
    maxResults: 50,
    vectorThreshold: 0,
  });
  assert.deepEqual(calls, [{
    query: interpretation.formulations[0]!.text,
    ai_search_options: {
      instance_ids: ["current-00"],
      retrieval: {
        retrieval_type: "hybrid",
        fusion_method: "rrf",
        max_num_results: 50,
        match_threshold: 0,
        context_expansion: 0,
        metadata_only: true,
        return_on_failure: false,
      },
      query_rewrite: { enabled: false },
      reranking: { enabled: false },
      cache: { enabled: false },
    },
  }]);
  assert.deepEqual(result, {
    hits: [{ ...normalizedCandidate, providerMetadata }],
    errors: [],
    searchedInstanceIds: ["current-00"],
  });
});

test("Cloudflare AI Search namespace adapter rejects configuration drift", async () => {
  let keywordMatchMode: "and" | "or" = "and";
  let publicEndpointEnabled = false;
  let chunkSize = 4096;
  let chunkOverlap = 0;
  const provider = createCloudflareAiSearchProvider({
    get() {
      return {
        async info() {
          return {
            id: "current-00",
            namespace: "juro-legal-development",
            type: "r2",
            source: "juro-legal-ai-search-development",
            paused: true,
            embedding_model: "openai/text-embedding-3-large",
            ai_gateway_id: "juro-ai-search-development",
            rewrite_query: false,
            reranking: false,
            index_method: { vector: true, keyword: true },
            fusion_method: "rrf",
            indexing_options: { keyword_tokenizer: "porter" },
            retrieval_options: { keyword_match_mode: keywordMatchMode },
            max_num_results: 50,
            score_threshold: 0,
            cache: false,
            chunk: true,
            chunk_size: chunkSize,
            chunk_overlap: chunkOverlap,
            public_endpoint_params: { enabled: publicEndpointEnabled, custom_domains: [] },
            sync_interval: 86400,
            source_params: { prefix: `search-releases/${release.id}/current/` },
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
  } as unknown as AiSearchNamespace, {
    namespaceIdentity: "juro-legal-development",
    sourceBucketName: "juro-legal-ai-search-development",
    sourcePrefix: `search-releases/${release.id}/current/`,
    shardByInstance: { "current-00": "current-00" },
    configuration: release.configuration,
    async attestManagement() { return managementAttestation; },
  });

  await assert.rejects(provider.attest("current-00"), /AI_SEARCH_CONFIGURATION_DRIFT/u);
  keywordMatchMode = "or";
  publicEndpointEnabled = true;
  await assert.rejects(provider.attest("current-00"), /AI_SEARCH_CONFIGURATION_DRIFT/u);
  publicEndpointEnabled = false;
  chunkSize = 4095;
  await assert.rejects(provider.attest("current-00"), /AI_SEARCH_CONFIGURATION_DRIFT/u);
  chunkSize = 4096;
  chunkOverlap = 1;
  await assert.rejects(provider.attest("current-00"), /AI_SEARCH_CONFIGURATION_DRIFT/u);
});

test("Cloudflare AI Search namespace adapter rejects stale management privacy evidence", async () => {
  let observedAt = "2026-09-01T00:00:00.000Z";
  const provider = createCloudflareAiSearchProvider({
    get() {
      return { async info() { return {
        id: "current-00", namespace: "juro-legal-development", type: "r2",
        source: "juro-legal-ai-search-development", paused: true,
        modified_at: "2026-09-02T00:00:00.000Z",
        embedding_model: "openai/text-embedding-3-large",
        ai_gateway_id: "juro-ai-search-development", rewrite_query: false, reranking: false,
        index_method: { vector: true, keyword: true }, fusion_method: "rrf",
        indexing_options: { keyword_tokenizer: "porter" },
        retrieval_options: { keyword_match_mode: "or" }, max_num_results: 50,
        score_threshold: 0, cache: false, chunk: true, chunk_size: 4096,
        chunk_overlap: 0, public_endpoint_params: { enabled: false, custom_domains: [] },
        sync_interval: 86400,
        source_params: { prefix: `search-releases/${release.id}/current/` },
        custom_metadata: [
          { field_name: "language", data_type: "text" },
          { field_name: "document_type", data_type: "text" },
          { field_name: "valid_from", data_type: "datetime" },
          { field_name: "valid_to", data_type: "datetime" },
        ],
      }; } };
    },
  } as unknown as AiSearchNamespace, {
    namespaceIdentity: "juro-legal-development",
    sourceBucketName: "juro-legal-ai-search-development",
    sourcePrefix: `search-releases/${release.id}/current/`,
    shardByInstance: { "current-00": "current-00" },
    configuration: release.configuration,
    async attestManagement() {
      return { ...managementAttestation, observedAt };
    },
  });
  await assert.rejects(provider.attest("current-00"), /AI_SEARCH_CONFIGURATION_DRIFT/u);
  observedAt = "2026-09-02T00:00:00.000Z";
  await assert.doesNotReject(provider.attest("current-00"));
});

test("governed AI Search instance updates pin retrieval, privacy, sync, and tokenizer settings", () => {
  assert.deepEqual(governedAiSearchInstanceUpdate("trigram"), {
    paused: true,
    ai_gateway_id: "juro-ai-search-staging",
    rewrite_query: false,
    reranking: false,
    index_method: { vector: true, keyword: true },
    fusion_method: "rrf",
    indexing_options: { keyword_tokenizer: "trigram" },
    retrieval_options: { keyword_match_mode: "or" },
    chunk: true,
    chunk_size: 4096,
    chunk_overlap: 0,
    score_threshold: 0,
    max_num_results: 50,
    cache: false,
    public_endpoint_params: {
      enabled: false,
      chat_completions_endpoint: { disabled: true },
      search_endpoint: { disabled: true },
      mcp: { disabled: true },
    },
    sync_interval: 86400,
    custom_metadata: [
      { field_name: "language", data_type: "text" },
      { field_name: "document_type", data_type: "text" },
      { field_name: "valid_from", data_type: "datetime" },
      { field_name: "valid_to", data_type: "datetime" },
    ],
  });
});

test("shadow AI Search cannot change the active packet", async () => {
  const activePacket: CandidatePacket = parseCandidatePacket({
    availability: "available",
    releaseId: release.id,
    endpoint,
    requiredInstanceIds: ["current-00"],
    candidates: [],
    partialErrors: [],
  });
  const active: LegalCandidateIndex = { retrieve: async () => activePacket };
  const shadow: LegalCandidateIndex = {
    retrieve: async () => parseCandidatePacket({
      ...activePacket,
      availability: "unavailable",
      partialErrors: [{ code: "AI_SEARCH_PARTIAL_RESPONSE", instanceId: "current-00" }],
    }),
  };
  let observedShadow: CandidatePacket | undefined;
  const visible = await runCandidateShadow({
    active,
    shadow,
    interpretation,
    endpoint,
    release,
    observe: (packet) => { observedShadow = packet; },
  });
  assert.deepEqual(visible, activePacket);
  assert.equal(observedShadow?.availability, "unavailable");
});

test("AI Search invalidates the complete packet for every namespace integrity failure", async (t) => {
  const cases: Array<{
    name: string;
    expectedCode: CandidatePacket["partialErrors"][number]["code"];
    provider: ReturnType<typeof aiProvider>;
  }> = [{
    name: "partial provider response",
    expectedCode: "AI_SEARCH_PARTIAL_RESPONSE",
    provider: aiProvider({ errors: [{ code: "namespace_timeout", instanceId: "current-00" }] }),
  }, {
    name: "missing required instance",
    expectedCode: "AI_SEARCH_MISSING_INSTANCE",
    provider: aiProvider({ searchedInstanceIds: [] }),
  }, {
    name: "unknown searched instance",
    expectedCode: "AI_SEARCH_UNKNOWN_INSTANCE",
    provider: aiProvider({ searchedInstanceIds: ["current-00", "foreign-00"] }),
  }, {
    name: "duplicate searched instance",
    expectedCode: "AI_SEARCH_PARTIAL_RESPONSE",
    provider: aiProvider({ searchedInstanceIds: ["current-00", "current-00"] }),
  }, {
    name: "unknown hit instance",
    expectedCode: "AI_SEARCH_UNKNOWN_INSTANCE",
    provider: aiProvider({ hits: [{
      ...normalizedCandidate,
      instanceId: "foreign-00",
    }] }),
  }, {
    name: "wrong release item",
    expectedCode: "AI_SEARCH_WRONG_RELEASE",
    provider: aiProvider({ hits: [{
      ...normalizedCandidate,
      itemKey: "search-releases/release-foreign/current/current-00/rendition-10.md",
    }] }),
  }, {
    name: "wrong shard",
    expectedCode: "AI_SEARCH_WRONG_RELEASE",
    provider: aiProvider({ hits: [{
      ...normalizedCandidate,
      shardId: "current-foreign",
    }] }),
  }, {
    name: "configuration drift",
    expectedCode: "AI_SEARCH_CONFIGURATION_DRIFT",
    provider: aiProvider({ configuration: {
      ...release.configuration,
      keywordTokenizer: "trigram",
    } }),
  }];

  for (const failure of cases) {
    await t.test(failure.name, async () => {
      const packet = await createAiSearchCandidateIndex(failure.provider,
        completePrivateNameAttestation)
        .retrieve(interpretation, endpoint, release);
      assert.equal(packet.availability, "unavailable");
      assert.deepEqual(packet.candidates, []);
      assert.equal(packet.partialErrors[0]?.code, failure.expectedCode);
    });
  }
});

test("AI Search caps provider results and deterministically deduplicates locator mappings", async () => {
  const secondInterpretation: QuestionInterpretation = {
    id: "interpretation-2",
    formulations: [interpretation.formulations[0]!, {
      id: "formulation-2",
      text: "mehnat shartnomasini bekor qilish",
      privateNameSpans: [],
      readingIds: ["reading-uzbek"],
      requirementIds: ["requirement-exception"],
    }],
  };
  let call = 0;
  const provider = {
    async attest() { return release.configuration; },
    async search() {
      call += 1;
      const score = call === 1 ? 0.7 : 0.9;
      return {
        hits: Array.from({ length: 55 }, (_, index) => ({
          ...normalizedCandidate,
          itemKey: index === 0
            ? itemKey
            : `search-releases/${release.id}/current/current-00/rendition-${index + 100}.md`,
          fusionScore: score - index / 1_000,
          vectorRank: index + 1,
          keywordRank: index + 1,
          candidateText: "provider text must not cross the seam",
        })),
        errors: [],
        searchedInstanceIds: ["current-00"],
      };
    },
  };

  const first = await createAiSearchCandidateIndex(provider, completePrivateNameAttestation)
    .retrieve(secondInterpretation, endpoint, release);
  assert.equal(first.availability, "available");
  assert.equal(first.candidates.length, 50);
  assert.deepEqual(first.candidates.find((candidate) => candidate.itemKey === itemKey), {
    ...normalizedCandidate,
    keywordRank: 1,
    formulationId: "formulation-2",
    readingIds: ["reading-termination", "reading-uzbek"],
    requirementIds: ["requirement-exception", "requirement-governing-rule"],
    fusionScore: 0.9,
  });
  assert.equal(first.candidates.some((candidate) => Object.hasOwn(candidate, "candidateText")), false);
  assert.deepEqual(first.candidates.map((candidate) => candidate.itemKey),
    [...first.candidates].sort((left, right) =>
      right.fusionScore - left.fusionScore || left.itemKey.localeCompare(right.itemKey))
      .map((candidate) => candidate.itemKey));
});

test("retrieval sends every formulation unchanged and ignores content classifiers", async () => {
  const queries: string[] = [];
  let classifierCalls = 0;
  const raw = "Ivan Petrov, ivan@example.com, case ABC-123, key sk-proj-example123456789012345: Labor Code dismissal";
  const packet = await createAiSearchCandidateIndex({
    async attest() { return release.configuration; },
    async search(request) {
      queries.push(request.query);
      return { hits: [], errors: [], searchedInstanceIds: request.instanceIds };
    },
  }, {
    async attestPrivateNames() {
      classifierCalls += 1;
      throw new Error("content classification must not run");
    },
    resolveTrustedLegalTitles: async () => { throw new Error("title filtering must not run"); },
  }).retrieve({
    id: "unmodified-retrieval-formulation",
    formulations: [{
      id: "unmodified-retrieval-formulation-1",
      text: raw,
      legalTitleSpans: ["Labor Code"],
      privateNameSpans: ["Ivan Petrov"],
      readingIds: ["reading-1"],
      requirementIds: ["requirement-1"],
    }],
  }, endpoint, release);

  assert.equal(packet.availability, "available");
  assert.deepEqual(queries, [raw]);
  assert.equal(classifierCalls, 0);
});

test("more than ten instances are searched in deterministic waves and globally rank-fused", async () => {
  const instances = Array.from({ length: 11 }, (_, index) => ({
    id: `history-${String(index).padStart(2, "0")}`,
    shardId: `history-${String(index).padStart(2, "0")}`,
  }));
  const historyRelease: PinnedCandidateRelease = parsePinnedCandidateRelease({
    ...release,
    id: "release-history-many-shards",
    capability: "history",
    instances,
  });
  const calls: string[][] = [];
  const packet = await createAiSearchCandidateIndex({
    async attest() { return historyRelease.configuration; },
    async search(request) {
      calls.push(request.instanceIds);
      const secondWave = request.instanceIds.length === 1;
      const instanceId = request.instanceIds[0]!;
      return {
        hits: [{
          ...normalizedCandidate,
          itemKey: `search-releases/${historyRelease.id}/history/${instanceId}/item.md`,
          instanceId,
          shardId: instanceId,
          vectorRank: secondWave ? 1 : 10,
          keywordRank: secondWave ? 1 : 10,
          fusionScore: secondWave ? 0.01 : 0.99,
        }],
        errors: [],
        searchedInstanceIds: request.instanceIds,
      };
    },
  }, completePrivateNameAttestation).retrieve(
    interpretation,
    { kind: "timestamp", instant: "2026-01-01T00:00:00.000Z" },
    historyRelease,
  );

  assert.equal(packet.availability, "available");
  assert.deepEqual(calls.map((wave) => wave.length), [10, 1]);
  assert.equal(packet.candidates[0]?.instanceId, "history-10",
    "global RRF must not compare provider-local fusion scores across waves");
});

test("privacy and cache configuration drift fails closed before a provider search", async () => {
  let searches = 0;
  const packet = await createAiSearchCandidateIndex({
    async attest() {
      return { ...release.configuration, gatewayPayloadLogging: true };
    },
    async search() {
      searches += 1;
      return { hits: [], errors: [], searchedInstanceIds: ["current-00"] };
    },
  }, completePrivateNameAttestation).retrieve(interpretation, endpoint, release);

  assert.equal(searches, 0);
  assert.equal(packet.availability, "unavailable");
  assert.equal(packet.partialErrors[0]?.code, "AI_SEARCH_CONFIGURATION_DRIFT");
});
