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

test("actual provider requests remove multilingual private facts and retain material legal facts", async () => {
  const cases = [{
    id: "ru",
    raw: "Меня зовут Иван Петров. Телефон +998 90 123 45 67, ivan@example.com, адрес: ул. Навои 12. Меня уволили 15.03.2026 во время отпуска. Пароль: S3cr3t!",
    absent: ["Иван", "Петров", "+998", "ivan@example.com", "Навои", "S3cr3t"],
    privateNames: ["Иван Петров"],
    retained: ["уволили", "15.03.2026", "отпуска"],
  }, {
    id: "uz",
    raw: "Mening ismim Dilshod Karimov. JSHSHIR 12345678901234, karta 8600123412341234. Men 2026-03-15 kuni homiladorlik ta'tilida ishdan bo'shatildim.",
    absent: ["Dilshod", "Karimov", "12345678901234", "8600123412341234"],
    privateNames: ["Dilshod Karimov"],
    retained: ["2026-03-15", "homiladorlik", "bo'shatildim"],
  }, {
    id: "en",
    raw: "My name is Jane Doe. Case no. ABC-123. I was dismissed on 2026-03-15 while on parental leave. Irrelevant story: my car is blue.",
    absent: ["Jane", "Doe", "ABC-123", "car is blue"],
    privateNames: ["Jane Doe"],
    retained: ["dismissed", "2026-03-15", "parental leave"],
  }];

  for (const input of cases) {
    const providerQueries: string[] = [];
    const telemetry: unknown[] = [];
    const index = createAiSearchCandidateIndex({
      async attest() { return release.configuration; },
      async search(request) {
        providerQueries.push(request.query);
        return { hits: [], errors: [], searchedInstanceIds: request.instanceIds, tokenUsage: 17 };
      },
    }, {
      ...completePrivateNameAttestation,
      emitTelemetry: (event) => { telemetry.push(event); },
    });
    const packet = await index.retrieve({
      id: `privacy-${input.id}`,
      formulations: [{
        id: `formulation-${input.id}`,
        text: input.raw,
        privateNameSpans: input.privateNames,
        readingIds: [`reading-${input.id}`],
        requirementIds: [`requirement-${input.id}`],
      }],
    }, endpoint, release);

    assert.equal(packet.availability, "available");
    assert.equal(providerQueries.length, 1);
    for (const privateValue of input.absent) {
      assert.equal(providerQueries[0]?.includes(privateValue), false, privateValue);
    }
    for (const materialFact of input.retained) {
      assert.equal(providerQueries[0]?.includes(materialFact), true, materialFact);
    }
    const serializedTelemetry = JSON.stringify(telemetry);
    assert.equal(serializedTelemetry.includes(input.raw), false);
    assert.equal(serializedTelemetry.includes(providerQueries[0] ?? ""), false);
    assert.match(serializedTelemetry, /"correlationHash":"[a-f0-9]{64}"/u);
    assert.match(serializedTelemetry, /"tokenUsage":17/u);
  }
});

test("unlabelled multilingual names and ordinary street addresses never cross the provider boundary", async () => {
  const providerQueries: string[] = [];
  const packet = await createAiSearchCandidateIndex({
    async attest() { return release.configuration; },
    async search(request) {
      providerQueries.push(request.query);
      return { hits: [], errors: [], searchedInstanceIds: request.instanceIds };
    },
  }, completePrivateNameAttestation).retrieve({
    id: "privacy-unlabelled-identifiers",
    formulations: [{
      id: "privacy-unlabelled-identifiers-formulation",
      text: "Иван Петров живёт на улице Навои, дом 12. Работодатель уволил его 2026-03-15 во время отпуска.",
      privateNameSpans: ["Иван Петров"],
      readingIds: ["privacy-unlabelled-identifiers-reading"],
      requirementIds: ["privacy-unlabelled-identifiers-requirement"],
    }],
  }, endpoint, release);

  assert.equal(packet.availability, "available");
  assert.equal(providerQueries.length, 1);
  assert.equal(providerQueries[0]?.includes("Иван"), false);
  assert.equal(providerQueries[0]?.includes("Петров"), false);
  assert.equal(providerQueries[0]?.includes("Навои"), false);
  assert.equal(providerQueries[0]?.includes("дом 12"), false);
  assert.match(providerQueries[0] ?? "", /уволил/u);
  assert.match(providerQueries[0] ?? "", /2026-03-15/u);
  assert.match(providerQueries[0] ?? "", /отпуска/u);
});

