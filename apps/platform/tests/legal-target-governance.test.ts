import assert from "node:assert/strict";
import test from "node:test";

import { legalEvaluationCorpus } from "../evaluation/legal-evaluation-corpus";
import {
  LEGAL_RELEASE_EVALUATION_REGISTRY,
  REQUIRED_RELEASE_EVALUATION_STRATA,
  evaluatePersistedObservationWindow,
  recordReleaseObservation,
  recordSearchReleaseGovernance,
} from "../lib/legal-corpus/target-governance";
import { createReleaseLifecycle } from "../lib/legal-corpus/target-release";
import {
  importCurrentRepresentativeProvision,
  MemoryEvidenceBucket,
  representativeProvision,
} from "./helpers/legal-target";
import { sqliteD1FixtureFromDirectory } from "./helpers/sqlite-d1";

const metrics = {
  recallAt5: 0.90,
  recallAt10: 0.95,
  mrr: 0.85,
  citationPrecision: 1,
  citationRecall: 0.95,
  articleExactness: 0.95,
  documentExactness: 0.97,
  abstentionCorrectness: 0.95,
  partialAnswerCorrectness: 0.90,
  groundedness: 0.95,
  staleInvalidLinkCount: 0,
  sourceUnavailabilityRate: 0.02,
  indexedP95Ms: 5_000,
  answerP95Ms: 30_000,
  providerCostUsd: 30,
};

function governanceEvidence(releaseId: string, reportId: string, item: {
  itemKey: string;
  language: "ru";
  documentType: string;
  validFrom: string;
}) {
  return {
    id: `governance-${releaseId}`,
    releaseId,
    environment: "development" as const,
    capability: "current" as const,
    reconciliationRunId: reportId,
    recordedAt: "2026-08-30T03:00:00.000Z",
    configuration: {
      identity: "ai-search-governed-v1",
      metadataSchema: ["language", "document_type", "valid_from", "valid_to"],
      fifthMetadataFieldReserved: true,
      embeddingModel: "openai/text-embedding-3-large",
      dimensions: 1_536,
      keywordTokenizer: "porter" as const,
      gatewayIdentity: "juro-ai-search-development",
      providerProjectIdentity: "juro-openai-development",
      providerNamespaceIdentity: "juro-legal-development",
      sourcePrefix: `search-releases/${releaseId}/current/`,
      serviceBindingIdentity: "LEGAL_CORPUS_SERVICE",
      gatewayPayloadLogging: false,
      gatewayCaching: false,
      similarityCaching: false,
      queryRewriting: false,
      providerReranking: false,
      providerGeneration: false,
      contextExpansion: false,
    },
    privacy: {
      deterministicTransformAttested: true,
      contentFreeTelemetryAttested: true,
      productionDisclosureAccepted: false,
      productionEmbeddingDataControlsApproved: false,
      stagingQueriesSyntheticOrNonPersonal: true,
    },
    sync: { state: "complete" as const, scheduledIndexingPaused: true, partialErrors: 0 },
    shards: [{ id: "00", itemCount: 1, inventorySha256: "8".repeat(64), syncState: "complete" as const }],
    providerItems: [{
      itemKey: item.itemKey,
      language: item.language,
      documentType: item.documentType,
      validFrom: item.validFrom,
      validTo: null,
    }],
    cost: {
      measuredEmbeddingTokens: 1_000_000,
      acceptedUsdPerMillionTokens: 0.13,
      authorizedCostUsd: 0.1625,
      migrationBudgetKind: "current" as const,
      monthlyProductionQueryCostUsd: 24.99,
      unpricedRequests: 0,
    },
    integrity: {
      missingItems: 0,
      extraItems: 0,
      hashMismatches: 0,
      metadataMismatches: 0,
      unknownKeys: 0,
      wrongReleaseKeys: 0,
      partialResponses: 0,
      configurationErrors: 0,
      privacyErrors: 0,
    },
    evaluation: {
      registryVersion: "legal-evaluation-corpus-v3" as const,
      scenarioCount: 314 as const,
      providerCostUsd: 30,
      strata: REQUIRED_RELEASE_EVALUATION_STRATA.map((stratum) => ({
        stratum,
        scenarioIds: [...LEGAL_RELEASE_EVALUATION_REGISTRY[stratum]],
        scenarioCount: LEGAL_RELEASE_EVALUATION_REGISTRY[stratum].length,
        ...metrics,
      })),
    },
    operations: {
      officialChangeValidatedAt: "2026-08-30T01:00:00.000Z",
      currentSnapshotReadyAt: "2026-08-30T03:00:00.000Z",
      emergencyRequestedAt: "2026-08-30T01:00:00.000Z",
      emergencyReadyAt: "2026-08-30T03:00:00.000Z",
      historyLastReconciledAt: "2026-08-29T03:00:00.000Z",
      rollbackHealthy: true,
    },
  };
}

