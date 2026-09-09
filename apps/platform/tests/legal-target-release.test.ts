import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { importProvisionRendition } from "../lib/legal-corpus/target-evidence";
import { recordProvisionTemporalEvidence } from "../lib/legal-corpus/target-temporal";
import { recordReleaseObservation } from "../lib/legal-corpus/target-governance";
import {
  compatibleReleaseCorpora,
  createReleaseLifecycle,
  createReleaseLifecycleClient,
  handleReleaseLifecycleRequest,
  resolveStagingHistoryComparisonEvaluationSet,
} from "../lib/legal-corpus/target-release";
import {
  importCurrentRepresentativeProvision,
  MemoryEvidenceBucket,
  representativeProvision,
} from "./helpers/legal-target";
import { sqliteD1FixtureFromDirectory } from "./helpers/sqlite-d1";

test("comparison corpus compatibility requires one Corpus Snapshot", () => {
  assert.equal(compatibleReleaseCorpora(
    { corpusSnapshotId: "snapshot-one" },
    { corpusSnapshotId: "snapshot-one" },
  ), true);
  assert.equal(compatibleReleaseCorpora(
    { corpusSnapshotId: "snapshot-current" },
    { corpusSnapshotId: "snapshot-history" },
  ), false);
});

function stagingEvaluationDb(overrides: {
  activation?: Record<string, unknown>;
  history?: Record<string, unknown>;
  reconciliation?: Record<string, unknown>;
  currentGovernance?: Record<string, unknown> | null;
} = {}): D1Database {
  const currentId = "release:staging:current:evaluation-v1";
  const historyId = "release:staging:history:evaluation-v1";
  const report = { releaseId: historyId, corpusSnapshotId: "snapshot:staging:evaluation-v1",
    chunkCount: 20, materializationComplete: true, sparseReductionComplete: true,
    vectorizeFullListReconciled: true, regularApiOnly: true, batchApiUsed: false };
  const activation = { id: "activation:staging:evaluation-v1", environment: "staging",
    currentReleaseId: currentId, asOfReleaseId: historyId,
    comparisonCurrentReleaseId: currentId, comparisonHistoryReleaseId: historyId,
    previousActivationSetId: "activation:staging:current-v2",
    activeActivationSetId: "activation:staging:current-v2",
    ...overrides.activation };
  const current = { id: currentId, environment: "staging", capability: "current",
    corpusSnapshotId: "snapshot:staging:evaluation-v1", status: "sealed", itemCount: 10,
    retrievalPolicyVersion: "custom-hybrid-temporal-v1",
    configurationIdentity: "custom-hybrid-staging-pair-v1", snapshotStatus: "frozen",
    chunkCount: 10, mappingCount: 10, configurationSha256: "a".repeat(64) };
  const history = { id: historyId, environment: "staging", capability: "history",
    corpusSnapshotId: "snapshot:staging:evaluation-v1", status: "draft", itemCount: 20,
    retrievalPolicyVersion: "custom-hybrid-temporal-v1",
    configurationIdentity: "custom-hybrid-staging-pair-v1", snapshotStatus: "frozen",
    chunkCount: 20, mappingCount: 20, configurationSha256: "a".repeat(64),
    ...overrides.history };
  const reconciliation = { environment: "staging", releaseId: historyId,
    capability: "history", status: "clean",
    reportSha256: createHash("sha256").update(`${JSON.stringify(report, null, 2)}\n`).digest("hex"),
    reportJson: JSON.stringify(report), ...overrides.reconciliation };
  return {
    prepare(sql: string) {
      return { bind() {
        if (sql.includes("FROM legal_activation_sets candidate")) {
          return { first: async () => activation };
        }
        if (sql.includes("FROM legal_search_releases release")) {
          return { all: async () => ({ results: [current, history] }) };
        }
        if (sql.includes("FROM legal_search_release_governance")) {
          return { first: async () => overrides.currentGovernance === undefined
            ? { id: "governance:staging:current:evaluation-v1" }
            : overrides.currentGovernance };
        }
        if (sql.includes("FROM legal_migration_reconciliation_reports")) {
          return { first: async () => reconciliation };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      } };
    },
  } as unknown as D1Database;
}

test("staging evaluation resolves one exact compatible off-side Activation Set", async () => {
  const report = { releaseId: "release:staging:history:evaluation-v1",
    corpusSnapshotId: "snapshot:staging:evaluation-v1", chunkCount: 20,
    materializationComplete: true, sparseReductionComplete: true,
    vectorizeFullListReconciled: true, regularApiOnly: true, batchApiUsed: false };
  const input = { activationSetId: "activation:staging:evaluation-v1",
    historyReconciliationRunId: "history-evaluation:staging:custom-v1",
    historyReportSha256: createHash("sha256").update(`${JSON.stringify(report, null, 2)}\n`).digest("hex") };
  const selected = await resolveStagingHistoryComparisonEvaluationSet(
    stagingEvaluationDb(), input,
  );
  assert.equal(selected.current.status, "sealed");
  assert.equal(selected.history.status, "draft");
  assert.equal(selected.current.id, "release:staging:current:evaluation-v1");
  await assert.rejects(() => resolveStagingHistoryComparisonEvaluationSet(
    stagingEvaluationDb({ activation: { activeActivationSetId: input.activationSetId } }), input,
  ), /ACTIVATION_REJECTED/u);
  await assert.rejects(() => resolveStagingHistoryComparisonEvaluationSet(
    stagingEvaluationDb({ activation: { activeActivationSetId: null } }), input,
  ), /ACTIVATION_REJECTED/u);
  await assert.rejects(() => resolveStagingHistoryComparisonEvaluationSet(
    stagingEvaluationDb({ history: { corpusSnapshotId: "snapshot:staging:other-v1" } }), input,
  ), /ACTIVATION_REJECTED/u);
  await assert.rejects(() => resolveStagingHistoryComparisonEvaluationSet(
    stagingEvaluationDb({ reconciliation: { reportSha256: "c".repeat(64) } }), input,
  ), /ACTIVATION_REJECTED/u);
  await assert.rejects(() => resolveStagingHistoryComparisonEvaluationSet(
    stagingEvaluationDb({ reconciliation: { reportJson: JSON.stringify({ ...report, chunkCount: 19 }) } }),
    input,
  ), /ACTIVATION_REJECTED/u);
  await assert.rejects(() => resolveStagingHistoryComparisonEvaluationSet(
    stagingEvaluationDb({ currentGovernance: null }), input,
  ), /ACTIVATION_REJECTED/u);
});

function governedItem(
  imported: Awaited<ReturnType<typeof importProvisionRendition>>,
  releaseId: string,
  capability: "current" | "history" = "current",
) {
  const canonicalChunkId = `chunk:${representativeProvision.provisionRenditionId}:0`;
  const itemKey = `search-releases/${releaseId}/${capability}/00/${canonicalChunkId}.md`;
  return {
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
}

function recordPassedGovernance(sqlite: import("node:sqlite").DatabaseSync, input: {
  releaseId: string;
  reportId: string;
  environment?: "development" | "production";
  capability?: "current" | "history";
  recordedAt?: string;
}) {
  const environment = input.environment ?? "development";
  const capability = input.capability ?? "current";
  const recordedAt = input.recordedAt ?? "2026-08-30T00:00:00.000Z";
  const releaseItems = sqlite.prepare(`SELECT canonical_chunk_id AS chunkId,
      provision_rendition_id AS provisionRenditionId,item_key AS itemKey,
      r2_key AS r2Key,byte_count AS byteCount,sha256
    FROM legal_search_release_items WHERE search_release_id=? ORDER BY canonical_chunk_id`)
    .all(input.releaseId);
  const reportJson = JSON.stringify({
    status: "clean",
    environment,
    releaseId: input.releaseId,
    capability,
    expected: { releaseItems },
  });
  const reportSha256 = createHash("sha256").update(`${input.reportId}\n${reportJson}`).digest("hex");
  sqlite.prepare(`INSERT OR IGNORE INTO legal_migration_reconciliation_reports
    (run_id,environment,release_id,capability,input_sha256,report_sha256,status,report_json,created_at)
    VALUES (?,?,?,?,?,?,'clean',?,'2026-08-30T00:00:00.000Z')`).run(
    input.reportId, environment, input.releaseId, capability, "1".repeat(64),
    reportSha256, reportJson,
  );
  sqlite.prepare(`INSERT INTO legal_search_release_governance
    (id,search_release_id,environment,capability,reconciliation_run_id,status,failures_json,
      evidence_json,recorded_at) VALUES (?,?,?,?,?,'passed','[]','{}',
        ?)`).run(
    `governance-${input.releaseId}-${recordedAt.replace(/[^0-9]/gu, "")}`,
    input.releaseId, environment, capability, input.reportId, recordedAt,
  );
}

test("one immutable current release activates and rolls back through the private lifecycle seam", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(
    new URL("../legal-drizzle/", import.meta.url),
  );
  const bucket = new MemoryEvidenceBucket();
  try {
    const imported = await importCurrentRepresentativeProvision({ db: d1, bucket });
    const lifecycle = createReleaseLifecycle({ db: d1 });
    const snapshot = await lifecycle.freezeCorpusSnapshot({
      id: "snapshot-current-tracer-v1",
      environment: "development",
      provisionRenditionIds: [representativeProvision.provisionRenditionId],
      createdAt: "2026-08-30T01:00:00.000Z",
    });
    assert.match(snapshot.corpusHash, /^[a-f0-9]{64}$/u);

    const item = governedItem(imported, "release-current-tracer-v1");
    await lifecycle.createSearchReleaseDraft({
      id: "release-current-tracer-v1",
      environment: "development",
      capability: "current",
      corpusSnapshotId: snapshot.id,
      items: [item],
      retrievalPolicyVersion: "current-tracer-v1",
      configurationIdentity: "memory-index-v1",
      createdAt: "2026-08-30T01:04:00.000Z",
    });
    recordPassedGovernance(sqlite, {
      releaseId: "release-current-tracer-v1",
      reportId: "report-current-tracer-v1",
    });

    await assert.rejects(
      () => lifecycle.sealSearchRelease({
        id: "release-current-tracer-v1",
        environment: "development",
        capability: "current",
        corpusSnapshotId: snapshot.id,
        items: [{ ...item, sha256: "0".repeat(64) }],
        retrievalPolicyVersion: "current-tracer-v1",
        configurationIdentity: "memory-index-v1",
        createdAt: "2026-08-30T01:04:30.000Z",
      }),
      /SEARCH_RELEASE_REJECTED/u,
      "sealing must bind to the exact reconciled chunk-object hash",
    );

    const decoyJson = JSON.stringify({
      status: "clean",
      environment: "development",
      releaseId: "release-current-tracer-v1",
      capability: "current",
      expected: { releaseItems: [{
        chunkId: item.canonicalChunkId,
        provisionRenditionId: item.provisionRenditionId,
        itemKey: item.itemKey,
        r2Key: item.r2Key,
        byteCount: item.byteCount,
        sha256: "0".repeat(64),
      }] },
    });
    sqlite.prepare(`INSERT INTO legal_migration_reconciliation_reports
      (run_id,environment,release_id,capability,input_sha256,report_sha256,status,report_json,created_at)
      VALUES ('report-current-decoy-v1','development','release-current-tracer-v1','current',
        ?,?,'clean',?,'2026-08-30T00:01:00.000Z')`).run(
      "2".repeat(64), createHash("sha256").update(decoyJson).digest("hex"), decoyJson,
    );

    const release = await lifecycle.sealSearchRelease({
      id: "release-current-tracer-v1",
      environment: "development",
      capability: "current",
      corpusSnapshotId: snapshot.id,
      items: [item],
      retrievalPolicyVersion: "current-tracer-v1",
      configurationIdentity: "memory-index-v1",
      createdAt: "2026-08-30T01:05:00.000Z",
    });
    assert.equal(release.status, "sealed");

    recordPassedGovernance(sqlite, {
      releaseId: "release-current-tracer-v1",
      reportId: "report-current-refreshed-v1",
      recordedAt: "2026-08-30T00:02:00.000Z",
    });
    await assert.rejects(
      () => lifecycle.activateCurrent({
        environment: "development",
        currentReleaseId: release.id,
        actor: "test-suite",
        reason: "A refreshed governance decision must not detach activation from the sealed report.",
        createdAt: "2026-08-30T01:09:00.000Z",
      }),
      /ACTIVATION_REJECTED/u,
    );
    recordPassedGovernance(sqlite, {
      releaseId: "release-current-tracer-v1",
      reportId: "report-current-tracer-v1",
      recordedAt: "2026-08-30T00:03:00.000Z",
    });

    const activation = await lifecycle.activateCurrent({
      environment: "development",
      currentReleaseId: release.id,
      actor: "test-suite",
      reason: "Activate the verified current tracer release.",
      createdAt: "2026-08-30T01:10:00.000Z",
    });
    assert.equal(activation.currentReleaseId, release.id);
    assert.equal(activation.asOfReleaseId, null);
    assert.equal(activation.comparisonCurrentReleaseId, null);
    assert.equal(activation.comparisonHistoryReleaseId, null);

    const service = {
      fetch(input: RequestInfo | URL, init?: RequestInit) {
        return handleReleaseLifecycleRequest(new Request(input, init), {
          APP_ENV: "development",
          LEGAL_DB: d1,
        });
      },
    } as Fetcher;
    const client = createReleaseLifecycleClient({ service, environment: "development" });
    const current = await client.resolve("current");
    assert.equal(current.availability, "available");
    assert.equal(current.searchRelease?.id, release.id);
    const historical = await client.resolve("as_of");
    assert.deepEqual(historical, {
      capability: "as_of",
      availability: "unsupported",
      nextTier: "live_official_search",
    });

    const rollback = await lifecycle.rollback({
      environment: "development",
      actor: "test-suite",
      reason: "Rehearse rollback to the prior legacy retrieval set.",
      createdAt: "2026-08-30T01:15:00.000Z",
    });
    assert.equal(rollback.currentReleaseId, null);
    assert.equal((await client.resolve("current")).availability, "unsupported");

    const events = sqlite.prepare(`SELECT action,prior_activation_set_id AS priorSet
      FROM legal_activation_events ORDER BY created_at,id`).all() as Array<{
      action: string;
      priorSet: string | null;
    }>;
    assert.equal(events.length, 2);
    assert.equal(events[0]?.action, "activate");
    assert.equal(events[1]?.action, "rollback");
    assert.equal(events[1]?.priorSet, activation.id);
  } finally {
    sqlite.close();
  }
});

test("release lifecycle rejects mutable, incomplete, ineligible, and cross-environment state", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(
    new URL("../legal-drizzle/", import.meta.url),
  );
  const bucket = new MemoryEvidenceBucket();
  try {
    const imported = await importCurrentRepresentativeProvision({ db: d1, bucket });
    const lifecycle = createReleaseLifecycle({ db: d1 });
    const snapshot = await lifecycle.freezeCorpusSnapshot({
      id: "snapshot-rejection-v1",
      environment: "development",
      provisionRenditionIds: [representativeProvision.provisionRenditionId],
      createdAt: "2026-08-30T02:00:00.000Z",
    });
    await assert.rejects(
      () => lifecycle.freezeCorpusSnapshot({
        id: snapshot.id,
        environment: "production",
        provisionRenditionIds: [representativeProvision.provisionRenditionId],
        createdAt: "2026-08-30T02:01:00.000Z",
      }),
      /CORPUS_SNAPSHOT_REJECTED/u,
    );
    await assert.rejects(
      () => lifecycle.sealSearchRelease({
        id: "release-incomplete-v1",
        environment: "development",
        capability: "current",
        corpusSnapshotId: snapshot.id,
        items: [],
        retrievalPolicyVersion: "current-tracer-v1",
        configurationIdentity: "memory-index-v1",
        createdAt: "2026-08-30T02:02:00.000Z",
      }),
    );

    const item = governedItem(imported, "release-draft-v1");
    const draft = await lifecycle.createSearchReleaseDraft({
      id: "release-draft-v1",
      environment: "development",
      capability: "current",
      corpusSnapshotId: snapshot.id,
      items: [item],
      retrievalPolicyVersion: "current-tracer-v1",
      configurationIdentity: "memory-index-v1",
      createdAt: "2026-08-30T02:03:00.000Z",
    });
    assert.equal(draft.status, "draft");
    await assert.rejects(
      () => lifecycle.activateCurrent({
        environment: "development",
        currentReleaseId: draft.id,
        actor: "test-suite",
        reason: "An unsealed release must never activate.",
        createdAt: "2026-08-30T02:04:00.000Z",
      }),
      /ACTIVATION_REJECTED/u,
    );
    const crossEnvironmentItem = governedItem(imported, "release-cross-environment-v1");
    await lifecycle.createSearchReleaseDraft({
      id: "release-cross-environment-v1",
      environment: "development",
      capability: "current",
      corpusSnapshotId: snapshot.id,
      items: [crossEnvironmentItem],
      retrievalPolicyVersion: "current-tracer-v1",
      configurationIdentity: "memory-index-v1",
      createdAt: "2026-08-30T02:04:30.000Z",
    });
    recordPassedGovernance(sqlite, {
      releaseId: "release-cross-environment-v1",
      reportId: "report-cross-environment-v1",
    });
    const sealed = await lifecycle.sealSearchRelease({
      id: "release-cross-environment-v1",
      environment: "development",
      capability: "current",
      corpusSnapshotId: snapshot.id,
      items: [crossEnvironmentItem],
      retrievalPolicyVersion: "current-tracer-v1",
      configurationIdentity: "memory-index-v1",
      createdAt: "2026-08-30T02:05:00.000Z",
    });
    await assert.rejects(
      () => lifecycle.activateCurrent({
        environment: "production",
        currentReleaseId: sealed.id,
        actor: "test-suite",
        reason: "A development release must not cross environments.",
        createdAt: "2026-08-30T02:06:00.000Z",
      }),
      /ACTIVATION_REJECTED/u,
    );

    const unknown = {
      ...representativeProvision,
      officialExpressionId: "expression-release-unknown",
      textRevisionId: "revision-release-unknown",
      provisionConceptId: "concept-release-unknown",
      publisherProvisionToken: "article-unknown",
      provisionRenditionId: "rendition-release-unknown",
      captureId: "capture-release-unknown",
      textualAuthority: "unknown" as const,
      origin: "unknown" as const,
      publicationStatus: "unknown" as const,
      controllingOnConflict: false,
      derivedFromExpressionId: null,
      authorityEvidence: null,
    };
    await importProvisionRendition({ db: d1, bucket }, unknown);
    await assert.rejects(
      () => lifecycle.freezeCorpusSnapshot({
        id: "snapshot-ineligible-v1",
        environment: "development",
        provisionRenditionIds: [unknown.provisionRenditionId],
        createdAt: "2026-08-30T02:07:00.000Z",
      }),
      /CORPUS_SNAPSHOT_REJECTED/u,
    );
  } finally {
    sqlite.close();
  }
});

