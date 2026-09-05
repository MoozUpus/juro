import { z } from "zod";

const identity = z.string().min(1).max(300).regex(/^[A-Za-z0-9._:-]+$/u);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const instant = z.string().datetime({ offset: true });
const reference = z.object({ key: z.string().min(1).max(1024), sha256: hash }).strict();

export const customReleaseGovernanceSchema = z.object({
  policy: z.literal("legal-corpus-verification-20260905"),
  id: identity,
  releaseId: identity,
  environment: z.enum(["development", "staging", "production"]),
  capability: z.enum(["current", "history"]),
  reconciliationRunId: identity,
  recordedAt: instant,
  build: z.object({
    result: reference,
    sourceRootSha256: hash,
    sparseManifestSha256: hash,
    vectorInventorySha256: hash,
    vectorizeIndexName: identity,
    finalMutationId: identity,
    chunkCount: z.number().int().positive(),
    materializationComplete: z.boolean(),
    sparseReductionComplete: z.boolean(),
    vectorizeFullListReconciled: z.boolean(),
  }).strict(),
  configuration: z.object({
    identity,
    sha256: hash,
    gatewayIdentity: identity,
    gatewayAuthenticated: z.boolean(),
    gatewayPayloadLogging: z.boolean(),
    gatewayCaching: z.boolean(),
    model: z.literal("text-embedding-3-large"),
    dimensions: z.literal(1536),
    fusionPolicy: z.literal("equal-rrf-k60-v1"),
  }).strict(),
  privacy: z.object({
    attestationSha256: hash,
    deterministicTransformAttested: z.boolean(),
    contentFreeTelemetryAttested: z.boolean(),
    productionDisclosureAccepted: z.boolean(),
    productionEmbeddingDataControlsApproved: z.boolean(),
    stagingQueriesSyntheticOrNonPersonal: z.boolean(),
  }).strict(),
  capacity: z.object({ databaseId: z.string().uuid(), projectedBytes: z.number().int().nonnegative() }).strict(),
  cost: z.object({
    authorizedCostUsd: z.number().finite().nonnegative(),
    reservedCostUsd: z.number().finite().nonnegative(),
    migrationBudgetKind: z.enum(["current", "complete"]),
    completeMigrationCostUsd: z.number().finite().nonnegative(),
    monthlyProductionQueryCostUsd: z.number().finite().nonnegative(),
    evaluationCostUsd: z.number().finite().nonnegative(),
    unpricedRequests: z.number().int().nonnegative(),
  }).strict(),
  recovery: reference,
  rollbackHealthy: z.boolean(),
  smoke: z.object({
    result: reference,
    startedAt: instant,
    completedAt: instant,
    requestCount: z.number().int().min(1).max(20),
    checks: z.array(z.object({
      name: z.enum(["russian", "uzbek_latin", "uzbek_cyrillic", "english", "exact_citation",
        "general_question", "source_ladder_failure", "as_of", "current_history",
        "history_current", "history_history", "separate_provision_sets"]),
      passed: z.boolean(),
    }).strict()).min(1).max(20),
  }).strict(),
}).strict();

export type CustomReleaseGovernance = z.input<typeof customReleaseGovernanceSchema>;

