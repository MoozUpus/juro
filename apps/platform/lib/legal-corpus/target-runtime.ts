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
import { resolveCustomTrustedLegalTitles } from "./custom-search-trusted-titles";
import { assertCompleteCorpusCurrentInterval, resolveCompleteCorpusCurrentEvidence, resolveControllingEvidence,
  type LegalEvidenceBucket } from "./target-evidence";
import { resolveProvisionLineage } from "./target-lineage";
import { governedAiSearchConfigurationSchema } from "./target-governance";
import { createReleaseLifecycle } from "./target-release";
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
};

type RuntimeProviderGovernance = {
  governanceId: string;
  evidenceJson: string;
  recordedAt: string;
  providerNamespace: string;
};

async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
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

export function createRuntimeCandidateCatalog(db: D1Database) {
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
      if (custom && endpoint.kind !== "current") {
        throw new TypeError("TARGET_CUSTOM_CANDIDATE_ENDPOINT_INVALID");
      }
      for (let offset = 0; offset < uniqueKeys.length; offset += 80) {
        const keys = uniqueKeys.slice(offset, offset + 80);
        if (keys.length === 0) continue;
        const placeholders = keys.map(() => "?").join(",");
        const result = await db.prepare(custom ? `SELECT item.item_key AS itemKey,
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
            AND record.current_eligible=1 AND record.quarantined=0` : `SELECT item.item_key AS itemKey,
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
          ...keys,
        ).all<typeof rows[number]>();
        rows.push(...result.results);
      }
      const byKey = new Map(rows.map((row) => [row.itemKey, row]));
      return parseRevalidatedCandidates(packet.candidates.map((candidate) => {
        const row = byKey.get(candidate.itemKey);
        if (!row) throw new TypeError("TARGET_CANDIDATE_NOT_IN_PINNED_RELEASE");
        if (custom) assertCompleteCorpusCurrentInterval(row, currentAt);
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

const customInstanceId = (environment: string) => `custom-current-${environment}-v1`;
const customShardId = "current-base-v1";

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

export function createRuntimeCustomSearchProvider(input: {
  db: D1Database;
  service: Fetcher;
  environment: "development" | "staging" | "production";
  gatewayIdentity: string;
  projectIdentity: string;
}): AiSearchProvider {
  const pinned = async (releaseId: string | undefined) => {
    if (!releaseId) throw new TypeError("CUSTOM_SEARCH_PINNED_RELEASE_REQUIRED");
    const row = await input.db.prepare(`SELECT release.id,release.configuration_identity AS configurationIdentity
      FROM legal_search_releases release
      JOIN legal_custom_search_runtime_components runtime ON runtime.search_release_id=release.id
      WHERE release.environment=? AND release.id=? AND release.status='sealed'`).bind(input.environment, releaseId)
      .first<{ id: string; configurationIdentity: string }>();
    if (!row) throw new TypeError("CUSTOM_SEARCH_ACTIVE_RELEASE_UNAVAILABLE");
    return row;
  };
  return {
    async attest(instanceId, releaseId) {
      if (instanceId !== customInstanceId(input.environment)) {
        throw new TypeError("CUSTOM_SEARCH_INSTANCE_REJECTED");
      }
      const release = await pinned(releaseId);
      return customPinnedConfiguration(release.configurationIdentity,
        input.gatewayIdentity, input.projectIdentity);
    },
    async search(searchInput) {
      if (searchInput.endpoint.kind !== "current"
        || searchInput.instanceIds.length !== 1
        || searchInput.instanceIds[0] !== customInstanceId(input.environment)) {
        throw new TypeError("CUSTOM_SEARCH_REQUEST_REJECTED");
      }
      const release = await pinned(searchInput.releaseId);
      const response = await input.service.fetch(`http://legal-corpus.internal${CUSTOM_SEARCH_PATH}`, {
        method: "POST",
        headers: { "content-type": "application/json",
          "x-juro-service-binding": CUSTOM_SEARCH_SERVICE_MARKER,
          "x-juro-legal-environment": input.environment },
        body: JSON.stringify({ ...searchInput, releaseId: release.id }),
      });
      if (!response.ok) throw new TypeError("CUSTOM_SEARCH_SERVICE_UNAVAILABLE");
      return customSearchResponseSchema.parse(await response.json());
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
    candidateCatalog: createRuntimeCandidateCatalog(db),
    evidenceResolver: {
      async resolveControlling(provisionRenditionId, endpoint, context) {
        if (context.release.instances.some((instance) => instance.id === customInstanceId(environment))) {
          return resolveCompleteCorpusCurrentEvidence(
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
  const customProvider = env.LEGAL_CUSTOM_SEARCH_SERVICE && env.LEGAL_AI_GATEWAY_ID
    && env.LEGAL_AI_PROVIDER_PROJECT_ID ? createRuntimeCustomSearchProvider({
      db, service: env.LEGAL_CUSTOM_SEARCH_SERVICE, environment,
      gatewayIdentity: env.LEGAL_AI_GATEWAY_ID,
      projectIdentity: env.LEGAL_AI_PROVIDER_PROJECT_ID,
    }) : null;
  if (!aiProvider && !customProvider) throw new TypeError("TARGET_RETRIEVAL_RUNTIME_UNAVAILABLE");
  const provider: AiSearchProvider = {
    attest(instanceId, releaseId) {
      return instanceId === customInstanceId(environment) && customProvider
        ? customProvider.attest(instanceId, releaseId)
        : aiProvider?.attest(instanceId, releaseId)
          ?? Promise.reject(new TypeError("TARGET_CANDIDATE_PROVIDER_UNAVAILABLE"));
    },
    search(input) {
      return input.instanceIds.every((id) => id === customInstanceId(environment)) && customProvider
        ? customProvider.search(input)
        : aiProvider?.search(input)
          ?? Promise.reject(new TypeError("TARGET_CANDIDATE_PROVIDER_UNAVAILABLE"));
    },
  };
  const candidateIndex = createRuntimeCandidateIndex(dependencies, provider);
  return createRuntimeRetriever(dependencies, candidateIndex, {
      async resolve(endpoint) {
        const capability = endpoint.kind === "current" ? "current" : "as_of";
        const resolution = await releaseLifecycle.resolveActiveCapability(capability, environment);
        if (resolution.availability !== "available") return null;
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
          resolution.searchRelease.id,
        ).first<{ configurationIdentity: string; itemCount: number; chunkCount: number;
          embeddingModel: string; embeddingDimensions: number; mappingCount: number;
          evidenceJson: string }>();
        if (custom) {
          const evidence = customReleaseGovernanceSchema.parse(JSON.parse(custom.evidenceJson) as unknown);
          if (evidence.releaseId !== resolution.searchRelease.id
            || custom.itemCount !== custom.chunkCount || custom.mappingCount !== custom.itemCount
            || custom.embeddingModel !== "text-embedding-3-large"
            || Number(custom.embeddingDimensions) !== 1_536
            || !customProvider || !env.LEGAL_AI_GATEWAY_ID || !env.LEGAL_AI_PROVIDER_PROJECT_ID) {
            return null;
          }
          return parsePinnedCandidateRelease({
            id: resolution.searchRelease.id,
            environment,
            capability: resolution.searchRelease.capability,
            instances: [{ id: customInstanceId(environment), shardId: customShardId }],
            configuration: customPinnedConfiguration(custom.configurationIdentity,
              env.LEGAL_AI_GATEWAY_ID, env.LEGAL_AI_PROVIDER_PROJECT_ID),
          });
        }
        const governance = await db.prepare(`SELECT id,evidence_json AS evidenceJson
          FROM legal_search_release_governance
          WHERE search_release_id=? AND status='passed'
          ORDER BY recorded_at DESC LIMIT 1`).bind(
          resolution.searchRelease.id,
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
          id: resolution.searchRelease.id,
          environment,
          capability: resolution.searchRelease.capability,
          instances: shards.results.map(({ shardId, instanceId }) => ({
            id: instanceId!,
            shardId,
          })),
          configuration: toPinnedCandidateConfiguration(evidence.configuration),
        });
      },
  });
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
