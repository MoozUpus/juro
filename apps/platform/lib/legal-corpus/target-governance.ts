import { z } from "zod";

import { legalEvaluationCorpus } from "../../evaluation/legal-evaluation-corpus";
import {
  AI_SEARCH_METADATA_SCHEMA,
  candidateConfigurationSchema,
} from "./legal-candidate-index";
import { LEGAL_CORPUS_RELEASE_THRESHOLDS } from "./release-gate";
import { assertSearchReleaseMetadataParity } from "./target-temporal";
import { customReleaseGovernanceSchema } from "./custom-release-governance";

const identifier = z.string().min(1).max(200).regex(/^[A-Za-z0-9._:-]+$/u);
const instant = z.string().datetime().regex(/Z$/u);
const sha = z.string().regex(/^[a-f0-9]{64}$/u);
const environment = z.enum(["development", "staging", "production"]);
const capability = z.enum(["current", "history"]);

export const REQUIRED_RELEASE_EVALUATION_STRATA = [
  "exact_citation",
  "russian",
  "uzbek_latin",
  "uzbek_cyrillic",
  "english",
  "cross_language",
  "ambiguity",
  "domain_breadth",
  "current",
  "as_of",
  "comparison",
  "coverage_completeness",
  "long_adjacent_referenced",
  "typo_transliteration",
  "adversarial_source",
  "dependency_failure",
  "cold_warm",
  "fast_deep",
] as const;

export const LEGAL_RELEASE_EVALUATION_REGISTRY_VERSION = "legal-evaluation-corpus-v3";
type ReleaseEvaluationStratum = (typeof REQUIRED_RELEASE_EVALUATION_STRATA)[number];

function scenarioBelongsToStratum(
  scenario: (typeof legalEvaluationCorpus)[number],
  stratum: ReleaseEvaluationStratum,
): boolean {
  switch (stratum) {
    case "exact_citation": return scenario.releaseGateCapabilities.includes("exact_citation");
    case "russian": return scenario.queryLanguage === "ru";
    case "uzbek_latin": return scenario.queryLanguage === "uz-Latn";
    case "uzbek_cyrillic": return scenario.queryLanguage === "uz-Cyrl";
    case "english": return scenario.queryLanguage === "en";
    case "cross_language": return scenario.releaseGateCapabilities.includes("cross_language");
    case "ambiguity": return scenario.tags.includes("ambiguous")
      || scenario.tags.includes("incomplete_facts");
    case "domain_breadth": return true;
    case "current": return scenario.releaseGateCapabilities.includes("current");
    case "as_of": return scenario.releaseGateCapabilities.includes("as_of");
    case "comparison": return scenario.releaseGateCapabilities.includes("comparison");
    case "coverage_completeness": return scenario.releaseGateCapabilities
      .includes("coverage_completeness");
    case "long_adjacent_referenced": return scenario.releaseGateCapabilities
      .includes("long_adjacent_referenced");
    case "typo_transliteration": return scenario.releaseGateCapabilities
      .includes("typo_transliteration");
    case "adversarial_source": return scenario.releaseGateCapabilities.includes("adversarial_source");
    case "dependency_failure": return scenario.releaseGateCapabilities.includes("dependency_failure");
    case "cold_warm": return scenario.releaseGateCapabilities.includes("cold_warm");
    case "fast_deep": return scenario.releaseGateCapabilities.includes("fast_deep");
  }
}

export const LEGAL_RELEASE_EVALUATION_REGISTRY = Object.freeze(Object.fromEntries(
  REQUIRED_RELEASE_EVALUATION_STRATA.map((stratum) => [
    stratum,
    Object.freeze(legalEvaluationCorpus
      .filter((scenario) => scenarioBelongsToStratum(scenario, stratum))
      .map((scenario) => scenario.id)),
  ]),
) as Record<ReleaseEvaluationStratum, readonly string[]>);

