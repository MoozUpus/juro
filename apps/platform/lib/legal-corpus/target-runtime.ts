import { z } from "zod";

import {
  createAiSearchCandidateIndex,
  createCloudflareAiSearchProvider,
  parsePinnedCandidateRelease,
  toPinnedCandidateConfiguration,
  type AiSearchProvider,
  type CandidatePacket,
  type PinnedCandidateRelease,
  type TemporalEndpoint,
} from "./legal-candidate-index";
import { CUSTOM_SEARCH_PATH, CUSTOM_SEARCH_SERVICE_MARKER, customSearchResponseSchema }
  from "./custom-search-service";
import { customReleaseGovernanceSchema } from "./custom-release-governance";
import { resolveCustomBm25RuntimeMembershipEntries } from "./custom-bm25-runtime";
import { resolveCustomTrustedLegalTitles } from "./custom-search-trusted-titles";
import { assertCompleteCorpusCurrentInterval, resolveCompleteCorpusEvidence, resolveControllingEvidence,
  type LegalEvidenceBucket } from "./target-evidence";
import { resolveProvisionLineage } from "./target-lineage";
import { governedAiSearchConfigurationSchema } from "./target-governance";
import { createReleaseLifecycle, resolveStagingHistoryComparisonEvaluationSet } from "./target-release";
import {
  createTargetLegalAnswerRetriever,
  parseQuestionInterpretationPlan,
  parseRevalidatedCandidates,
  parseSelectionDecision,
  type QuestionInterpretationPlan,
  type RevalidatedCandidate,
  type SelectionDecision,
  type TargetLegalAnswerRetriever,
} from "./target-retrieval";

const environmentSchema = z.enum(["development", "staging", "production"]);
const governanceSchema = z.object({
  configuration: governedAiSearchConfigurationSchema,
}).passthrough();

export type TargetRetrievalRuntimeEnv = {
  APP_ENV: string;
  LEGAL_CORPUS_SHADOW_MODE?: string;
  LEGAL_AI_SEARCH_PAUSED?: string;
  LEGAL_DB?: D1Database;
  LEGAL_EVIDENCE_BUCKET?: Pick<LegalEvidenceBucket, "get">;
  LEGAL_AI_SEARCH_NAMESPACE?: AiSearchNamespace;
  LEGAL_AI_SEARCH_NAMESPACE_NAME?: string;
  LEGAL_AI_SEARCH_SOURCE_BUCKET_NAME?: string;
  LEGAL_CORPUS_REASONING_SERVICE?: Fetcher;
  LEGAL_CUSTOM_SEARCH_SERVICE?: Fetcher;
  LEGAL_CUSTOM_HISTORY_SEARCH_SERVICE?: Fetcher;
  LEGAL_AI_GATEWAY_ID?: string;
  LEGAL_AI_PROVIDER_PROJECT_ID?: string;
};

type RuntimeDependencies = {
  environment: z.infer<typeof environmentSchema>;
  db: D1Database;
  evidenceBucket: Pick<LegalEvidenceBucket, "get">;
  reasoningService: Fetcher;
};

type RuntimeReleaseResolver = {
  resolve(endpoint: TemporalEndpoint): Promise<PinnedCandidateRelease | null>;
  resolveComparison?(
    left: TemporalEndpoint,
    right: TemporalEndpoint,
  ): Promise<{ left: PinnedCandidateRelease; right: PinnedCandidateRelease } | null>;
};

type RuntimeProviderGovernance = {
  governanceId: string;
  evidenceJson: string;
  recordedAt: string;
  providerNamespace: string;
};

async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const encoded = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const bytes = new Uint8Array(encoded.byteLength);
  bytes.set(encoded);
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function createRuntimeAiSearchProvider(input: {
  db: D1Database;
  namespace: AiSearchNamespace;
  namespaceName: string;
  sourceBucketName: string;
}): AiSearchProvider {
  const governanceByInstance = new Map<string, Promise<RuntimeProviderGovernance>>();
  const providerByGovernance = new Map<string, Promise<AiSearchProvider>>();
  const loadGovernance = (instanceId: string): Promise<RuntimeProviderGovernance> => {
    const existing = governanceByInstance.get(instanceId);
    if (existing) return existing;
    const loaded = input.db.prepare(`SELECT provider.governance_id AS governanceId,
        governance.evidence_json AS evidenceJson,governance.recorded_at AS recordedAt,
        provider.provider_namespace AS providerNamespace
      FROM legal_search_release_provider_instances provider
      JOIN legal_search_release_governance governance ON governance.id=provider.governance_id
      WHERE provider.provider_instance_id=? AND provider.scheduled_indexing_paused=1
        AND governance.status='passed' AND governance.failures_json='[]'
      ORDER BY governance.recorded_at DESC LIMIT 1`).bind(instanceId)
      .first<RuntimeProviderGovernance>().then((row) => {
        if (!row || row.providerNamespace !== input.namespaceName) {
          throw new TypeError("AI_SEARCH_PROVIDER_GOVERNANCE_UNAVAILABLE");
        }
        return row;
      });
    governanceByInstance.set(instanceId, loaded);
    return loaded;
  };
  const loadProvider = async (governance: RuntimeProviderGovernance): Promise<AiSearchProvider> => {
    const existing = providerByGovernance.get(governance.governanceId);
    if (existing) return existing;
    const loaded = (async () => {
      const evidence = governanceSchema.parse(JSON.parse(governance.evidenceJson) as unknown);
      if (evidence.configuration.providerNamespaceIdentity !== input.namespaceName) {
        throw new TypeError("AI_SEARCH_PROVIDER_NAMESPACE_DRIFT");
      }
      const mappings = await input.db.prepare(`SELECT shard.shard_id AS shardId,
          shard.sync_state AS syncState,provider.provider_instance_id AS instanceId,
          provider.provider_namespace AS providerNamespace,
          provider.scheduled_indexing_paused AS scheduledIndexingPaused
        FROM legal_search_release_shards shard
        LEFT JOIN legal_search_release_provider_instances provider
          ON provider.governance_id=shard.governance_id
          AND provider.shard_id=shard.shard_id
          AND provider.search_release_id=shard.search_release_id
        WHERE shard.governance_id=? ORDER BY shard.shard_id`).bind(governance.governanceId).all<{
          shardId: string;
          syncState: string;
          instanceId: string | null;
          providerNamespace: string | null;
          scheduledIndexingPaused: number | null;
        }>();
      if (mappings.results.length === 0 || mappings.results.some((mapping) =>
        mapping.syncState !== "complete" || mapping.instanceId === null
        || mapping.providerNamespace !== input.namespaceName
        || Number(mapping.scheduledIndexingPaused) !== 1)) {
        throw new TypeError("AI_SEARCH_PROVIDER_SHARD_MAPPING_INCOMPLETE");
      }
      const configuration = toPinnedCandidateConfiguration(evidence.configuration);
      const shardByInstance = Object.fromEntries(mappings.results.map((mapping) => [
        mapping.instanceId!, mapping.shardId,
      ]));
      const evidenceSha256 = await sha256Hex(governance.evidenceJson);
      return createCloudflareAiSearchProvider(input.namespace, {
        namespaceIdentity: input.namespaceName,
        sourceBucketName: input.sourceBucketName,
        sourcePrefix: evidence.configuration.sourcePrefix,
        shardByInstance,
        configuration,
        async attestManagement(instanceId) {
          if (!(instanceId in shardByInstance)) {
            throw new TypeError("AI_SEARCH_INSTANCE_NOT_IN_GOVERNED_RELEASE");
          }
          return {
            instanceId,
            configuration,
            evidenceSha256,
            observedAt: governance.recordedAt,
          };
        },
      });
    })();
    providerByGovernance.set(governance.governanceId, loaded);
    return loaded;
  };
  return {
    async attest(instanceId) {
      const governance = await loadGovernance(instanceId);
      return (await loadProvider(governance)).attest(instanceId);
    },
    async search(searchInput) {
      const governances = await Promise.all(searchInput.instanceIds.map(loadGovernance));
      const governanceIds = new Set(governances.map(({ governanceId }) => governanceId));
      if (governanceIds.size !== 1 || governances.length === 0) {
        throw new TypeError("AI_SEARCH_CROSS_GOVERNANCE_QUERY_REJECTED");
      }
      return (await loadProvider(governances[0]!)).search(searchInput);
    },
  };
}