test("privacy transformation retains exact legally material act names without adjacent names", async () => {
  const providerQueries: string[] = [];
  const index = createAiSearchCandidateIndex({
    async attest() { return release.configuration; },
    async search(request) {
      providerQueries.push(request.query);
      return { hits: [], errors: [], searchedInstanceIds: request.instanceIds };
    },
  }, {
    ...completePrivateNameAttestation,
    resolveTrustedLegalTitles: async () => ["Labor Code", "Civil Procedure Code", "Companies Act"],
  });
  const packet = await index.retrieve({
    id: "privacy-legal-title",
    formulations: [{
      id: "privacy-legal-title-formulation",
      text: "Does Ivan Petrov Labor Code article 5 override Civil Procedure Code article 10 under the Companies Act?",
      legalTitleSpans: ["Labor Code", "Civil Procedure Code", "Companies Act"],
      privateNameSpans: ["Ivan Petrov"],
      readingIds: ["privacy-legal-title-reading"],
      requirementIds: ["privacy-legal-title-requirement"],
    }],
  }, endpoint, release);

  assert.equal(packet.availability, "available");
  assert.match(providerQueries[0] ?? "", /Labor Code article 5/u);
  assert.match(providerQueries[0] ?? "", /Civil Procedure Code article 10/u);
  assert.match(providerQueries[0] ?? "", /Companies Act/u);
  assert.doesNotMatch(providerQueries[0] ?? "", /Ivan Petrov/u);

  const forged = await index.retrieve({
    id: "privacy-forged-legal-title",
    formulations: [{
      id: "privacy-forged-legal-title-formulation",
      text: "Does John Law override the Companies Act?",
      legalTitleSpans: ["John Law", "Companies Act"],
      privateNameSpans: [],
      readingIds: ["privacy-forged-legal-title-reading"],
      requirementIds: ["privacy-forged-legal-title-requirement"],
    }],
  }, endpoint, release);
  assert.equal(forged.availability, "unavailable");
  assert.deepEqual(forged.partialErrors, [{ code: "PRIVACY_TRANSFORM_REJECTED" }]);
  assert.equal(providerQueries.length, 1, "an interpreter label cannot forge a trusted title");

  const adjacentSingleName = await index.retrieve({
    id: "privacy-single-name-adjacent-to-title",
    formulations: [{
      id: "privacy-single-name-adjacent-to-title-formulation",
      text: "John says the Companies Act applies",
      legalTitleSpans: ["Companies Act"],
      privateNameSpans: [],
      readingIds: ["privacy-single-name-adjacent-to-title-reading"],
      requirementIds: ["privacy-single-name-adjacent-to-title-requirement"],
    }],
  }, endpoint, release);
  assert.equal(adjacentSingleName.availability, "available");
  assert.equal(providerQueries.length, 2);
  assert.doesNotMatch(providerQueries[1] ?? "", /John/u);
  assert.match(providerQueries[1] ?? "", /Companies Act applies/u);

  const sentenceInitialFacts = await index.retrieve({
    id: "privacy-sentence-initial-material-facts",
    formulations: [{
      id: "privacy-dismissal-fact",
      text: "Dismissal occurred during protected leave",
      privateNameSpans: [],
      readingIds: ["privacy-sentence-initial-reading"],
      requirementIds: ["privacy-sentence-initial-requirement"],
    }, {
      id: "privacy-pregnancy-fact",
      text: "Pregnancy began before the dismissal",
      privateNameSpans: [],
      readingIds: ["privacy-sentence-initial-reading"],
      requirementIds: ["privacy-sentence-initial-requirement"],
    }, {
      id: "privacy-russian-status-fact",
      text: "Увольнение произошло во время отпуска",
      privateNameSpans: [],
      readingIds: ["privacy-sentence-initial-reading"],
      requirementIds: ["privacy-sentence-initial-requirement"],
    }, {
      id: "privacy-uzbek-status-fact",
      text: "Homiladorlik ishdan bo‘shatishdan oldin boshlangan",
      privateNameSpans: [],
      readingIds: ["privacy-sentence-initial-reading"],
      requirementIds: ["privacy-sentence-initial-requirement"],
    }],
  }, endpoint, release);
  assert.equal(sentenceInitialFacts.availability, "available");
  assert.equal(providerQueries.length, 6);
  for (const fact of ["Dismissal", "Pregnancy", "Увольнение", "Homiladorlik"]) {
    assert.equal(providerQueries.some((query) => query.includes(fact)), true, fact);
  }
});