test("history and comparison activate only as a governed pair from one Corpus Snapshot", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(new URL("../legal-drizzle/", import.meta.url));
  const bucket = new MemoryEvidenceBucket();
  try {
    const imported = await importCurrentRepresentativeProvision({ db: d1, bucket });
    const lifecycle = createReleaseLifecycle({ db: d1 });
    const snapshot = await lifecycle.freezeCorpusSnapshot({
      id: "snapshot-compatible-pair-v1",
      environment: "development",
      provisionRenditionIds: [representativeProvision.provisionRenditionId],
      createdAt: "2026-08-30T04:00:00.000Z",
    });
    for (const [releaseId, releaseCapability] of [
      ["release-compatible-current-v1", "current"],
      ["release-compatible-history-v1", "history"],
    ] as const) {
      const item = governedItem(imported, releaseId, releaseCapability);
      await lifecycle.createSearchReleaseDraft({
        id: releaseId,
        environment: "development",
        capability: releaseCapability,
        corpusSnapshotId: snapshot.id,
        items: [item],
        retrievalPolicyVersion: "compatible-v1",
        configurationIdentity: "memory-index-v1",
        createdAt: "2026-08-30T04:05:00.000Z",
      });
      const reportId = `report-${releaseId}`;
      recordPassedGovernance(sqlite, { releaseId, reportId, capability: releaseCapability });
      await lifecycle.sealSearchRelease({
        id: releaseId,
        environment: "development",
        capability: releaseCapability,
        corpusSnapshotId: snapshot.id,
        items: [item],
        retrievalPolicyVersion: "compatible-v1",
        configurationIdentity: "memory-index-v1",
        createdAt: "2026-08-30T04:10:00.000Z",
      });
    }
    const incompatibleHistoryId = "release-incompatible-history-v1";
    const incompatibleHistoryItem = governedItem(imported, incompatibleHistoryId, "history");
    await lifecycle.createSearchReleaseDraft({
      id: incompatibleHistoryId,
      environment: "development",
      capability: "history",
      corpusSnapshotId: snapshot.id,
      items: [incompatibleHistoryItem],
      retrievalPolicyVersion: "incompatible-v2",
      configurationIdentity: "memory-index-v2",
      createdAt: "2026-08-30T04:10:30.000Z",
    });
    recordPassedGovernance(sqlite, {
      releaseId: incompatibleHistoryId,
      reportId: `report-${incompatibleHistoryId}`,
      capability: "history",
    });
    await lifecycle.sealSearchRelease({
      id: incompatibleHistoryId,
      environment: "development",
      capability: "history",
      corpusSnapshotId: snapshot.id,
      items: [incompatibleHistoryItem],
      retrievalPolicyVersion: "incompatible-v2",
      configurationIdentity: "memory-index-v2",
      createdAt: "2026-08-30T04:11:00.000Z",
    });
    await assert.rejects(
      () => lifecycle.activateHistoryComparison({
        environment: "development",
        currentReleaseId: "release-compatible-current-v1",
        historyReleaseId: incompatibleHistoryId,
        actor: "test-suite",
        reason: "Incompatible policy and provider identities must not activate.",
        createdAt: "2026-08-30T04:11:30.000Z",
      }),
      /ACTIVATION_REJECTED/u,
    );
    const currentOnly = await lifecycle.activateCurrent({
      environment: "development",
      currentReleaseId: "release-compatible-current-v1",
      actor: "test-suite",
      reason: "Activate current capability before the history pair.",
      createdAt: "2026-08-30T04:12:00.000Z",
    });
    const activation = await lifecycle.activateHistoryComparison({
      environment: "development",
      currentReleaseId: "release-compatible-current-v1",
      historyReleaseId: "release-compatible-history-v1",
      actor: "test-suite",
      reason: "Activate the compatible current and history release pair.",
      createdAt: "2026-08-30T04:15:00.000Z",
    });
    assert.equal(activation.asOfReleaseId, "release-compatible-history-v1");
    assert.equal(activation.comparisonCurrentReleaseId, "release-compatible-current-v1");
    assert.equal(activation.comparisonHistoryReleaseId, "release-compatible-history-v1");
    const pinnedPair = await lifecycle.resolveActiveComparison("development");
    assert.equal(pinnedPair.availability, "available");
    if (pinnedPair.availability === "available") {
      assert.equal(pinnedPair.current.id, "release-compatible-current-v1");
      assert.equal(pinnedPair.history.id, "release-compatible-history-v1");
    }
    const rollback = await lifecycle.rollback({
      environment: "development",
      actor: "test-suite",
      reason: "Restore the exact prior current-only activation set.",
      createdAt: "2026-08-30T04:20:00.000Z",
    });
    assert.equal(rollback.currentReleaseId, currentOnly.currentReleaseId);
    assert.equal(rollback.asOfReleaseId, null);
    assert.equal(rollback.comparisonCurrentReleaseId, null);
    assert.equal(rollback.comparisonHistoryReleaseId, null);
  } finally {
    sqlite.close();
  }
});