async function serviceJson(
  service: Fetcher,
  environment: string,
  path: string,
  body: unknown,
): Promise<unknown> {
  const response = await service.fetch(`http://legal-corpus.internal${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-juro-service-binding": "target-retrieval-runtime-v1",
      "x-juro-legal-environment": environment,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new TypeError("TARGET_RETRIEVAL_DEPENDENCY_UNAVAILABLE");
  return response.json();
}

const customChunkArtifactSchema = z.object({
  schemaVersion: z.literal(1),
  releaseId: z.string().min(1),
  chunk: z.object({ id: z.string().min(1),
    snapshotProvisionId: z.string().regex(/^audit:[a-f0-9]{64}$/u) }).passthrough(),
  evidence: z.object({ snapshotProvisionId: z.string().regex(/^audit:[a-f0-9]{64}$/u) })
    .passthrough(),
}).passthrough();

async function resolveCustomChunkIdentities(
  bucket: Pick<LegalEvidenceBucket, "get">,
  releaseId: string,
  itemKeys: readonly string[],
) {
  const prefix = `search-releases/${releaseId}/`;
  const output = new Map<string, { canonicalChunkId: string; legalIdentitySha256: string }>();
  for (let offset = 0; offset < itemKeys.length; offset += 6) {
    await Promise.all(itemKeys.slice(offset, offset + 6).map(async (itemKey) => {
      if (!itemKey.startsWith(prefix)) throw new TypeError("TARGET_CUSTOM_CHUNK_IDENTITY_INVALID");
      const canonicalChunkId = z.string().regex(/^retrieval-chunk-v1:[a-f0-9]{64}$/u)
        .parse(itemKey.slice(prefix.length));
      const object = await bucket.get(`search-releases/${releaseId}/chunks/${canonicalChunkId}.json`);
      if (!object || !object.customMetadata?.sha256) {
        throw new TypeError("TARGET_CUSTOM_CHUNK_ARTIFACT_MISSING");
      }
      const bytes = await object.bytes();
      if (bytes.byteLength !== object.size || await sha256Hex(bytes) !== object.customMetadata.sha256) {
        throw new TypeError("TARGET_CUSTOM_CHUNK_ARTIFACT_CORRUPT");
      }
      const artifact = customChunkArtifactSchema.parse(JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      ) as unknown);
      if (artifact.releaseId !== releaseId || artifact.chunk.id !== canonicalChunkId
        || artifact.chunk.snapshotProvisionId !== artifact.evidence.snapshotProvisionId) {
        throw new TypeError("TARGET_CUSTOM_CHUNK_IDENTITY_INVALID");
      }
      output.set(itemKey, { canonicalChunkId,
        legalIdentitySha256: artifact.chunk.snapshotProvisionId.slice("audit:".length) });
    }));
  }
  return output;
}

export function createRuntimeCandidateCatalog(
  db: D1Database,
  bucket?: Pick<LegalEvidenceBucket, "get">,
) {
  return {
    async revalidate(
      packet: CandidatePacket,
      endpoint: TemporalEndpoint,
      release: PinnedCandidateRelease,
      currentAt: string,
    ): Promise<RevalidatedCandidate[]> {
      if (packet.releaseId !== release.id || packet.availability !== "available") {
        throw new TypeError("TARGET_CANDIDATE_PACKET_IDENTITY_MISMATCH");
      }
      const uniqueKeys = [...new Set(packet.candidates.map((candidate) => candidate.itemKey))];
      const rows: Array<{
        itemKey: string;
        canonicalChunkId: string;
        provisionRenditionId: string;
        textRevisionId: string;
        provisionConceptId: string;
        languageTag: string;
        textualAuthority: string;
        validFrom: string | null;
        validTo: string | null;
      }> = [];
      const custom = packet.candidates.every((candidate) =>
        candidate.itemKey.startsWith(`search-releases/${release.id}/retrieval-chunk-v1:`));
      if (custom && ((release.capability === "current" && endpoint.kind !== "current")
        || (release.capability === "history" && endpoint.kind !== "timestamp"))) {
        throw new TypeError("TARGET_CUSTOM_CANDIDATE_ENDPOINT_INVALID");
      }
      const customEligibility = release.capability === "history"
        ? "historical_eligible" : "current_eligible";
      let compactMembership: Map<string, { ordinal: number;
        legalIdentitySha256: string | null }> | null = null;
      if (custom && bucket) {
        const component = await db.prepare(`SELECT mapping_inventory_sha256 AS mappingInventorySha256
          FROM legal_custom_search_runtime_components WHERE search_release_id=?`).bind(release.id)
          .first<{ mappingInventorySha256: string }>();
        if (!component) throw new TypeError("TARGET_CUSTOM_RUNTIME_COMPONENT_MISSING");
        const prefix = `search-releases/${release.id}/`;
        compactMembership = await resolveCustomBm25RuntimeMembershipEntries(bucket as R2Bucket, release.id,
          component.mappingInventorySha256, uniqueKeys.map((key) => key.slice(prefix.length)));
        if (compactMembership && compactMembership.size !== uniqueKeys.length) {
          throw new TypeError("TARGET_CANDIDATE_NOT_IN_PINNED_RELEASE");
        }
      }
      const prefix = `search-releases/${release.id}/`;
      const anchoredIdentities = compactMembership
        && [...compactMembership.values()].every(({ legalIdentitySha256 }) => legalIdentitySha256)
        ? new Map(uniqueKeys.map((key) => {
          const canonicalChunkId = key.slice(prefix.length);
          return [key, { canonicalChunkId,
            legalIdentitySha256: compactMembership!.get(canonicalChunkId)!.legalIdentitySha256! }];
        })) : null;
      const customIdentities = anchoredIdentities ?? (compactMembership && bucket
        ? await resolveCustomChunkIdentities(bucket, release.id, uniqueKeys) : null);
      for (let offset = 0; offset < uniqueKeys.length; offset += 80) {
        const keys = uniqueKeys.slice(offset, offset + 80);
        if (keys.length === 0) continue;
        const identities = customIdentities
          ? keys.map((key) => customIdentities.get(key)!.legalIdentitySha256) : keys;
        const placeholders = identities.map(() => "?").join(",");
        const result = await db.prepare(custom && customIdentities ? `SELECT
            record.legal_identity_sha256 AS itemKey,'' AS canonicalChunkId,
            record.provision_rendition_id AS provisionRenditionId,
            record.text_revision_id AS textRevisionId,
            record.provision_concept_id AS provisionConceptId,
            record.language AS languageTag,record.textual_authority AS textualAuthority,
            record.valid_from AS validFrom,record.valid_to AS validTo
          FROM legal_custom_search_runtime_components runtime
          JOIN legal_complete_corpus_records record ON record.run_id=runtime.complete_corpus_run_id
          WHERE runtime.search_release_id=? AND record.legal_identity_sha256 IN (${placeholders})
            AND record.${customEligibility}=1 AND record.quarantined=0` : custom ? `SELECT item.item_key AS itemKey,
            item.retrieval_chunk_id AS canonicalChunkId,
            record.provision_rendition_id AS provisionRenditionId,
            record.text_revision_id AS textRevisionId,
            record.provision_concept_id AS provisionConceptId,
            record.language AS languageTag,record.textual_authority AS textualAuthority,
            record.valid_from AS validFrom,record.valid_to AS validTo
          FROM legal_custom_search_runtime_items item
          JOIN legal_custom_search_runtime_components runtime
            ON runtime.search_release_id=item.search_release_id
          JOIN legal_complete_corpus_records record
            ON record.run_id=runtime.complete_corpus_run_id
            AND record.legal_identity_sha256=item.legal_identity_sha256
          WHERE item.search_release_id=? AND item.item_key IN (${placeholders})
            AND record.${customEligibility}=1 AND record.quarantined=0` : `SELECT item.item_key AS itemKey,
            item.canonical_chunk_id AS canonicalChunkId,
            rendition.id AS provisionRenditionId,rendition.text_revision_id AS textRevisionId,
            rendition.provision_concept_id AS provisionConceptId,
            expression.language_tag AS languageTag,revision.textual_authority AS textualAuthority
          FROM legal_search_release_items item
          JOIN legal_provision_renditions rendition
            ON rendition.id=item.provision_rendition_id
          JOIN legal_text_revisions revision ON revision.id=rendition.text_revision_id
          JOIN legal_official_expressions expression ON expression.id=revision.official_expression_id
          WHERE item.search_release_id=? AND item.item_key IN (${placeholders})`).bind(
          release.id,
          ...identities,
        ).all<typeof rows[number]>();
        if (customIdentities) {
          const byIdentity = new Map(result.results.map((row) => [row.itemKey, row]));
          for (const key of keys) {
            const identity = customIdentities.get(key)!;
            const record = byIdentity.get(identity.legalIdentitySha256);
            if (record) rows.push({ ...record, itemKey: key,
              canonicalChunkId: identity.canonicalChunkId });
          }
        } else rows.push(...result.results);
      }
      const byKey = new Map(rows.map((row) => [row.itemKey, row]));
      return parseRevalidatedCandidates(packet.candidates.map((candidate) => {
        const row = byKey.get(candidate.itemKey);
        if (!row) throw new TypeError("TARGET_CANDIDATE_NOT_IN_PINNED_RELEASE");
        if (custom) assertCompleteCorpusCurrentInterval(row,
          endpoint.kind === "timestamp" ? endpoint.instant : currentAt);
        const languageFamily = row.languageTag.startsWith("uz-") ? "uz"
          : row.languageTag === "ru" ? "ru" : row.languageTag === "en" ? "en" : null;
        if (!languageFamily || !["controlling", "official_translation", "unknown"]
          .includes(row.textualAuthority)) {
          throw new TypeError("TARGET_CANDIDATE_IDENTITY_INVALID");
        }
        return {
          candidate,
          canonicalChunkId: row.canonicalChunkId,
          provisionRenditionId: row.provisionRenditionId,
          textRevisionId: row.textRevisionId,
          provisionConceptId: row.provisionConceptId,
          languageFamily,
          textualAuthority: row.textualAuthority as RevalidatedCandidate["textualAuthority"],
        };
      }));
    },
  };
}

type CustomSearchCapability = "current" | "history";
const customInstanceId = (capability: CustomSearchCapability, environment: string) =>
  `custom-${capability}-${environment}-v1`;
const customShardId = (capability: CustomSearchCapability) => `${capability}-base-v1`;

function customPinnedConfiguration(identityValue: string, gatewayIdentity: string,
  projectIdentity: string) {
  return toPinnedCandidateConfiguration({
    identity: identityValue,
    embeddingModel: "openai/text-embedding-3-large",
    dimensions: 1_536,
    keywordTokenizer: "porter",
    metadataSchema: ["language", "document_type", "valid_from", "valid_to"],
    gatewayIdentity,
    providerProjectIdentity: projectIdentity,
    gatewayPayloadLogging: false,
    gatewayCaching: false,
    similarityCaching: false,
  });
}

function assertCustomSearchRequest(capability: CustomSearchCapability, environment: string,
  input: Parameters<AiSearchProvider["search"]>[0]) {
  if ((capability === "current" && input.endpoint.kind !== "current")
    || (capability === "history" && input.endpoint.kind !== "timestamp")
    || input.instanceIds.length !== 1
    || input.instanceIds[0] !== customInstanceId(capability, environment)) {
    throw new TypeError("CUSTOM_SEARCH_REQUEST_REJECTED");
  }
}

async function requestCustomSearch(service: Fetcher, environment: string,
  input: Parameters<AiSearchProvider["search"]>[0]) {
  const response = await service.fetch(`http://legal-corpus.internal${CUSTOM_SEARCH_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json",
      "x-juro-service-binding": CUSTOM_SEARCH_SERVICE_MARKER,
      "x-juro-legal-environment": environment },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new TypeError("CUSTOM_SEARCH_SERVICE_UNAVAILABLE");
  return customSearchResponseSchema.parse(await response.json());
}