const metricSchema = z.object({
  recallAt5: z.number().min(0).max(1),
  recallAt10: z.number().min(0).max(1),
  mrr: z.number().min(0).max(1),
  citationPrecision: z.number().min(0).max(1),
  citationRecall: z.number().min(0).max(1),
  articleExactness: z.number().min(0).max(1),
  documentExactness: z.number().min(0).max(1),
  abstentionCorrectness: z.number().min(0).max(1),
  partialAnswerCorrectness: z.number().min(0).max(1),
  groundedness: z.number().min(0).max(1),
  staleInvalidLinkCount: z.number().int().nonnegative(),
  sourceUnavailabilityRate: z.number().min(0).max(1),
  indexedP95Ms: z.number().nonnegative(),
  answerP95Ms: z.number().nonnegative(),
  providerCostUsd: z.number().nonnegative(),
}).strict();
const stratumSchema = metricSchema.extend({
  stratum: z.enum(REQUIRED_RELEASE_EVALUATION_STRATA),
  scenarioCount: z.number().int().positive(),
  scenarioIds: z.array(identifier).min(1),
}).strict();
const providerItemSchema = z.object({
  itemKey: z.string().min(1).max(700),
  language: z.enum(["uz-Latn", "uz-Cyrl", "ru", "en"]),
  documentType: z.string().trim().min(1).max(160),
  validFrom: instant,
  validTo: instant.nullable(),
}).strict();
const candidateReconciliationSchema = z.object({
  instanceId: identifier,
  providerItems: z.number().int().positive(),
  uniqueItems: z.number().int().positive(),
  chunks: z.number().int().positive(),
  mismatches: z.record(z.string(), z.number().int().nonnegative()),
  verifiedInventorySha256: sha,
  ok: z.literal(true),
}).passthrough();
export const governedAiSearchConfigurationSchema = candidateConfigurationSchema.extend({
  metadataSchema: z.array(z.string().min(1).max(40)).max(5),
  fifthMetadataFieldReserved: z.boolean(),
  embeddingModel: z.string().min(1).max(200),
  dimensions: z.number().int().positive(),
  keywordTokenizer: z.string().min(1).max(40),
  providerNamespaceIdentity: identifier,
  sourcePrefix: z.string().min(1).max(500),
  serviceBindingIdentity: identifier,
  queryRewriting: z.boolean(),
  providerReranking: z.boolean(),
  providerGeneration: z.boolean(),
  contextExpansion: z.boolean(),
}).strict();
const evidenceSchema = z.object({
  id: identifier,
  releaseId: identifier,
  environment,
  capability,
  reconciliationRunId: identifier,
  recordedAt: instant,
  configuration: governedAiSearchConfigurationSchema,
  privacy: z.object({
    deterministicTransformAttested: z.boolean(),
    contentFreeTelemetryAttested: z.boolean(),
    productionDisclosureAccepted: z.boolean(),
    productionEmbeddingDataControlsApproved: z.boolean(),
    stagingQueriesSyntheticOrNonPersonal: z.boolean(),
  }).strict(),
  sync: z.object({
    state: z.enum(["pending", "complete", "failed"]),
    scheduledIndexingPaused: z.boolean(),
    partialErrors: z.number().int().nonnegative(),
  }).strict(),
  shards: z.array(z.object({
    id: z.string().regex(/^\d{2}$/u),
    itemCount: z.number().int().nonnegative(),
    inventorySha256: sha,
    syncState: z.enum(["pending", "complete", "failed"]),
    providerNamespaceIdentity: identifier,
    providerInstanceId: identifier,
    syncJobId: identifier,
    scheduledIndexingPaused: z.boolean(),
  }).strict()).min(1).max(99),
  providerItems: z.array(providerItemSchema).max(1_000).optional(),
  candidateQualificationIds: z.array(identifier).min(1).max(99).optional(),
  cost: z.object({
    measuredEmbeddingTokens: z.number().int().positive(),
    acceptedUsdPerMillionTokens: z.number().positive(),
    authorizedCostUsd: z.number().nonnegative(),
    migrationBudgetKind: z.enum(["current", "complete"]),
    monthlyProductionQueryCostUsd: z.number().nonnegative(),
    unpricedRequests: z.number().int().nonnegative(),
  }).strict(),
  integrity: z.object({
    missingItems: z.number().int().nonnegative(),
    extraItems: z.number().int().nonnegative(),
    hashMismatches: z.number().int().nonnegative(),
    metadataMismatches: z.number().int().nonnegative(),
    unknownKeys: z.number().int().nonnegative(),
    wrongReleaseKeys: z.number().int().nonnegative(),
    partialResponses: z.number().int().nonnegative(),
    configurationErrors: z.number().int().nonnegative(),
    privacyErrors: z.number().int().nonnegative(),
  }).strict(),
  evaluation: z.object({
    registryVersion: z.literal(LEGAL_RELEASE_EVALUATION_REGISTRY_VERSION),
    scenarioCount: z.literal(314),
    providerCostUsd: z.number().nonnegative(),
    strata: z.array(stratumSchema).min(REQUIRED_RELEASE_EVALUATION_STRATA.length),
  }).strict(),
  operations: z.object({
    officialChangeValidatedAt: instant,
    currentSnapshotReadyAt: instant,
    emergencyRequestedAt: instant.nullable(),
    emergencyReadyAt: instant.nullable(),
    historyLastReconciledAt: instant,
    rollbackHealthy: z.boolean(),
  }).strict(),
}).strict().superRefine((value, context) => {
  const hasItems = value.providerItems !== undefined;
  const hasQualifications = value.candidateQualificationIds !== undefined;
  if (hasItems === hasQualifications) {
    context.addIssue({
      code: "custom",
      message: "Provide exactly one provider inventory evidence form",
    });
  }
  if (value.environment !== "development" && !hasQualifications) {
    context.addIssue({
      code: "custom",
      message: "Staging and production require immutable candidate qualifications",
    });
  }
});

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function minimum(failures: string[], label: string, actual: number, threshold: number): void {
  if (actual < threshold) failures.push(label);
}