test("current and history releases form complete but distinct eligible snapshot projections", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(new URL("../legal-drizzle/", import.meta.url));
  const bucket = new MemoryEvidenceBucket();
  try {
    const currentImported = await importCurrentRepresentativeProvision({ db: d1, bucket });
    const historical = {
      ...representativeProvision,
      textRevisionId: "revision-labor-code-ru-2025-01-01",
      provisionConceptId: "concept-labor-code-article-9-historical",
      publisherProvisionToken: "article-9-historical",
      provisionRenditionId: "rendition-labor-code-ru-2025-article-9",
      captureId: "lex-100-2025-01-01",
      publisherRevisionToken: "2025-01-01",
      articleNumber: "9",
      provisionSequence: 9,
      capturedAt: "2025-01-01T00:00:00.000Z",
    };
    const historicalImported = await importProvisionRendition({ db: d1, bucket }, historical);
    await recordProvisionTemporalEvidence({ db: d1 }, {
      id: "temporal-rendition-labor-code-ru-2025-article-9",
      textRevisionId: historical.textRevisionId,
      provisionRenditionId: historical.provisionRenditionId,
      editorialValidFrom: "2025-01-01T00:00:00.000Z",
      editorialValidTo: "2026-01-01T00:00:00.000Z",
      applicability: {
        validFrom: "2025-01-01T00:00:00.000Z",
        validTo: "2026-01-01T00:00:00.000Z",
        evidenceUrl: historical.sourceUrl,
        evidenceKind: "official_timeline",
      },
      recordedAt: "2026-08-30T00:00:00.000Z",
    });
    const lifecycle = createReleaseLifecycle({ db: d1 });
    const snapshot = await lifecycle.freezeCorpusSnapshot({
      id: "snapshot-distinct-projections-v1",
      environment: "development",
      provisionRenditionIds: [
        representativeProvision.provisionRenditionId,
        historical.provisionRenditionId,
      ],
      createdAt: "2026-08-30T05:00:00.000Z",
    });
    const currentItem = governedItem(currentImported, "release-distinct-current-v1");
    const historyCurrentItem = governedItem(
      currentImported,
      "release-distinct-history-v1",
      "history",
    );
    const historicalChunkId = `chunk:${historical.provisionRenditionId}:0`;
    const historicalItemKey = `search-releases/release-distinct-history-v1/history/00/${historicalChunkId}.md`;
    const historicalItem = {
      provisionRenditionId: historical.provisionRenditionId,
      canonicalChunkId: historicalChunkId,
      itemKey: historicalItemKey,
      r2Key: historicalItemKey,
      byteCount: historicalImported.provisionLocator.byteCount,
      sha256: historicalImported.provisionLocator.sha256,
      language: "ru" as const,
      documentType: historical.documentType,
      validFrom: "2025-01-01T00:00:00.000Z",
      validTo: "2026-01-01T00:00:00.000Z",
    };
    const currentDraft = await lifecycle.createSearchReleaseDraft({
      id: "release-distinct-current-v1",
      environment: "development",
      capability: "current",
      corpusSnapshotId: snapshot.id,
      items: [currentItem],
      retrievalPolicyVersion: "distinct-v1",
      configurationIdentity: "memory-index-v1",
      createdAt: "2026-08-30T05:05:00.000Z",
    });
    const historyDraft = await lifecycle.createSearchReleaseDraft({
      id: "release-distinct-history-v1",
      environment: "development",
      capability: "history",
      corpusSnapshotId: snapshot.id,
      items: [historyCurrentItem, historicalItem],
      retrievalPolicyVersion: "distinct-v1",
      configurationIdentity: "memory-index-v1",
      createdAt: "2026-08-30T05:05:00.000Z",
    });
    assert.equal(currentDraft.itemCount, 1);
    assert.equal(historyDraft.itemCount, 2);
  } finally {
    sqlite.close();
  }
});