export function createRuntimeCustomSearchProvider(input: {
  db: D1Database;
  service: Fetcher;
  capability: CustomSearchCapability;
  environment: "development" | "staging" | "production";
  gatewayIdentity: string;
  projectIdentity: string;
}): AiSearchProvider {
  const pinned = async (releaseId: string | undefined) => {
    if (!releaseId) throw new TypeError("CUSTOM_SEARCH_PINNED_RELEASE_REQUIRED");
    const row = await input.db.prepare(`SELECT release.id,release.configuration_identity AS configurationIdentity
      FROM legal_search_releases release
      JOIN legal_custom_search_runtime_components runtime ON runtime.search_release_id=release.id
      WHERE release.environment=? AND release.id=? AND release.capability=?
        AND release.status='sealed'`).bind(input.environment, releaseId, input.capability)
      .first<{ id: string; configurationIdentity: string }>();
    if (!row) throw new TypeError("CUSTOM_SEARCH_ACTIVE_RELEASE_UNAVAILABLE");
    return row;
  };
  return {
    async attest(instanceId, releaseId) {
      if (instanceId !== customInstanceId(input.capability, input.environment)) {
        throw new TypeError("CUSTOM_SEARCH_INSTANCE_REJECTED");
      }
      const release = await pinned(releaseId);
      return customPinnedConfiguration(release.configurationIdentity,
        input.gatewayIdentity, input.projectIdentity);
    },
    async search(searchInput) {
      assertCustomSearchRequest(input.capability, input.environment, searchInput);
      const release = await pinned(searchInput.releaseId);
      return requestCustomSearch(input.service, input.environment,
        { ...searchInput, releaseId: release.id });
    },
  };
}