function maximum(failures: string[], label: string, actual: number, threshold: number): void {
  if (actual > threshold) failures.push(label);
}

function evaluateMetrics(failures: string[], prefix: string, row: z.infer<typeof metricSchema>): void {
  minimum(failures, `${prefix}:RECALL_AT_5`, row.recallAt5, LEGAL_CORPUS_RELEASE_THRESHOLDS.recallAt5);
  minimum(failures, `${prefix}:RECALL_AT_10`, row.recallAt10, LEGAL_CORPUS_RELEASE_THRESHOLDS.recallAt10);
  minimum(failures, `${prefix}:MRR`, row.mrr, LEGAL_CORPUS_RELEASE_THRESHOLDS.mrr);
  minimum(failures, `${prefix}:CITATION_PRECISION`, row.citationPrecision,
    LEGAL_CORPUS_RELEASE_THRESHOLDS.citationPrecision);
  minimum(failures, `${prefix}:CITATION_RECALL`, row.citationRecall,
    LEGAL_CORPUS_RELEASE_THRESHOLDS.citationRecall);
  minimum(failures, `${prefix}:ARTICLE_EXACTNESS`, row.articleExactness,
    LEGAL_CORPUS_RELEASE_THRESHOLDS.articleExactness);
  minimum(failures, `${prefix}:DOCUMENT_EXACTNESS`, row.documentExactness,
    LEGAL_CORPUS_RELEASE_THRESHOLDS.documentExactness);
  minimum(failures, `${prefix}:ABSTENTION_CORRECTNESS`, row.abstentionCorrectness,
    LEGAL_CORPUS_RELEASE_THRESHOLDS.abstentionAccuracy);
  minimum(failures, `${prefix}:PARTIAL_ANSWER_CORRECTNESS`, row.partialAnswerCorrectness,
    LEGAL_CORPUS_RELEASE_THRESHOLDS.partialAnswerAccuracy);
  minimum(failures, `${prefix}:GROUNDEDNESS`, row.groundedness,
    LEGAL_CORPUS_RELEASE_THRESHOLDS.groundedness);
  maximum(failures, `${prefix}:STALE_INVALID_LINKS`, row.staleInvalidLinkCount, 0);
  maximum(failures, `${prefix}:SOURCE_UNAVAILABILITY`, row.sourceUnavailabilityRate,
    LEGAL_CORPUS_RELEASE_THRESHOLDS.maximumTechnicalUnavailabilityRate);
  maximum(failures, `${prefix}:INDEXED_P95`, row.indexedP95Ms,
    LEGAL_CORPUS_RELEASE_THRESHOLDS.p95RetrievalMs);
  maximum(failures, `${prefix}:ANSWER_P95`, row.answerP95Ms,
    LEGAL_CORPUS_RELEASE_THRESHOLDS.p95CompleteAnswerMs);
  maximum(failures, `${prefix}:EVALUATION_COST`, row.providerCostUsd,
    LEGAL_CORPUS_RELEASE_THRESHOLDS.maximumProviderCostUsd);
}

