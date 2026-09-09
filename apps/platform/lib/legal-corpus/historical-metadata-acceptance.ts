import { z } from "zod";

import { legalEnvironmentSchema, searchReleaseIdSchema, sha256Schema, utcInstantSchema }
  from "./target-domain-schemas";

const nonnegative = z.number().int().nonnegative();
const positive = z.number().int().positive();
const artifactSchema = z.object({
  key: z.string().min(1).max(1_000),
  sha256: sha256Schema,
}).strict();
const membershipSchema = artifactSchema.extend({
  count: nonnegative,
  rootSha256: sha256Schema,
}).strict();

const controlRowSchema = z.object({
  runId: z.string().min(1).max(300),
  runStatus: z.literal("materialized"),
  completedAt: z.null(),
  sourceCutoff: utcInstantSchema,
  sourceBookmark: z.string().min(1).max(300),
  sourceInventorySha256: sha256Schema,
  sourceCanonicalSha256: sha256Schema,
  sourceAliasSha256: sha256Schema,
  planR2Key: z.string().min(1).max(1_000),
  planSha256: sha256Schema,
  reconstructionR2Key: z.string().min(1).max(1_000),
  reconstructionSha256: sha256Schema,
  expectedRecordCount: positive,
  materializedRecordCount: positive,
  snapshotR2Key: z.string().min(1).max(1_000),
  snapshotSha256: sha256Schema,
  currentCount: positive,
  currentRootSha256: sha256Schema,
  currentManifestR2Key: z.string().min(1).max(1_000),
  currentManifestSha256: sha256Schema,
  historyCount: positive,
  historyRootSha256: sha256Schema,
  historyManifestR2Key: z.string().min(1).max(1_000),
  historyManifestSha256: sha256Schema,
  gapCount: nonnegative,
  gapRootSha256: sha256Schema,
  gapManifestR2Key: z.string().min(1).max(1_000),
  gapManifestSha256: sha256Schema,
  quarantineCount: nonnegative,
  quarantineRootSha256: sha256Schema,
  quarantineManifestR2Key: z.string().min(1).max(1_000),
  quarantineManifestSha256: sha256Schema,
  unionCount: positive,
  unionRootSha256: sha256Schema,
  unionManifestR2Key: z.string().min(1).max(1_000),
  unionManifestSha256: sha256Schema,
  aliasCount: nonnegative,
  rawAliasCount: nonnegative,
  normalizedAliasCount: nonnegative,
  urlAliasCount: nonnegative,
  lineageRefCount: nonnegative,
  manifestLaneCount: positive,
  activeActivationSetId: z.string().min(1).max(300),
  activeCurrentReleaseId: searchReleaseIdSchema,
}).strict();

export const acceptedHistoricalReconstructionSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("complete-corpus-reconstruction"),
  runId: z.string().min(1).max(300),
  derivativeIndexMutations: z.literal(0),
  providerRequests: z.literal(0),
  missingObjects: z.literal(0),
  hashMismatches: z.literal(0),
  reconstructionLaneCount: positive,
  reconstructionRootSha256: sha256Schema,
  exact: z.object({
    records: positive,
    currentRecords: positive,
    historicalRecords: positive,
    gaps: nonnegative,
    overlapRecords: nonnegative,
    quarantineCount: nonnegative,
    sourceVersionCount: positive,
    distinctBodies: positive,
    physicalObjectCounts: z.object({
      dataObjects: positive,
      rawObjects: positive,
      normalizedObjects: positive,
      provisionObjects: positive,
    }).strict(),
  }).passthrough(),
}).passthrough();