function createRuntimeEvaluationCustomSearchProvider(input: {
  releaseId: string;
  configurationIdentity: string;
  service: Fetcher;
  capability: CustomSearchCapability;
  gatewayIdentity: string;
  projectIdentity: string;
}): AiSearchProvider {
  const configuration = customPinnedConfiguration(input.configurationIdentity,
    input.gatewayIdentity, input.projectIdentity);
  const assertEvaluationRelease = (releaseId: string | undefined) => {
    if (releaseId !== input.releaseId) {
      throw new TypeError("CUSTOM_SEARCH_EVALUATION_RELEASE_REJECTED");
    }
  };
  return {
    async attest(instanceId, releaseId) {
      if (instanceId !== customInstanceId(input.capability, "staging")) {
        throw new TypeError("CUSTOM_SEARCH_INSTANCE_REJECTED");
      }
      assertEvaluationRelease(releaseId);
      return configuration;
    },
    async search(searchInput) {
      assertCustomSearchRequest(input.capability, "staging", searchInput);
      assertEvaluationRelease(searchInput.releaseId);
      return requestCustomSearch(input.service, "staging", searchInput);
    },
  };
}

export async function resolveRuntimeTrustedLegalTitles(db: D1Database, releaseId: string): Promise<string[]> {
  const custom = await resolveCustomTrustedLegalTitles(db, releaseId);
  if (custom !== null) return custom;
  const result = await db.prepare(`SELECT DISTINCT instrument.canonical_title AS title
    FROM legal_search_release_items item
    JOIN legal_provision_renditions rendition ON rendition.id=item.provision_rendition_id
    JOIN legal_provision_concepts concept ON concept.id=rendition.provision_concept_id
    JOIN legal_instruments instrument ON instrument.id=concept.legal_instrument_id
    WHERE item.search_release_id=? ORDER BY title`)
    .bind(releaseId).all<{ title: string }>();
  return result.results.map((row) => z.string().trim().min(3).max(300).parse(row.title));
}

function createRuntimeCandidateIndex(
  dependencies: RuntimeDependencies,
  provider: AiSearchProvider,
) {
  return createAiSearchCandidateIndex(provider, {
    async attestPrivateNames(input) {
      return serviceJson(
        dependencies.reasoningService,
        dependencies.environment,
        "/internal/legal-corpus/privacy/classify-private-names",
        input,
      );
    },
    emitTelemetry(event) {
      console.log(JSON.stringify({ event: "legal_target_candidate", ...event }));
    },
    async resolveTrustedLegalTitles(release) {
      return resolveRuntimeTrustedLegalTitles(dependencies.db, release.id);
    },
  });
}