/** Reuse sealed construction evidence; smoke observations never imply benchmark scores. */
export async function recordCustomReleaseGovernance(
  dependencies: { db: D1Database },
  untrusted: CustomReleaseGovernance,
): Promise<{ passed: boolean; failures: string[] }> {
  const input = customReleaseGovernanceSchema.parse(untrusted);
  const failures: string[] = [];
  const release = await dependencies.db.prepare(`SELECT release.environment,release.capability,
      release.status,release.item_count AS itemCount,release.configuration_identity AS configurationIdentity,
      component.source_root_sha256 AS sourceRootSha256,
      component.sparse_manifest_sha256 AS sparseManifestSha256,
      component.vectorize_inventory_sha256 AS vectorInventorySha256,
      component.vectorize_index_name AS vectorizeIndexName,
      component.vectorize_final_mutation_id AS finalMutationId,
      component.chunk_count AS chunkCount,component.configuration_sha256 AS configurationSha256,
      component.privacy_attestation_sha256 AS privacySha256
    FROM legal_search_releases release
    JOIN legal_custom_search_release_components component ON component.search_release_id=release.id
    WHERE release.id=?`).bind(input.releaseId).first<{
      environment: string; capability: string; status: string; itemCount: number;
      configurationIdentity: string; sourceRootSha256: string; sparseManifestSha256: string;
      vectorInventorySha256: string; vectorizeIndexName: string; finalMutationId: string;
      chunkCount: number; configurationSha256: string; privacySha256: string;
    }>();
  if (!release || release.environment !== input.environment || release.capability !== input.capability
    || !["draft", "sealed"].includes(release.status)
    || release.itemCount !== input.build.chunkCount || release.chunkCount !== input.build.chunkCount
    || release.configurationIdentity !== input.configuration.identity
    || release.configurationSha256 !== input.configuration.sha256
    || release.privacySha256 !== input.privacy.attestationSha256
    || release.sourceRootSha256 !== input.build.sourceRootSha256
    || release.sparseManifestSha256 !== input.build.sparseManifestSha256
    || release.vectorInventorySha256 !== input.build.vectorInventorySha256
    || release.vectorizeIndexName !== input.build.vectorizeIndexName
    || release.finalMutationId !== input.build.finalMutationId) failures.push("CUSTOM_BUILD_IDENTITY_MISMATCH");
  const report = await dependencies.db.prepare(`SELECT environment,release_id AS releaseId,capability,
      status,report_sha256 AS reportSha256 FROM legal_migration_reconciliation_reports WHERE run_id=?`)
    .bind(input.reconciliationRunId).first<{
      environment: string; releaseId: string; capability: string; status: string; reportSha256: string;
    }>();
  if (!report || report.environment !== input.environment || report.releaseId !== input.releaseId
    || report.capability !== input.capability || report.status !== "clean"
    || report.reportSha256 !== input.build.result.sha256) failures.push("CUSTOM_BUILD_RESULT_MISMATCH");
  if (!input.build.materializationComplete || !input.build.sparseReductionComplete
    || !input.build.vectorizeFullListReconciled) failures.push("CUSTOM_BUILD_INCOMPLETE");
  if (!input.configuration.gatewayAuthenticated || input.configuration.gatewayPayloadLogging
    || input.configuration.gatewayCaching) failures.push("CUSTOM_GATEWAY_PRIVACY_FAILED");
  if (!input.privacy.deterministicTransformAttested || !input.privacy.contentFreeTelemetryAttested
    || (input.environment === "production" && (!input.privacy.productionDisclosureAccepted
      || !input.privacy.productionEmbeddingDataControlsApproved))
    || (input.environment === "staging" && !input.privacy.stagingQueriesSyntheticOrNonPersonal)) {
    failures.push("CUSTOM_QUERY_PRIVACY_FAILED");
  }
  if (input.capacity.projectedBytes >= 7_000_000_000) failures.push("CUSTOM_CATALOG_CAPACITY_FAILED");
  const cap = input.cost.migrationBudgetKind === "current" ? 50 : 450;
  if (input.cost.reservedCostUsd > input.cost.authorizedCostUsd || input.cost.authorizedCostUsd > cap
    || input.cost.completeMigrationCostUsd > 450 || input.cost.monthlyProductionQueryCostUsd > 25
    || input.cost.evaluationCostUsd > 30 || input.cost.unpricedRequests !== 0) {
    failures.push("CUSTOM_COST_LIMIT_FAILED");
  }
  if (!input.rollbackHealthy) failures.push("CUSTOM_ROLLBACK_UNAVAILABLE");
  const duration = Date.parse(input.smoke.completedAt) - Date.parse(input.smoke.startedAt);
  if (duration < 0 || duration > 600_000 || Date.parse(input.recordedAt) < Date.parse(input.smoke.completedAt)) {
    failures.push("CUSTOM_SMOKE_TIME_INVALID");
  }
  const checks = new Map(input.smoke.checks.map(check => [check.name, check.passed]));
  if (checks.size !== input.smoke.checks.length || input.smoke.checks.some(check => !check.passed)) {
    failures.push("CUSTOM_SMOKE_FAILED");
  }
  const required = input.capability === "current"
    ? ["russian", "uzbek_latin", "uzbek_cyrillic", "english", "exact_citation", "general_question", "source_ladder_failure"] as const
    : ["as_of", "current_history", "history_current", "history_history", "separate_provision_sets", "source_ladder_failure"] as const;
  for (const name of required) if (checks.get(name) !== true) failures.push(`CUSTOM_SMOKE_MISSING:${name}`);
  const verdict = { passed: failures.length === 0, failures: [...new Set(failures)].sort() };
  await dependencies.db.prepare(`INSERT INTO legal_search_release_governance
    (id,search_release_id,environment,capability,reconciliation_run_id,status,failures_json,evidence_json,recorded_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).bind(input.id, input.releaseId, input.environment, input.capability,
    input.reconciliationRunId, verdict.passed ? "passed" : "failed", JSON.stringify(verdict.failures),
    JSON.stringify(input), input.recordedAt).run();
  return verdict;
}