export const historicalMetadataAcceptanceSchema = z.object({
  schemaVersion: z.literal("historical-metadata-acceptance-v1"),
  status: z.literal("accepted_materialized_with_owner_waiver"),
  environment: legalEnvironmentSchema,
  catalogDatabaseId: z.string().min(1).max(300),
  completeCorpus: z.object({
    runId: z.string().min(1).max(300),
    runStatus: z.literal("materialized"),
    completedAt: z.null(),
    sourceCutoff: utcInstantSchema,
    sourceBookmark: z.string().min(1).max(300),
    plan: artifactSchema,
    snapshot: artifactSchema,
    reconstruction: artifactSchema.extend({ rootSha256: sha256Schema }).strict(),
  }).strict(),
  sourceRoots: z.object({
    inventorySha256: sha256Schema,
    canonicalSha256: sha256Schema,
    aliasSha256: sha256Schema,
  }).strict(),
  memberships: z.object({
    union: membershipSchema,
    current: membershipSchema,
    history: membershipSchema,
    gaps: membershipSchema,
    quarantines: membershipSchema,
    currentHistoryOverlap: nonnegative,
  }).strict(),
  metadata: z.object({
    materializedRecords: positive,
    lineageRefs: nonnegative,
    aliases: z.object({
      total: nonnegative,
      rawCapture: nonnegative,
      normalizedRevision: nonnegative,
      versionUrl: nonnegative,
    }).strict(),
    distinctBodies: positive,
    physicalObjects: z.object({
      total: positive,
      rawCaptures: positive,
      normalizedRevisions: positive,
      provisionRenditions: positive,
    }).strict(),
    membershipManifestCount: z.literal(5),
    manifestLaneCount: positive,
    reconstructionLaneCount: positive,
  }).strict(),
  writes: z.object({
    newHistoricalRecords: z.literal(0),
    newEvidenceObjects: z.literal(0),
  }).strict(),
  activation: z.object({
    activationSetId: z.string().min(1).max(300),
    currentReleaseId: searchReleaseIdSchema,
    historyActivated: z.literal(false),
    comparisonCompatible: z.literal(false),
  }).strict(),
  waiver: z.object({
    id: z.string().min(1).max(300),
    recordedAt: utcInstantSchema,
    skippedChecks: z.array(z.string().min(1).max(300)).min(1).max(12),
  }).strict(),
  acceptedAt: utcInstantSchema,
}).strict();

export type HistoricalMetadataAcceptance = z.infer<typeof historicalMetadataAcceptanceSchema>;

const acceptanceReceiptSchema = z.object({
  id: z.string().min(1).max(300),
  environment: legalEnvironmentSchema,
  catalogDatabaseId: z.string().min(1).max(300),
  completeCorpusRunId: z.string().min(1).max(300),
  historyRootSha256: sha256Schema,
  historyRecordCount: positive,
  gapRecordCount: nonnegative,
  aliasCount: nonnegative,
  lineageRefCount: nonnegative,
  activeActivationSetId: z.string().min(1).max(300),
  activeCurrentReleaseId: searchReleaseIdSchema,
  waiverId: z.string().min(1).max(300),
  newHistoricalRecordCount: z.literal(0),
  newEvidenceObjectCount: z.literal(0),
  resultR2Key: z.string().min(1).max(1_000),
  resultSha256: sha256Schema,
  acceptedAt: utcInstantSchema,
}).strict();

export type HistoricalMetadataAcceptanceReceipt = z.infer<typeof acceptanceReceiptSchema>;

function asNumber(value: unknown): number {
  return z.coerce.number().int().nonnegative().parse(value);
}