function createRuntimeRetriever(
  dependencies: RuntimeDependencies,
  candidateIndex: ReturnType<typeof createRuntimeCandidateIndex>,
  releaseResolver: RuntimeReleaseResolver,
): TargetLegalAnswerRetriever {
  const { environment, db, evidenceBucket, reasoningService } = dependencies;
  return createTargetLegalAnswerRetriever({
    environment,
    interpreter: {
      async interpret(question): Promise<QuestionInterpretationPlan> {
        const body = await serviceJson(
          reasoningService,
          environment,
          "/internal/legal-corpus/reasoning/interpret",
          { question },
        );
        const response = z.object({ result: z.unknown() }).strict().parse(body);
        return parseQuestionInterpretationPlan(response.result);
      },
    },
    releaseResolver,
    candidateIndex,
    candidateCatalog: createRuntimeCandidateCatalog(db, evidenceBucket),
    evidenceResolver: {
      async resolveControlling(provisionRenditionId, endpoint, context) {
        if (context.release.instances.some((instance) =>
          instance.id === customInstanceId("current", environment)
          || instance.id === customInstanceId("history", environment))) {
          return resolveCompleteCorpusEvidence(
            { db, bucket: evidenceBucket, environment,
              releaseId: context.release.id, currentAt: context.currentAt }, provisionRenditionId, endpoint,
          );
        }
        return resolveControllingEvidence(
          { db, bucket: evidenceBucket }, provisionRenditionId, endpoint,
        );
      },
    },
    provisionSelector: {
      async select(input): Promise<SelectionDecision> {
        const body = await serviceJson(
          reasoningService,
          environment,
          "/internal/legal-corpus/reasoning/select",
          input,
        );
        const response = z.object({ result: z.unknown() }).strict().parse(body);
        return parseSelectionDecision(response.result);
      },
    },
    lineageResolver: {
      resolve: (leftConceptIds, rightConceptIds) => resolveProvisionLineage(
        { db },
        leftConceptIds,
        rightConceptIds,
      ),
    },
  });
}

export function createRuntimeTargetLegalAnswerRetriever(
  env: TargetRetrievalRuntimeEnv,
): TargetLegalAnswerRetriever {
  const environment = environmentSchema.parse(env.APP_ENV);
  if (!env.LEGAL_DB || !env.LEGAL_EVIDENCE_BUCKET
    || !env.LEGAL_CORPUS_REASONING_SERVICE) {
    throw new TypeError("TARGET_RETRIEVAL_RUNTIME_UNAVAILABLE");
  }
  const db = env.LEGAL_DB;
  const evidenceBucket = env.LEGAL_EVIDENCE_BUCKET;
  const reasoningService = env.LEGAL_CORPUS_REASONING_SERVICE;
  const dependencies = { environment, db, evidenceBucket, reasoningService };
  const releaseLifecycle = createReleaseLifecycle({ db });
  const aiProvider = env.LEGAL_AI_SEARCH_NAMESPACE && env.LEGAL_AI_SEARCH_NAMESPACE_NAME
    && env.LEGAL_AI_SEARCH_SOURCE_BUCKET_NAME ? createRuntimeAiSearchProvider({
      db, namespace: env.LEGAL_AI_SEARCH_NAMESPACE,
      namespaceName: env.LEGAL_AI_SEARCH_NAMESPACE_NAME,
      sourceBucketName: env.LEGAL_AI_SEARCH_SOURCE_BUCKET_NAME,
    }) : null;
  const customProviders = new Map<CustomSearchCapability, AiSearchProvider>();
  if (env.LEGAL_AI_GATEWAY_ID && env.LEGAL_AI_PROVIDER_PROJECT_ID) {
    if (env.LEGAL_CUSTOM_SEARCH_SERVICE) customProviders.set("current",
      createRuntimeCustomSearchProvider({
        db, service: env.LEGAL_CUSTOM_SEARCH_SERVICE, capability: "current", environment,
        gatewayIdentity: env.LEGAL_AI_GATEWAY_ID,
        projectIdentity: env.LEGAL_AI_PROVIDER_PROJECT_ID,
      }));
    if (env.LEGAL_CUSTOM_HISTORY_SEARCH_SERVICE) customProviders.set("history",
      createRuntimeCustomSearchProvider({
        db, service: env.LEGAL_CUSTOM_HISTORY_SEARCH_SERVICE, capability: "history", environment,
        gatewayIdentity: env.LEGAL_AI_GATEWAY_ID,
        projectIdentity: env.LEGAL_AI_PROVIDER_PROJECT_ID,
      }));
  }
  if (!aiProvider && customProviders.size === 0) {
    throw new TypeError("TARGET_RETRIEVAL_RUNTIME_UNAVAILABLE");
  }
  const customProviderForInstance = (instanceId: string) =>
    (["current", "history"] as const).map((capability) => ({
      capability, provider: customProviders.get(capability),
    })).find(({ capability, provider }) => provider
      && instanceId === customInstanceId(capability, environment))?.provider;
  const provider: AiSearchProvider = {
    attest(instanceId, releaseId) {
      const custom = customProviderForInstance(instanceId);
      return custom
        ? custom.attest(instanceId, releaseId)
        : aiProvider?.attest(instanceId, releaseId)
          ?? Promise.reject(new TypeError("TARGET_CANDIDATE_PROVIDER_UNAVAILABLE"));
    },
    search(input) {
      const custom = input.instanceIds.length === 1
        ? customProviderForInstance(input.instanceIds[0]!) : undefined;
      return custom
        ? custom.search(input)
        : aiProvider?.search(input)
          ?? Promise.reject(new TypeError("TARGET_CANDIDATE_PROVIDER_UNAVAILABLE"));
    },
  };
  const candidateIndex = createRuntimeCandidateIndex(dependencies, provider);
  const resolvePinnedRelease = async (searchRelease: { id: string; capability: string }) => {
        const custom = await db.prepare(`SELECT
            release.configuration_identity AS configurationIdentity,
            release.item_count AS itemCount,component.chunk_count AS chunkCount,
            component.embedding_model AS embeddingModel,
            component.embedding_dimensions AS embeddingDimensions,
            runtime.mapping_count AS mappingCount,
            governance.evidence_json AS evidenceJson
          FROM legal_search_releases release
          JOIN legal_custom_search_release_components component
            ON component.search_release_id=release.id
          JOIN legal_custom_search_runtime_components runtime
            ON runtime.search_release_id=release.id
          JOIN legal_search_release_governance governance
            ON governance.search_release_id=release.id
            AND governance.status='passed' AND governance.failures_json='[]'
          WHERE release.id=? ORDER BY governance.recorded_at DESC LIMIT 1`).bind(
          searchRelease.id,
        ).first<{ configurationIdentity: string; itemCount: number; chunkCount: number;
          embeddingModel: string; embeddingDimensions: number; mappingCount: number;
          evidenceJson: string }>();
        if (custom) {
          const capability = searchRelease.capability as CustomSearchCapability;
          const customProvider = customProviders.get(capability);
          const evidence = customReleaseGovernanceSchema.parse(JSON.parse(custom.evidenceJson) as unknown);
          if (evidence.releaseId !== searchRelease.id
            || custom.itemCount !== custom.chunkCount || custom.mappingCount !== custom.itemCount
            || custom.embeddingModel !== "text-embedding-3-large"
            || Number(custom.embeddingDimensions) !== 1_536
            || !customProvider || !env.LEGAL_AI_GATEWAY_ID || !env.LEGAL_AI_PROVIDER_PROJECT_ID) {
            return null;
          }
          return parsePinnedCandidateRelease({
            id: searchRelease.id,
            environment,
            capability: searchRelease.capability,
            instances: [{ id: customInstanceId(capability, environment),
              shardId: customShardId(capability) }],
            configuration: customPinnedConfiguration(custom.configurationIdentity,
              env.LEGAL_AI_GATEWAY_ID, env.LEGAL_AI_PROVIDER_PROJECT_ID),
          });
        }
        const governance = await db.prepare(`SELECT id,evidence_json AS evidenceJson
          FROM legal_search_release_governance
          WHERE search_release_id=? AND status='passed'
          ORDER BY recorded_at DESC LIMIT 1`).bind(
          searchRelease.id,
        ).first<{ id: string; evidenceJson: string }>();
        const shards = await db.prepare(`SELECT shard.shard_id AS shardId,
            shard.sync_state AS syncState,
            provider.provider_instance_id AS instanceId,
            provider.provider_namespace AS providerNamespace,
            provider.scheduled_indexing_paused AS scheduledIndexingPaused
          FROM legal_search_release_shards shard
          LEFT JOIN legal_search_release_provider_instances provider
            ON provider.governance_id=shard.governance_id
            AND provider.shard_id=shard.shard_id
            AND provider.search_release_id=shard.search_release_id
          WHERE shard.governance_id=?
          ORDER BY shard.shard_id`).bind(governance?.id ?? "").all<{
            shardId: string;
            syncState: string;
            instanceId: string | null;
            providerNamespace: string | null;
            scheduledIndexingPaused: number | null;
          }>();
        if (!governance || shards.results.length === 0) return null;
        const evidence = governanceSchema.parse(JSON.parse(governance.evidenceJson) as unknown);
        if (shards.results.some((shard) => shard.syncState !== "complete"
          || shard.instanceId === null
          || shard.providerNamespace !== evidence.configuration.providerNamespaceIdentity
          || Number(shard.scheduledIndexingPaused) !== 1)) return null;
        return parsePinnedCandidateRelease({
          id: searchRelease.id,
          environment,
          capability: searchRelease.capability,
          instances: shards.results.map(({ shardId, instanceId }) => ({
            id: instanceId!,
            shardId,
          })),
          configuration: toPinnedCandidateConfiguration(evidence.configuration),
        });
  };
  return createRuntimeRetriever(dependencies, candidateIndex, {
      async resolve(endpoint) {
        const capability = endpoint.kind === "current" ? "current" : "as_of";
        const resolution = await releaseLifecycle.resolveActiveCapability(capability, environment);
        return resolution.availability === "available"
          ? resolvePinnedRelease(resolution.searchRelease) : null;
      },
      async resolveComparison(left, right) {
        const resolution = await releaseLifecycle.resolveActiveComparison(environment);
        if (resolution.availability !== "available") return null;
        const [current, history] = await Promise.all([
          resolvePinnedRelease(resolution.current), resolvePinnedRelease(resolution.history),
        ]);
        if (!current || !history) return null;
        return {
          left: left.kind === "current" ? current : history,
          right: right.kind === "current" ? current : history,
        };
      },
  });
}

