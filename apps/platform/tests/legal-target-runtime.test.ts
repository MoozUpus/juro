import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createAiSearchCandidateIndex, parseCandidatePacket, parsePinnedCandidateRelease }
  from "../lib/legal-corpus/legal-candidate-index";

import { createRuntimeAiSearchProvider, createRuntimeCustomSearchProvider, createRuntimeCandidateCatalog,
  resolveRuntimeTrustedLegalTitles }
  from "../lib/legal-corpus/target-runtime";
import { buildCustomTrustedTitleInventory } from "../lib/legal-corpus/custom-search-trusted-titles";

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

test("named instruments remain searchable with custom-only release mappings", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE legal_search_releases (id TEXT PRIMARY KEY);
    INSERT INTO legal_search_releases VALUES ('custom-release'),('legacy-release');
    CREATE TABLE legal_search_release_items (search_release_id TEXT,provision_rendition_id TEXT);
    CREATE TABLE legal_provision_renditions (id TEXT,provision_concept_id TEXT);
    CREATE TABLE legal_provision_concepts (id TEXT,legal_instrument_id TEXT);
    CREATE TABLE legal_instruments (id TEXT,canonical_title TEXT);
    CREATE TABLE legal_custom_search_runtime_items (search_release_id TEXT,legal_identity_sha256 TEXT);
    CREATE TABLE legal_custom_search_runtime_components (search_release_id TEXT,complete_corpus_run_id TEXT);
    CREATE TABLE legal_complete_corpus_records (run_id TEXT,legal_identity_sha256 TEXT,
      instrument_id TEXT,current_eligible INTEGER,quarantined INTEGER);
    INSERT INTO legal_search_release_items VALUES ('legacy-release','legacy-rendition');
    INSERT INTO legal_provision_renditions VALUES ('legacy-rendition','legacy-concept');
    INSERT INTO legal_provision_concepts VALUES ('legacy-concept','other');
    INSERT INTO legal_custom_search_runtime_items VALUES ('custom-release','identity');
    INSERT INTO legal_custom_search_runtime_components VALUES ('custom-release','accepted-run');
    INSERT INTO legal_complete_corpus_records VALUES ('accepted-run','identity','labor',1,0),
      ('unrelated-run','identity','other',1,0);`);
  sqlite.exec(readFileSync(new URL("../legal-drizzle/0026_custom_search_trusted_titles.sql", import.meta.url), "utf8"));
  const inventory = await buildCustomTrustedTitleInventory("custom-release", ["Labor Code"]);
  sqlite.prepare("INSERT INTO legal_custom_search_trusted_titles VALUES (?,?)")
    .run(inventory.releaseId, inventory.titles[0]!);
  sqlite.prepare("INSERT INTO legal_custom_search_title_inventories VALUES (?,?,?,?)")
    .run(inventory.releaseId, inventory.titleCount, inventory.sha256, "2026-09-06T00:00:00.000Z");
  const db = { prepare(sql: string) { return { bind(...values: string[]) {
    return { async all() { return { results: sqlite.prepare(sql).all(...values) }; } };
  } }; } } as unknown as D1Database;
  const release = parsePinnedCandidateRelease({ id: "custom-release", environment: "development",
    capability: "current", instances: [{ id: "custom-current-development-v1", shardId: "base" }],
    configuration: { identity: "custom-v1", embeddingModel: "openai/text-embedding-3-large",
      dimensions: 1536, keywordTokenizer: "porter",
      metadataSchema: ["language", "document_type", "valid_from", "valid_to"],
      gatewayIdentity: "gateway", providerProjectIdentity: "project", gatewayPayloadLogging: false,
      gatewayCaching: false, similarityCaching: false } });
  const searched: string[] = [];
  const index = createAiSearchCandidateIndex({
    async attest() { return release.configuration; },
    async search(input) {
      searched.push(input.query);
      return { hits: [], errors: [], searchedInstanceIds: input.instanceIds };
    },
  }, {
    async attestPrivateNames(input) { return { classifierVersion: "juro-local-pii-v1",
      formulationSha256: input.formulationSha256, status: "complete", privateNameSpans: [] }; },
    resolveTrustedLegalTitles: (pinned) => resolveRuntimeTrustedLegalTitles(db, pinned.id),
  });
  try {
    const packet = await index.retrieve({ id: "interpretation", formulations: [{
      id: "formulation", text: "Labor Code termination rules", legalTitleSpans: ["Labor Code"],
      privateNameSpans: [], readingIds: ["reading"], requirementIds: ["requirement"],
    }] }, { kind: "current" }, release);
    assert.equal(packet.availability, "available");
    assert.deepEqual(searched, ["Labor Code termination rules"]);
    assert.deepEqual(await resolveRuntimeTrustedLegalTitles(db, release.id), ["Labor Code"]);
    sqlite.prepare("INSERT INTO legal_instruments VALUES (?,?)").run("other", "Other Code");
    assert.deepEqual(await resolveRuntimeTrustedLegalTitles(db, "legacy-release"), ["Other Code"]);
  } finally { sqlite.close(); }
});

function runtimeDatabase(options: { missingMapping?: boolean } = {}): D1Database {
  return {
    prepare() {
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

test("runtime custom provider keeps its pinned release after activation changes, including empty results", async () => {
  const requests: Request[] = [];
  const releaseId = "release:staging:current:custom-v2:2026-09-05";
  const currentAt = "2026-09-06T00:00:00.000Z";
  let activeReleaseId = releaseId;
  const provider = createRuntimeCustomSearchProvider({
    environment: "staging",
    gatewayIdentity: "juro-ai-search-staging",
    projectIdentity: "juro-openai-staging",
    db: { prepare(sql: string) { return { bind(_environment: string, pinnedId?: string) {
      return { async first() { return {
      id: sql.includes("legal_active_activation_sets") ? activeReleaseId : pinnedId,
      configurationIdentity: "custom-hybrid-staging-v1",
    }; } }; } }; } } as unknown as D1Database,
    service: { async fetch(input, init) {
      const request = new Request(input, init);
      requests.push(request);
      return Response.json({ hits: [], errors: [],
        searchedInstanceIds: ["custom-current-staging-v1"], tokenUsage: 2 });
    } } as Fetcher,
  });
  assert.equal((await provider.attest("custom-current-staging-v1", releaseId)).identity,
    "custom-hybrid-staging-v1");
  activeReleaseId = "release:staging:current:replacement";
  const result = await provider.search({ releaseId, currentAt, instanceIds: ["custom-current-staging-v1"],
    query: "Article 1", endpoint: { kind: "current" }, maxResults: 50, vectorThreshold: 0 });
  assert.equal(result.tokenUsage, 2);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.headers.get("x-juro-service-binding"), "custom-search-runtime-v1");
  assert.deepEqual(await requests[0]?.json(), {
    releaseId: "release:staging:current:custom-v2:2026-09-05",
    currentAt,
    instanceIds: ["custom-current-staging-v1"], query: "Article 1",
    endpoint: { kind: "current" }, maxResults: 50, vectorThreshold: 0,
  });
  await assert.rejects(() => provider.search({ instanceIds: ["custom-current-staging-v1"],
    query: "Article 1", endpoint: { kind: "current" }, maxResults: 50, vectorThreshold: 0 }),
  /CUSTOM_SEARCH_PINNED_RELEASE_REQUIRED/u);
});

test("custom catalog rejects future and expired records even when candidate lanes returned them", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE legal_custom_search_runtime_items
    (search_release_id TEXT,item_key TEXT,retrieval_chunk_id TEXT,legal_identity_sha256 TEXT);
    CREATE TABLE legal_custom_search_runtime_components (search_release_id TEXT,complete_corpus_run_id TEXT);
    CREATE TABLE legal_complete_corpus_records (run_id TEXT,legal_identity_sha256 TEXT,
      provision_rendition_id TEXT,text_revision_id TEXT,provision_concept_id TEXT,
      language TEXT,textual_authority TEXT,valid_from TEXT,valid_to TEXT,current_eligible INTEGER,quarantined INTEGER);`);
  const release = parsePinnedCandidateRelease({ id: "release-custom", environment: "staging",
    capability: "current", instances: [{ id: "custom-current-staging-v1", shardId: "current-base-v1" }],
    configuration: { identity: "custom-v1", embeddingModel: "openai/text-embedding-3-large",
      dimensions: 1536, keywordTokenizer: "porter", metadataSchema: ["language", "document_type", "valid_from", "valid_to"],
      gatewayIdentity: "gateway", providerProjectIdentity: "project", gatewayPayloadLogging: false,
      gatewayCaching: false, similarityCaching: false } });
  const key = `search-releases/${release.id}/retrieval-chunk-v1:one`;
  sqlite.prepare("INSERT INTO legal_custom_search_runtime_items VALUES (?,?,?,?)")
    .run(release.id, key, "retrieval-chunk-v1:one", "identity");
  sqlite.prepare("INSERT INTO legal_custom_search_runtime_components VALUES (?,?)").run(release.id, "run");
  const packet = parseCandidatePacket({ availability: "available", releaseId: release.id,
    endpoint: { kind: "current" }, requiredInstanceIds: ["custom-current-staging-v1"], partialErrors: [],
    candidates: [{ itemKey: key, instanceId: "custom-current-staging-v1", shardId: "current-base-v1",
      formulationId: "formulation", readingIds: ["reading"], requirementIds: ["requirement"],
      vectorRank: 1, vectorScore: 1, keywordRank: 1, keywordScore: 1, fusionScore: 1 }] });
  const db = { prepare(sql: string) { return { bind(...values: string[]) {
    return { async all() { return { results: sqlite.prepare(sql).all(...values) }; } };
  } }; } } as unknown as D1Database;
  const catalog = createRuntimeCandidateCatalog(db);
  const at = "2026-09-06T00:00:00.000Z";
  try {
    for (const [from, to, valid] of [
      [at, null, true], ["2026-09-07T00:00:00.000Z", null, false],
      ["2026-01-01T00:00:00.000Z", at, false], [null, null, false],
    ] as const) {
      sqlite.exec("DELETE FROM legal_complete_corpus_records");
      sqlite.prepare("INSERT INTO legal_complete_corpus_records VALUES (?,?,?,?,?,?,?,?,?,1,0)")
        .run("run", "identity", "rendition", "revision", "concept", "ru", "unknown", from, to);
      const result = catalog.revalidate(packet, { kind: "current" }, release, at);
      if (valid) assert.equal((await result).length, 1);
      else await assert.rejects(() => result, /SOURCE_UNAVAILABILITY/u);
    }
  } finally { sqlite.close(); }
});