export async function loadHistoricalMetadataControl(
  db: D1Database,
  runId: string,
  environment: z.infer<typeof legalEnvironmentSchema>,
) {
  const row = await db.prepare(`SELECT run.id AS runId,run.status AS runStatus,
      run.completed_at AS completedAt,run.source_cutoff AS sourceCutoff,
      run.source_bookmark AS sourceBookmark,run.source_inventory_sha256 AS sourceInventorySha256,
      run.source_canonical_sha256 AS sourceCanonicalSha256,run.source_alias_sha256 AS sourceAliasSha256,
      run.plan_r2_key AS planR2Key,run.plan_sha256 AS planSha256,
      run.final_reconstruction_r2_key AS reconstructionR2Key,
      run.final_reconstruction_sha256 AS reconstructionSha256,
      run.expected_record_count AS expectedRecordCount,
      run.materialized_record_count AS materializedRecordCount,
      snapshot.r2_key AS snapshotR2Key,snapshot.snapshot_sha256 AS snapshotSha256,
      current.record_count AS currentCount,current.root_sha256 AS currentRootSha256,
      current.r2_key AS currentManifestR2Key,current.manifest_sha256 AS currentManifestSha256,
      history.record_count AS historyCount,history.root_sha256 AS historyRootSha256,
      history.r2_key AS historyManifestR2Key,history.manifest_sha256 AS historyManifestSha256,
      gaps.record_count AS gapCount,gaps.root_sha256 AS gapRootSha256,
      gaps.r2_key AS gapManifestR2Key,gaps.manifest_sha256 AS gapManifestSha256,
      quarantines.record_count AS quarantineCount,quarantines.root_sha256 AS quarantineRootSha256,
      quarantines.r2_key AS quarantineManifestR2Key,
      quarantines.manifest_sha256 AS quarantineManifestSha256,
      union_manifest.record_count AS unionCount,union_manifest.root_sha256 AS unionRootSha256,
      union_manifest.r2_key AS unionManifestR2Key,
      union_manifest.manifest_sha256 AS unionManifestSha256,
      (SELECT count(*) FROM legal_complete_corpus_aliases alias WHERE alias.run_id=run.id) AS aliasCount,
      (SELECT count(*) FROM legal_complete_corpus_aliases alias
        WHERE alias.run_id=run.id AND alias.alias_kind='raw_capture') AS rawAliasCount,
      (SELECT count(*) FROM legal_complete_corpus_aliases alias
        WHERE alias.run_id=run.id AND alias.alias_kind='normalized_revision') AS normalizedAliasCount,
      (SELECT count(*) FROM legal_complete_corpus_aliases alias
        WHERE alias.run_id=run.id AND alias.alias_kind='version_url') AS urlAliasCount,
      (SELECT count(*) FROM legal_complete_corpus_lineage_refs lineage
        WHERE lineage.run_id=run.id) AS lineageRefCount,
      (SELECT count(*) FROM legal_complete_corpus_lane_reports report
        WHERE report.run_id=run.id AND report.report_kind='manifest') AS manifestLaneCount,
      active.activation_set_id AS activeActivationSetId,
      selected.current_release_id AS activeCurrentReleaseId
    FROM legal_complete_corpus_runs run
    JOIN legal_complete_corpus_snapshots snapshot ON snapshot.run_id=run.id
    JOIN legal_complete_corpus_manifests current ON current.run_id=run.id AND current.membership='current'
    JOIN legal_complete_corpus_manifests history ON history.run_id=run.id AND history.membership='history'
    JOIN legal_complete_corpus_manifests gaps ON gaps.run_id=run.id AND gaps.membership='gaps'
    JOIN legal_complete_corpus_manifests quarantines
      ON quarantines.run_id=run.id AND quarantines.membership='quarantines'
    JOIN legal_complete_corpus_manifests union_manifest
      ON union_manifest.run_id=run.id AND union_manifest.membership='union'
    JOIN legal_active_activation_sets active ON active.environment=?
    JOIN legal_activation_sets selected ON selected.id=active.activation_set_id
    WHERE run.id=?`).bind(environment, runId).first<Record<string, unknown>>();
  if (!row) throw new TypeError("HISTORICAL_METADATA_CONTROL_UNAVAILABLE");
  for (const key of ["expectedRecordCount", "materializedRecordCount", "currentCount", "historyCount",
    "gapCount", "quarantineCount", "unionCount", "aliasCount", "rawAliasCount",
    "normalizedAliasCount", "urlAliasCount", "lineageRefCount", "manifestLaneCount"] as const) {
    row[key] = asNumber(row[key]);
  }
  const parsed = controlRowSchema.parse(row);
  if (parsed.expectedRecordCount !== parsed.materializedRecordCount
    || parsed.materializedRecordCount !== parsed.historyCount + parsed.gapCount
    || parsed.unionCount !== parsed.materializedRecordCount + parsed.quarantineCount
    || parsed.aliasCount !== parsed.rawAliasCount + parsed.normalizedAliasCount + parsed.urlAliasCount) {
    throw new TypeError("HISTORICAL_METADATA_CONTROL_MISMATCH");
  }
  return parsed;
}