export type TargetActivationSetEvaluationObservation = {
  activationSetId: string;
  historyReconciliationRunId: string;
  historyReportSha256: string;
  resolutions: Array<{
    kind: "endpoint" | "comparison";
    endpoint?: TemporalEndpoint;
    left?: TemporalEndpoint;
    right?: TemporalEndpoint;
    releaseId?: string;
    leftReleaseId?: string;
    rightReleaseId?: string;
  }>;
};

/** Opens one explicit off-side current/history pair for staging-only target evaluation. */
export async function createRuntimeTargetActivationSetEvaluation(input: {
  env: TargetRetrievalRuntimeEnv;
  activationSetId: string;
  historyReconciliationRunId: string;
  historyReportSha256: string;
}): Promise<{
  answer(question: Parameters<TargetLegalAnswerRetriever["answer"]>[0]): Promise<{
    result: Awaited<ReturnType<TargetLegalAnswerRetriever["answer"]>>;
    observation: TargetActivationSetEvaluationObservation;
  }>;
}> {
  const { env } = input;
  if (env.APP_ENV !== "staging" || env.LEGAL_CORPUS_SHADOW_MODE !== "true"
    || env.LEGAL_AI_SEARCH_PAUSED !== "true" || !env.LEGAL_DB || !env.LEGAL_EVIDENCE_BUCKET
    || !env.LEGAL_CORPUS_REASONING_SERVICE || !env.LEGAL_CUSTOM_SEARCH_SERVICE
    || !env.LEGAL_CUSTOM_HISTORY_SEARCH_SERVICE || !env.LEGAL_AI_GATEWAY_ID
    || !env.LEGAL_AI_PROVIDER_PROJECT_ID) {
    throw new TypeError("TARGET_ACTIVATION_SET_EVALUATION_UNAVAILABLE");
  }
  const selected = await resolveStagingHistoryComparisonEvaluationSet(env.LEGAL_DB, {
    activationSetId: input.activationSetId,
    historyReconciliationRunId: input.historyReconciliationRunId,
    historyReportSha256: input.historyReportSha256,
  });
  const dependencies: RuntimeDependencies = {
    environment: "staging", db: env.LEGAL_DB, evidenceBucket: env.LEGAL_EVIDENCE_BUCKET,
    reasoningService: env.LEGAL_CORPUS_REASONING_SERVICE,
  };
  const providers = new Map<CustomSearchCapability, AiSearchProvider>([
    ["current", createRuntimeEvaluationCustomSearchProvider({
      releaseId: selected.current.id, configurationIdentity: selected.current.configurationIdentity,
      service: env.LEGAL_CUSTOM_SEARCH_SERVICE, capability: "current",
      gatewayIdentity: env.LEGAL_AI_GATEWAY_ID, projectIdentity: env.LEGAL_AI_PROVIDER_PROJECT_ID,
    })],
    ["history", createRuntimeEvaluationCustomSearchProvider({
      releaseId: selected.history.id, configurationIdentity: selected.history.configurationIdentity,
      service: env.LEGAL_CUSTOM_HISTORY_SEARCH_SERVICE, capability: "history",
      gatewayIdentity: env.LEGAL_AI_GATEWAY_ID, projectIdentity: env.LEGAL_AI_PROVIDER_PROJECT_ID,
    })],
  ]);
  const providerForInstance = (instanceId: string) =>
    (["current", "history"] as const).find(capability =>
      instanceId === customInstanceId(capability, "staging"));
  const provider: AiSearchProvider = {
    attest(instanceId, releaseId) {
      const capability = providerForInstance(instanceId);
      return capability
        ? providers.get(capability)!.attest(instanceId, releaseId)
        : Promise.reject(new TypeError("TARGET_CANDIDATE_PROVIDER_UNAVAILABLE"));
    },
    search(searchInput) {
      const capability = searchInput.instanceIds.length === 1
        ? providerForInstance(searchInput.instanceIds[0]!) : undefined;
      return capability
        ? providers.get(capability)!.search(searchInput)
        : Promise.reject(new TypeError("TARGET_CANDIDATE_PROVIDER_UNAVAILABLE"));
    },
  };
  const pinned = (release: typeof selected.current) => parsePinnedCandidateRelease({
    id: release.id, environment: "staging", capability: release.capability,
    instances: [{ id: customInstanceId(release.capability, "staging"),
      shardId: customShardId(release.capability) }],
    configuration: customPinnedConfiguration(release.configurationIdentity,
      env.LEGAL_AI_GATEWAY_ID!, env.LEGAL_AI_PROVIDER_PROJECT_ID!),
  });
  const current = pinned(selected.current);
  const history = pinned(selected.history);
  return {
    async answer(question) {
      const observation: TargetActivationSetEvaluationObservation = {
        activationSetId: selected.id,
        historyReconciliationRunId: selected.historyReconciliationRunId,
        historyReportSha256: selected.historyReportSha256,
        resolutions: [],
      };
      const releaseResolver: RuntimeReleaseResolver = {
        async resolve(endpoint) {
          const release = endpoint.kind === "current" ? current : history;
          observation.resolutions.push({ kind: "endpoint", endpoint, releaseId: release.id });
          return release;
        },
        async resolveComparison(left, right) {
          const leftRelease = left.kind === "current" ? current : history;
          const rightRelease = right.kind === "current" ? current : history;
          observation.resolutions.push({ kind: "comparison", left, right,
            leftReleaseId: leftRelease.id, rightReleaseId: rightRelease.id });
          return { left: leftRelease, right: rightRelease };
        },
      };
      const retriever = createRuntimeRetriever(dependencies,
        createRuntimeCandidateIndex(dependencies, provider), releaseResolver);
      return { result: await retriever.answer(question), observation };
    },
  };
}