async function governedDraft() {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(new URL("../legal-drizzle/", import.meta.url));
  const bucket = new MemoryEvidenceBucket();
  const imported = await importCurrentRepresentativeProvision({ db: d1, bucket });
  const lifecycle = createReleaseLifecycle({ db: d1 });
  const snapshot = await lifecycle.freezeCorpusSnapshot({
    id: "snapshot-governance-v1",
    environment: "development",
    provisionRenditionIds: [representativeProvision.provisionRenditionId],
    createdAt: "2026-08-30T02:00:00.000Z",
  });
  const releaseId = "release-governance-v1";
  const canonicalChunkId = `chunk:${representativeProvision.provisionRenditionId}:0`;
  const itemKey = `search-releases/${releaseId}/current/00/${canonicalChunkId}.md`;
  const item = {
    provisionRenditionId: representativeProvision.provisionRenditionId,
    canonicalChunkId,
    itemKey,
    r2Key: itemKey,
    byteCount: imported.provisionLocator.byteCount,
    sha256: imported.provisionLocator.sha256,
    language: "ru" as const,
    documentType: representativeProvision.documentType,
    validFrom: "2026-01-01T00:00:00.000Z",
    validTo: null,
  };
  await lifecycle.createSearchReleaseDraft({
    id: releaseId,
    environment: "development",
    capability: "current",
    corpusSnapshotId: snapshot.id,
    items: [item],
    retrievalPolicyVersion: "governed-v1",
    configurationIdentity: "ai-search-governed-v1",
    createdAt: "2026-08-30T02:30:00.000Z",
  });
  const reportId = "reconciliation-governance-v1";
  const reportJson = JSON.stringify({
    status: "clean",
    environment: "development",
    releaseId,
    capability: "current",
    expected: {
      releaseItems: [{
        chunkId: item.canonicalChunkId,
        provisionRenditionId: item.provisionRenditionId,
        itemKey: item.itemKey,
        r2Key: item.r2Key,
        byteCount: item.byteCount,
        sha256: item.sha256,
      }],
    },
  });
  sqlite.prepare(`INSERT INTO legal_migration_reconciliation_reports
    (run_id,environment,release_id,capability,input_sha256,report_sha256,status,report_json,created_at)
    VALUES (?,'development',?,'current',?,?,'clean',?,'2026-08-30T02:45:00.000Z')`).run(
    reportId, releaseId, "6".repeat(64), "7".repeat(64), reportJson,
  );
  return { sqlite, d1, lifecycle, snapshot, releaseId, reportId, item };
}

test("release strata are derived from authenticated scenario language, tags, and capabilities", () => {
  const scenarioById = new Map(legalEvaluationCorpus.map((scenario) => [scenario.id, scenario]));
  for (const [stratum, language] of [
    ["russian", "ru"],
    ["uzbek_latin", "uz-Latn"],
    ["uzbek_cyrillic", "uz-Cyrl"],
    ["english", "en"],
  ] as const) {
    const ids = LEGAL_RELEASE_EVALUATION_REGISTRY[stratum];
    assert.equal(ids.length > 0, true, stratum);
    assert.equal(ids.every((id) => scenarioById.get(id)?.queryLanguage === language), true, stratum);
  }
  assert.equal(LEGAL_RELEASE_EVALUATION_REGISTRY.cross_language.every((id) =>
    scenarioById.get(id)?.releaseGateCapabilities.includes("cross_language")), true);
  assert.equal(LEGAL_RELEASE_EVALUATION_REGISTRY.exact_citation.every((id) =>
    scenarioById.get(id)?.releaseGateCapabilities.includes("exact_citation")), true);
  assert.equal(LEGAL_RELEASE_EVALUATION_REGISTRY.exact_citation.length > 0, true);
  assert.equal(new Set(Object.values(LEGAL_RELEASE_EVALUATION_REGISTRY).flat()).size,
    legalEvaluationCorpus.length);
});