export async function recordSearchReleaseGovernance(
  dependencies: { db: D1Database },
  untrustedEvidence: z.input<typeof evidenceSchema>,
): Promise<{ passed: boolean; failures: string[] }> {
  const evidence = evidenceSchema.parse(untrustedEvidence);
  const failures: string[] = [];
  const release = await dependencies.db.prepare(`SELECT environment,capability,item_count AS itemCount,
      status,configuration_identity AS configurationIdentity
    FROM legal_search_releases WHERE id=?`).bind(evidence.releaseId).first<{
      environment: string;
      capability: string;
      itemCount: number;
      status: string;
      configurationIdentity: string;
    }>();
  if (!release || release.status !== "draft" || release.environment !== evidence.environment
    || release.capability !== evidence.capability) failures.push("RELEASE_IDENTITY_MISMATCH");
  if (release?.configurationIdentity !== evidence.configuration.identity) {
    failures.push("CONFIGURATION_IDENTITY_MISMATCH");
  }
  const reconciliation = await dependencies.db.prepare(`SELECT environment,release_id AS releaseId,
      capability,status FROM legal_migration_reconciliation_reports WHERE run_id=?`)
    .bind(evidence.reconciliationRunId).first<{
      environment: string;
      releaseId: string;
      capability: string;
      status: string;
    }>();
  if (!reconciliation || reconciliation.status !== "clean"
    || reconciliation.environment !== evidence.environment
    || reconciliation.releaseId !== evidence.releaseId
    || reconciliation.capability !== evidence.capability) failures.push("RECONCILIATION_NOT_CLEAN");

  if (JSON.stringify(evidence.configuration.metadataSchema)
      !== JSON.stringify(AI_SEARCH_METADATA_SCHEMA)
    || !evidence.configuration.fifthMetadataFieldReserved) failures.push("METADATA_SCHEMA_DRIFT");
  if (evidence.configuration.embeddingModel !== "openai/text-embedding-3-large"
    || evidence.configuration.dimensions !== 1_536
    || !["porter", "trigram"].includes(evidence.configuration.keywordTokenizer)) {
    failures.push("PROVIDER_CONFIGURATION_DRIFT");
  }
  for (const [key, value] of Object.entries({
    gatewayPayloadLogging: evidence.configuration.gatewayPayloadLogging,
    gatewayCaching: evidence.configuration.gatewayCaching,
    similarityCaching: evidence.configuration.similarityCaching,
    queryRewriting: evidence.configuration.queryRewriting,
    providerReranking: evidence.configuration.providerReranking,
    providerGeneration: evidence.configuration.providerGeneration,
    contextExpansion: evidence.configuration.contextExpansion,
  })) if (value) failures.push(`CONFIGURATION_MUST_BE_DISABLED:${key}`);
  if (!evidence.privacy.deterministicTransformAttested
    || !evidence.privacy.contentFreeTelemetryAttested) failures.push("PRIVACY_ATTESTATION_FAILED");
  if (evidence.environment === "production" && (!evidence.privacy.productionDisclosureAccepted
    || !evidence.privacy.productionEmbeddingDataControlsApproved)) {
    failures.push("PRODUCTION_PRIVACY_APPROVAL_MISSING");
  }
  if (evidence.environment === "staging" && !evidence.privacy.stagingQueriesSyntheticOrNonPersonal) {
    failures.push("STAGING_QUERY_PRIVACY_FAILED");
  }
  if (evidence.sync.state !== "complete" || !evidence.sync.scheduledIndexingPaused
    || evidence.sync.partialErrors !== 0) failures.push("PROVIDER_SYNC_INCOMPLETE");
  const shardIds = new Set(evidence.shards.map((shard) => shard.id));
  const providerInstanceIds = new Set(evidence.shards.map((shard) => shard.providerInstanceId));
  if (shardIds.size !== evidence.shards.length || evidence.shards.some((shard) => shard.syncState !== "complete")
    || evidence.shards.reduce((total, shard) => total + shard.itemCount, 0) !== Number(release?.itemCount ?? -1)) {
    failures.push("SHARD_INVENTORY_MISMATCH");
  }
  if (providerInstanceIds.size !== evidence.shards.length
    || evidence.shards.some((shard) =>
      shard.providerNamespaceIdentity !== evidence.configuration.providerNamespaceIdentity
      || !shard.scheduledIndexingPaused)) {
    failures.push("PROVIDER_INSTANCE_IDENTITY_MISMATCH");
  }
  if (evidence.providerItems) {
    try {
      await assertSearchReleaseMetadataParity(
        dependencies,
        evidence.releaseId,
        evidence.providerItems,
      );
    } catch {
      failures.push("ITEM_METADATA_PARITY_FAILED");
    }
  } else {
    const qualificationIds = evidence.candidateQualificationIds ?? [];
    const uniqueQualificationIds = new Set(qualificationIds);
    if (uniqueQualificationIds.size !== qualificationIds.length
      || qualificationIds.length !== evidence.shards.length) {
      failures.push("CANDIDATE_QUALIFICATION_INVENTORY_MISMATCH");
    }
    const qualificationByInstance = new Map<string, {
      searchReleaseId: string;
      environment: string;
      capability: string;
      reconciliationRunId: string;
      providerNamespace: string;
      providerInstanceId: string;
      shardId: string;
      syncJobId: string;
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
    }>();
    for (const qualificationId of uniqueQualificationIds) {
      const qualification = await dependencies.db.prepare(`SELECT
          search_release_id AS searchReleaseId,environment,capability,
          reconciliation_run_id AS reconciliationRunId,
          provider_namespace AS providerNamespace,
          provider_instance_id AS providerInstanceId,shard_id AS shardId,
          sync_job_id AS syncJobId,configuration_json AS configurationJson,
          configuration_sha256 AS configurationSha256,
          provider_item_count AS providerItemCount,
          provider_chunk_count AS providerChunkCount,
          provider_inventory_sha256 AS providerInventorySha256,
          provider_reconciliation_json AS providerReconciliationJson,
          provider_reconciliation_sha256 AS providerReconciliationSha256,
          source_prefix AS sourcePrefix,
          scheduled_indexing_paused AS scheduledIndexingPaused,
          status,recorded_at AS recordedAt
        FROM legal_search_candidate_qualifications WHERE id=? LIMIT 1`)
        .bind(qualificationId).first<{
          searchReleaseId: string;
          environment: string;
          capability: string;
          reconciliationRunId: string;
          providerNamespace: string;
          providerInstanceId: string;
          shardId: string;
          syncJobId: string;
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
        }>();
      if (!qualification || qualificationByInstance.has(qualification.providerInstanceId)) {
        failures.push("CANDIDATE_QUALIFICATION_INVENTORY_MISMATCH");
        continue;
      }
      qualificationByInstance.set(qualification.providerInstanceId, qualification);
    }
    for (const shard of evidence.shards) {
      const qualification = qualificationByInstance.get(shard.providerInstanceId);
      let parsedConfiguration: z.infer<typeof governedAiSearchConfigurationSchema> | null = null;
      let parsedReconciliation: z.infer<typeof candidateReconciliationSchema> | null = null;
      try {
        parsedConfiguration = qualification
          ? governedAiSearchConfigurationSchema.parse(
            JSON.parse(qualification.configurationJson) as unknown,
          )
          : null;
        parsedReconciliation = qualification
          ? candidateReconciliationSchema.parse(
            JSON.parse(qualification.providerReconciliationJson) as unknown,
          )
          : null;
      } catch {
        // The aggregate failure below deliberately remains content-free.
      }
      const configurationHash = qualification
        ? await sha256Hex(qualification.configurationJson)
        : null;
      const reconciliationHash = qualification
        ? await sha256Hex(qualification.providerReconciliationJson)
        : null;
      if (!qualification
        || qualification.searchReleaseId !== evidence.releaseId
        || qualification.environment !== evidence.environment
        || qualification.capability !== evidence.capability
        || qualification.reconciliationRunId !== evidence.reconciliationRunId
        || qualification.providerNamespace !== shard.providerNamespaceIdentity
        || qualification.shardId !== shard.id
        || qualification.syncJobId !== shard.syncJobId
        || Number(qualification.providerItemCount) !== shard.itemCount
        || Number(qualification.providerChunkCount) < Number(qualification.providerItemCount)
        || qualification.providerInventorySha256 !== shard.inventorySha256
        || reconciliationHash !== qualification.providerReconciliationSha256
        || !parsedReconciliation
        || parsedReconciliation.instanceId !== qualification.providerInstanceId
        || parsedReconciliation.providerItems !== Number(qualification.providerItemCount)
        || parsedReconciliation.uniqueItems !== Number(qualification.providerItemCount)
        || parsedReconciliation.chunks !== Number(qualification.providerChunkCount)
        || parsedReconciliation.verifiedInventorySha256 !== qualification.providerInventorySha256
        || Object.keys(parsedReconciliation.mismatches).length !== 0
        || qualification.sourcePrefix !== evidence.configuration.sourcePrefix
        || Number(qualification.scheduledIndexingPaused) !== 1
        || qualification.status !== "qualified"
        || Date.parse(qualification.recordedAt) > Date.parse(evidence.recordedAt)
        || configurationHash !== qualification.configurationSha256
        || !parsedConfiguration
        || JSON.stringify(parsedConfiguration) !== JSON.stringify(evidence.configuration)) {
        failures.push("CANDIDATE_QUALIFICATION_REJECTED");
      }
    }
    if (qualificationByInstance.size !== evidence.shards.length) {
      failures.push("CANDIDATE_QUALIFICATION_INVENTORY_MISMATCH");
    }
  }
  const measuredCost = evidence.cost.measuredEmbeddingTokens
    * evidence.cost.acceptedUsdPerMillionTokens / 1_000_000 * 1.25;
  if (Math.abs(measuredCost - evidence.cost.authorizedCostUsd) > 1e-9) {
    failures.push("AUTHORIZED_COST_MISMATCH");
  }
  maximum(failures, "MIGRATION_COST_CAP_EXCEEDED", evidence.cost.authorizedCostUsd,
    evidence.cost.migrationBudgetKind === "current" ? 50 : 450);
  maximum(failures, "MONTHLY_QUERY_COST_CAP_EXCEEDED",
    evidence.cost.monthlyProductionQueryCostUsd, 25);
  if (evidence.cost.unpricedRequests !== 0) failures.push("UNPRICED_PROVIDER_REQUESTS");
  const integrityLabels: Record<keyof typeof evidence.integrity, string> = {
    missingItems: "INTEGRITY_MISSING_ITEM",
    extraItems: "INTEGRITY_EXTRA_ITEM",
    hashMismatches: "INTEGRITY_HASH_MISMATCH",
    metadataMismatches: "INTEGRITY_METADATA_MISMATCH",
    unknownKeys: "INTEGRITY_UNKNOWN_KEY",
    wrongReleaseKeys: "INTEGRITY_WRONG_RELEASE_KEY",
    partialResponses: "INTEGRITY_PARTIAL_RESPONSE",
    configurationErrors: "INTEGRITY_CONFIGURATION_ERROR",
    privacyErrors: "INTEGRITY_PRIVACY_ERROR",
  };
  for (const [key, label] of Object.entries(integrityLabels) as Array<[
    keyof typeof evidence.integrity,
    string,
  ]>) if (evidence.integrity[key] !== 0) failures.push(label);

  const observedStrata = new Set<string>();
  const observedScenarios = new Set<string>();
  for (const row of evidence.evaluation.strata) {
    if (observedStrata.has(row.stratum)) failures.push(`EVALUATION_STRATUM_DUPLICATE:${row.stratum}`);
    observedStrata.add(row.stratum);
    const uniqueScenarioIds = new Set(row.scenarioIds);
    if (uniqueScenarioIds.size !== row.scenarioIds.length) {
      failures.push(`EVALUATION_SCENARIO_DUPLICATE:${row.stratum}`);
    }
    if (uniqueScenarioIds.size !== row.scenarioCount) {
      failures.push(`EVALUATION_SCENARIO_COUNT_MISMATCH:${row.stratum}`);
    }
    const registeredScenarioIds = LEGAL_RELEASE_EVALUATION_REGISTRY[row.stratum];
    if (JSON.stringify([...uniqueScenarioIds].sort())
      !== JSON.stringify([...registeredScenarioIds].sort())) {
      failures.push(`EVALUATION_SCENARIO_REGISTRY_MISMATCH:${row.stratum}`);
    }
    for (const scenarioId of uniqueScenarioIds) observedScenarios.add(scenarioId);
    evaluateMetrics(failures, `STRATUM:${row.stratum}`, row);
  }
  for (const required of REQUIRED_RELEASE_EVALUATION_STRATA) {
    if (!observedStrata.has(required)) failures.push(`EVALUATION_STRATUM_MISSING:${required}`);
  }
  const registeredScenarios = new Set(legalEvaluationCorpus.map((scenario) => scenario.id));
  if (observedScenarios.size !== evidence.evaluation.scenarioCount
    || observedScenarios.size !== registeredScenarios.size
    || [...observedScenarios].some((scenarioId) => !registeredScenarios.has(scenarioId))) {
    failures.push("EVALUATION_SCENARIO_INVENTORY_MISMATCH");
  }
  maximum(failures, "EVALUATION_PROVIDER_COST_EXCEEDED",
    evidence.evaluation.providerCostUsd,
    LEGAL_CORPUS_RELEASE_THRESHOLDS.maximumProviderCostUsd);
  const recordedAt = Date.parse(evidence.recordedAt);
  for (const [name, value] of Object.entries({
    officialChangeValidatedAt: evidence.operations.officialChangeValidatedAt,
    currentSnapshotReadyAt: evidence.operations.currentSnapshotReadyAt,
    emergencyRequestedAt: evidence.operations.emergencyRequestedAt,
    emergencyReadyAt: evidence.operations.emergencyReadyAt,
    historyLastReconciledAt: evidence.operations.historyLastReconciledAt,
  })) {
    if (value !== null && Date.parse(value) > recordedAt) {
      failures.push(`OPERATION_TIMESTAMP_AFTER_RECORDING:${name}`);
    }
  }
  const currentFreshness = Date.parse(evidence.operations.currentSnapshotReadyAt)
    - Date.parse(evidence.operations.officialChangeValidatedAt);
  if (!Number.isFinite(currentFreshness) || currentFreshness < 0
    || currentFreshness > 24 * 60 * 60_000) {
    failures.push("CURRENT_FRESHNESS_SLO_FAILED");
  }
  if ((evidence.operations.emergencyRequestedAt === null)
    !== (evidence.operations.emergencyReadyAt === null)) failures.push("EMERGENCY_EVIDENCE_INCOMPLETE");
  if (evidence.operations.emergencyRequestedAt && evidence.operations.emergencyReadyAt) {
    const emergencyFreshness = Date.parse(evidence.operations.emergencyReadyAt)
      - Date.parse(evidence.operations.emergencyRequestedAt);
    if (!Number.isFinite(emergencyFreshness) || emergencyFreshness < 0
      || emergencyFreshness > 4 * 60 * 60_000) {
      failures.push("EMERGENCY_FRESHNESS_SLO_FAILED");
    }
  }
  const historyAge = Date.parse(evidence.recordedAt)
    - Date.parse(evidence.operations.historyLastReconciledAt);
  if (!Number.isFinite(historyAge) || historyAge < 0
    || historyAge > 7 * 24 * 60 * 60_000) failures.push("HISTORY_RECONCILIATION_STALE");
  if (!evidence.operations.rollbackHealthy) failures.push("ROLLBACK_UNHEALTHY");
  const uniqueFailures = [...new Set(failures)].sort();
  const verdict = { passed: uniqueFailures.length === 0, failures: uniqueFailures };
  const evidenceJson = JSON.stringify(evidence);
  await dependencies.db.batch([
    dependencies.db.prepare(`INSERT INTO legal_search_release_governance
      (id,search_release_id,environment,capability,reconciliation_run_id,status,failures_json,
        evidence_json,recorded_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(
      evidence.id,
      evidence.releaseId,
      evidence.environment,
      evidence.capability,
      evidence.reconciliationRunId,
      verdict.passed ? "passed" : "failed",
      JSON.stringify(uniqueFailures),
      evidenceJson,
      evidence.recordedAt,
    ),
    ...evidence.shards.map((shard) => dependencies.db.prepare(`INSERT INTO legal_search_release_shards
      (governance_id,search_release_id,shard_id,item_count,inventory_sha256,sync_state)
      VALUES (?,?,?,?,?,?)`).bind(
      evidence.id,
      evidence.releaseId,
      shard.id,
      shard.itemCount,
      shard.inventorySha256,
      shard.syncState,
    )),
    ...evidence.shards.map((shard) => dependencies.db.prepare(`INSERT INTO legal_search_release_provider_instances
      (governance_id,search_release_id,shard_id,provider_namespace,provider_instance_id,
        sync_job_id,scheduled_indexing_paused) VALUES (?,?,?,?,?,?,?)`).bind(
      evidence.id,
      evidence.releaseId,
      shard.id,
      shard.providerNamespaceIdentity,
      shard.providerInstanceId,
      shard.syncJobId,
      shard.scheduledIndexingPaused ? 1 : 0,
    )),
    ...evidence.evaluation.strata.map((row) => dependencies.db.prepare(`INSERT INTO legal_search_release_evaluation_strata
      (governance_id,search_release_id,stratum,scenario_count,metrics_json) VALUES (?,?,?,?,?)`).bind(
      evidence.id,
      evidence.releaseId,
      row.stratum,
      row.scenarioCount,
      JSON.stringify(row),
    )),
  ]);
  return verdict;
}

export async function assertSearchReleaseGovernanceReady(
  db: D1Database,
  releaseId: string,
  asOf?: string,
): Promise<{ governanceId: string; reconciliationRunId: string; boundedVerification: boolean;
  observedThrough: string }> {
  const row = await db.prepare(`SELECT id,reconciliation_run_id AS reconciliationRunId,
      status,failures_json AS failures,recorded_at AS recordedAt,evidence_json AS evidenceJson
    FROM legal_search_release_governance WHERE search_release_id=?
    ORDER BY recorded_at DESC LIMIT 1`).bind(identifier.parse(releaseId))
    .first<{ id: string; reconciliationRunId: string; status: string; failures: string;
      recordedAt: string; evidenceJson: string }>();
  if (!row || row.status !== "passed" || row.failures !== "[]") {
    throw new Error("SEARCH_RELEASE_GOVERNANCE_REJECTED");
  }
  const custom = customReleaseGovernanceSchema.safeParse(JSON.parse(row.evidenceJson) as unknown);
  const boundedVerification = custom.success && custom.data.releaseId === releaseId
    && custom.data.reconciliationRunId === row.reconciliationRunId;
  if (asOf) {
    const age = Date.parse(instant.parse(asOf)) - Date.parse(row.recordedAt);
    if (!Number.isFinite(age) || age < 0 || (!boundedVerification && age > 24 * 60 * 60_000)) {
      throw new Error("SEARCH_RELEASE_GOVERNANCE_STALE");
    }
  }
  return { governanceId: row.id, reconciliationRunId: row.reconciliationRunId, boundedVerification,
    observedThrough: custom.success ? custom.data.smoke.completedAt : row.recordedAt };
}

const observationSchema = z.object({
  id: identifier,
  releaseId: identifier,
  environment: z.enum(["staging", "production"]),
  phase: z.enum(["staging_soak", "production_canary", "retirement_stability"]),
  observedAt: instant,
  requestCount: z.number().int().nonnegative(),
  green: z.boolean(),
  gateBreachCount: z.number().int().nonnegative(),
}).strict();

export async function recordReleaseObservation(
  dependencies: { db: D1Database },
  untrustedInput: z.input<typeof observationSchema>,
): Promise<void> {
  const input = observationSchema.parse(untrustedInput);
  await dependencies.db.prepare(`INSERT INTO legal_release_observations
    (id,release_id,environment,phase,observed_at,request_count,green,gate_breach_count)
    VALUES (?,?,?,?,?,?,?,?)`).bind(
    input.id,
    input.releaseId,
    input.environment,
    input.phase,
    input.observedAt,
    input.requestCount,
    input.green ? 1 : 0,
    input.gateBreachCount,
  ).run();
}

const windowSchema = z.object({
  releaseId: identifier,
  environment: z.enum(["staging", "production"]),
  phase: observationSchema.shape.phase,
  asOf: instant,
}).strict();

export async function evaluatePersistedObservationWindow(
  dependencies: { db: D1Database },
  untrustedInput: z.input<typeof windowSchema>,
) {
  const input = windowSchema.parse(untrustedInput);
  // Retain phase names as immutable operational history. The accepted verification
  // policy uses the latest observed outcome, without calendar or request quotas.
  const row = await dependencies.db.prepare(`SELECT observed_at AS observedAt,
      request_count AS requestCount,green,gate_breach_count AS gateBreachCount
    FROM legal_release_observations
    WHERE release_id=? AND environment=? AND phase=? AND observed_at<=?
    ORDER BY observed_at DESC LIMIT 1`).bind(
    input.releaseId,
    input.environment,
    input.phase,
    input.asOf,
  ).first<{ observedAt: string; requestCount: number; green: number; gateBreachCount: number }>();
  const eligible = row !== null && Number(row.green) === 1 && Number(row.gateBreachCount) === 0;
  return {
    eligible,
    requiredDays: 0,
    requiredRequests: 0,
    requestCount: Number(row?.requestCount ?? 0),
    continuous: eligible,
    windowStartedAt: row?.observedAt ?? null,
    lastObservedAt: row?.observedAt ?? null,
    earliestEligibilityTime: eligible ? row.observedAt : null,
  };
}