const qualificationIdentifier = z.string().trim().min(1).max(200)
  .regex(/^[A-Za-z0-9._:-]+$/u);
const qualificationReconciliationSchema = z.object({
  instanceId: z.string().trim().min(1).max(64),
  providerItems: z.number().int().positive(),
  uniqueItems: z.number().int().positive(),
  chunks: z.number().int().positive(),
  mismatches: z.record(z.string(), z.number().int().nonnegative()),
  verifiedInventorySha256: z.string().regex(/^[a-f0-9]{64}$/u),
  ok: z.literal(true),
}).passthrough();

type CandidateQualificationRow = {
  id: string;
  searchReleaseId: string;
  environment: string;
  capability: string;
  reconciliationRunId: string;
  providerNamespace: string;
  providerInstanceId: string;
  shardId: string;
  configurationJson: string;
  configurationSha256: string;
  providerItemCount: number;
  providerChunkCount: number;
  providerInventorySha256: string;
  providerReconciliationJson: string;
  providerReconciliationSha256: string;
  sourcePrefix: string;
  scheduledIndexingPaused: number;
  status: string;
  recordedAt: string;
  releaseEnvironment: string;
  releaseCapability: string;
  releaseStatus: string;
  releaseItemCount: number;
  releaseConfigurationIdentity: string;
  reconciliationStatus: string;
  reconciliationEnvironment: string;
  reconciliationReleaseId: string;
  reconciliationCapability: string;
  projectionStatus: string;
  projectionEnvironment: string;
  projectionExpectedItems: number;
  projectionCopiedItems: number;
  projectionBucketName: string;
};

/**
 * Opens one immutable, fully reconciled off-side candidate for staging-only
 * Legal Answer evaluation. It does not create governance, seal a release, or
 * change the active capability set.
 */