test("production current activation requires its own recorded passing observation", async () => {
  const { sqlite, d1 } = sqliteD1FixtureFromDirectory(new URL("../legal-drizzle/", import.meta.url));
  const bucket = new MemoryEvidenceBucket();
  try {
    const imported = await importCurrentRepresentativeProvision({ db: d1, bucket });
    const lifecycle = createReleaseLifecycle({ db: d1 });
    const snapshot = await lifecycle.freezeCorpusSnapshot({
      id: "snapshot-production-canary-v1",
      environment: "production",
      provisionRenditionIds: [representativeProvision.provisionRenditionId],
      createdAt: "2026-08-30T00:00:00.000Z",
    });
    const item = governedItem(imported, "release-production-canary-v1");
    await lifecycle.createSearchReleaseDraft({
      id: "release-production-canary-v1",
      environment: "production",
      capability: "current",
      corpusSnapshotId: snapshot.id,
      items: [item],
      retrievalPolicyVersion: "production-canary-v1",
      configurationIdentity: "production-index-v1",
      createdAt: "2026-08-30T00:05:00.000Z",
    });
    recordPassedGovernance(sqlite, {
      releaseId: "release-production-canary-v1",
      reportId: "report-production-canary-v1",
      environment: "production",
    });
    await lifecycle.sealSearchRelease({
      id: "release-production-canary-v1",
      environment: "production",
      capability: "current",
      corpusSnapshotId: snapshot.id,
      items: [item],
      retrievalPolicyVersion: "production-canary-v1",
      configurationIdentity: "production-index-v1",
      createdAt: "2026-08-30T00:10:00.000Z",
    });
    await assert.rejects(
      () => lifecycle.activateCurrent({
        environment: "production",
        currentReleaseId: "release-production-canary-v1",
        actor: "test-suite",
        reason: "A production release requires an observed capability check.",
        createdAt: "2026-08-30T00:20:00.000Z",
      }),
      /ACTIVATION_REJECTED/u,
    );
    const activationTime = "2026-08-30T00:20:00.000Z";
    await recordReleaseObservation({ db: d1 }, {
      id: "production-current-observation",
      releaseId: "release-production-canary-v1",
      environment: "production",
      phase: "production_canary",
      observedAt: activationTime,
      requestCount: 4,
      green: true,
      gateBreachCount: 0,
    });
    recordPassedGovernance(sqlite, {
      releaseId: "release-production-canary-v1",
      reportId: "report-production-canary-v1",
      environment: "production",
      recordedAt: activationTime,
    });
    const activated = await lifecycle.activateCurrent({
      environment: "production",
      currentReleaseId: "release-production-canary-v1",
      actor: "test-suite",
      reason: "Activate after the recorded bounded capability check.",
      createdAt: activationTime,
    });
    assert.equal(activated.currentReleaseId, "release-production-canary-v1");
  } finally {
    sqlite.close();
  }
});
