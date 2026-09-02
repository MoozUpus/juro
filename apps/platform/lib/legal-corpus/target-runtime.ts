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
import { resolveControllingEvidence, type LegalEvidenceBucket } from "./target-evidence";
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
  LEGAL_DB?: D1Database;
  LEGAL_EVIDENCE_BUCKET?: Pick<LegalEvidenceBucket, "get">;
  LEGAL_AI_SEARCH_NAMESPACE?: AiSearchNamespace;
  LEGAL_AI_SEARCH_NAMESPACE_NAME?: string;
  LEGAL_AI_SEARCH_SOURCE_BUCKET_NAME?: string;
  LEGAL_CORPUS_REASONING_SERVICE?: Fetcher;
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

function createCandidateCatalog(db: D1Database) {
  return {
    async revalidate(
      packet: CandidatePacket,
      _endpoint: TemporalEndpoint,
      release: PinnedCandidateRelease,
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
      }> = [];
      for (let offset = 0; offset < uniqueKeys.length; offset += 80) {
        const keys = uniqueKeys.slice(offset, offset + 80);
        if (keys.length === 0) continue;
        const placeholders = keys.map(() => "?").join(",");
        const result = await db.prepare(`SELECT item.item_key AS itemKey,
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

export function createRuntimeTargetLegalAnswerRetriever(
  env: TargetRetrievalRuntimeEnv,
): TargetLegalAnswerRetriever {
  const environment = environmentSchema.parse(env.APP_ENV);
  if (!env.LEGAL_DB || !env.LEGAL_EVIDENCE_BUCKET
    || !env.LEGAL_AI_SEARCH_NAMESPACE || !env.LEGAL_AI_SEARCH_NAMESPACE_NAME
    || !env.LEGAL_AI_SEARCH_SOURCE_BUCKET_NAME || !env.LEGAL_CORPUS_REASONING_SERVICE) {
    throw new TypeError("TARGET_RETRIEVAL_RUNTIME_UNAVAILABLE");
  }
  const db = env.LEGAL_DB;
  const evidenceBucket = env.LEGAL_EVIDENCE_BUCKET;
  const reasoningService = env.LEGAL_CORPUS_REASONING_SERVICE;
  const releaseLifecycle = createReleaseLifecycle({ db });
  const candidateIndex = createAiSearchCandidateIndex(createRuntimeAiSearchProvider({
    db,
    namespace: env.LEGAL_AI_SEARCH_NAMESPACE,
    namespaceName: env.LEGAL_AI_SEARCH_NAMESPACE_NAME,
    sourceBucketName: env.LEGAL_AI_SEARCH_SOURCE_BUCKET_NAME,
  }), {
    async attestPrivateNames(input) {
      return serviceJson(
        reasoningService,
        environment,
        "/internal/legal-corpus/privacy/classify-private-names",
        input,
      );
    },
    emitTelemetry(event) {
      console.log(JSON.stringify({ event: "legal_target_candidate", ...event }));
    },
    async resolveTrustedLegalTitles(release) {
      const result = await db.prepare(`SELECT DISTINCT instrument.canonical_title AS title
        FROM legal_search_release_items item
        JOIN legal_provision_renditions rendition
          ON rendition.id=item.provision_rendition_id
        JOIN legal_provision_concepts concept
          ON concept.id=rendition.provision_concept_id
        JOIN legal_instruments instrument ON instrument.id=concept.legal_instrument_id
        WHERE item.search_release_id=? ORDER BY instrument.canonical_title`)
        .bind(release.id).all<{ title: string }>();
      return result.results.map((row) => z.string().trim().min(3).max(300).parse(row.title));
    },
  });
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
    releaseResolver: {
      async resolve(endpoint) {
        const capability = endpoint.kind === "current" ? "current" : "as_of";
        const resolution = await releaseLifecycle.resolveActiveCapability(capability, environment);
        if (resolution.availability !== "available") return null;
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
    },
    candidateIndex,
    candidateCatalog: createCandidateCatalog(db),
    evidenceResolver: {
      resolveControlling: (provisionRenditionId, endpoint) => resolveControllingEvidence(
        { db, bucket: evidenceBucket },
        provisionRenditionId,
        endpoint,
      ),
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