export async function buildHistoricalMetadataAcceptance(input: {
  control: z.infer<typeof controlRowSchema>;
  reconstructionBytes: Uint8Array;
  environment: z.infer<typeof legalEnvironmentSchema>;
  catalogDatabaseId: string;
  waiver: HistoricalMetadataAcceptance["waiver"];
  acceptedAt: string;
}): Promise<HistoricalMetadataAcceptance> {
  const control = controlRowSchema.parse(input.control);
  const reconstructionBytes = new Uint8Array(input.reconstructionBytes);
  const reconstructionDigest = await crypto.subtle.digest("SHA-256", reconstructionBytes);
  const reconstructionSha256 = [...new Uint8Array(reconstructionDigest)]
    .map((value) => value.toString(16).padStart(2, "0")).join("");
  if (reconstructionSha256 !== control.reconstructionSha256) {
    throw new TypeError("HISTORICAL_METADATA_RECONSTRUCTION_HASH_MISMATCH");
  }
  const proof = acceptedHistoricalReconstructionSchema.parse(
    JSON.parse(new TextDecoder().decode(reconstructionBytes)) as unknown,
  );
  if (proof.runId !== control.runId
    || proof.exact.records !== control.materializedRecordCount
    || proof.exact.currentRecords !== control.currentCount
    || proof.exact.historicalRecords !== control.historyCount
    || proof.exact.gaps !== control.gapCount
    || proof.exact.quarantineCount !== control.quarantineCount
    || proof.exact.sourceVersionCount !== control.lineageRefCount
    || proof.exact.physicalObjectCounts.dataObjects
      !== proof.exact.physicalObjectCounts.rawObjects
        + proof.exact.physicalObjectCounts.normalizedObjects
        + proof.exact.physicalObjectCounts.provisionObjects) {
    throw new TypeError("HISTORICAL_METADATA_RECONSTRUCTION_MISMATCH");
  }
  const membership = (kind: "union" | "current" | "history" | "gap" | "quarantine") => ({
    count: control[`${kind}Count`],
    rootSha256: control[`${kind}RootSha256`],
    key: control[`${kind}ManifestR2Key`],
    sha256: control[`${kind}ManifestSha256`],
  });
  return historicalMetadataAcceptanceSchema.parse({
    schemaVersion: "historical-metadata-acceptance-v1",
    status: "accepted_materialized_with_owner_waiver",
    environment: input.environment,
    catalogDatabaseId: input.catalogDatabaseId,
    completeCorpus: {
      runId: control.runId, runStatus: control.runStatus, completedAt: control.completedAt,
      sourceCutoff: control.sourceCutoff, sourceBookmark: control.sourceBookmark,
      plan: { key: control.planR2Key, sha256: control.planSha256 },
      snapshot: { key: control.snapshotR2Key, sha256: control.snapshotSha256 },
      reconstruction: { key: control.reconstructionR2Key,
        sha256: control.reconstructionSha256, rootSha256: proof.reconstructionRootSha256 },
    },
    sourceRoots: { inventorySha256: control.sourceInventorySha256,
      canonicalSha256: control.sourceCanonicalSha256, aliasSha256: control.sourceAliasSha256 },
    memberships: { union: membership("union"), current: membership("current"),
      history: membership("history"), gaps: membership("gap"),
      quarantines: membership("quarantine"), currentHistoryOverlap: proof.exact.overlapRecords },
    metadata: { materializedRecords: control.materializedRecordCount,
      lineageRefs: control.lineageRefCount, aliases: { total: control.aliasCount,
        rawCapture: control.rawAliasCount, normalizedRevision: control.normalizedAliasCount,
        versionUrl: control.urlAliasCount }, distinctBodies: proof.exact.distinctBodies,
      physicalObjects: { total: proof.exact.physicalObjectCounts.dataObjects,
        rawCaptures: proof.exact.physicalObjectCounts.rawObjects,
        normalizedRevisions: proof.exact.physicalObjectCounts.normalizedObjects,
        provisionRenditions: proof.exact.physicalObjectCounts.provisionObjects },
      membershipManifestCount: 5, manifestLaneCount: control.manifestLaneCount,
      reconstructionLaneCount: proof.reconstructionLaneCount },
    writes: { newHistoricalRecords: 0, newEvidenceObjects: 0 },
    activation: { activationSetId: control.activeActivationSetId,
      currentReleaseId: control.activeCurrentReleaseId,
      historyActivated: false, comparisonCompatible: false },
    waiver: input.waiver,
    acceptedAt: input.acceptedAt,
  });
}