test("a complete governed manifest seals while any failed numeric or zero-tolerance gate blocks", async () => {
  const fixture = await governedDraft();
  try {
    const evidence = governanceEvidence(fixture.releaseId, fixture.reportId, {
      itemKey: fixture.item.itemKey,
      language: fixture.item.language,
      documentType: fixture.item.documentType,
      validFrom: fixture.item.validFrom,
    });
    await assert.rejects(
      () => fixture.lifecycle.sealSearchRelease({
        id: fixture.releaseId,
        environment: "development",
        capability: "current",
        corpusSnapshotId: fixture.snapshot.id,
        items: [fixture.item],
        retrievalPolicyVersion: "governed-v1",
        configurationIdentity: "ai-search-governed-v1",
        createdAt: "2026-08-30T03:04:00.000Z",
      }),
      /SEARCH_RELEASE_REJECTED/u,
      "missing governance evidence must block sealing",
    );
    const verdict = await recordSearchReleaseGovernance({ db: fixture.d1 }, evidence);
    assert.deepEqual(verdict, { passed: true, failures: [] });
    const sealed = await fixture.lifecycle.sealSearchRelease({
      id: fixture.releaseId,
      environment: "development",
      capability: "current",
      corpusSnapshotId: fixture.snapshot.id,
      items: [fixture.item],
      retrievalPolicyVersion: "governed-v1",
      configurationIdentity: "ai-search-governed-v1",
      createdAt: "2026-08-30T03:05:00.000Z",
    });
    assert.equal(sealed.status, "sealed");

    const second = await governedDraft();
    try {
      const failed = governanceEvidence(second.releaseId, second.reportId, {
        itemKey: second.item.itemKey,
        language: second.item.language,
        documentType: second.item.documentType,
        validFrom: second.item.validFrom,
      });
      failed.id = "governance-release-governance-failed-v1";
      failed.releaseId = "release-governance-v1";
      failed.integrity.hashMismatches = 1;
      failed.evaluation.strata[0]!.recallAt5 = 0.899;
      failed.evaluation.strata[0]!.scenarioIds.pop();
      failed.evaluation.providerCostUsd = 30.01;
      failed.operations.currentSnapshotReadyAt = "2026-08-30T00:59:00.000Z";
      failed.operations.historyLastReconciledAt = "2026-08-31T03:00:00.000Z";
      const failedVerdict = await recordSearchReleaseGovernance({ db: second.d1 }, failed);
      assert.equal(failedVerdict.passed, false);
      assert.equal(failedVerdict.failures.includes("INTEGRITY_HASH_MISMATCH"), true);
      assert.equal(failedVerdict.failures.some((failure) => failure.includes("RECALL_AT_5")), true);
      assert.equal(failedVerdict.failures.some((failure) =>
        failure.startsWith("EVALUATION_SCENARIO_COUNT_MISMATCH:")), true);
      assert.equal(failedVerdict.failures.some((failure) =>
        failure.startsWith("EVALUATION_SCENARIO_REGISTRY_MISMATCH:")), true);
      assert.equal(failedVerdict.failures.includes("EVALUATION_PROVIDER_COST_EXCEEDED"), true);
      assert.equal(failedVerdict.failures.includes("CURRENT_FRESHNESS_SLO_FAILED"), true);
      assert.equal(failedVerdict.failures.includes("HISTORY_RECONCILIATION_STALE"), true);
      assert.equal(failedVerdict.failures.includes(
        "OPERATION_TIMESTAMP_AFTER_RECORDING:historyLastReconciledAt"), true);

      const future = governanceEvidence(second.releaseId, second.reportId, {
        itemKey: second.item.itemKey,
        language: second.item.language,
        documentType: second.item.documentType,
        validFrom: second.item.validFrom,
      });
      future.id = "governance-release-future-readiness-v1";
      future.recordedAt = "2026-08-30T03:01:00.000Z";
      future.operations.officialChangeValidatedAt = "2026-08-30T02:00:00.000Z";
      future.operations.currentSnapshotReadyAt = "2026-08-30T04:00:00.000Z";
      future.operations.emergencyRequestedAt = "2026-08-30T02:00:00.000Z";
      future.operations.emergencyReadyAt = "2026-08-30T04:00:00.000Z";
      const futureVerdict = await recordSearchReleaseGovernance({ db: second.d1 }, future);
      assert.equal(futureVerdict.passed, false);
      assert.equal(futureVerdict.failures.includes(
        "OPERATION_TIMESTAMP_AFTER_RECORDING:currentSnapshotReadyAt"), true);
      assert.equal(futureVerdict.failures.includes(
        "OPERATION_TIMESTAMP_AFTER_RECORDING:emergencyReadyAt"), true);
      await assert.rejects(
        () => second.lifecycle.sealSearchRelease({
          id: second.releaseId,
          environment: "development",
          capability: "current",
          corpusSnapshotId: second.snapshot.id,
          items: [second.item],
          retrievalPolicyVersion: "governed-v1",
          configurationIdentity: "ai-search-governed-v1",
          createdAt: "2026-08-30T03:05:00.000Z",
        }),
        /SEARCH_RELEASE_REJECTED/u,
      );
    } finally {
      second.sqlite.close();
    }

    const staleFixture = await governedDraft();
    try {
      const stale = governanceEvidence(staleFixture.releaseId, staleFixture.reportId, {
        itemKey: staleFixture.item.itemKey,
        language: staleFixture.item.language,
        documentType: staleFixture.item.documentType,
        validFrom: staleFixture.item.validFrom,
      });
      stale.recordedAt = "2026-08-28T03:00:00.000Z";
      stale.operations.officialChangeValidatedAt = "2026-08-28T01:00:00.000Z";
      stale.operations.currentSnapshotReadyAt = "2026-08-28T02:00:00.000Z";
      stale.operations.emergencyRequestedAt = "2026-08-28T01:00:00.000Z";
      stale.operations.emergencyReadyAt = "2026-08-28T02:00:00.000Z";
      stale.operations.historyLastReconciledAt = "2026-08-28T02:00:00.000Z";
      assert.equal((await recordSearchReleaseGovernance({ db: staleFixture.d1 }, stale)).passed, true);
      await assert.rejects(
        () => staleFixture.lifecycle.sealSearchRelease({
          id: staleFixture.releaseId,
          environment: "development",
          capability: "current",
          corpusSnapshotId: staleFixture.snapshot.id,
          items: [staleFixture.item],
          retrievalPolicyVersion: "governed-v1",
          configurationIdentity: "ai-search-governed-v1",
          createdAt: "2026-08-30T03:05:00.000Z",
        }),
        /SEARCH_RELEASE_REJECTED/u,
        "governance evidence older than 24 hours must block sealing",
      );
    } finally {
      staleFixture.sqlite.close();
    }
  } finally {
    fixture.sqlite.close();
  }
});