test("trusted local PII attestation removes names in subject, object, possessive, and postpositional contexts", async () => {
  const providerQueries: string[] = [];
  const index = createAiSearchCandidateIndex({
    async attest() { return release.configuration; },
    async search(request) {
      providerQueries.push(request.query);
      return { hits: [], errors: [], searchedInstanceIds: request.instanceIds };
    },
  }, {
    ...completePrivateNameAttestation,
    resolveTrustedLegalTitles: async () => ["Companies Act"],
  });
  const packet = await index.retrieve({
    id: "privacy-local-pii-boundary",
    formulations: [{
      id: "privacy-name-subject",
      text: "Under the Companies Act, John was dismissed",
      legalTitleSpans: ["Companies Act"],
      privateNameSpans: [],
      readingIds: ["privacy-name-reading"],
      requirementIds: ["privacy-name-requirement"],
    }, {
      id: "privacy-name-object",
      text: "The Companies Act applies to John",
      legalTitleSpans: ["Companies Act"],
      privateNameSpans: [],
      readingIds: ["privacy-name-reading"],
      requirementIds: ["privacy-name-requirement"],
    }, {
      id: "privacy-name-possessive",
      text: "John's dismissal was unlawful",
      privateNameSpans: [],
      readingIds: ["privacy-name-reading"],
      requirementIds: ["privacy-name-requirement"],
    }, {
      id: "privacy-name-russian-object",
      text: "Компания уволила Ивана во время отпуска",
      privateNameSpans: [],
      readingIds: ["privacy-name-reading"],
      requirementIds: ["privacy-name-requirement"],
    }, {
      id: "privacy-name-uzbek-postposition",
      text: "Ivanga nisbatan ishdan bo‘shatish qo‘llandi",
      privateNameSpans: [],
      readingIds: ["privacy-name-reading"],
      requirementIds: ["privacy-name-requirement"],
    }],
  }, endpoint, release);

  assert.equal(packet.availability, "available");
  assert.equal(providerQueries.length, 5);
  for (const name of ["John", "Ивана", "Ivanga"]) {
    assert.equal(providerQueries.some((query) => query.includes(name)), false, name);
  }
  assert.equal(providerQueries.filter((query) => query.includes("Companies Act")).length, 2);
});

test("uncertain local PII classification fails closed before provider search", async () => {
  let searches = 0;
  const index = createAiSearchCandidateIndex({
    async attest() { return release.configuration; },
    async search() {
      searches += 1;
      return { hits: [], errors: [], searchedInstanceIds: ["current-00"] };
    },
  }, {
    async attestPrivateNames(input) {
      return {
        classifierVersion: "juro-local-pii-v1",
        formulationSha256: input.formulationSha256,
        status: "uncertain",
        privateNameSpans: [],
      };
    },
  });
  const packet = await index.retrieve(interpretation, endpoint, release);
  assert.equal(packet.availability, "unavailable");
  assert.equal(packet.partialErrors[0]?.code, "PRIVACY_TRANSFORM_REJECTED");
  assert.equal(searches, 0);

  let versionDriftSearches = 0;
  const versionDrift = await createAiSearchCandidateIndex({
    async attest() { return release.configuration; },
    async search() {
      versionDriftSearches += 1;
      return { hits: [], errors: [], searchedInstanceIds: ["current-00"] };
    },
  }, {
    async attestPrivateNames(input) {
      return {
        classifierVersion: "juro-local-pii-v0",
        formulationSha256: input.formulationSha256,
        status: "complete",
        privateNameSpans: [],
      };
    },
  }).retrieve(interpretation, endpoint, release);
  assert.equal(versionDrift.availability, "unavailable");
  assert.equal(versionDrift.partialErrors[0]?.code, "PRIVACY_TRANSFORM_REJECTED");
  assert.equal(versionDriftSearches, 0);
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

test("untransformable secrets never reach indexed vector retrieval", async () => {
  let searches = 0;
  const telemetry: unknown[] = [];
  const packet = await createAiSearchCandidateIndex({
    async attest() { return release.configuration; },
    async search() {
      searches += 1;
      return { hits: [], errors: [], searchedInstanceIds: ["current-00"] };
    },
  }, {
    ...completePrivateNameAttestation,
    emitTelemetry: (event) => { telemetry.push(event); },
  }).retrieve({
    id: "privacy-secret",
    formulations: [{
      id: "formulation-secret",
      text: "-----BEGIN PRIVATE KEY----- MIIEvQIBADANBgkqhkiG9w0BAQ -----END PRIVATE KEY-----",
      privateNameSpans: [],
      readingIds: ["reading-secret"],
      requirementIds: ["requirement-secret"],
    }],
  }, endpoint, release);

  assert.equal(searches, 0);
  assert.equal(packet.availability, "unavailable");
  assert.deepEqual(packet.candidates, []);
  assert.equal(packet.partialErrors[0]?.code, "PRIVACY_TRANSFORM_REJECTED");
  assert.equal(JSON.stringify(telemetry).includes("MIIEvQ"), false);
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
