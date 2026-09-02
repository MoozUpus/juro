import { z } from "zod";

import {
  createAiSearchCandidateIndex,
  candidateConfigurationSchema,
  parsePinnedCandidateRelease,
  toPinnedCandidateConfiguration,
  type CandidateConfiguration,
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
  LEGAL_AI_SEARCH_SERVICE?: Fetcher;
  LEGAL_CORPUS_REASONING_SERVICE?: Fetcher;
};

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
    || !env.LEGAL_AI_SEARCH_SERVICE || !env.LEGAL_CORPUS_REASONING_SERVICE) {
    throw new TypeError("TARGET_RETRIEVAL_RUNTIME_UNAVAILABLE");
  }
  const db = env.LEGAL_DB;
  const evidenceBucket = env.LEGAL_EVIDENCE_BUCKET;
  const aiSearchService = env.LEGAL_AI_SEARCH_SERVICE;
  const reasoningService = env.LEGAL_CORPUS_REASONING_SERVICE;
  const releaseLifecycle = createReleaseLifecycle({ db });
  const candidateIndex = createAiSearchCandidateIndex({
    async attest(instanceId): Promise<CandidateConfiguration> {
      const body = await serviceJson(
        aiSearchService,
        environment,
        "/internal/legal-corpus/ai-search/attest",
        { instanceId },
      );
      return z.object({ configuration: candidateConfigurationSchema }).strict()
        .parse(body).configuration;
    },
    async search(input) {
      const body = await serviceJson(
        aiSearchService,
        environment,
        "/internal/legal-corpus/ai-search/search",
        input,
      );
      return z.object({ result: z.object({
        hits: z.array(z.object({
          itemKey: z.string(), instanceId: z.string(), shardId: z.string(),
          vectorRank: z.number(), vectorScore: z.number(), keywordRank: z.number(),
          keywordScore: z.number(), fusionScore: z.number(),
        }).passthrough()),
        errors: z.array(z.object({ code: z.string(), instanceId: z.string().optional() })),
        searchedInstanceIds: z.array(z.string()),
        tokenUsage: z.number().int().nonnegative().optional(),
      }).strict() }).strict().parse(body).result;
    },
  }, {
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