test("immutable observations calculate real staging, canary, and retirement eligibility clocks", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(new URL("../legal-drizzle/", import.meta.url));
  try {
    const start = Date.parse("2026-08-30T00:00:00.000Z");
    for (let day = 0; day <= 14; day += 1) {
      await recordReleaseObservation({ db: d1 }, {
        id: `staging-observation-${day}`,
        releaseId: "release-staging-soak",
        environment: "staging",
        phase: "staging_soak",
        observedAt: new Date(start + day * 86_400_000).toISOString(),
        requestCount: day === 0 ? 0 : 715,
        green: true,
        gateBreachCount: 0,
      });
    }
    const staging = await evaluatePersistedObservationWindow({ db: d1 }, {
      releaseId: "release-staging-soak",
      environment: "staging",
      phase: "staging_soak",
      asOf: "2026-09-13T00:00:00.000Z",
    });
    assert.equal(staging.eligible, true);
    assert.equal(staging.requestCount, 10_010);
    assert.equal(staging.earliestEligibilityTime, "2026-09-13T00:00:00.000Z");

    const canary = await evaluatePersistedObservationWindow({ db: d1 }, {
      releaseId: "release-production-canary",
      environment: "production",
      phase: "production_canary",
      asOf: "2026-08-30T00:00:00.000Z",
    });
    assert.equal(canary.eligible, false);
    assert.equal(canary.requiredDays, 30);
    assert.equal(canary.earliestEligibilityTime, null);
    const retirement = await evaluatePersistedObservationWindow({ db: d1 }, {
      releaseId: "release-complete-activation",
      environment: "production",
      phase: "retirement_stability",
      asOf: "2026-08-30T00:00:00.000Z",
    });
    assert.equal(retirement.requiredDays, 90);
    assert.equal(retirement.eligible, false);
  } finally {
    sqlite.close();
  }
});