export async function serializeHistoricalMetadataAcceptance(result: HistoricalMetadataAcceptance) {
  const bytes = new TextEncoder().encode(`${JSON.stringify(historicalMetadataAcceptanceSchema.parse(result))}\n`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0")).join("");
  return { bytes, sha256 };
}

export async function recordHistoricalMetadataAcceptance(input: {
  db: D1Database;
  id: string;
  result: HistoricalMetadataAcceptance;
  resultR2Key: string;
  resultSha256: string;
}): Promise<HistoricalMetadataAcceptanceReceipt> {
  const result = historicalMetadataAcceptanceSchema.parse(input.result);
  const serialized = await serializeHistoricalMetadataAcceptance(result);
  if (serialized.sha256 !== input.resultSha256) {
    throw new TypeError("HISTORICAL_METADATA_RESULT_HASH_MISMATCH");
  }
  const expected = acceptanceReceiptSchema.parse({
    id: input.id,
    environment: result.environment,
    catalogDatabaseId: result.catalogDatabaseId,
    completeCorpusRunId: result.completeCorpus.runId,
    historyRootSha256: result.memberships.history.rootSha256,
    historyRecordCount: result.memberships.history.count,
    gapRecordCount: result.memberships.gaps.count,
    aliasCount: result.metadata.aliases.total,
    lineageRefCount: result.metadata.lineageRefs,
    activeActivationSetId: result.activation.activationSetId,
    activeCurrentReleaseId: result.activation.currentReleaseId,
    waiverId: result.waiver.id,
    newHistoricalRecordCount: result.writes.newHistoricalRecords,
    newEvidenceObjectCount: result.writes.newEvidenceObjects,
    resultR2Key: input.resultR2Key,
    resultSha256: input.resultSha256,
    acceptedAt: result.acceptedAt,
  });
  const read = async () => {
    const row = await input.db.prepare(`SELECT id,environment,catalog_database_id AS catalogDatabaseId,
        complete_corpus_run_id AS completeCorpusRunId,history_root_sha256 AS historyRootSha256,
        history_record_count AS historyRecordCount,gap_record_count AS gapRecordCount,
        alias_count AS aliasCount,lineage_ref_count AS lineageRefCount,
        active_activation_set_id AS activeActivationSetId,
        active_current_release_id AS activeCurrentReleaseId,waiver_id AS waiverId,
        new_historical_record_count AS newHistoricalRecordCount,
        new_evidence_object_count AS newEvidenceObjectCount,result_r2_key AS resultR2Key,
        result_sha256 AS resultSha256,accepted_at AS acceptedAt
      FROM legal_historical_metadata_acceptances WHERE complete_corpus_run_id=?`)
      .bind(result.completeCorpus.runId).first<Record<string, unknown>>();
    if (!row) return null;
    for (const key of ["historyRecordCount", "gapRecordCount", "aliasCount", "lineageRefCount",
      "newHistoricalRecordCount", "newEvidenceObjectCount"] as const) row[key] = asNumber(row[key]);
    return acceptanceReceiptSchema.parse(row);
  };
  const existing = await read();
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(expected)) {
      throw new TypeError("HISTORICAL_METADATA_ACCEPTANCE_CONFLICT");
    }
    return existing;
  }
  try {
    await input.db.prepare(`INSERT INTO legal_historical_metadata_acceptances
        (id,environment,catalog_database_id,complete_corpus_run_id,history_root_sha256,
         history_record_count,gap_record_count,alias_count,lineage_ref_count,
         active_activation_set_id,active_current_release_id,waiver_id,
         new_historical_record_count,new_evidence_object_count,result_r2_key,result_sha256,accepted_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
      FROM legal_active_activation_sets active
      JOIN legal_activation_sets selected ON selected.id=active.activation_set_id
      WHERE active.environment=? AND active.activation_set_id=? AND selected.current_release_id=?`)
      .bind(expected.id, expected.environment, expected.catalogDatabaseId,
        expected.completeCorpusRunId, expected.historyRootSha256, expected.historyRecordCount,
        expected.gapRecordCount, expected.aliasCount, expected.lineageRefCount,
        expected.activeActivationSetId, expected.activeCurrentReleaseId, expected.waiverId,
        expected.newHistoricalRecordCount, expected.newEvidenceObjectCount, expected.resultR2Key,
        expected.resultSha256, expected.acceptedAt, expected.environment,
        expected.activeActivationSetId, expected.activeCurrentReleaseId).run();
  } catch {
    const raced = await read();
    if (!raced || JSON.stringify(raced) !== JSON.stringify(expected)) {
      throw new TypeError("HISTORICAL_METADATA_ACCEPTANCE_WRITE_FAILED");
    }
    return raced;
  }
  const stored = await read();
  if (!stored || JSON.stringify(stored) !== JSON.stringify(expected)) {
    throw new TypeError("HISTORICAL_METADATA_ACCEPTANCE_WRITE_FAILED");
  }
  return stored;
}