export async function createRuntimeTargetCandidateEvaluationRetriever(
  env: TargetRetrievalRuntimeEnv,
  untrustedQualificationId: string,
): Promise<TargetLegalAnswerRetriever> {
  const environment = environmentSchema.parse(env.APP_ENV);
  if (environment !== "staging" || env.LEGAL_CORPUS_SHADOW_MODE !== "true"
    || env.LEGAL_AI_SEARCH_PAUSED !== "true"
    || !env.LEGAL_DB || !env.LEGAL_EVIDENCE_BUCKET
    || !env.LEGAL_AI_SEARCH_NAMESPACE || !env.LEGAL_AI_SEARCH_NAMESPACE_NAME
    || !env.LEGAL_AI_SEARCH_SOURCE_BUCKET_NAME || !env.LEGAL_CORPUS_REASONING_SERVICE) {
    throw new TypeError("TARGET_CANDIDATE_EVALUATION_UNAVAILABLE");
  }
  const qualificationId = qualificationIdentifier.parse(untrustedQualificationId);
  const row = await env.LEGAL_DB.prepare(`SELECT qualification.id,
      qualification.search_release_id AS searchReleaseId,
      qualification.environment,qualification.capability,
      qualification.reconciliation_run_id AS reconciliationRunId,
      qualification.provider_namespace AS providerNamespace,
      qualification.provider_instance_id AS providerInstanceId,
      qualification.shard_id AS shardId,
      qualification.configuration_json AS configurationJson,
      qualification.configuration_sha256 AS configurationSha256,
      qualification.provider_item_count AS providerItemCount,
      qualification.provider_chunk_count AS providerChunkCount,
      qualification.provider_inventory_sha256 AS providerInventorySha256,
      qualification.provider_reconciliation_json AS providerReconciliationJson,
      qualification.provider_reconciliation_sha256 AS providerReconciliationSha256,
      qualification.source_prefix AS sourcePrefix,
      qualification.scheduled_indexing_paused AS scheduledIndexingPaused,
      qualification.status,qualification.recorded_at AS recordedAt,
      release.environment AS releaseEnvironment,release.capability AS releaseCapability,
      release.status AS releaseStatus,release.item_count AS releaseItemCount,
      release.configuration_identity AS releaseConfigurationIdentity,
      reconciliation.status AS reconciliationStatus,
      reconciliation.environment AS reconciliationEnvironment,
      reconciliation.release_id AS reconciliationReleaseId,
      reconciliation.capability AS reconciliationCapability,
      projection.status AS projectionStatus,
      projection.environment AS projectionEnvironment,
      projection.expected_item_count AS projectionExpectedItems,
      projection.copied_item_count AS projectionCopiedItems,
      projection.projection_bucket_name AS projectionBucketName
    FROM legal_search_candidate_qualifications qualification
    JOIN legal_search_releases release ON release.id=qualification.search_release_id
    JOIN legal_migration_reconciliation_reports reconciliation
      ON reconciliation.run_id=qualification.reconciliation_run_id
    JOIN legal_ai_search_projection_builds projection
      ON projection.search_release_id=qualification.search_release_id
    WHERE qualification.id=? AND projection.projection_bucket_name=? LIMIT 1`)
    .bind(qualificationId, env.LEGAL_AI_SEARCH_SOURCE_BUCKET_NAME)
    .first<CandidateQualificationRow>();
  if (!row) throw new TypeError("TARGET_CANDIDATE_QUALIFICATION_NOT_FOUND");
  const configuration = governedAiSearchConfigurationSchema.parse(
    JSON.parse(row.configurationJson) as unknown,
  );
  const configurationSha256 = await sha256Hex(row.configurationJson);
  const reconciliationSha256 = await sha256Hex(row.providerReconciliationJson);
  const providerReconciliation = qualificationReconciliationSchema.parse(
    JSON.parse(row.providerReconciliationJson) as unknown,
  );
  const inventorySha = z.string().regex(/^[a-f0-9]{64}$/u)
    .safeParse(row.providerInventorySha256);
  const exactIdentity = row.environment === environment
    && row.capability === "current"
    && row.status === "qualified"
    && row.releaseEnvironment === environment
    && row.releaseCapability === "current"
    && row.releaseStatus === "draft"
    && row.reconciliationStatus === "clean"
    && row.reconciliationEnvironment === environment
    && row.reconciliationReleaseId === row.searchReleaseId
    && row.reconciliationCapability === "current"
    && row.projectionStatus === "complete"
    && row.projectionEnvironment === environment
    && Number(row.providerItemCount) === Number(row.releaseItemCount)
    && Number(row.projectionExpectedItems) === Number(row.releaseItemCount)
    && Number(row.projectionCopiedItems) === Number(row.releaseItemCount)
    && Number(row.providerChunkCount) >= Number(row.providerItemCount)
    && Number(row.scheduledIndexingPaused) === 1
    && row.providerNamespace === env.LEGAL_AI_SEARCH_NAMESPACE_NAME
    && row.projectionBucketName === env.LEGAL_AI_SEARCH_SOURCE_BUCKET_NAME
    && row.configurationSha256 === configurationSha256
    && row.providerReconciliationSha256 === reconciliationSha256
    && inventorySha.success
    && providerReconciliation.instanceId === row.providerInstanceId
    && providerReconciliation.providerItems === Number(row.providerItemCount)
    && providerReconciliation.uniqueItems === Number(row.providerItemCount)
    && providerReconciliation.chunks === Number(row.providerChunkCount)
    && providerReconciliation.verifiedInventorySha256 === row.providerInventorySha256
    && Object.keys(providerReconciliation.mismatches).length === 0
    && configuration.identity === row.releaseConfigurationIdentity
    && configuration.providerNamespaceIdentity === row.providerNamespace
    && configuration.sourcePrefix === row.sourcePrefix
    && row.sourcePrefix === `search-releases/${row.searchReleaseId}/current/`;
  if (!exactIdentity) throw new TypeError("TARGET_CANDIDATE_QUALIFICATION_REJECTED");
  const pinnedConfiguration = toPinnedCandidateConfiguration(configuration);
  const pinnedRelease = parsePinnedCandidateRelease({
    id: row.searchReleaseId,
    environment,
    capability: "current",
    instances: [{ id: row.providerInstanceId, shardId: row.shardId }],
    configuration: pinnedConfiguration,
  });
  const provider = createCloudflareAiSearchProvider(env.LEGAL_AI_SEARCH_NAMESPACE, {
    namespaceIdentity: row.providerNamespace,
    sourceBucketName: env.LEGAL_AI_SEARCH_SOURCE_BUCKET_NAME,
    sourcePrefix: row.sourcePrefix,
    shardByInstance: { [row.providerInstanceId]: row.shardId },
    configuration: pinnedConfiguration,
    async attestManagement(instanceId) {
      if (instanceId !== row.providerInstanceId) {
        throw new TypeError("TARGET_CANDIDATE_INSTANCE_REJECTED");
      }
      return {
        instanceId,
        configuration: pinnedConfiguration,
        evidenceSha256: row.configurationSha256,
        observedAt: row.recordedAt,
      };
    },
  });
  const dependencies = {
    environment,
    db: env.LEGAL_DB,
    evidenceBucket: env.LEGAL_EVIDENCE_BUCKET,
    reasoningService: env.LEGAL_CORPUS_REASONING_SERVICE,
  };
  return createRuntimeRetriever(
    dependencies,
    createRuntimeCandidateIndex(dependencies, provider),
    { resolve: async (endpoint) => endpoint.kind === "current" ? pinnedRelease : null },
  );
}
