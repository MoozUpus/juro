import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";

import {
  completeCorpusLegalIdentitySha256,
  completeCorpusPublisherRevisionToken,
} from "../lib/legal-corpus/complete-corpus-audit";
import {
  immutableEvidencePut,
  runTicket29MaterializationPage,
  ticket29EvidenceKey,
  ticket29AccountingTotalsMatch,
  ticket29ControlReplayMatches,
  ticket29LifecycleDisposition,
  ticket29QueueMessageSchema,
  ticket29Sha256,
  ticket29ManifestRoot,
  ticket29TargetPublisherRevisionToken,
  ticket29StageDecision,
  type Ticket29BodyFreeRecord,
  type Ticket29EvidenceDescriptor,
  type Ticket29HydratedSource,
  type Ticket29PlanItem,
  type Ticket29RetainedLocator,
} from "../lib/legal-corpus/complete-corpus-materialization";
import { stableSourceSnapshotJson } from "../lib/legal-corpus/source-snapshot";
import {
  TICKET29_SOURCE_OBJECT_MANIFEST,
  TICKET29_SOURCE_OBJECT_MANIFEST_SHA256,
  TICKET29_SOURCE_REVISION_ALIASES,
  TICKET29_SOURCE_REVISION_ALIAS_SHA256,
  TICKET29_EMPTY_VERSION_MANIFEST,
  TICKET29_EMPTY_VERSION_MANIFEST_SHA256,
} from "../lib/legal-corpus/ticket29-source-object-manifest.generated";

const RUN_ID = "ticket29:cutoff-20260831:complete-corpus-v1";
const ACCOUNT_ID = "e22babd36b65c99b69adf3de50df5227";
const CUTOFF = "2026-08-31T06:26:27.2253695Z";
const SOURCE_BOOKMARK = "00001fc0-00000006-000050d8-8d0a7d4edf4ab919646c241f8e32cde1";
const SOURCE_INVENTORY_SHA256 = "2105a4d39465ae8e0b923ab89a08dddf2599d57b9e1517490a8d2f1996fe4c00";
const SOURCE_CANONICAL_SHA256 = "e527fa5221acf6063defa5f944d9ef54ca7e8b2667c47df34ba8135ef879f830";
const SOURCE_ALIAS_SHA256 = "5ff75e07391b9acd01699d8aca2bbaa32684c402e3470e42660d66fdd064f201";
const EXPECTED_RECORDS = 1_299_828;
// The largest source lane has 523,265 rows; 600 keeps the durable workflow
// below its 1,024-step ceiling while each queue page remains bounded at 100.
const SOURCE_PAGE_SIZE = 600;
const MATERIALIZATION_PAGE_SIZE = 100;
const SOURCE_RELEASE_ID = "release:staging:current:source-snapshot-v1";
const decoder = new TextDecoder("utf-8", { fatal: true });
const sourceObjectManifest = new Map(TICKET29_SOURCE_OBJECT_MANIFEST.map((entry) => [entry[0], {
  role: entry[1], byteCount: entry[2], etag: entry[3], sha256: entry[4],
}]));
const sourceRevisionAliases = new Map(TICKET29_SOURCE_REVISION_ALIASES.map((entry) => [entry[0], {
  normalizedObjectKey: entry[1], sourceRevisionSha256: entry[2], objectMetadataRevisionSha256: entry[3],
}]));

type SourceRow = {
  id: string;
  documentId: string;
  versionId: string;
  versionNumber: number;
  versionDate: string | null;
  versionContentSha256: string;
  previousVersionId: string | null;
  changeType: string;
  versionSourceUrl: string | null;
  rawObjectKey: string;
  normalizedObjectKey: string;
  language: "uz-Latn" | "uz-Cyrl" | "ru" | "en";
  articleNumber: string | null;
  articleNumberNormalized: string | null;
  articleTitle: string | null;
  provisionSourceUrl: string | null;
  part: string | null;
  chapter: string | null;
  section: string | null;
  sequence: number;
  text?: string;
  contentSha256: string;
  validFrom: string | null;
  validTo: string | null;
  status: string;
};

type CompletePlanItem = Ticket29PlanItem & {
  sourceDocumentId: string;
  sourceVersionId: string;
  instrumentId: string;
  officialExpressionId: string;
  textRevisionId: string;
  provisionConceptId: string;
  provisionRenditionId: string;
  legacyCurrentRenditionId: string;
  publisherRevisionToken: string;
  legacyTargetPublisherRevisionToken: string;
  sourcePublisherRevisionToken: string;
  publisherProvisionToken: string;
  applicabilityIdentity: string;
  identityStage: "ticket29-provisional-v1";
  provisionSourceUrl: string | null;
  versionSourceUrl: string | null;
  previousSourceVersionId: string | null;
  sourceChangeType: string;
  sourceRevisionSha256: string;
  objectMetadataRevisionSha256: string;
  textualAuthority: "unknown";
  language: SourceRow["language"];
  script: "Latn" | "Cyrl";
  ordinal: number;
  validFrom: string | null;
  validTo: string | null;
  currentEligible: boolean;
  historicalEligible: boolean;
  temporalGap: boolean;
};

type MaterializeMessage = ReturnType<typeof ticket29QueueMessageSchema.parse>;

type PlannerPayload = {
  schemaVersion: 1;
  lane: "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
  proofMode: "interrupted" | "idempotent";
};

type ControlProofMode = "first" | "second";
type LanePayload = { schemaVersion: 1; lane: string; proofMode: ControlProofMode };

type MaterializationEnv = {
  APP_ENV: "staging";
  CLOUDFLARE_ACCOUNT_ID: typeof ACCOUNT_ID;
  SOURCE_DB: D1Database;
  LEGAL_DB: D1Database;
  SOURCE_EVIDENCE: R2Bucket;
  EVIDENCE: R2Bucket;
  MATERIALIZATION_QUEUE: Queue<MaterializeMessage>;
};

const sourcePlanSql = `SELECT p.id,p.document_id AS documentId,v.id AS versionId,
  v.version_number AS versionNumber,v.version_date AS versionDate,
  v.content_sha256 AS versionContentSha256,v.previous_version_id AS previousVersionId,
  v.change_type AS changeType,v.source_url AS versionSourceUrl,
  v.raw_object_key AS rawObjectKey,v.normalized_object_key AS normalizedObjectKey,
  p.language,p.article_number AS articleNumber,p.article_number_normalized AS articleNumberNormalized,
  p.article_title AS articleTitle,p.source_url AS provisionSourceUrl,
  p.part,p.chapter,p.section,p.sequence,
  p.content_sha256 AS contentSha256,p.valid_from AS validFrom,p.valid_to AS validTo,p.status
  FROM legal_corpus_provisions p JOIN legal_corpus_versions v ON v.id=p.version_id
  WHERE p.id>? AND p.id>=? AND p.id<? AND p.created_at<=? AND v.created_at<=?
  ORDER BY p.id LIMIT ?`;

const sourceHydrationSql = `SELECT p.id,p.document_id AS documentId,v.id AS versionId,
  v.version_number AS versionNumber,v.version_date AS versionDate,
  v.content_sha256 AS versionContentSha256,v.previous_version_id AS previousVersionId,
  v.change_type AS changeType,v.source_url AS versionSourceUrl,
  v.raw_object_key AS rawObjectKey,v.normalized_object_key AS normalizedObjectKey,
  p.language,p.article_number AS articleNumber,p.article_number_normalized AS articleNumberNormalized,
  p.article_title AS articleTitle,p.source_url AS provisionSourceUrl,
  p.part,p.chapter,p.section,p.sequence,p.text,
  p.content_sha256 AS contentSha256,p.valid_from AS validFrom,p.valid_to AS validTo,p.status
  FROM legal_corpus_provisions p JOIN legal_corpus_versions v ON v.id=p.version_id
  WHERE p.id IN (SELECT value FROM json_each(?)) AND p.created_at<=? AND v.created_at<=?
  ORDER BY p.id`;

function laneBounds(lane: PlannerPayload["lane"]): { lower: string; upper: string } {
  return { lower: `lexuz-family:${lane}`, upper: lane === "9" ? "lexuz-family::" : `lexuz-family:${Number(lane) + 1}` };
}

function dateInstant(value: string | null): string | null {
  return value?.length === 10 ? `${value}T00:00:00.000Z` : value;
}

function scriptFor(language: SourceRow["language"]): "Latn" | "Cyrl" {
  return language === "ru" || language === "uz-Cyrl" ? "Cyrl" : "Latn";
}

async function identifier(kind: string, identity: string): Promise<string> {
  return `${kind}:${await ticket29Sha256(identity)}`;
}

async function identities(row: SourceRow) {
  const script = scriptFor(row.language);
  const instrumentId = await identifier("instrument", row.documentId);
  // This is the exact publisher token persisted by Ticket 12 and consumed by
  // target-migration's canonical Text Revision natural-key calculation.
  const legacyTargetPublisherRevisionToken = ticket29TargetPublisherRevisionToken(row);
  const publisherRevisionToken = completeCorpusPublisherRevisionToken({
    sourceVersionId: row.versionId, versionDate: row.versionDate, versionNumber: row.versionNumber,
  });
  const sourcePublisherRevisionToken = publisherRevisionToken;
  const officialExpressionId = await identifier(
    "expression", `${instrumentId}\u0000${row.language}\u0000${script}\u0000unknown`,
  );
  const textRevisionId = await identifier("revision", [row.documentId, row.language, script,
    "unknown", sourcePublisherRevisionToken].join("|"));
  const publisherProvisionToken = row.articleNumberNormalized
    ? `article:${row.articleNumberNormalized}:sequence:${row.sequence}`
    : `unnumbered:sequence:${row.sequence}`;
  // Ticket 15 owns cross-revision canonical Provision Concept resolution. Until
  // then, preserve the opaque source provision identity and never infer a
  // stable concept from an article label or ingestion ordinal.
  const provisionConceptId = await identifier("concept", `source-provision:${row.id}`);
  const applicabilityIdentity = `${dateInstant(row.validFrom) ?? "gap"}/${dateInstant(row.validTo) ?? ""}`;
  const provisionRenditionId = await identifier("rendition", [row.documentId, provisionConceptId,
    publisherProvisionToken, textRevisionId, row.language, script, "unknown", applicabilityIdentity].join("|"));
  const legacyRevisionId = await identifier("revision", `${officialExpressionId}\u0000${row.versionContentSha256}`);
  const legacyProvisionConceptId = await identifier("concept", `${row.documentId}|${publisherProvisionToken}`);
  const legacyCurrentRenditionId = await identifier(
    "rendition", `${legacyProvisionConceptId}\u0000${legacyRevisionId}`,
  );
  return { instrumentId, officialExpressionId, textRevisionId, provisionConceptId,
    provisionRenditionId, legacyCurrentRenditionId, publisherRevisionToken, sourcePublisherRevisionToken,
    legacyTargetPublisherRevisionToken,
    publisherProvisionToken, applicabilityIdentity, identityStage: "ticket29-provisional-v1" as const, script };
}

async function planItem(
  row: SourceRow,
  retained: { current: boolean; raw?: Ticket29RetainedLocator;
    normalized?: Ticket29RetainedLocator; provision?: Ticket29RetainedLocator },
): Promise<CompletePlanItem> {
  if (!row.rawObjectKey || !row.normalizedObjectKey) throw new Error("TICKET29_SOURCE_LOCATOR_MISSING");
  const target = await identities(row);
  const sourceAlias = sourceRevisionAliases.get(row.id);
  const sourceRevisionSha256 = sourceAlias?.sourceRevisionSha256 ?? row.versionContentSha256;
  const objectMetadataRevisionSha256 = sourceAlias?.objectMetadataRevisionSha256
    ?? row.versionContentSha256;
  const expectedRaw = sourceObjectManifest.get(row.rawObjectKey);
  const expectedNormalized = sourceObjectManifest.get(row.normalizedObjectKey);
  if (!expectedRaw || !expectedNormalized
    || expectedRaw.role !== "raw" || expectedNormalized.role !== "normalized"
    || sourceRevisionSha256 !== row.versionContentSha256
    || (sourceAlias !== undefined && sourceAlias.normalizedObjectKey !== row.normalizedObjectKey)) {
    throw new Error("TICKET29_SOURCE_R2_METADATA_MISMATCH");
  }
  const rawSourceSha256 = expectedRaw.sha256;
  const normalizedSourceSha256 = expectedNormalized.sha256;
  const articleNumber = row.articleNumber?.trim() || row.articleNumberNormalized?.trim()
    || `unnumbered-${row.sequence}`;
  const legalIdentitySha256 = await completeCorpusLegalIdentitySha256({
    publisherDocumentToken: row.documentId,
    publisherRevisionToken: completeCorpusPublisherRevisionToken({
      sourceVersionId: row.versionId,
      versionDate: row.versionDate,
      versionNumber: row.versionNumber,
    }),
    language: row.language,
    articleNumber,
    sequence: row.sequence,
  });
  const materialSha256 = await ticket29Sha256(stableSourceSnapshotJson({
    articleNumber,
    articleTitle: row.articleTitle,
    contentSha256: row.contentSha256,
    documentId: row.documentId,
    documentType: "unknown",
    hierarchy: [row.part, row.chapter, row.section].filter((value) => Boolean(value?.trim())),
    language: row.language,
    normalizedObjectKey: row.normalizedObjectKey,
    rawObjectKey: row.rawObjectKey,
    sequence: row.sequence,
    status: row.status,
    validFrom: row.validFrom,
    validTo: row.validTo,
    versionId: row.versionId,
  }));
  return {
    sourceId: row.id,
    sourceDocumentId: row.documentId,
    sourceVersionId: row.versionId,
    legalIdentitySha256,
    materialSha256,
    contentSha256: row.contentSha256,
    rawSourceKey: row.rawObjectKey,
    rawSourceSha256,
    normalizedSourceKey: row.normalizedObjectKey,
    normalizedSourceSha256,
    ...target,
    sourceRevisionSha256,
    objectMetadataRevisionSha256,
    provisionSourceUrl: row.provisionSourceUrl,
    versionSourceUrl: row.versionSourceUrl,
    previousSourceVersionId: row.previousVersionId,
    sourceChangeType: row.changeType,
    textualAuthority: "unknown",
    language: row.language,
    ordinal: row.sequence,
    validFrom: dateInstant(row.validFrom),
    validTo: dateInstant(row.validTo),
    currentEligible: retained.current,
    historicalEligible: row.validFrom !== null,
    temporalGap: row.validFrom === null,
    ...(retained.raw ? { retainedRawLocator: retained.raw } : {}),
    ...(retained.normalized ? { retainedNormalizedLocator: retained.normalized } : {}),
    ...(retained.provision ? { retainedProvisionLocator: retained.provision } : {}),
  };
}

async function ensureRun(env: MaterializationEnv, now: string): Promise<void> {
  await env.LEGAL_DB.prepare(`INSERT OR IGNORE INTO legal_complete_corpus_runs
    (id,schema_version,source_cutoff,source_bookmark,source_inventory_sha256,
     source_canonical_sha256,source_alias_sha256,source_r2_object_manifest_sha256,
     source_r2_alias_manifest_sha256,source_empty_version_manifest_sha256,
     plan_r2_key,plan_sha256,status,expected_record_count,materialized_record_count,
     created_at,updated_at,completed_at)
    VALUES (?,'complete-corpus-materialization-v1',?,?,?,?,?,?,?,?,NULL,NULL,'building',?,0,?,?,NULL)`)
    .bind(RUN_ID, CUTOFF, SOURCE_BOOKMARK, SOURCE_INVENTORY_SHA256, SOURCE_CANONICAL_SHA256,
      SOURCE_ALIAS_SHA256, TICKET29_SOURCE_OBJECT_MANIFEST_SHA256,
      TICKET29_SOURCE_REVISION_ALIAS_SHA256, TICKET29_EMPTY_VERSION_MANIFEST_SHA256,
      EXPECTED_RECORDS, now, now).run();
  const run = await env.LEGAL_DB.prepare(`SELECT source_cutoff AS sourceCutoff,
      source_bookmark AS sourceBookmark,source_inventory_sha256 AS sourceInventorySha256,
      source_canonical_sha256 AS sourceCanonicalSha256,source_alias_sha256 AS sourceAliasSha256,
      source_r2_object_manifest_sha256 AS sourceR2ObjectManifestSha256,
      source_r2_alias_manifest_sha256 AS sourceR2AliasManifestSha256,
      source_empty_version_manifest_sha256 AS sourceEmptyVersionManifestSha256,
      expected_record_count AS expectedRecordCount,status FROM legal_complete_corpus_runs WHERE id=?`)
    .bind(RUN_ID).first<Record<string, unknown>>();
  if (!run || run.sourceCutoff !== CUTOFF || run.sourceBookmark !== SOURCE_BOOKMARK
    || run.sourceInventorySha256 !== SOURCE_INVENTORY_SHA256
    || run.sourceCanonicalSha256 !== SOURCE_CANONICAL_SHA256
    || run.sourceAliasSha256 !== SOURCE_ALIAS_SHA256
    || run.sourceR2ObjectManifestSha256 !== TICKET29_SOURCE_OBJECT_MANIFEST_SHA256
    || run.sourceR2AliasManifestSha256 !== TICKET29_SOURCE_REVISION_ALIAS_SHA256
    || run.sourceEmptyVersionManifestSha256 !== TICKET29_EMPTY_VERSION_MANIFEST_SHA256
    || Number(run.expectedRecordCount) !== EXPECTED_RECORDS || run.status !== "building") {
    throw new Error("TICKET29_RUN_IDENTITY_MISMATCH");
  }
}

async function assertRunBuilding(env: MaterializationEnv): Promise<void> {
  const run = await env.LEGAL_DB.prepare(`SELECT status FROM legal_complete_corpus_runs WHERE id=?`)
    .bind(RUN_ID).first<{ status: string }>();
  if (run?.status !== "building") throw new Error("TICKET29_RUN_SEALED");
}

async function assertRetainedCurrentEvidenceComplete(env: MaterializationEnv): Promise<void> {
  const state = await env.LEGAL_DB.prepare(`SELECT count(*) AS records,
      sum(CASE WHEN provision.object_kind='provision_rendition'
        AND provision.source_normalized_sha256=normalized.sha256
        AND raw.object_kind='raw_capture' AND normalized.object_kind='normalized_revision'
        THEN 1 ELSE 0 END) AS completeRecords
    FROM legal_search_release_items item
    JOIN legal_provision_renditions rendition ON rendition.id=item.provision_rendition_id
    JOIN legal_evidence_locators provision ON provision.id=rendition.locator_id
    JOIN legal_text_revisions revision ON revision.id=rendition.text_revision_id
    JOIN legal_evidence_locators raw ON raw.id=revision.raw_locator_id
    JOIN legal_evidence_locators normalized ON normalized.id=revision.normalized_locator_id
    WHERE item.search_release_id=?`).bind(SOURCE_RELEASE_ID)
    .first<{ records: number; completeRecords: number }>();
  if (Number(state?.records) !== 160_978 || Number(state?.completeRecords) !== 160_978) {
    throw new Error("TICKET29_RETAINED_CURRENT_EVIDENCE_INCOMPLETE");
  }
}

async function assertMaterializationNamespaceReady(env: MaterializationEnv): Promise<void> {
  const existingRun = await env.LEGAL_DB.prepare(`SELECT status
    FROM legal_complete_corpus_runs WHERE id=?`).bind(RUN_ID).first<{ status: string }>();
  if (existingRun) return;
  const existingObjects = await env.EVIDENCE.list({ prefix: "legal-corpus/complete-v1/", limit: 1 });
  if (existingObjects.objects.length !== 0) {
    throw new Error("TICKET29_EVIDENCE_NAMESPACE_NOT_EMPTY");
  }
}

async function assertFirstTraversalComplete(env: MaterializationEnv): Promise<void> {
  const state = await env.LEGAL_DB.prepare(`SELECT
      (SELECT count(*) FROM legal_complete_corpus_lane_reports
        WHERE run_id=? AND report_kind='plan') AS planLanes,
      (SELECT coalesce(sum(verified_object_count),0) FROM legal_complete_corpus_lane_reports
        WHERE run_id=? AND report_kind='plan') AS planPages,
      (SELECT count(*) FROM legal_complete_corpus_attempt_pages
        WHERE run_id=? AND attempt_id='ticket29:first') AS attemptPages,
      (SELECT coalesce(sum(record_count),0) FROM legal_complete_corpus_attempt_pages
        WHERE run_id=? AND attempt_id='ticket29:first') AS records,
      (SELECT record_count FROM legal_complete_corpus_quarantine_attempts
        WHERE run_id=? AND attempt_id='ticket29:quarantine:first') AS quarantines`)
    .bind(RUN_ID, RUN_ID, RUN_ID, RUN_ID, RUN_ID).first<Record<string, number | null>>();
  if (Number(state?.planLanes) !== 9 || Number(state?.planPages) !== Number(state?.attemptPages)
    || Number(state?.records) !== EXPECTED_RECORDS || Number(state?.quarantines) !== 12) {
    throw new Error("TICKET29_FIRST_TRAVERSAL_INCOMPLETE");
  }
}

async function assertFirstQuarantineComplete(env: MaterializationEnv): Promise<void> {
  const state = await env.LEGAL_DB.prepare(`SELECT record_count AS records
    FROM legal_complete_corpus_quarantine_attempts
    WHERE run_id=? AND attempt_id='ticket29:quarantine:first'`).bind(RUN_ID)
    .first<{ records: number }>();
  if (Number(state?.records) !== 12) throw new Error("TICKET29_FIRST_QUARANTINE_INCOMPLETE");
}

async function assertSecondTraversalComplete(env: MaterializationEnv): Promise<void> {
  await assertFirstTraversalComplete(env);
  const state = await env.LEGAL_DB.prepare(`SELECT
      (SELECT count(*) FROM legal_complete_corpus_attempt_pages
        WHERE run_id=? AND attempt_id='ticket29:second') AS attemptPages,
      (SELECT count(*) FROM legal_complete_corpus_pages WHERE run_id=?) AS committedPages,
      (SELECT coalesce(sum(record_count),0) FROM legal_complete_corpus_attempt_pages
        WHERE run_id=? AND attempt_id='ticket29:second') AS records,
      (SELECT coalesce(sum(created_object_count),0) FROM legal_complete_corpus_attempt_pages
        WHERE run_id=? AND attempt_id='ticket29:second') AS createdObjects,
      (SELECT record_count FROM legal_complete_corpus_quarantine_attempts
        WHERE run_id=? AND attempt_id='ticket29:quarantine:second') AS quarantines,
      (SELECT created_object_count FROM legal_complete_corpus_quarantine_attempts
        WHERE run_id=? AND attempt_id='ticket29:quarantine:second') AS quarantineCreated`)
    .bind(RUN_ID, RUN_ID, RUN_ID, RUN_ID, RUN_ID, RUN_ID).first<Record<string, number | null>>();
  if (Number(state?.attemptPages) !== Number(state?.committedPages)
    || Number(state?.records) !== EXPECTED_RECORDS || Number(state?.createdObjects) !== 0
    || Number(state?.quarantines) !== 12 || Number(state?.quarantineCreated) !== 0) {
    throw new Error("TICKET29_SECOND_TRAVERSAL_INCOMPLETE");
  }
}

async function assertManifestTraversalComplete(env: MaterializationEnv): Promise<void> {
  await assertSecondTraversalComplete(env);
  const state = await env.LEGAL_DB.prepare(`SELECT count(*) AS lanes,
      coalesce(sum(record_count),0) AS records FROM legal_complete_corpus_lane_reports
      WHERE run_id=? AND report_kind='manifest'`).bind(RUN_ID)
    .first<{ lanes: number; records: number }>();
  if (Number(state?.lanes) !== 9 || Number(state?.records) !== EXPECTED_RECORDS) {
    throw new Error("TICKET29_MANIFEST_TRAVERSAL_INCOMPLETE");
  }
}

async function assertReconstructionTraversalComplete(env: MaterializationEnv): Promise<void> {
  await assertManifestTraversalComplete(env);
  const state = await env.LEGAL_DB.prepare(`SELECT count(*) AS lanes
    FROM legal_complete_corpus_lane_reports WHERE run_id=? AND report_kind='reconstruction'`)
    .bind(RUN_ID).first<{ lanes: number }>();
  if (Number(state?.lanes) !== 16) throw new Error("TICKET29_RECONSTRUCTION_TRAVERSAL_INCOMPLETE");
}

type TargetLocatorRow = { objectKind: Ticket29RetainedLocator["kind"]; r2Key: string;
  mediaType: string; byteCount: number; sha256: string; sourceNormalizedSha256: string | null };

function retainedLocator(row: TargetLocatorRow): Ticket29RetainedLocator {
  return { key: row.r2Key, kind: row.objectKind, sha256: row.sha256,
    byteCount: Number(row.byteCount), mediaType: row.mediaType,
    sourceNormalizedSha256: row.sourceNormalizedSha256, schemaVersion: 1 };
}

async function targetState(env: MaterializationEnv, rows: readonly SourceRow[]): Promise<Map<string, {
  current: boolean; raw?: Ticket29RetainedLocator; normalized?: Ticket29RetainedLocator;
  provision?: Ticket29RetainedLocator;
}>> {
  const requested = await Promise.all(rows.map(async (row) => ({ sourceId: row.id,
    legacyCurrentRenditionId: (await identities(row)).legacyCurrentRenditionId,
    rawSha256: sourceObjectManifest.get(row.rawObjectKey)?.sha256,
    normalizedSha256: sourceObjectManifest.get(row.normalizedObjectKey)?.sha256 })));
  if (requested.some((item) => !item.rawSha256 || !item.normalizedSha256)) {
    throw new Error("TICKET29_SOURCE_R2_METADATA_MISMATCH");
  }
  const locators = await env.LEGAL_DB.prepare(`SELECT object_kind AS objectKind,r2_key AS r2Key,
      media_type AS mediaType,byte_count AS byteCount,sha256,
      source_normalized_sha256 AS sourceNormalizedSha256
    FROM legal_evidence_locators WHERE
      (object_kind='raw_capture' AND sha256 IN (SELECT json_extract(value,'$.rawSha256') FROM json_each(?)))
      OR (object_kind='normalized_revision' AND sha256 IN
        (SELECT json_extract(value,'$.normalizedSha256') FROM json_each(?)))
    ORDER BY r2_key`).bind(JSON.stringify(requested), JSON.stringify(requested)).all<TargetLocatorRow>();
  const byKindSha = new Map<string, Ticket29RetainedLocator>();
  for (const row of locators.results) {
    const key = `${row.objectKind}:${row.sha256}`;
    if (!byKindSha.has(key)) byKindSha.set(key, retainedLocator(row));
  }
  const current = await env.LEGAL_DB.prepare(`SELECT json_extract(request.value,'$.sourceId') AS sourceId,
      locator.object_kind AS objectKind,locator.r2_key AS r2Key,locator.media_type AS mediaType,
      locator.byte_count AS byteCount,locator.sha256,
      locator.source_normalized_sha256 AS sourceNormalizedSha256
    FROM json_each(?) request
    JOIN legal_search_release_items item ON item.search_release_id=?
      AND item.provision_rendition_id=json_extract(request.value,'$.legacyCurrentRenditionId')
    JOIN legal_provision_renditions rendition ON rendition.id=item.provision_rendition_id
    JOIN legal_evidence_locators locator ON locator.id=rendition.locator_id
    ORDER BY sourceId`).bind(JSON.stringify(requested), SOURCE_RELEASE_ID)
    .all<TargetLocatorRow & { sourceId: string }>();
  const currentBySource = new Map(current.results.map((row) => [row.sourceId, retainedLocator(row)]));
  return new Map(requested.map((item) => {
    const raw = byKindSha.get(`raw_capture:${item.rawSha256}`);
    const normalized = byKindSha.get(`normalized_revision:${item.normalizedSha256}`);
    const provision = currentBySource.get(item.sourceId);
    if (provision && (!raw || !normalized || provision.kind !== "provision_rendition"
      || provision.sourceNormalizedSha256 !== item.normalizedSha256)) {
      throw new Error("TICKET29_CURRENT_EVIDENCE_INCOMPLETE");
    }
    return [item.sourceId, { current: Boolean(provision), ...(raw ? { raw } : {}),
      ...(normalized ? { normalized } : {}), ...(provision ? { provision } : {}) }];
  }));
}

async function writePlanPage(
  env: MaterializationEnv,
  items: readonly CompletePlanItem[],
  injectInterruption: boolean,
  proofMode: PlannerPayload["proofMode"],
): Promise<{ message: MaterializeMessage; evidence: StoredEvidence }> {
  const bytes = new TextEncoder().encode(`${stableSourceSnapshotJson(items)}\n`);
  const sha256 = await ticket29Sha256(bytes);
  const descriptor: Ticket29EvidenceDescriptor = {
    key: ticket29EvidenceKey("plan", sha256, "application/json;charset=utf-8"),
    kind: "plan",
    mediaType: "application/json;charset=utf-8",
    sha256,
    byteCount: bytes.byteLength,
  };
  const stored = await immutableEvidencePut(env.EVIDENCE, descriptor, bytes);
  await persistDescriptor(env, descriptor, stored.disposition);
  return { message: ticket29QueueMessageSchema.parse({
    schemaVersion: 1,
    kind: "materialize-page",
    runId: RUN_ID,
    attemptId: payloadAttemptId(proofMode),
    planKey: descriptor.key,
    offset: 0,
    length: bytes.byteLength,
    pageSha256: sha256,
    injectInterruption,
    proofMode,
  }), evidence: { descriptor, writeDisposition: stored.disposition } };
}

function payloadAttemptId(
  proofMode: PlannerPayload["proofMode"],
): "ticket29:first" | "ticket29:second" {
  return proofMode === "interrupted" ? "ticket29:first" : "ticket29:second";
}

export class CompleteCorpusMaterializationWorkflow extends WorkflowEntrypoint<MaterializationEnv, PlannerPayload> {
  override async run(event: Readonly<WorkflowEvent<PlannerPayload>>, step: WorkflowStep): Promise<unknown> {
    const payload = typeof event.payload === "string" ? JSON.parse(event.payload) as PlannerPayload : event.payload;
    if (payload.schemaVersion !== 1 || !/^[1-9]$/u.test(payload.lane)
      || !["interrupted", "idempotent"].includes(payload.proofMode)
      || this.env.APP_ENV !== "staging" || this.env.CLOUDFLARE_ACCOUNT_ID !== ACCOUNT_ID) {
      throw new Error("TICKET29_WORKFLOW_PAYLOAD_INVALID");
    }
    await step.do(`preflight current evidence ${payload.lane}`, async () => {
      await assertRetainedCurrentEvidenceComplete(this.env);
      await assertMaterializationNamespaceReady(this.env);
    });
    await step.do(`initialize ${payload.lane}`, async () => ensureRun(this.env, new Date().toISOString()));
    await step.do(`gate ${payload.proofMode} ${payload.lane}`, async () => {
      if (payload.proofMode === "idempotent") await assertFirstTraversalComplete(this.env);
      else await assertFirstQuarantineComplete(this.env);
    });
    const bounds = laneBounds(payload.lane);
    let cursor = bounds.lower;
    let sourceCount = 0;
    let sourcePage = 0;
    let planPageCount = 0;
    const planPages: Array<{ key: string; sha256: string; byteCount: number }> = [];
    const planWrites: StoredEvidence[] = [];
    for (;;) {
      const result = await step.do(`plan lane ${payload.lane} source page ${sourcePage}`, {
        retries: { limit: 8, delay: "30 seconds", backoff: "exponential" },
        timeout: "10 minutes",
      }, async () => {
        const queried = await this.env.SOURCE_DB.prepare(sourcePlanSql).bind(
          cursor, bounds.lower, bounds.upper, CUTOFF, CUTOFF, SOURCE_PAGE_SIZE,
        ).all<SourceRow>();
        const rows = queried.results;
        if (rows.length === 0) return { done: true as const, cursor, sourceCount: 0,
          planPageCount: 0, pages: [], writes: [] };
        const retained = await targetState(this.env, rows);
        const planned: Array<{ message: MaterializeMessage; evidence: StoredEvidence }> = [];
        for (let offset = 0; offset < rows.length; offset += MATERIALIZATION_PAGE_SIZE) {
          const slice = rows.slice(offset, offset + MATERIALIZATION_PAGE_SIZE);
          const items = await Promise.all(slice.map((row) => planItem(row, retained.get(row.id)!)));
          planned.push(await writePlanPage(
            this.env,
            items,
            payload.proofMode === "interrupted" && payload.lane === "1"
              && sourcePage === 0 && offset === 0,
            payload.proofMode,
          ));
        }
        for (let offset = 0; offset < planned.length; offset += 100) {
          await this.env.MATERIALIZATION_QUEUE.sendBatch(
            planned.slice(offset, offset + 100).map(({ message: body }) => ({ body })),
          );
        }
        return {
          done: false as const,
          cursor: rows.at(-1)!.id,
          sourceCount: rows.length,
          planPageCount: planned.length,
          pages: planned.map(({ message }) => ({ key: message.planKey,
            sha256: message.pageSha256, byteCount: message.length })),
          writes: planned.map(({ evidence }) => evidence),
        };
      });
      if (result.done) break;
      cursor = result.cursor;
      sourceCount += result.sourceCount;
      planPageCount += result.planPageCount;
      planPages.push(...result.pages);
      planWrites.push(...result.writes);
      sourcePage += 1;
    }
    const planReport = { schemaVersion: 1, kind: "plan-lane", runId: RUN_ID,
      lane: payload.lane, sourceCount, planPageCount, pages: planPages };
    const reportWrite = await step.do(`seal plan lane ${payload.lane}`, async () =>
      putJsonEvidence(this.env, "plan", planReport));
    const rootSha256 = await ticket29Sha256(stableSourceSnapshotJson(planPages));
    await persistLaneReport(this.env, { reportKind: "plan", lane: payload.lane,
      recordCount: sourceCount, currentCount: 0, historyCount: 0, gapCount: 0,
      verifiedObjectCount: planPageCount, rootSha256, descriptor: reportWrite.descriptor });
    await persistControlAttempt(this.env, { attemptId: payloadAttemptId(payload.proofMode),
      stage: "plan", lane: payload.lane, recordCount: sourceCount, rootSha256,
      writes: [...planWrites, reportWrite] });
    return { schemaVersion: 1, runId: RUN_ID, lane: payload.lane, proofMode: payload.proofMode,
      sourceCount, sourcePageCount: sourcePage, planPageCount, finalCursor: cursor,
      descriptor: reportWrite.descriptor, rootSha256 };
  }
}

type EmptyVersionPayload = { schemaVersion: 1; proofMode: "first" | "second" };

export class CompleteCorpusEmptyVersionsWorkflow extends WorkflowEntrypoint<
  MaterializationEnv, EmptyVersionPayload
> {
  override async run(event: Readonly<WorkflowEvent<EmptyVersionPayload>>, step: WorkflowStep): Promise<unknown> {
    const payload = typeof event.payload === "string"
      ? JSON.parse(event.payload) as EmptyVersionPayload : event.payload;
    if (payload.schemaVersion !== 1 || !["first", "second"].includes(payload.proofMode)) {
      throw new Error("TICKET29_EMPTY_VERSION_PAYLOAD_INVALID");
    }
    await step.do("preflight current evidence", async () => {
      await assertRetainedCurrentEvidenceComplete(this.env);
      await assertMaterializationNamespaceReady(this.env);
    });
    await step.do("initialize empty versions", async () => ensureRun(this.env, new Date().toISOString()));
    if (payload.proofMode === "second") {
      await step.do("gate second empty-version traversal", async () => assertFirstTraversalComplete(this.env));
    }
    const result = await step.do("materialize empty versions", {
      retries: { limit: 8, delay: "30 seconds", backoff: "exponential" }, timeout: "10 minutes",
    }, async () => {
      let createdObjectCount = 0;
      let reusedObjectCount = 0;
      let createdByteCount = 0;
      let reusedByteCount = 0;
      const records: Array<Record<string, unknown>> = [];
      for (const item of TICKET29_EMPTY_VERSION_MANIFEST) {
        const [sourceVersionId, sourceDocumentId, language, versionNumber, versionDate,
          sourceRevisionSha256, previousSourceVersionId, sourceChangeType, versionSourceUrl,
          rawSourceKey, rawSourceSha256, rawByteCount, normalizedSourceKey,
          normalizedSourceSha256, normalizedByteCount, canonicalSourceUrl,
          sourceAvailabilityStatus] = item;
        const [rawBytes, normalizedBytes] = await Promise.all([
          readSourceObject(this.env.SOURCE_EVIDENCE, rawSourceKey),
          readSourceObject(this.env.SOURCE_EVIDENCE, normalizedSourceKey),
        ]);
        if (rawBytes.byteLength !== rawByteCount || normalizedBytes.byteLength !== normalizedByteCount
          || await ticket29Sha256(rawBytes) !== rawSourceSha256
          || await ticket29Sha256(normalizedBytes) !== normalizedSourceSha256) {
          throw new Error("TICKET29_EMPTY_VERSION_SOURCE_MISMATCH");
        }
        const descriptors: Ticket29EvidenceDescriptor[] = [
          { key: ticket29EvidenceKey("raw_capture", rawSourceSha256, "application/octet-stream"),
            kind: "raw_capture", mediaType: "application/octet-stream", sha256: rawSourceSha256,
            byteCount: rawByteCount },
          { key: ticket29EvidenceKey("normalized_revision", normalizedSourceSha256,
            "application/json;charset=utf-8"), kind: "normalized_revision",
            mediaType: "application/json;charset=utf-8", sha256: normalizedSourceSha256,
            byteCount: normalizedByteCount, sourceNormalizedSha256: normalizedSourceSha256 },
        ];
        for (const [index, descriptor] of descriptors.entries()) {
          const stored = await immutableEvidencePut(this.env.EVIDENCE, descriptor,
            index === 0 ? rawBytes : normalizedBytes);
          if (stored.disposition === "created") {
            createdObjectCount += 1;
            createdByteCount += descriptor.byteCount;
          } else {
            reusedObjectCount += 1;
            reusedByteCount += descriptor.byteCount;
          }
          await persistDescriptor(this.env, descriptor, stored.disposition);
        }
        const script = scriptFor(language);
        const instrumentId = await identifier("instrument", sourceDocumentId);
        const officialExpressionId = await identifier("expression",
          `${instrumentId}\u0000${language}\u0000${script}\u0000unknown`);
        const legacyTargetPublisherRevisionToken = ticket29TargetPublisherRevisionToken({
          versionNumber, versionContentSha256: sourceRevisionSha256,
        });
        const publisherRevisionToken = completeCorpusPublisherRevisionToken({
          sourceVersionId, versionDate, versionNumber,
        });
        const sourcePublisherRevisionToken = publisherRevisionToken;
        const textRevisionId = await identifier("revision", [sourceDocumentId, language, script,
          "unknown", sourcePublisherRevisionToken].join("|"));
        const record = { sourceVersionId, sourceDocumentId, instrumentId, officialExpressionId,
          textRevisionId, publisherRevisionToken, legacyTargetPublisherRevisionToken,
          sourcePublisherRevisionToken,
          identityStage: "ticket29-provisional-v1", language, script, versionSourceUrl,
          canonicalSourceUrl, previousSourceVersionId, sourceChangeType, sourceAvailabilityStatus,
          sourceRevisionSha256, rawSourceKey, rawSourceSha256, normalizedSourceKey,
          normalizedSourceSha256, rawObjectKey: descriptors[0]!.key,
          normalizedObjectKey: descriptors[1]!.key, reason: "NO_MATERIALIZED_PROVISIONS" };
        records.push({ ...record, rowSha256: await ticket29Sha256(stableSourceSnapshotJson(record)) });
      }
      const rootSha256 = await ticket29Sha256(stableSourceSnapshotJson(records));
      const aliases = (await Promise.all(records.flatMap((record) => [
        ["raw_capture", record.rawSourceKey],
        ["normalized_revision", record.normalizedSourceKey],
        ["version_url", record.versionSourceUrl],
      ].filter((entry): entry is ["raw_capture" | "normalized_revision" | "version_url", string] =>
        typeof entry[1] === "string" && entry[1].length > 0)
        .map(async ([aliasKind, aliasValue]) => {
          const base = { ownerKind: "source_version", ownerId: String(record.sourceVersionId),
            targetIdentity: String(record.textRevisionId), aliasKind, aliasValue };
          return { ...base, aliasSha256: await ticket29Sha256(aliasValue),
            rowSha256: await ticket29Sha256(stableSourceSnapshotJson(base)) };
        })))).flat();
      const lineage = await Promise.all(records.map(async (record) => {
        const base = { sourceVersionId: String(record.sourceVersionId),
          previousSourceVersionId: record.previousSourceVersionId,
          changeType: String(record.sourceChangeType) };
        return { ...base, rowSha256: await ticket29Sha256(stableSourceSnapshotJson(base)) };
      }));
      const now = new Date().toISOString();
      await this.env.LEGAL_DB.batch([
        this.env.LEGAL_DB.prepare(`INSERT OR IGNORE INTO legal_complete_corpus_quarantines
          (run_id,source_version_id,source_document_id,instrument_id,official_expression_id,
           text_revision_id,publisher_revision_token,legacy_target_publisher_revision_token,
           source_publisher_revision_token,identity_stage,
           language,script,version_source_url,canonical_source_url,previous_source_version_id,
           source_change_type,source_availability_status,source_revision_sha256,raw_source_r2_key,
           raw_source_sha256,normalized_source_r2_key,normalized_source_sha256,raw_object_r2_key,
           normalized_object_r2_key,reason,row_sha256,created_at)
          SELECT ?,json_extract(value,'$.sourceVersionId'),json_extract(value,'$.sourceDocumentId'),
           json_extract(value,'$.instrumentId'),json_extract(value,'$.officialExpressionId'),
            json_extract(value,'$.textRevisionId'),json_extract(value,'$.publisherRevisionToken'),
            json_extract(value,'$.legacyTargetPublisherRevisionToken'),
           json_extract(value,'$.sourcePublisherRevisionToken'),json_extract(value,'$.identityStage'),
           json_extract(value,'$.language'),json_extract(value,'$.script'),
           json_extract(value,'$.versionSourceUrl'),json_extract(value,'$.canonicalSourceUrl'),
           json_extract(value,'$.previousSourceVersionId'),json_extract(value,'$.sourceChangeType'),
           json_extract(value,'$.sourceAvailabilityStatus'),json_extract(value,'$.sourceRevisionSha256'),
           json_extract(value,'$.rawSourceKey'),json_extract(value,'$.rawSourceSha256'),
           json_extract(value,'$.normalizedSourceKey'),json_extract(value,'$.normalizedSourceSha256'),
           json_extract(value,'$.rawObjectKey'),json_extract(value,'$.normalizedObjectKey'),
           json_extract(value,'$.reason'),json_extract(value,'$.rowSha256'),? FROM json_each(?)`)
           .bind(RUN_ID, now, JSON.stringify(records)),
        this.env.LEGAL_DB.prepare(`INSERT OR IGNORE INTO legal_complete_corpus_aliases
          (run_id,owner_kind,owner_id,target_identity,alias_kind,alias_sha256,alias_value,row_sha256,created_at)
          SELECT ?,json_extract(value,'$.ownerKind'),json_extract(value,'$.ownerId'),
           json_extract(value,'$.targetIdentity'),json_extract(value,'$.aliasKind'),
           json_extract(value,'$.aliasSha256'),json_extract(value,'$.aliasValue'),
           json_extract(value,'$.rowSha256'),? FROM json_each(?)`)
          .bind(RUN_ID, now, JSON.stringify(aliases)),
        this.env.LEGAL_DB.prepare(`INSERT OR IGNORE INTO legal_complete_corpus_lineage_refs
          (run_id,source_version_id,previous_source_version_id,change_type,row_sha256,created_at)
          SELECT ?,json_extract(value,'$.sourceVersionId'),json_extract(value,'$.previousSourceVersionId'),
           json_extract(value,'$.changeType'),json_extract(value,'$.rowSha256'),? FROM json_each(?)`)
          .bind(RUN_ID, now, JSON.stringify(lineage)),
        this.env.LEGAL_DB.prepare(`INSERT OR IGNORE INTO legal_complete_corpus_quarantine_attempts
          (run_id,attempt_id,record_count,created_object_count,reused_object_count,
           created_byte_count,reused_byte_count,root_sha256,completed_at)
          VALUES (?,?,?,?,?,?,?,?,?)`).bind(RUN_ID, `ticket29:quarantine:${payload.proofMode}`,
          records.length, createdObjectCount, reusedObjectCount, createdByteCount, reusedByteCount,
          rootSha256, now),
      ]);
      const readback = await this.env.LEGAL_DB.prepare(`SELECT source_version_id AS sourceVersionId,
          row_sha256 AS rowSha256 FROM legal_complete_corpus_quarantines WHERE run_id=? ORDER BY source_version_id`)
        .bind(RUN_ID).all<{ sourceVersionId: string; rowSha256: string }>();
      const expected = new Map(records.map((record) => [record.sourceVersionId, record.rowSha256]));
      const attempt = await this.env.LEGAL_DB.prepare(`SELECT record_count AS recordCount,
          created_object_count AS createdObjectCount,reused_object_count AS reusedObjectCount,
          created_byte_count AS createdByteCount,reused_byte_count AS reusedByteCount,
          root_sha256 AS rootSha256 FROM legal_complete_corpus_quarantine_attempts
          WHERE run_id=? AND attempt_id=?`).bind(RUN_ID, `ticket29:quarantine:${payload.proofMode}`)
         .first<Record<string, unknown>>();
      const aliasReadback = await this.env.LEGAL_DB.prepare(`SELECT owner_id AS ownerId,
          alias_kind AS aliasKind,row_sha256 AS rowSha256 FROM legal_complete_corpus_aliases
          WHERE run_id=? AND owner_id IN (SELECT value FROM json_each(?))`)
        .bind(RUN_ID, JSON.stringify(records.map((record) => record.sourceVersionId)))
        .all<{ ownerId: string; aliasKind: string; rowSha256: string }>();
      const expectedAliases = new Map(aliases.map((row) =>
        [`${row.ownerId}\u0000${row.aliasKind}`, row.rowSha256]));
      const lineageReadback = await this.env.LEGAL_DB.prepare(`SELECT source_version_id AS sourceVersionId,
          row_sha256 AS rowSha256 FROM legal_complete_corpus_lineage_refs
          WHERE run_id=? AND source_version_id IN (SELECT value FROM json_each(?))`)
        .bind(RUN_ID, JSON.stringify(records.map((record) => record.sourceVersionId)))
        .all<{ sourceVersionId: string; rowSha256: string }>();
      const expectedLineage = new Map(lineage.map((row) => [row.sourceVersionId, row.rowSha256]));
      if (readback.results.length !== records.length || readback.results.some((row) =>
        expected.get(row.sourceVersionId) !== row.rowSha256) || !attempt
        || Number(attempt.recordCount) !== records.length
        || !ticket29AccountingTotalsMatch({
          createdObjectCount: Number(attempt.createdObjectCount),
          reusedObjectCount: Number(attempt.reusedObjectCount),
          createdByteCount: Number(attempt.createdByteCount),
          reusedByteCount: Number(attempt.reusedByteCount),
        }, { createdObjectCount, reusedObjectCount, createdByteCount, reusedByteCount })
        || attempt.rootSha256 !== rootSha256
        || aliasReadback.results.length !== aliases.length || aliasReadback.results.some((row) =>
          expectedAliases.get(`${row.ownerId}\u0000${row.aliasKind}`) !== row.rowSha256)
        || lineageReadback.results.length !== lineage.length || lineageReadback.results.some((row) =>
          expectedLineage.get(row.sourceVersionId) !== row.rowSha256)) {
        throw new Error("TICKET29_EMPTY_VERSION_ROW_CONFLICT");
      }
      return { recordCount: records.length,
        createdObjectCount: Number(attempt.createdObjectCount),
        reusedObjectCount: Number(attempt.reusedObjectCount),
        createdByteCount: Number(attempt.createdByteCount),
        reusedByteCount: Number(attempt.reusedByteCount), rootSha256 };
    });
    return { schemaVersion: 1, runId: RUN_ID, proofMode: payload.proofMode,
      sourceManifestSha256: TICKET29_EMPTY_VERSION_MANIFEST_SHA256, ...result };
  }
}

async function readSourceObject(bucket: R2Bucket, key: string): Promise<Uint8Array> {
  const object = await bucket.get(key);
  if (!object) throw new Error("TICKET29_SOURCE_R2_OBJECT_MISSING");
  return new Uint8Array(await object.arrayBuffer());
}

async function loadHydratedSources(
  env: MaterializationEnv,
  plan: readonly Ticket29PlanItem[],
): Promise<Ticket29HydratedSource[]> {
  const result = await env.SOURCE_DB.prepare(sourceHydrationSql).bind(
    JSON.stringify(plan.map((item) => item.sourceId)), CUTOFF, CUTOFF,
  ).all<SourceRow>();
  const planned = new Map(plan.map((item) => [item.sourceId, item as CompletePlanItem]));
  const objectPromises = new Map<string, Promise<Uint8Array>>();
  const get = (key: string) => {
    let promise = objectPromises.get(key);
    if (!promise) { promise = readSourceObject(env.SOURCE_EVIDENCE, key); objectPromises.set(key, promise); }
    return promise;
  };
  return Promise.all(result.results.map(async (row) => {
    const expected = planned.get(row.id);
    if (!expected || row.text === undefined) throw new Error("TICKET29_SOURCE_ROW_UNPLANNED");
    return {
      ...expected,
      sourceDocumentId: row.documentId,
      sourceVersionId: row.versionId,
      rawBytes: await get(expected.rawSourceKey),
      normalizedBytes: await get(expected.normalizedSourceKey),
      officialBytes: new TextEncoder().encode(row.text),
      language: row.language,
      script: scriptFor(row.language),
      ordinal: row.sequence,
      validFrom: dateInstant(row.validFrom),
      validTo: dateInstant(row.validTo),
      currentEligible: expected.currentEligible,
      historicalEligible: row.validFrom !== null,
      temporalGap: row.validFrom === null,
      quarantined: false,
    };
  }));
}

async function commitPage(
  env: MaterializationEnv,
  planById: ReadonlyMap<string, CompletePlanItem>,
  value: {
    runId: string;
    attemptId: string;
    pageSha256: string;
    planOffset: number;
    planLength: number;
    planKey: string;
    receiptSha256: string;
    records: Ticket29BodyFreeRecord[];
    objects: Array<Ticket29EvidenceDescriptor & { writeDisposition: "created" | "reused" }>;
    createdObjectCount: number;
    reusedObjectCount: number;
    createdByteCount: number;
    reusedByteCount: number;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const records = await Promise.all(value.records.map(async (record) => {
    const merged = { ...record, ...planById.get(record.sourceId) };
    // Retained-locator planning hints are execution inputs, not persisted
    // identity/provenance fields. Excluding them keeps record_sha256 exactly
    // reproducible from the body-free D1 row during isolated reconstruction.
    const { retainedRawLocator: _retainedRawLocator,
      retainedNormalizedLocator: _retainedNormalizedLocator,
      retainedProvisionLocator: _retainedProvisionLocator, ...complete } = merged;
    void _retainedRawLocator;
    void _retainedNormalizedLocator;
    void _retainedProvisionLocator;
    return { ...complete, recordSha256: await ticket29Sha256(stableSourceSnapshotJson(complete)) };
  }));
  const objects = await Promise.all(value.objects.map(async (object) => {
    // Per-source locators live on records/aliases. A content-addressed object can
    // serve multiple source keys, so its immutable descriptor cannot select one.
    const complete = { ...object, sourceR2Key: null };
    const sourceSha256 = object.kind === "raw_capture" ? object.sha256
      : object.kind === "normalized_revision" ? object.sha256 : null;
    const retained = !object.key.startsWith("legal-corpus/complete-v1/");
    const materializationDisposition = ticket29LifecycleDisposition(object.key);
    const descriptorSha256 = await ticket29Sha256(stableSourceSnapshotJson({
      kind: complete.kind, sha256: complete.sha256, key: complete.key,
      byteCount: complete.byteCount, mediaType: complete.mediaType,
      sourceR2Key: complete.sourceR2Key ?? null,
      sourceSha256,
      sourceNormalizedSha256: complete.sourceNormalizedSha256 ?? null,
      schemaVersion: retained ? "ticket12-evidence-v1" : "complete-corpus-evidence-v1",
      normalizationVersion: retained ? "ticket12-qualified-current-v1" : "legal-corpus-normalized-v1",
    }));
    return { ...complete, sourceSha256, materializationDisposition,
      sourceNormalizedSha256: complete.sourceNormalizedSha256 ?? null, descriptorSha256,
      schemaVersion: retained ? "ticket12-evidence-v1" : "complete-corpus-evidence-v1",
      normalizationVersion: retained ? "ticket12-qualified-current-v1" : "legal-corpus-normalized-v1" };
  }));
  const revisions = [...new Map(records.map((record) => [record.sourceVersionId, record])).values()];
  const aliases = (await Promise.all(revisions.flatMap((record) => [
    ["raw_capture", record.rawSourceKey],
    ["normalized_revision", record.normalizedSourceKey],
    ["version_url", record.versionSourceUrl],
  ].filter((entry): entry is ["raw_capture" | "normalized_revision" | "version_url", string] =>
    typeof entry[1] === "string" && entry[1].length > 0)
    .map(async ([aliasKind, aliasValue]) => ({ ownerKind: "source_version", ownerId: record.sourceVersionId,
      targetIdentity: record.textRevisionId, aliasKind, aliasValue,
      aliasSha256: await ticket29Sha256(aliasValue),
      rowSha256: await ticket29Sha256(stableSourceSnapshotJson({ ownerKind: "source_version",
        ownerId: record.sourceVersionId, targetIdentity: record.textRevisionId, aliasKind, aliasValue })) }))))).flat();
  const lineageBase = [...new Map(records.map((record) => [record.sourceVersionId, {
    sourceVersionId: record.sourceVersionId,
    previousSourceVersionId: record.previousSourceVersionId,
    changeType: record.sourceChangeType,
  }])).values()];
  const lineage = await Promise.all(lineageBase.map(async (row) => ({ ...row,
    rowSha256: await ticket29Sha256(stableSourceSnapshotJson(row)) })));
  await env.LEGAL_DB.batch([
    env.LEGAL_DB.prepare(`INSERT OR IGNORE INTO legal_complete_corpus_objects
      (run_id,object_kind,sha256,r2_key,byte_count,materialization_disposition,
       media_type,schema_version,normalization_version,
       source_r2_key,source_sha256,source_normalized_sha256,descriptor_sha256,created_at)
      SELECT ?,json_extract(value,'$.kind'),json_extract(value,'$.sha256'),json_extract(value,'$.key'),
        json_extract(value,'$.byteCount'),json_extract(value,'$.materializationDisposition'),
        json_extract(value,'$.mediaType'),
        json_extract(value,'$.schemaVersion'),json_extract(value,'$.normalizationVersion'),
        json_extract(value,'$.sourceR2Key'),json_extract(value,'$.sourceSha256'),
        json_extract(value,'$.sourceNormalizedSha256'),
        json_extract(value,'$.descriptorSha256'),?
      FROM json_each(?)`).bind(RUN_ID, now, JSON.stringify(objects)),
    env.LEGAL_DB.prepare(`INSERT OR IGNORE INTO legal_complete_corpus_records
      (run_id,source_id,source_document_id,source_version_id,instrument_id,official_expression_id,
       text_revision_id,provision_concept_id,provision_rendition_id,legacy_current_rendition_id,
        publisher_revision_token,legacy_target_publisher_revision_token,
        publisher_provision_token,applicability_identity,
       source_publisher_revision_token,
       identity_stage,
       textual_authority,provision_source_url,version_source_url,
       previous_source_version_id,source_change_type,source_revision_sha256,
       object_metadata_revision_sha256,record_sha256,
       legal_identity_sha256,material_sha256,content_sha256,raw_source_r2_key,raw_source_sha256,
       normalized_source_r2_key,normalized_source_sha256,raw_object_r2_key,
       normalized_object_r2_key,provision_object_r2_key,provision_object_sha256,
       language,script,ordinal,valid_from,valid_to,
       current_eligible,historical_eligible,temporal_gap,quarantined,created_at)
      SELECT ?,json_extract(value,'$.sourceId'),json_extract(value,'$.sourceDocumentId'),
       json_extract(value,'$.sourceVersionId'),json_extract(value,'$.instrumentId'),
       json_extract(value,'$.officialExpressionId'),json_extract(value,'$.textRevisionId'),
       json_extract(value,'$.provisionConceptId'),json_extract(value,'$.provisionRenditionId'),
       json_extract(value,'$.legacyCurrentRenditionId'),json_extract(value,'$.publisherRevisionToken'),
        json_extract(value,'$.legacyTargetPublisherRevisionToken'),
       json_extract(value,'$.publisherProvisionToken'),json_extract(value,'$.applicabilityIdentity'),
       json_extract(value,'$.sourcePublisherRevisionToken'),
       json_extract(value,'$.identityStage'),
       json_extract(value,'$.textualAuthority'),
       json_extract(value,'$.provisionSourceUrl'),
       json_extract(value,'$.versionSourceUrl'),json_extract(value,'$.previousSourceVersionId'),
       json_extract(value,'$.sourceChangeType'),json_extract(value,'$.sourceRevisionSha256'),
       json_extract(value,'$.objectMetadataRevisionSha256'),json_extract(value,'$.recordSha256'),
       json_extract(value,'$.legalIdentitySha256'),
       json_extract(value,'$.materialSha256'),json_extract(value,'$.contentSha256'),
       json_extract(value,'$.rawSourceKey'),json_extract(value,'$.rawSourceSha256'),
       json_extract(value,'$.normalizedSourceKey'),json_extract(value,'$.normalizedSourceSha256'),
       json_extract(value,'$.rawObjectKey'),json_extract(value,'$.normalizedObjectKey'),
       json_extract(value,'$.provisionObjectKey'),json_extract(value,'$.provisionObjectSha256'),
       json_extract(value,'$.language'),
       json_extract(value,'$.script'),json_extract(value,'$.ordinal'),json_extract(value,'$.validFrom'),
       json_extract(value,'$.validTo'),json_extract(value,'$.currentEligible'),
       json_extract(value,'$.historicalEligible'),json_extract(value,'$.temporalGap'),
       json_extract(value,'$.quarantined'),?
      FROM json_each(?)`).bind(RUN_ID, now, JSON.stringify(records)),
    env.LEGAL_DB.prepare(`INSERT OR IGNORE INTO legal_complete_corpus_aliases
      (run_id,owner_kind,owner_id,target_identity,alias_kind,alias_sha256,alias_value,row_sha256,created_at)
      SELECT ?,json_extract(value,'$.ownerKind'),json_extract(value,'$.ownerId'),
       json_extract(value,'$.targetIdentity'),
       json_extract(value,'$.aliasKind'),json_extract(value,'$.aliasSha256'),
       json_extract(value,'$.aliasValue'),json_extract(value,'$.rowSha256'),? FROM json_each(?)`)
      .bind(RUN_ID, now, JSON.stringify(aliases)),
    env.LEGAL_DB.prepare(`INSERT OR IGNORE INTO legal_complete_corpus_lineage_refs
      (run_id,source_version_id,previous_source_version_id,change_type,row_sha256,created_at)
      SELECT ?,json_extract(value,'$.sourceVersionId'),json_extract(value,'$.previousSourceVersionId'),
       json_extract(value,'$.changeType'),json_extract(value,'$.rowSha256'),? FROM json_each(?)`)
      .bind(RUN_ID, now, JSON.stringify(lineage)),
    env.LEGAL_DB.prepare(`INSERT OR IGNORE INTO legal_complete_corpus_pages
      (run_id,page_sha256,plan_offset,plan_length,record_count,created_object_count,
       plan_r2_key,reused_object_count,created_byte_count,reused_byte_count,receipt_sha256,completed_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      RUN_ID, value.pageSha256, value.planOffset, value.planLength, records.length, value.createdObjectCount,
      value.planKey, value.reusedObjectCount, value.createdByteCount, value.reusedByteCount,
      value.receiptSha256, now,
    ),
    env.LEGAL_DB.prepare(`INSERT OR IGNORE INTO legal_complete_corpus_attempt_pages
      (run_id,attempt_id,page_sha256,record_count,created_object_count,reused_object_count,
       created_byte_count,reused_byte_count,receipt_sha256,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(
      RUN_ID, value.attemptId, value.pageSha256, records.length, value.createdObjectCount,
      value.reusedObjectCount, value.createdByteCount, value.reusedByteCount, value.receiptSha256, now,
    ),
  ]);
  const receipt = await env.LEGAL_DB.prepare(`SELECT receipt_sha256 AS receiptSha256,record_count AS recordCount
    ,plan_offset AS planOffset,plan_length AS planLength,plan_r2_key AS planKey
    FROM legal_complete_corpus_pages WHERE run_id=? AND page_sha256=?`).bind(RUN_ID, value.pageSha256)
    .first<{ receiptSha256: string; recordCount: number; planOffset: number; planLength: number;
      planKey: string }>();
  if (!receipt || receipt.receiptSha256 !== value.receiptSha256 || receipt.recordCount !== records.length) {
    throw new Error("TICKET29_PAGE_COMMIT_CONFLICT");
  }
  if (receipt.planOffset !== value.planOffset || receipt.planLength !== value.planLength
    || receipt.planKey !== value.planKey) {
    throw new Error("TICKET29_PAGE_LOCATOR_CONFLICT");
  }
  const attempt = await env.LEGAL_DB.prepare(`SELECT record_count AS recordCount,
      created_object_count AS createdObjectCount,reused_object_count AS reusedObjectCount,
      created_byte_count AS createdByteCount,reused_byte_count AS reusedByteCount,
      receipt_sha256 AS receiptSha256 FROM legal_complete_corpus_attempt_pages
      WHERE run_id=? AND attempt_id=? AND page_sha256=?`)
    .bind(RUN_ID, value.attemptId, value.pageSha256).first<{
      recordCount: number; createdObjectCount: number; reusedObjectCount: number;
      createdByteCount: number; reusedByteCount: number; receiptSha256: string;
    }>();
  if (!attempt || attempt.recordCount !== records.length
    || attempt.createdObjectCount !== value.createdObjectCount
    || attempt.reusedObjectCount !== value.reusedObjectCount
    || attempt.createdByteCount !== value.createdByteCount
    || attempt.reusedByteCount !== value.reusedByteCount
    || attempt.receiptSha256 !== value.receiptSha256) {
    throw new Error("TICKET29_ATTEMPT_PAGE_CONFLICT");
  }
  const recordReadback = await env.LEGAL_DB.prepare(`SELECT source_id AS sourceId,record_sha256 AS recordSha256
    FROM legal_complete_corpus_records WHERE run_id=? AND source_id IN (SELECT value FROM json_each(?))`)
    .bind(RUN_ID, JSON.stringify(records.map((record) => record.sourceId)))
    .all<{ sourceId: string; recordSha256: string }>();
  const expectedRecords = new Map(records.map((record) => [record.sourceId, record.recordSha256]));
  if (recordReadback.results.length !== records.length
    || recordReadback.results.some((record) => expectedRecords.get(record.sourceId) !== record.recordSha256)) {
    throw new Error("TICKET29_RECORD_ROW_CONFLICT");
  }
  const objectReadback = await env.LEGAL_DB.prepare(`SELECT r2_key AS key,descriptor_sha256 AS descriptorSha256
    FROM legal_complete_corpus_objects WHERE run_id=? AND r2_key IN (SELECT value FROM json_each(?))`)
    .bind(RUN_ID, JSON.stringify(objects.map((object) => object.key)))
    .all<{ key: string; descriptorSha256: string }>();
  const expectedObjects = new Map(objects.map((object) => [object.key, object.descriptorSha256]));
  if (objectReadback.results.length !== objects.length
    || objectReadback.results.some((object) => expectedObjects.get(object.key) !== object.descriptorSha256)) {
    throw new Error("TICKET29_OBJECT_ROW_CONFLICT");
  }
  const aliasReadback = await env.LEGAL_DB.prepare(`SELECT owner_id AS ownerId,alias_kind AS aliasKind,
      row_sha256 AS rowSha256 FROM legal_complete_corpus_aliases WHERE run_id=?
      AND owner_id IN (SELECT value FROM json_each(?))`)
    .bind(RUN_ID, JSON.stringify(revisions.map((record) => record.sourceVersionId)))
    .all<{ ownerId: string; aliasKind: string; rowSha256: string }>();
  const expectedAliases = new Map(aliases.map((row) => [`${row.ownerId}\u0000${row.aliasKind}`, row.rowSha256]));
  if (aliasReadback.results.length !== aliases.length || aliasReadback.results.some((row) =>
    expectedAliases.get(`${row.ownerId}\u0000${row.aliasKind}`) !== row.rowSha256)) {
    throw new Error("TICKET29_ALIAS_ROW_CONFLICT");
  }
  const lineageReadback = await env.LEGAL_DB.prepare(`SELECT source_version_id AS sourceVersionId,
      row_sha256 AS rowSha256 FROM legal_complete_corpus_lineage_refs WHERE run_id=?
      AND source_version_id IN (SELECT value FROM json_each(?))`)
    .bind(RUN_ID, JSON.stringify(lineage.map((row) => row.sourceVersionId)))
    .all<{ sourceVersionId: string; rowSha256: string }>();
  const expectedLineage = new Map(lineage.map((row) => [row.sourceVersionId, row.rowSha256]));
  if (lineageReadback.results.length !== lineage.length || lineageReadback.results.some((row) =>
    expectedLineage.get(row.sourceVersionId) !== row.rowSha256)) {
    throw new Error("TICKET29_LINEAGE_ROW_CONFLICT");
  }
}

async function processMessage(env: MaterializationEnv, rawMessage: unknown) {
  const message = ticket29QueueMessageSchema.parse(rawMessage);
  const run = await env.LEGAL_DB.prepare(`SELECT status FROM legal_complete_corpus_runs WHERE id=?`)
    .bind(RUN_ID).first<{ status: string }>();
  if (run?.status !== "building") {
    const committed = await env.LEGAL_DB.prepare(`SELECT receipt_sha256 AS receiptSha256
      FROM legal_complete_corpus_attempt_pages WHERE run_id=? AND attempt_id=? AND page_sha256=?`)
      .bind(RUN_ID, message.attemptId, message.pageSha256).first<{ receiptSha256: string }>();
    if (committed && (run?.status === "materialized" || run?.status === "complete")) {
      return { disposition: "sealed-duplicate" as const, receiptSha256: committed.receiptSha256,
        records: 0, objects: { created: 0, reused: 0, createdBytes: 0, reusedBytes: 0 } };
    }
    throw new Error("TICKET29_RUN_SEALED");
  }
  let currentPlan = new Map<string, CompletePlanItem>();
  return runTicket29MaterializationPage({
    bucket: env.EVIDENCE,
    loadPlan: async ({ planKey, offset, length }) => {
      const object = await env.EVIDENCE.get(planKey, { range: { offset, length } });
      if (!object) throw new Error("TICKET29_PLAN_MISSING");
      const bytes = new Uint8Array(await object.arrayBuffer());
      const parsed = JSON.parse(decoder.decode(bytes).trim()) as CompletePlanItem[];
      currentPlan = new Map(parsed.map((item) => [item.sourceId, item]));
      return bytes;
    },
    loadSource: (plan) => loadHydratedSources(env, plan),
    verifyRetainedObject: async (locator) => {
      const object = await env.EVIDENCE.get(locator.key);
      if (!object || object.size !== locator.byteCount
        || object.customMetadata?.sha256 !== locator.sha256
        || object.customMetadata?.schemaVersion !== "1"
        || object.customMetadata?.objectKind !== locator.kind) {
        throw new Error("TICKET29_RETAINED_OBJECT_MISMATCH");
      }
      return new Uint8Array(await object.arrayBuffer());
    },
    findReceipt: async (runId, pageSha256) => {
      const row = await env.LEGAL_DB.prepare(`SELECT receipt_sha256 AS receiptSha256
        FROM legal_complete_corpus_pages WHERE run_id=? AND page_sha256=?`).bind(runId, pageSha256)
        .first<{ receiptSha256: string }>();
      return row?.receiptSha256 ?? null;
    },
    commitPage: (value) => commitPage(env, currentPlan, value),
    afterObjectCheckpoint: async (checkpoint) => {
      const result = await env.LEGAL_DB.prepare(`INSERT OR IGNORE INTO legal_complete_corpus_interruptions
        (run_id,page_sha256,checkpoint,record_count,created_object_count,reused_object_count,
         created_byte_count,reused_byte_count,recorded_at)
        VALUES (?,?,'objects_durable_before_receipt',?,?,?,?,?,?)`)
        .bind(RUN_ID, message.pageSha256, checkpoint.recordCount, checkpoint.createdObjectCount,
          checkpoint.reusedObjectCount, checkpoint.createdByteCount, checkpoint.reusedByteCount,
          new Date().toISOString()).run();
      if (Number(result.meta.changes ?? 0) === 1) throw new Error("TICKET29_INJECTED_INTERRUPTION");
      const persisted = await env.LEGAL_DB.prepare(`SELECT record_count AS recordCount,
          created_object_count AS createdObjectCount,reused_object_count AS reusedObjectCount,
          created_byte_count AS createdByteCount,reused_byte_count AS reusedByteCount
        FROM legal_complete_corpus_interruptions WHERE run_id=? AND page_sha256=?
          AND checkpoint='objects_durable_before_receipt'`).bind(RUN_ID, message.pageSha256)
        .first<{ recordCount: number; createdObjectCount: number; reusedObjectCount: number;
          createdByteCount: number; reusedByteCount: number }>();
      if (!persisted || persisted.recordCount !== checkpoint.recordCount
        || !ticket29AccountingTotalsMatch(persisted, checkpoint)) {
        throw new Error("TICKET29_INTERRUPTION_CHECKPOINT_CONFLICT");
      }
    },
  }, message);
}

type ManifestRecordRow = {
  sourceId: string;
  sourceDocumentId: string;
  sourceVersionId: string;
  instrumentId: string;
  officialExpressionId: string;
  textRevisionId: string;
  provisionConceptId: string;
  provisionRenditionId: string;
  legacyCurrentRenditionId: string;
  publisherRevisionToken: string;
  legacyTargetPublisherRevisionToken: string;
  sourcePublisherRevisionToken: string;
  publisherProvisionToken: string;
  applicabilityIdentity: string;
  identityStage: "ticket29-provisional-v1";
  textualAuthority: string;
  provisionSourceUrl: string | null;
  versionSourceUrl: string | null;
  previousSourceVersionId: string | null;
  sourceChangeType: string;
  sourceRevisionSha256: string;
  objectMetadataRevisionSha256: string;
  legalIdentitySha256: string;
  materialSha256: string;
  contentSha256: string;
  rawSourceKey: string;
  rawSourceSha256: string;
  normalizedSourceKey: string;
  normalizedSourceSha256: string;
  rawObjectKey: string;
  normalizedObjectKey: string;
  provisionObjectKey: string;
  provisionObjectSha256: string;
  language: SourceRow["language"];
  script: "Latn" | "Cyrl";
  ordinal: number;
  validFrom: string | null;
  validTo: string | null;
  currentEligible: number;
  historicalEligible: number;
  temporalGap: number;
  quarantined: number;
};

const manifestPageSql = `SELECT source_id AS sourceId,source_document_id AS sourceDocumentId,
  source_version_id AS sourceVersionId,instrument_id AS instrumentId,
  official_expression_id AS officialExpressionId,text_revision_id AS textRevisionId,
  provision_concept_id AS provisionConceptId,provision_rendition_id AS provisionRenditionId,
  legacy_current_rendition_id AS legacyCurrentRenditionId,
  publisher_revision_token AS publisherRevisionToken,
  legacy_target_publisher_revision_token AS legacyTargetPublisherRevisionToken,
  publisher_provision_token AS publisherProvisionToken,
  applicability_identity AS applicabilityIdentity,source_publisher_revision_token AS sourcePublisherRevisionToken,
  identity_stage AS identityStage,textual_authority AS textualAuthority,
  provision_source_url AS provisionSourceUrl,version_source_url AS versionSourceUrl,
  previous_source_version_id AS previousSourceVersionId,source_change_type AS sourceChangeType,
  source_revision_sha256 AS sourceRevisionSha256,
  object_metadata_revision_sha256 AS objectMetadataRevisionSha256,
  legal_identity_sha256 AS legalIdentitySha256,
  material_sha256 AS materialSha256,content_sha256 AS contentSha256,
  raw_source_r2_key AS rawSourceKey,raw_source_sha256 AS rawSourceSha256,
  normalized_source_r2_key AS normalizedSourceKey,normalized_source_sha256 AS normalizedSourceSha256,
  raw_object_r2_key AS rawObjectKey,normalized_object_r2_key AS normalizedObjectKey,
  provision_object_r2_key AS provisionObjectKey,provision_object_sha256 AS provisionObjectSha256,
  language,script,ordinal,valid_from AS validFrom,
  valid_to AS validTo,current_eligible AS currentEligible,historical_eligible AS historicalEligible,
  temporal_gap AS temporalGap,quarantined FROM legal_complete_corpus_records
  WHERE run_id=? AND source_id>=? AND source_id<? AND legal_identity_sha256>?
  ORDER BY legal_identity_sha256 LIMIT 1000`;

function bodyFreeRecord(row: ManifestRecordRow): Ticket29BodyFreeRecord {
  return {
    runId: RUN_ID,
    sourceId: row.sourceId,
    sourceDocumentId: row.sourceDocumentId,
    sourceVersionId: row.sourceVersionId,
    instrumentId: row.instrumentId,
    officialExpressionId: row.officialExpressionId,
    textRevisionId: row.textRevisionId,
    provisionConceptId: row.provisionConceptId,
    provisionRenditionId: row.provisionRenditionId,
    legacyCurrentRenditionId: row.legacyCurrentRenditionId,
    publisherRevisionToken: row.publisherRevisionToken,
    legacyTargetPublisherRevisionToken: row.legacyTargetPublisherRevisionToken,
    sourcePublisherRevisionToken: row.sourcePublisherRevisionToken,
    publisherProvisionToken: row.publisherProvisionToken,
    applicabilityIdentity: row.applicabilityIdentity,
    identityStage: row.identityStage,
    textualAuthority: row.textualAuthority,
    provisionSourceUrl: row.provisionSourceUrl,
    versionSourceUrl: row.versionSourceUrl,
    previousSourceVersionId: row.previousSourceVersionId,
    sourceChangeType: row.sourceChangeType,
    sourceRevisionSha256: row.sourceRevisionSha256,
    objectMetadataRevisionSha256: row.objectMetadataRevisionSha256,
    legalIdentitySha256: row.legalIdentitySha256,
    materialSha256: row.materialSha256,
    contentSha256: row.contentSha256,
    rawSourceKey: row.rawSourceKey,
    rawSourceKeySha256: row.rawSourceSha256,
    normalizedSourceKey: row.normalizedSourceKey,
    normalizedSourceKeySha256: row.normalizedSourceSha256,
    rawObjectKey: row.rawObjectKey,
    normalizedObjectKey: row.normalizedObjectKey,
    provisionObjectKey: row.provisionObjectKey,
    provisionObjectSha256: row.provisionObjectSha256,
    language: row.language,
    script: row.script,
    ordinal: row.ordinal,
    validFrom: row.validFrom,
    validTo: row.validTo,
    currentEligible: row.currentEligible === 1,
    historicalEligible: row.historicalEligible === 1,
    temporalGap: row.temporalGap === 1,
    quarantined: row.quarantined === 1,
  };
}

async function persistDescriptor(
  env: MaterializationEnv,
  descriptor: Ticket29EvidenceDescriptor,
  _writeDisposition: "created" | "reused",
  sourceR2Key: string | null = null,
): Promise<void> {
  const materializationDisposition = ticket29LifecycleDisposition(descriptor.key);
  const descriptorSha256 = await ticket29Sha256(stableSourceSnapshotJson({
    kind: descriptor.kind, sha256: descriptor.sha256, key: descriptor.key,
    byteCount: descriptor.byteCount, mediaType: descriptor.mediaType, sourceR2Key,
    sourceSha256: descriptor.kind === "raw_capture" || descriptor.kind === "normalized_revision"
      ? descriptor.sha256 : null,
    sourceNormalizedSha256: descriptor.sourceNormalizedSha256 ?? null,
    schemaVersion: "complete-corpus-evidence-v1", normalizationVersion: "legal-corpus-normalized-v1",
  }));
  await env.LEGAL_DB.prepare(`INSERT OR IGNORE INTO legal_complete_corpus_objects
    (run_id,object_kind,sha256,r2_key,byte_count,materialization_disposition,
     media_type,schema_version,normalization_version,
     source_r2_key,source_sha256,source_normalized_sha256,descriptor_sha256,created_at)
    VALUES (?,?,?,?,?,?,?,'complete-corpus-evidence-v1','legal-corpus-normalized-v1',?,?,?,?,?)`).bind(
    RUN_ID, descriptor.kind, descriptor.sha256, descriptor.key, descriptor.byteCount,
    materializationDisposition, descriptor.mediaType, sourceR2Key,
    descriptor.kind === "raw_capture" || descriptor.kind === "normalized_revision" ? descriptor.sha256 : null,
    descriptor.sourceNormalizedSha256 ?? null, descriptorSha256, new Date().toISOString(),
  ).run();
  const row = await env.LEGAL_DB.prepare(`SELECT descriptor_sha256 AS descriptorSha256,
      materialization_disposition AS materializationDisposition
    FROM legal_complete_corpus_objects WHERE run_id=? AND object_kind=? AND sha256=?`)
    .bind(RUN_ID, descriptor.kind, descriptor.sha256).first<{
      descriptorSha256: string; materializationDisposition: string;
    }>();
  if (row?.descriptorSha256 !== descriptorSha256
    || row.materializationDisposition !== materializationDisposition) {
    throw new Error("TICKET29_OBJECT_ROW_CONFLICT");
  }
}

type StoredEvidence = {
  descriptor: Ticket29EvidenceDescriptor;
  writeDisposition: "created" | "reused";
};

async function putJsonEvidence(
  env: MaterializationEnv,
  kind: "plan" | "manifest" | "reconstruction" | "corpus_snapshot",
  value: unknown,
): Promise<StoredEvidence> {
  const bytes = new TextEncoder().encode(`${stableSourceSnapshotJson(value)}\n`);
  const sha256 = await ticket29Sha256(bytes);
  const descriptor: Ticket29EvidenceDescriptor = {
    key: ticket29EvidenceKey(kind, sha256, "application/json;charset=utf-8"),
    kind,
    mediaType: "application/json;charset=utf-8",
    sha256,
    byteCount: bytes.byteLength,
  };
  const stored = await immutableEvidencePut(env.EVIDENCE, descriptor, bytes);
  await persistDescriptor(env, descriptor, stored.disposition);
  return { descriptor, writeDisposition: stored.disposition };
}

function writeTotals(writes: readonly StoredEvidence[]): {
  createdObjectCount: number; reusedObjectCount: number;
  createdByteCount: number; reusedByteCount: number;
} {
  return writes.reduce((totals, write) => {
    const created = write.writeDisposition === "created";
    totals[created ? "createdObjectCount" : "reusedObjectCount"] += 1;
    totals[created ? "createdByteCount" : "reusedByteCount"] += write.descriptor.byteCount;
    return totals;
  }, { createdObjectCount: 0, reusedObjectCount: 0, createdByteCount: 0, reusedByteCount: 0 });
}

async function persistControlAttempt(env: MaterializationEnv, input: {
  attemptId: "ticket29:first" | "ticket29:second";
  stage: "plan" | "manifest" | "reconstruction" | "finalize";
  lane: string;
  recordCount: number;
  rootSha256: string;
  writes: readonly StoredEvidence[];
}): Promise<void> {
  const totals = writeTotals(input.writes);
  await env.LEGAL_DB.prepare(`INSERT OR IGNORE INTO legal_complete_corpus_control_attempts
    (run_id,attempt_id,stage,lane,record_count,created_object_count,reused_object_count,
     created_byte_count,reused_byte_count,root_sha256,completed_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(
    RUN_ID, input.attemptId, input.stage, input.lane, input.recordCount,
    totals.createdObjectCount, totals.reusedObjectCount, totals.createdByteCount,
    totals.reusedByteCount, input.rootSha256, new Date().toISOString(),
  ).run();
  const row = await env.LEGAL_DB.prepare(`SELECT record_count AS recordCount,
      created_object_count AS createdObjectCount,reused_object_count AS reusedObjectCount,
      created_byte_count AS createdByteCount,reused_byte_count AS reusedByteCount,
      root_sha256 AS rootSha256 FROM legal_complete_corpus_control_attempts
      WHERE run_id=? AND attempt_id=? AND stage=? AND lane=?`)
    .bind(RUN_ID, input.attemptId, input.stage, input.lane).first<Record<string, unknown>>();
  const expected = { recordCount: input.recordCount, ...totals, rootSha256: input.rootSha256 };
  if (!row || Object.entries(expected).some(([key, value]) => row[key] !== value)) {
    throw new Error("TICKET29_CONTROL_ATTEMPT_ROW_CONFLICT");
  }
}

async function assertControlStageComplete(env: MaterializationEnv,
  attemptId: "ticket29:first" | "ticket29:second",
  stage: "plan" | "manifest" | "reconstruction" | "finalize",
  expectedRows: number): Promise<void> {
  const state = await env.LEGAL_DB.prepare(`SELECT count(*) AS rows
    FROM legal_complete_corpus_control_attempts WHERE run_id=? AND attempt_id=? AND stage=?`)
    .bind(RUN_ID, attemptId, stage).first<{ rows: number }>();
  if (Number(state?.rows) !== expectedRows) throw new Error("TICKET29_CONTROL_STAGE_INCOMPLETE");
}

async function persistLaneReport(env: MaterializationEnv, input: {
  reportKind: "plan" | "manifest" | "reconstruction";
  lane: string;
  recordCount: number;
  currentCount: number;
  historyCount: number;
  gapCount: number;
  verifiedObjectCount: number;
  rootSha256: string;
  descriptor: Ticket29EvidenceDescriptor;
}): Promise<void> {
  await env.LEGAL_DB.prepare(`INSERT OR IGNORE INTO legal_complete_corpus_lane_reports
    (run_id,report_kind,lane,record_count,current_count,history_count,gap_count,verified_object_count,
     root_sha256,r2_key,report_sha256,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    RUN_ID, input.reportKind, input.lane, input.recordCount, input.currentCount,
    input.historyCount, input.gapCount, input.verifiedObjectCount, input.rootSha256,
    input.descriptor.key, input.descriptor.sha256, new Date().toISOString(),
  ).run();
  const row = await env.LEGAL_DB.prepare(`SELECT record_count AS recordCount,
      current_count AS currentCount,history_count AS historyCount,gap_count AS gapCount,
      verified_object_count AS verifiedObjectCount,root_sha256 AS rootSha256,
      r2_key AS r2Key,report_sha256 AS reportSha256 FROM legal_complete_corpus_lane_reports
      WHERE run_id=? AND report_kind=? AND lane=?`).bind(RUN_ID, input.reportKind, input.lane)
    .first<Record<string, unknown>>();
  const expected = { recordCount: input.recordCount, currentCount: input.currentCount,
    historyCount: input.historyCount, gapCount: input.gapCount,
    verifiedObjectCount: input.verifiedObjectCount, rootSha256: input.rootSha256,
    r2Key: input.descriptor.key, reportSha256: input.descriptor.sha256 };
  if (!row || Object.entries(expected).some(([key, value]) => row[key] !== value)) {
    throw new Error("TICKET29_LANE_REPORT_ROW_CONFLICT");
  }
}

async function persistManifest(env: MaterializationEnv, input: {
  membership: "union" | "current" | "history" | "gaps" | "quarantines";
  recordCount: number;
  rootSha256: string;
  descriptor: Ticket29EvidenceDescriptor;
}): Promise<void> {
  await env.LEGAL_DB.prepare(`INSERT OR IGNORE INTO legal_complete_corpus_manifests
    (run_id,membership,record_count,root_sha256,r2_key,manifest_sha256,created_at)
    VALUES (?,?,?,?,?,?,?)`).bind(RUN_ID, input.membership, input.recordCount, input.rootSha256,
    input.descriptor.key, input.descriptor.sha256, new Date().toISOString()).run();
  const row = await env.LEGAL_DB.prepare(`SELECT record_count AS recordCount,root_sha256 AS rootSha256,
      r2_key AS r2Key,manifest_sha256 AS manifestSha256 FROM legal_complete_corpus_manifests
      WHERE run_id=? AND membership=?`).bind(RUN_ID, input.membership).first<Record<string, unknown>>();
  if (!row || row.recordCount !== input.recordCount || row.rootSha256 !== input.rootSha256
    || row.r2Key !== input.descriptor.key || row.manifestSha256 !== input.descriptor.sha256) {
    throw new Error("TICKET29_MANIFEST_ROW_CONFLICT");
  }
}

function assertLanePayload(payload: LanePayload, pattern: RegExp): void {
  if (payload.schemaVersion !== 1 || !pattern.test(payload.lane)
    || !["first", "second"].includes(payload.proofMode)) {
    throw new Error("TICKET29_LANE_PAYLOAD_INVALID");
  }
}

export class CompleteCorpusManifestLaneWorkflow extends WorkflowEntrypoint<MaterializationEnv, LanePayload> {
  override async run(event: Readonly<WorkflowEvent<LanePayload>>, step: WorkflowStep): Promise<unknown> {
    const payload = typeof event.payload === "string" ? JSON.parse(event.payload) as LanePayload : event.payload;
    assertLanePayload(payload, /^[1-9]$/u);
    await step.do("gate manifest traversal", async () => {
      await assertRunBuilding(this.env);
      await assertSecondTraversalComplete(this.env);
      await assertControlStageComplete(this.env, `ticket29:${payload.proofMode}`, "plan", 9);
      if (payload.proofMode === "second") {
        await assertControlStageComplete(this.env, "ticket29:first", "finalize", 1);
      }
    });
    const bounds = laneBounds(payload.lane as PlannerPayload["lane"]);
    let cursor = "";
    let pageOrdinal = 0;
    const pages: Array<{ descriptor: Ticket29EvidenceDescriptor; counts: {
      union: number; current: number; history: number; gaps: number; quarantines: number;
    }; roots: Record<string, string> }> = [];
    const pageWrites: StoredEvidence[] = [];
    for (;;) {
      const page = await step.do(`manifest lane ${payload.lane} page ${pageOrdinal}`, {
        retries: { limit: 8, delay: "30 seconds", backoff: "exponential" }, timeout: "10 minutes",
      }, async () => {
        const result = await this.env.LEGAL_DB.prepare(manifestPageSql)
          .bind(RUN_ID, bounds.lower, bounds.upper, cursor).all<ManifestRecordRow>();
        if (result.results.length === 0) return null;
        const records = result.results.map(bodyFreeRecord);
        const manifest = await ticket29ManifestRoot(records);
        const value = { schemaVersion: 1, runId: RUN_ID, lane: payload.lane, pageOrdinal, records };
        const write = await putJsonEvidence(this.env, "manifest", value);
        return { descriptor: write.descriptor, writeDisposition: write.writeDisposition,
          counts: manifest.counts, roots: manifest.roots,
          cursor: result.results.at(-1)!.legalIdentitySha256 };
      });
      if (!page) break;
      cursor = page.cursor;
      pages.push({ descriptor: page.descriptor, counts: page.counts, roots: page.roots });
      pageWrites.push({ descriptor: page.descriptor, writeDisposition: page.writeDisposition });
      pageOrdinal += 1;
    }
    const counts = pages.reduce((total, page) => ({
      union: total.union + page.counts.union,
      current: total.current + page.counts.current,
      history: total.history + page.counts.history,
      gaps: total.gaps + page.counts.gaps,
      quarantines: total.quarantines + page.counts.quarantines,
    }), { union: 0, current: 0, history: 0, gaps: 0, quarantines: 0 });
    const roots = Object.fromEntries(await Promise.all(
      ["union", "current", "history", "gaps", "quarantines"].map(async (membership) => [
      membership,
      await ticket29Sha256(stableSourceSnapshotJson(pages.map((page) => ({
        count: page.counts[membership as keyof typeof page.counts],
        rootSha256: page.roots[membership],
      })))),
    ])));
    const report = { schemaVersion: 1, kind: "manifest-lane", runId: RUN_ID,
      lane: payload.lane, pageCount: pages.length, counts, roots,
      pages: pages.map((page) => page.descriptor) };
    const reportWrite = await step.do(`seal manifest lane ${payload.lane}`, async () =>
      putJsonEvidence(this.env, "manifest", report));
    const rootSha256 = await ticket29Sha256(stableSourceSnapshotJson({ counts, roots }));
    await persistLaneReport(this.env, { reportKind: "manifest", lane: payload.lane,
      recordCount: counts.union, currentCount: counts.current, historyCount: counts.history,
      gapCount: counts.gaps, verifiedObjectCount: 0, rootSha256,
      descriptor: reportWrite.descriptor });
    await persistControlAttempt(this.env, { attemptId: `ticket29:${payload.proofMode}`,
      stage: "manifest", lane: payload.lane, recordCount: counts.union, rootSha256,
      writes: [...pageWrites, reportWrite] });
    return { ...report, descriptor: reportWrite.descriptor, rootSha256 };
  }
}

export class CompleteCorpusReconstructionLaneWorkflow extends WorkflowEntrypoint<MaterializationEnv, LanePayload> {
  override async run(event: Readonly<WorkflowEvent<LanePayload>>, step: WorkflowStep): Promise<unknown> {
    const payload = typeof event.payload === "string" ? JSON.parse(event.payload) as LanePayload : event.payload;
    assertLanePayload(payload, /^[0-9a-f]$/u);
    await step.do("gate reconstruction traversal", async () => {
      await assertRunBuilding(this.env);
      await assertManifestTraversalComplete(this.env);
      await assertControlStageComplete(this.env, `ticket29:${payload.proofMode}`, "manifest", 9);
    });
    const lower = payload.lane;
    const upper = payload.lane === "f" ? "g" : (Number.parseInt(payload.lane, 16) + 1).toString(16);
    let cursorSha256 = "";
    let cursorKind = "";
    let pageOrdinal = 0;
    let byteCount = 0;
    const pageRoots: Array<{ count: number; byteCount: number; rootSha256: string }> = [];
    for (;;) {
      const page = await step.do(`reconstruct lane ${payload.lane} page ${pageOrdinal}`, {
        retries: { limit: 8, delay: "30 seconds", backoff: "exponential" }, timeout: "10 minutes",
      }, async () => {
        const result = await this.env.LEGAL_DB.prepare(`SELECT object_kind AS objectKind,sha256,r2_key AS objectKey,
          byte_count AS expectedByteCount FROM legal_complete_corpus_objects
          WHERE run_id=? AND object_kind IN ('raw_capture','normalized_revision','provision_rendition')
          AND sha256>=? AND sha256<? AND (sha256>? OR (sha256=? AND object_kind>?))
          ORDER BY sha256,object_kind LIMIT 100`)
          .bind(RUN_ID, lower, upper, cursorSha256, cursorSha256, cursorKind).all<{
            objectKind: string; sha256: string; objectKey: string; expectedByteCount: number;
          }>();
        if (result.results.length === 0) return null;
        const verified = await Promise.all(result.results.map(async (item) => {
          const object = await this.env.EVIDENCE.get(item.objectKey);
          if (!object) throw new Error("TICKET29_RECONSTRUCTION_OBJECT_MISSING");
          const bytes = new Uint8Array(await object.arrayBuffer());
          if (bytes.byteLength !== item.expectedByteCount || await ticket29Sha256(bytes) !== item.sha256) {
            throw new Error("TICKET29_RECONSTRUCTION_HASH_MISMATCH");
          }
          return { ...item, byteCount: bytes.byteLength };
        }));
        return {
          count: verified.length,
          byteCount: verified.reduce((sum, item) => sum + item.byteCount, 0),
          rootSha256: await ticket29Sha256(stableSourceSnapshotJson(verified)),
          cursorSha256: verified.at(-1)!.sha256,
          cursorKind: verified.at(-1)!.objectKind,
        };
      });
      if (!page) break;
      cursorSha256 = page.cursorSha256;
      cursorKind = page.cursorKind;
      byteCount += page.byteCount;
      pageRoots.push({ count: page.count, byteCount: page.byteCount, rootSha256: page.rootSha256 });
      pageOrdinal += 1;
    }
    const verifiedObjectCount = pageRoots.reduce((sum, page) => sum + page.count, 0);
    const rootSha256 = await ticket29Sha256(stableSourceSnapshotJson(pageRoots));
    const report = { schemaVersion: 1, kind: "reconstruction-lane", runId: RUN_ID,
      lane: payload.lane, pageCount: pageRoots.length, verifiedObjectCount, byteCount,
      missingObjects: 0, hashMismatches: 0, rootSha256, pages: pageRoots };
    const reportWrite = await step.do(`seal reconstruction lane ${payload.lane}`, async () =>
      putJsonEvidence(this.env, "reconstruction", report));
    await persistLaneReport(this.env, { reportKind: "reconstruction", lane: payload.lane,
      recordCount: 0, currentCount: 0, historyCount: 0, gapCount: 0,
      verifiedObjectCount, rootSha256, descriptor: reportWrite.descriptor });
    await persistControlAttempt(this.env, { attemptId: `ticket29:${payload.proofMode}`,
      stage: "reconstruction", lane: payload.lane, recordCount: verifiedObjectCount,
      rootSha256, writes: [reportWrite] });
    return { ...report, descriptor: reportWrite.descriptor };
  }
}

async function verifiedReport<T>(env: MaterializationEnv, row: { r2Key: string; reportSha256: string }): Promise<T> {
  const object = await env.EVIDENCE.get(row.r2Key);
  if (!object) throw new Error("TICKET29_REPORT_MISSING");
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (await ticket29Sha256(bytes) !== row.reportSha256) throw new Error("TICKET29_REPORT_HASH_MISMATCH");
  return JSON.parse(decoder.decode(bytes)) as T;
}

type ReconstructionLaneReport = {
  schemaVersion: number;
  kind: string;
  runId: string;
  lane: string;
  pageCount: number;
  verifiedObjectCount: number;
  byteCount: number;
  missingObjects: number;
  hashMismatches: number;
  rootSha256: string;
  pages: Array<{ count: number; byteCount: number; rootSha256: string }>;
};

async function assertCompleteControlReplay(env: MaterializationEnv): Promise<void> {
  const result = await env.LEGAL_DB.prepare(`SELECT attempt_id AS attemptId,stage,lane,
      record_count AS recordCount,created_object_count AS createdObjectCount,
      reused_object_count AS reusedObjectCount,created_byte_count AS createdByteCount,
      reused_byte_count AS reusedByteCount,root_sha256 AS rootSha256
    FROM legal_complete_corpus_control_attempts WHERE run_id=? ORDER BY attempt_id,stage,lane`)
    .bind(RUN_ID).all<{ attemptId: string; stage: string; lane: string; recordCount: number;
      createdObjectCount: number; reusedObjectCount: number; createdByteCount: number;
      reusedByteCount: number; rootSha256: string }>();
  const expectedKeys = [
    ...[..."123456789"].map((lane) => `plan:${lane}`),
    ...[..."123456789"].map((lane) => `manifest:${lane}`),
    ...[..."0123456789abcdef"].map((lane) => `reconstruction:${lane}`),
    "finalize:all",
  ].sort();
  const rows = (attemptId: string) => result.results.filter((row) => row.attemptId === attemptId)
    .map((row) => ({ ...row, key: `${row.stage}:${row.lane}` }));
  const firstRows = rows("ticket29:first");
  const secondRows = rows("ticket29:second");
  const controlObjects = await env.LEGAL_DB.prepare(`SELECT count(*) AS count,
      coalesce(sum(byte_count),0) AS bytes,
      coalesce(sum(CASE WHEN materialization_disposition='created' THEN 1 ELSE 0 END),0) AS created
    FROM legal_complete_corpus_objects WHERE run_id=?
      AND object_kind IN ('plan','manifest','reconstruction','corpus_snapshot')`)
    .bind(RUN_ID).first<{ count: number; bytes: number; created: number }>();
  const firstCreatedObjects = firstRows.reduce((sum, row) => sum + row.createdObjectCount, 0);
  const firstReusedObjects = firstRows.reduce((sum, row) => sum + row.reusedObjectCount, 0);
  const firstCreatedBytes = firstRows.reduce((sum, row) => sum + row.createdByteCount, 0);
  const firstReusedBytes = firstRows.reduce((sum, row) => sum + row.reusedByteCount, 0);
  if (!ticket29ControlReplayMatches(firstRows, secondRows, expectedKeys)
    || firstCreatedObjects + firstReusedObjects !== Number(controlObjects?.count)
    || Number(controlObjects?.created) !== Number(controlObjects?.count)
    || firstCreatedBytes + firstReusedBytes !== Number(controlObjects?.bytes)) {
    throw new Error("TICKET29_CONTROL_REPLAY_MISMATCH");
  }
}

type FinalizePayload = { schemaVersion: 1; proofMode: ControlProofMode };

export class CompleteCorpusFinalizeWorkflow extends WorkflowEntrypoint<MaterializationEnv, FinalizePayload> {
  override async run(event: Readonly<WorkflowEvent<FinalizePayload>>, step: WorkflowStep): Promise<unknown> {
    const payload = typeof event.payload === "string"
      ? JSON.parse(event.payload) as FinalizePayload : event.payload;
    if (payload.schemaVersion !== 1 || !["first", "second"].includes(payload.proofMode)) {
      throw new Error("TICKET29_FINALIZE_PAYLOAD_INVALID");
    }
    const existingRun = await this.env.LEGAL_DB.prepare(`SELECT status,
        final_reconstruction_r2_key AS r2Key,final_reconstruction_sha256 AS reportSha256
      FROM legal_complete_corpus_runs WHERE id=?`).bind(RUN_ID)
      .first<{ status: string; r2Key: string | null; reportSha256: string | null }>();
    if (!existingRun) throw new Error("TICKET29_FINALIZE_STATE_INVALID");
    const stageDecision = ticket29StageDecision("finalize", existingRun.status);
    if (stageDecision === "replay") {
      if (!existingRun.r2Key || !existingRun.reportSha256) {
        throw new Error("TICKET29_FINALIZED_RUN_INCOMPLETE");
      }
      const report = await verifiedReport<Record<string, unknown>>(this.env, {
        r2Key: existingRun.r2Key, reportSha256: existingRun.reportSha256,
      });
      return { ...report, status: existingRun.status, replayed: true };
    }
    await assertRunBuilding(this.env);
    await step.do("gate finalization", async () => {
      await assertReconstructionTraversalComplete(this.env);
      await assertControlStageComplete(this.env, `ticket29:${payload.proofMode}`, "reconstruction", 16);
    });
    const exact = await step.do("verify exact materialization counts", async () => {
      const row = await this.env.LEGAL_DB.prepare(`SELECT
        count(*) AS records,
        sum(current_eligible) AS currentRecords,
        sum(historical_eligible) AS historicalRecords,
        sum(CASE WHEN current_eligible=1 AND historical_eligible=1 THEN 1 ELSE 0 END) AS overlapRecords,
        sum(temporal_gap) AS gaps,
        sum(quarantined) AS quarantines,
        count(DISTINCT content_sha256) AS distinctBodies,
        count(DISTINCT CASE WHEN raw_object_r2_key IS NOT NULL THEN raw_object_r2_key END) AS rawObjects,
        count(DISTINCT CASE WHEN normalized_object_r2_key IS NOT NULL THEN normalized_object_r2_key END) AS normalizedObjects
        FROM legal_complete_corpus_records WHERE run_id=?`).bind(RUN_ID).first<Record<string, number>>();
      const pages = await this.env.LEGAL_DB.prepare(`SELECT count(*) AS pages,
        coalesce(sum(record_count),0) AS pageRecords FROM legal_complete_corpus_pages WHERE run_id=?`)
        .bind(RUN_ID).first<{ pages: number; pageRecords: number }>();
      const interruptions = await this.env.LEGAL_DB.prepare(`SELECT count(*) AS count,
          coalesce(sum(record_count),0) AS records,coalesce(sum(created_object_count),0) AS createdObjects,
          coalesce(sum(reused_object_count),0) AS reusedObjects,
          coalesce(sum(created_byte_count),0) AS createdBytes,
          coalesce(sum(reused_byte_count),0) AS reusedBytes
        FROM legal_complete_corpus_interruptions WHERE run_id=?`).bind(RUN_ID).first<{
          count: number; records: number; createdObjects: number; reusedObjects: number;
          createdBytes: number; reusedBytes: number;
        }>();
      const attempts = await this.env.LEGAL_DB.prepare(`SELECT attempt_id AS attemptId,
          count(*) AS pages,coalesce(sum(record_count),0) AS records,
          coalesce(sum(created_object_count),0) AS createdObjects,
          coalesce(sum(reused_object_count),0) AS reusedObjects,
          coalesce(sum(created_byte_count),0) AS createdBytes,
          coalesce(sum(reused_byte_count),0) AS reusedBytes
        FROM legal_complete_corpus_attempt_pages WHERE run_id=? GROUP BY attempt_id ORDER BY attempt_id`)
        .bind(RUN_ID).all<{ attemptId: string; pages: number; records: number;
          createdObjects: number; reusedObjects: number; createdBytes: number; reusedBytes: number }>();
      const attemptMismatch = await this.env.LEGAL_DB.prepare(`SELECT
          (SELECT count(*) FROM legal_complete_corpus_attempt_pages first
           LEFT JOIN legal_complete_corpus_attempt_pages second
             ON second.run_id=first.run_id AND second.attempt_id='ticket29:second'
             AND second.page_sha256=first.page_sha256
           WHERE first.run_id=? AND first.attempt_id='ticket29:first'
             AND (second.page_sha256 IS NULL OR second.record_count<>first.record_count
               OR second.receipt_sha256<>first.receipt_sha256))
          +
          (SELECT count(*) FROM legal_complete_corpus_attempt_pages second
           LEFT JOIN legal_complete_corpus_attempt_pages first
             ON first.run_id=second.run_id AND first.attempt_id='ticket29:first'
             AND first.page_sha256=second.page_sha256
           WHERE second.run_id=? AND second.attempt_id='ticket29:second'
             AND first.page_sha256 IS NULL) AS count`).bind(RUN_ID, RUN_ID)
        .first<{ count: number }>();
      const quarantineAttempts = await this.env.LEGAL_DB.prepare(`SELECT attempt_id AS attemptId,
          record_count AS recordCount,created_object_count AS createdObjects,
          reused_object_count AS reusedObjects,created_byte_count AS createdBytes,
          reused_byte_count AS reusedBytes,root_sha256 AS rootSha256
        FROM legal_complete_corpus_quarantine_attempts WHERE run_id=? ORDER BY attempt_id`)
        .bind(RUN_ID).all<{ attemptId: string; recordCount: number; createdObjects: number;
          reusedObjects: number; createdBytes: number; reusedBytes: number; rootSha256: string }>();
      const quarantineCount = await this.env.LEGAL_DB.prepare(`SELECT count(*) AS count
        FROM legal_complete_corpus_quarantines WHERE run_id=?`).bind(RUN_ID).first<{ count: number }>();
      const dataObjects = await this.env.LEGAL_DB.prepare(`SELECT count(*) AS count
        FROM legal_complete_corpus_objects WHERE run_id=?
          AND object_kind IN ('raw_capture','normalized_revision','provision_rendition')`)
        .bind(RUN_ID).first<{ count: number }>();
      const objectKinds = await this.env.LEGAL_DB.prepare(`SELECT object_kind AS objectKind,count(*) AS count
        FROM legal_complete_corpus_objects WHERE run_id=?
          AND object_kind IN ('raw_capture','normalized_revision','provision_rendition')
        GROUP BY object_kind ORDER BY object_kind`).bind(RUN_ID)
        .all<{ objectKind: string; count: number }>();
      const expectedObjects = await this.env.LEGAL_DB.prepare(`SELECT
        (SELECT count(*) FROM (SELECT raw_object_r2_key FROM legal_complete_corpus_records WHERE run_id=?
          UNION SELECT raw_object_r2_key FROM legal_complete_corpus_quarantines WHERE run_id=?)) AS rawObjects,
        (SELECT count(*) FROM (SELECT normalized_object_r2_key FROM legal_complete_corpus_records WHERE run_id=?
          UNION SELECT normalized_object_r2_key FROM legal_complete_corpus_quarantines WHERE run_id=?)) AS normalizedObjects,
        (SELECT count(DISTINCT provision_object_r2_key) FROM legal_complete_corpus_records
          WHERE run_id=?) AS provisionObjects`).bind(RUN_ID, RUN_ID, RUN_ID, RUN_ID, RUN_ID)
        .first<{ rawObjects: number; normalizedObjects: number; provisionObjects: number }>();
      const kindCounts = new Map(objectKinds.results.map((item) => [item.objectKind, Number(item.count)]));
      const firstAttempt = attempts.results.find((attempt) => attempt.attemptId === "ticket29:first");
      const secondAttempt = attempts.results.find((attempt) => attempt.attemptId === "ticket29:second");
      const firstQuarantine = quarantineAttempts.results.find((attempt) =>
        attempt.attemptId === "ticket29:quarantine:first");
      const secondQuarantine = quarantineAttempts.results.find((attempt) =>
        attempt.attemptId === "ticket29:quarantine:second");
      if (!row || Number(row.records) !== EXPECTED_RECORDS || Number(row.currentRecords) !== 160_978
        || Number(row.historicalRecords) !== 1_295_149 || Number(row.gaps) !== 4_679
        || Number(row.overlapRecords) !== 160_978
        || Number(row.distinctBodies) !== 166_754 || Number(row.rawObjects) !== 10_989
        || Number(row.normalizedObjects) !== 10_989 || Number(row.quarantines) !== 0
        || Number(pages?.pageRecords) !== EXPECTED_RECORDS
        || Number(interruptions?.count) !== 1 || attempts.results.length !== 2
        || Number(firstAttempt?.pages) !== Number(pages?.pages)
        || Number(secondAttempt?.pages) !== Number(pages?.pages)
        || Number(firstAttempt?.records) !== EXPECTED_RECORDS
        || Number(secondAttempt?.records) !== EXPECTED_RECORDS
        || Number(secondAttempt?.createdObjects) !== 0
        || Number(secondAttempt?.createdBytes) !== 0
        || Number(secondAttempt?.reusedObjects) !== Number(firstAttempt?.createdObjects)
          + Number(firstAttempt?.reusedObjects)
        || Number(secondAttempt?.reusedBytes) !== Number(firstAttempt?.createdBytes)
          + Number(firstAttempt?.reusedBytes)
        || Number(attemptMismatch?.count) !== 0 || Number(quarantineCount?.count) !== 12
        || quarantineAttempts.results.length !== 2 || firstQuarantine?.recordCount !== 12
        || secondQuarantine?.recordCount !== 12 || secondQuarantine.createdObjects !== 0
        || secondQuarantine.reusedObjects !== 24 || secondQuarantine.createdBytes !== 0
        || secondQuarantine.reusedBytes !== firstQuarantine.createdBytes + firstQuarantine.reusedBytes
        || firstQuarantine.rootSha256 !== secondQuarantine.rootSha256
        || Number(expectedObjects?.rawObjects) !== 11_001
        || Number(expectedObjects?.normalizedObjects) !== 11_001
        || kindCounts.get("raw_capture") !== Number(expectedObjects?.rawObjects)
        || kindCounts.get("normalized_revision") !== Number(expectedObjects?.normalizedObjects)
        || kindCounts.get("provision_rendition") !== Number(expectedObjects?.provisionObjects)
        || Number(dataObjects?.count) !== Number(expectedObjects?.rawObjects)
          + Number(expectedObjects?.normalizedObjects) + Number(expectedObjects?.provisionObjects)) {
        throw new Error("TICKET29_EXACT_RECONCILIATION_FAILED");
      }
      return { ...row, planPages: Number(pages?.pages), planPageRecords: Number(pages?.pageRecords),
        injectedInterruptions: Number(interruptions?.count), attempts: attempts.results,
        interruptionCheckpoint: interruptions,
        firstTraversalCreatedObjects: Number(firstAttempt?.createdObjects)
          + Number(interruptions?.createdObjects),
        firstTraversalCreatedBytes: Number(firstAttempt?.createdBytes) + Number(interruptions?.createdBytes),
        firstTraversalReusedObjects: Number(firstAttempt?.reusedObjects)
          + Number(interruptions?.reusedObjects),
        firstTraversalReusedBytes: Number(firstAttempt?.reusedBytes) + Number(interruptions?.reusedBytes),
        secondTraversalCreatedObjects: Number(secondAttempt?.createdObjects),
        secondTraversalCreatedBytes: Number(secondAttempt?.createdBytes),
        secondTraversalReusedObjects: Number(secondAttempt?.reusedObjects),
        secondTraversalReusedBytes: Number(secondAttempt?.reusedBytes),
        attemptPageMismatches: Number(attemptMismatch?.count), sourceVersionCount: 11_005,
        quarantineCount: 12, quarantineAttempts: quarantineAttempts.results,
        quarantineRootSha256: firstQuarantine.rootSha256,
        dataObjectCount: Number(dataObjects?.count) };
    });
    const manifests = await step.do("read nine manifest lane reports", async () => {
      const rows = await this.env.LEGAL_DB.prepare(`SELECT lane,r2_key AS r2Key,report_sha256 AS reportSha256
        FROM legal_complete_corpus_lane_reports WHERE run_id=? AND report_kind='manifest' ORDER BY lane`)
        .bind(RUN_ID).all<{ lane: string; r2Key: string; reportSha256: string }>();
      if (rows.results.map((row) => row.lane).join("") !== "123456789") {
        throw new Error("TICKET29_MANIFEST_LANES_INCOMPLETE");
      }
      return Promise.all(rows.results.map((row) => verifiedReport<{
        lane: string; counts: Record<string, number>; roots: Record<string, string>;
      }>(this.env, row)));
    });
    const plan = await step.do("seal complete plan manifest", async () => {
      const rows = await this.env.LEGAL_DB.prepare(`SELECT lane,record_count AS recordCount,
          verified_object_count AS planPageCount,root_sha256 AS rootSha256,
          r2_key AS r2Key,report_sha256 AS reportSha256
        FROM legal_complete_corpus_lane_reports WHERE run_id=? AND report_kind='plan' ORDER BY lane`)
        .bind(RUN_ID).all<{ lane: string; recordCount: number; planPageCount: number;
          rootSha256: string; r2Key: string; reportSha256: string }>();
      if (rows.results.map((row) => row.lane).join("") !== "123456789"
        || rows.results.reduce((sum, row) => sum + Number(row.recordCount), 0) !== EXPECTED_RECORDS) {
        throw new Error("TICKET29_PLAN_LANES_INCOMPLETE");
      }
      await Promise.all(rows.results.map((row) => verifiedReport(this.env, row)));
      const value = { schemaVersion: 1, kind: "complete-corpus-plan", runId: RUN_ID,
        sourceCutoff: CUTOFF, recordCount: EXPECTED_RECORDS, lanes: rows.results };
      const write = await putJsonEvidence(this.env, "plan", value);
      return { value, descriptor: write.descriptor, writeDisposition: write.writeDisposition };
    });
    const reconstruction = await step.do("read sixteen evidence reconstruction reports", async () => {
      const rows = await this.env.LEGAL_DB.prepare(`SELECT lane,r2_key AS r2Key,report_sha256 AS reportSha256,
          verified_object_count AS verifiedObjectCount FROM legal_complete_corpus_lane_reports
        WHERE run_id=? AND report_kind='reconstruction' ORDER BY lane`).bind(RUN_ID)
        .all<{ lane: string; r2Key: string; reportSha256: string; verifiedObjectCount: number }>();
      if (rows.results.map((row) => row.lane).join("") !== "0123456789abcdef"
        || rows.results.reduce((sum, row) => sum + row.verifiedObjectCount, 0)
          !== exact.dataObjectCount) {
        throw new Error("TICKET29_RECONSTRUCTION_LANES_INCOMPLETE");
      }
      return Promise.all(rows.results.map((row) => verifiedReport<ReconstructionLaneReport>(this.env, row)));
    });
    const finalManifests: Record<string, { count: number; rootSha256: string;
      descriptor: Ticket29EvidenceDescriptor; writeDisposition: "created" | "reused" }> = {};
    for (const membership of ["union", "current", "history", "gaps", "quarantines"] as const) {
      const provisionLanes = manifests.map((manifest) => ({ lane: manifest.lane,
        count: manifest.counts[membership], rootSha256: manifest.roots[membership] }));
      const quarantineLane = { lane: "quarantine", count: 12,
        rootSha256: exact.quarantineRootSha256 };
      const lanes = membership === "union" ? [...provisionLanes, quarantineLane]
        : membership === "quarantines" ? [quarantineLane] : provisionLanes;
      const count = lanes.reduce((sum, lane) => sum + lane.count, 0);
      const rootSha256 = await ticket29Sha256(stableSourceSnapshotJson(lanes));
      const value = { schemaVersion: 1, kind: "complete-corpus-manifest", runId: RUN_ID,
        membership, count, rootSha256, sourceCutoff: CUTOFF, sourceInventorySha256: SOURCE_INVENTORY_SHA256,
        sourceCanonicalSha256: SOURCE_CANONICAL_SHA256, sourceAliasSha256: SOURCE_ALIAS_SHA256, lanes };
      const write = await step.do(`seal ${membership} manifest`, async () =>
        putJsonEvidence(this.env, "manifest", value));
      await persistManifest(this.env, { membership, recordCount: count, rootSha256,
        descriptor: write.descriptor });
      finalManifests[membership] = { count, rootSha256, descriptor: write.descriptor,
        writeDisposition: write.writeDisposition };
    }
    if (finalManifests.union.count !== EXPECTED_RECORDS + 12 || finalManifests.current.count !== 160_978
      || finalManifests.history.count !== 1_295_149 || finalManifests.gaps.count !== 4_679
      || finalManifests.quarantines.count !== 12) {
      throw new Error("TICKET29_FINAL_MANIFEST_COUNT_MISMATCH");
    }
    const snapshot = await step.do("seal body-free Corpus Snapshot mirror", async () => {
      const value = { schemaVersion: 1, kind: "complete-corpus-snapshot", snapshotId: RUN_ID,
        sourceCutoff: CUTOFF, sourceBookmark: SOURCE_BOOKMARK,
        sourceInventorySha256: SOURCE_INVENTORY_SHA256,
        sourceCanonicalSha256: SOURCE_CANONICAL_SHA256, sourceAliasSha256: SOURCE_ALIAS_SHA256,
        counts: { provisions: EXPECTED_RECORDS, sourceVersions: 11_005, quarantines: 12,
          union: EXPECTED_RECORDS + 12, current: 160_978, history: 1_295_149, gaps: 4_679,
          distinctBodies: 166_754 },
        manifests: Object.fromEntries(Object.entries(finalManifests).map(([membership, manifest]) =>
          [membership, { key: manifest.descriptor.key, sha256: manifest.descriptor.sha256,
            byteCount: manifest.descriptor.byteCount }])),
        manifestRoots: Object.fromEntries(Object.entries(finalManifests)
          .map(([membership, manifest]) => [membership, manifest.rootSha256])) };
      const write = await putJsonEvidence(this.env, "corpus_snapshot", value);
      const descriptor = write.descriptor;
      await this.env.LEGAL_DB.prepare(`INSERT OR IGNORE INTO legal_complete_corpus_snapshots
        (run_id,snapshot_id,source_cutoff,source_inventory_sha256,source_canonical_sha256,
         source_alias_sha256,union_root_sha256,current_root_sha256,history_root_sha256,
         gaps_root_sha256,quarantines_root_sha256,r2_key,snapshot_sha256,byte_count,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        RUN_ID, RUN_ID, CUTOFF, SOURCE_INVENTORY_SHA256, SOURCE_CANONICAL_SHA256, SOURCE_ALIAS_SHA256,
        finalManifests.union.rootSha256, finalManifests.current.rootSha256,
        finalManifests.history.rootSha256, finalManifests.gaps.rootSha256,
        finalManifests.quarantines.rootSha256, descriptor.key, descriptor.sha256,
        descriptor.byteCount, new Date().toISOString(),
      ).run();
      const persisted = await this.env.LEGAL_DB.prepare(`SELECT r2_key AS r2Key,
        snapshot_sha256 AS snapshotSha256,byte_count AS byteCount
        FROM legal_complete_corpus_snapshots WHERE run_id=?`).bind(RUN_ID)
        .first<{ r2Key: string; snapshotSha256: string; byteCount: number }>();
      if (persisted?.r2Key !== descriptor.key || persisted.snapshotSha256 !== descriptor.sha256
        || persisted.byteCount !== descriptor.byteCount) throw new Error("TICKET29_SNAPSHOT_ROW_CONFLICT");
      return { value, descriptor, writeDisposition: write.writeDisposition };
    });
    const reconstructionRootSha256 = await ticket29Sha256(stableSourceSnapshotJson(reconstruction));
    const stableFinalManifests = Object.fromEntries(Object.entries(finalManifests)
      .map(([membership, { count, rootSha256, descriptor }]) =>
        [membership, { count, rootSha256, descriptor }]));
    const finalReport = { schemaVersion: 1, kind: "complete-corpus-reconstruction", runId: RUN_ID,
      isolated: false, sourceBindingsUsed: 0, providerRequests: 0, derivativeIndexMutations: 0,
      exact, manifests: stableFinalManifests,
      snapshot: { value: snapshot.value, descriptor: snapshot.descriptor },
      reconstructionLaneCount: reconstruction.length,
      reconstructionRootSha256, missingObjects: 0, hashMismatches: 0 };
    const reportWrite = await step.do("seal isolated reconstruction", async () =>
      putJsonEvidence(this.env, "reconstruction", finalReport));
    const finalWrites: StoredEvidence[] = [
      { descriptor: plan.descriptor, writeDisposition: plan.writeDisposition },
      ...Object.values(finalManifests).map(({ descriptor, writeDisposition }) =>
        ({ descriptor, writeDisposition })),
      { descriptor: snapshot.descriptor, writeDisposition: snapshot.writeDisposition },
      reportWrite,
    ];
    const controlRootSha256 = await ticket29Sha256(stableSourceSnapshotJson(
      finalWrites.map(({ descriptor }) => descriptor),
    ));
    await persistControlAttempt(this.env, { attemptId: `ticket29:${payload.proofMode}`,
      stage: "finalize", lane: "all", recordCount: EXPECTED_RECORDS,
      rootSha256: controlRootSha256, writes: finalWrites });
    if (payload.proofMode === "first") {
      return { ...finalReport, qualificationPending: true, plan,
        descriptor: reportWrite.descriptor, proofMode: payload.proofMode };
    }
    await step.do("verify complete control replay", async () => assertCompleteControlReplay(this.env));
    await step.do("mark corpus materialized", async () => {
      await this.env.LEGAL_DB.prepare(`UPDATE legal_complete_corpus_runs SET status='materialized',
        plan_r2_key=?,plan_sha256=?,final_reconstruction_r2_key=?,final_reconstruction_sha256=?,
        materialized_record_count=?,updated_at=?,completed_at=NULL
        WHERE id=? AND status='building'`).bind(
        plan.descriptor.key, plan.descriptor.sha256, reportWrite.descriptor.key,
        reportWrite.descriptor.sha256,
        EXPECTED_RECORDS, new Date().toISOString(), RUN_ID,
      ).run();
      const persisted = await this.env.LEGAL_DB.prepare(`SELECT status,plan_sha256 AS planSha256,
          final_reconstruction_sha256 AS reconstructionSha256,materialized_record_count AS records
        FROM legal_complete_corpus_runs WHERE id=?`).bind(RUN_ID)
        .first<{ status: string; planSha256: string; reconstructionSha256: string; records: number }>();
      if (persisted?.status !== "materialized" || persisted.planSha256 !== plan.descriptor.sha256
        || persisted.reconstructionSha256 !== reportWrite.descriptor.sha256
        || Number(persisted.records) !== EXPECTED_RECORDS) {
        throw new Error("TICKET29_MATERIALIZED_TRANSITION_FAILED");
      }
    });
    return { ...finalReport, qualificationPending: true, plan,
      descriptor: reportWrite.descriptor, proofMode: payload.proofMode };
  }
}

type IsolatedQualificationPayload = {
  schemaVersion: 1;
  report: {
    schemaVersion: 1;
    kind: "ticket29-isolated-reconstruction";
    contentFree: true;
    isolated: true;
    accountId: string;
    bucket: string;
    runId: string;
    sourceBindingsUsed: number;
    sourceDatabaseReads: number;
    providerRequests: number;
    derivativeIndexMutations: number;
    databaseIntegrity: string;
    foreignKeyViolations: number;
    bodyFields: number;
    databaseExportSha256: string;
    databaseExportByteCount: number;
    counts: Record<string, number>;
    ticket28Roots: Record<string, string>;
    targetManifestRoots: Record<string, string>;
    provenanceGaps: number;
    identityMismatches: number;
    aliasRowMismatches: number;
    lineageRowMismatches: number;
    quarantineRowMismatches: number;
    provenanceJoinMismatches: number;
    locatorMismatches: number;
    orphanObjects: number;
    descriptorMismatches: number;
    recordHashMismatches: number;
    manifestContentMismatches: number;
    snapshotContentMismatches: number;
    attemptParity: Record<string, number>;
    quarantineAttemptParity: Record<string, number>;
    controlAttemptParity: Record<string, number>;
    objects: Record<string, unknown> & { verified: number; missing: number;
      verifiedBytes: number; hashMismatches: number; byteCountMismatches: number;
      listed: number; listedMetadataMismatches: number; extraPrefixObjects: number;
      completeNamespaceObjects: number;
      retainedObjects: number;
      dispositions: Record<"created" | "reused", { count: number; bytes: number }>;
      evidenceRootSha256: string };
  };
};

export class CompleteCorpusQualifyWorkflow extends WorkflowEntrypoint<
  MaterializationEnv, IsolatedQualificationPayload
> {
  override async run(event: Readonly<WorkflowEvent<IsolatedQualificationPayload>>,
    step: WorkflowStep): Promise<unknown> {
    const payload = typeof event.payload === "string"
      ? JSON.parse(event.payload) as IsolatedQualificationPayload : event.payload;
    const report = payload.report;
    if (payload.schemaVersion !== 1 || report?.schemaVersion !== 1
      || report.kind !== "ticket29-isolated-reconstruction" || report.contentFree !== true
      || report.isolated !== true || report.accountId !== ACCOUNT_ID
      || report.bucket !== "juro-legal-evidence-staging-green2-20260831" || report.runId !== RUN_ID
      || report.sourceBindingsUsed !== 0 || report.sourceDatabaseReads !== 0
      || report.providerRequests !== 0 || report.derivativeIndexMutations !== 0
      || report.databaseIntegrity !== "ok" || report.foreignKeyViolations !== 0
      || report.bodyFields !== 0 || report.provenanceGaps !== 0
      || report.identityMismatches !== 0 || report.aliasRowMismatches !== 0
      || report.lineageRowMismatches !== 0 || report.quarantineRowMismatches !== 0
      || report.provenanceJoinMismatches !== 0 || report.locatorMismatches !== 0
      || report.orphanObjects !== 0 || report.descriptorMismatches !== 0
      || report.recordHashMismatches !== 0 || report.manifestContentMismatches !== 0
      || report.snapshotContentMismatches !== 0
      || report.attemptParity.firstRecords !== EXPECTED_RECORDS
      || report.attemptParity.secondRecords !== EXPECTED_RECORDS
      || report.attemptParity.secondCreated !== 0 || report.attemptParity.mismatches !== 0
      || report.attemptParity.secondCreatedBytes !== 0
      || report.attemptParity.secondReusedBytes !== report.attemptParity.firstRefBytes
      || report.attemptParity.firstPages !== report.attemptParity.secondPages
      || report.attemptParity.secondReused !== report.attemptParity.firstRefs
      || report.quarantineAttemptParity.firstRecords !== 12
      || report.quarantineAttemptParity.secondRecords !== 12
      || report.quarantineAttemptParity.secondCreated !== 0
      || report.quarantineAttemptParity.secondReused !== 24
      || report.quarantineAttemptParity.secondCreatedBytes !== 0
      || report.quarantineAttemptParity.secondReusedBytes
        !== report.quarantineAttemptParity.firstRefBytes
      || report.controlAttemptParity.firstRows !== 35
      || report.controlAttemptParity.secondRows !== 35
      || report.controlAttemptParity.secondCreated !== 0
      || report.controlAttemptParity.secondCreatedBytes !== 0
      || report.controlAttemptParity.secondReused !== report.controlAttemptParity.firstRefs
      || report.controlAttemptParity.secondReusedBytes
        !== report.controlAttemptParity.firstRefBytes
      || report.controlAttemptParity.mismatches !== 0
      || report.counts.records !== EXPECTED_RECORDS || report.counts.current !== 160_978
      || report.counts.history !== 1_295_149 || report.counts.gaps !== 4_679
      || report.counts.quarantines !== 12 || report.counts.sourceVersions !== 11_005
      || report.counts.union !== EXPECTED_RECORDS + 12 || report.counts.distinctBodies !== 166_754
      || report.ticket28Roots.inventorySha256 !== SOURCE_INVENTORY_SHA256
      || report.ticket28Roots.canonicalSha256 !== SOURCE_CANONICAL_SHA256
      || report.ticket28Roots.aliasSha256 !== SOURCE_ALIAS_SHA256
      || report.objects.missing !== 0 || report.objects.hashMismatches !== 0
      || report.objects.byteCountMismatches !== 0 || report.objects.extraPrefixObjects !== 0
      || report.objects.listedMetadataMismatches !== 0
      || report.objects.listed !== report.objects.verified
      || report.objects.listed !== report.objects.completeNamespaceObjects + report.objects.retainedObjects
      || report.objects.dispositions.created.count + report.objects.dispositions.reused.count
        !== report.objects.verified
      || report.objects.dispositions.created.bytes + report.objects.dispositions.reused.bytes
        !== report.objects.verifiedBytes
      || !/^[a-f0-9]{64}$/u.test(report.databaseExportSha256)
      || !/^[a-f0-9]{64}$/u.test(report.objects.evidenceRootSha256)
      || !Number.isSafeInteger(report.databaseExportByteCount) || report.databaseExportByteCount <= 0) {
      throw new Error("TICKET29_ISOLATED_QUALIFICATION_INVALID");
    }
    const manifests = await this.env.LEGAL_DB.prepare(`SELECT membership,root_sha256 AS rootSha256
      FROM legal_complete_corpus_manifests WHERE run_id=? ORDER BY membership`).bind(RUN_ID)
      .all<{ membership: string; rootSha256: string }>();
    const run = await this.env.LEGAL_DB.prepare(`SELECT status FROM legal_complete_corpus_runs WHERE id=?`)
      .bind(RUN_ID).first<{ status: string }>();
    const dataObjects = await this.env.LEGAL_DB.prepare(`SELECT count(*) AS count
      FROM legal_complete_corpus_objects WHERE run_id=?`).bind(RUN_ID).first<{ count: number }>();
    if (!run || !["materialized", "complete"].includes(run.status) || manifests.results.length !== 5
      || manifests.results.some((row) => report.targetManifestRoots[row.membership] !== row.rootSha256)
      || Number(dataObjects?.count) !== report.objects.verified) {
      throw new Error("TICKET29_ISOLATED_QUALIFICATION_REMOTE_MISMATCH");
    }
    const reportBytes = new TextEncoder().encode(`${stableSourceSnapshotJson(report)}\n`);
    const reportSha256 = await ticket29Sha256(reportBytes);
    const expectedDescriptor: Ticket29EvidenceDescriptor = { key: ticket29EvidenceKey(
      "qualification", reportSha256, "application/json;charset=utf-8"), kind: "qualification",
      mediaType: "application/json;charset=utf-8", sha256: reportSha256,
      byteCount: reportBytes.byteLength };
    const stageDecision = ticket29StageDecision("qualify", run.status);
    if (stageDecision === "replay") {
      const qualification = await this.env.LEGAL_DB.prepare(`SELECT report_r2_key AS reportR2Key,
          report_sha256 AS reportSha256,report_write_disposition AS reportWriteDisposition
        FROM legal_complete_corpus_qualifications WHERE run_id=?`)
        .bind(RUN_ID).first<{ reportR2Key: string; reportSha256: string;
          reportWriteDisposition: "created" | "reused" }>();
      if (qualification?.reportR2Key !== expectedDescriptor.key
        || qualification.reportSha256 !== expectedDescriptor.sha256) {
        throw new Error("TICKET29_COMPLETED_QUALIFICATION_MISMATCH");
      }
      await immutableEvidencePut(this.env.EVIDENCE, expectedDescriptor, reportBytes);
      return { schemaVersion: 1, runId: RUN_ID, status: "complete",
        descriptor: expectedDescriptor, writeDisposition: qualification.reportWriteDisposition,
        replayed: true };
    }
    const reportWrite = await step.do("persist isolated reconstruction report", async () => {
      const result = await immutableEvidencePut(this.env.EVIDENCE, expectedDescriptor, reportBytes);
      return { descriptor: expectedDescriptor, disposition: result.disposition };
    });
    const descriptor = reportWrite.descriptor;
    await step.do("qualify materialized corpus", async () => {
      const now = new Date().toISOString();
      const current = await this.env.LEGAL_DB.prepare(`SELECT status
        FROM legal_complete_corpus_runs WHERE id=?`).bind(RUN_ID).first<{ status: string }>();
      const currentDecision = ticket29StageDecision("qualify", current?.status ?? "missing");
      if (currentDecision === "execute") {
        await this.env.LEGAL_DB.prepare(`INSERT OR IGNORE INTO legal_complete_corpus_qualifications
          (run_id,report_r2_key,report_sha256,report_byte_count,report_write_disposition,database_export_sha256,
           database_export_byte_count,evidence_object_count,evidence_byte_count,
           evidence_root_sha256,qualified_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(
          RUN_ID, descriptor.key, descriptor.sha256, descriptor.byteCount, reportWrite.disposition,
          report.databaseExportSha256, report.databaseExportByteCount, report.objects.verified,
          report.objects.verifiedBytes, report.objects.evidenceRootSha256, now,
        ).run();
      }
      const qualification = await this.env.LEGAL_DB.prepare(`SELECT report_r2_key AS reportR2Key,
          report_sha256 AS reportSha256,report_byte_count AS reportByteCount,
          report_write_disposition AS reportWriteDisposition,
          database_export_sha256 AS databaseExportSha256,
          database_export_byte_count AS databaseExportByteCount,evidence_object_count AS evidenceObjectCount,
          evidence_byte_count AS evidenceByteCount,evidence_root_sha256 AS evidenceRootSha256
        FROM legal_complete_corpus_qualifications WHERE run_id=?`).bind(RUN_ID)
        .first<Record<string, unknown>>();
      const expectedQualification: Record<string, unknown> = { reportR2Key: descriptor.key,
        reportSha256: descriptor.sha256, reportByteCount: descriptor.byteCount,
        reportWriteDisposition: reportWrite.disposition,
        databaseExportSha256: report.databaseExportSha256,
        databaseExportByteCount: report.databaseExportByteCount,
        evidenceObjectCount: report.objects.verified, evidenceByteCount: report.objects.verifiedBytes,
        evidenceRootSha256: report.objects.evidenceRootSha256 };
      if (!qualification || Object.entries(expectedQualification).some(([key, value]) =>
        qualification[key] !== value)) throw new Error("TICKET29_QUALIFICATION_ROW_CONFLICT");
      if (currentDecision === "execute") {
        await this.env.LEGAL_DB.prepare(`UPDATE legal_complete_corpus_runs SET status='complete',
          updated_at=?,completed_at=? WHERE id=? AND status='materialized'`).bind(now, now, RUN_ID).run();
      }
      const qualified = await this.env.LEGAL_DB.prepare(`SELECT status,completed_at AS completedAt
        FROM legal_complete_corpus_runs WHERE id=?`).bind(RUN_ID)
        .first<{ status: string; completedAt: string | null }>();
      if (qualified?.status !== "complete" || !qualified.completedAt) {
        throw new Error("TICKET29_ISOLATED_QUALIFICATION_WRITE_FAILED");
      }
    });
    return { schemaVersion: 1, runId: RUN_ID, status: "complete", descriptor,
      writeDisposition: reportWrite.disposition,
      ticket28Roots: report.ticket28Roots, targetManifestRoots: report.targetManifestRoots,
      verifiedObjects: report.objects.verified };
  }
}

export default {
  async fetch(): Promise<Response> {
    return new Response(null, { status: 404, headers: { "cache-control": "private, no-store" } });
  },
  async queue(batch: MessageBatch<unknown>, env: MaterializationEnv): Promise<void> {
    for (const message of batch.messages) {
      try {
        const result = await processMessage(env, message.body);
        console.log(JSON.stringify({ event: "ticket29.materialization_page", disposition: result.disposition,
          pageSha256: ticket29QueueMessageSchema.parse(message.body).pageSha256, records: result.records,
          objects: result.objects }));
        message.ack();
      } catch (error) {
        const code = error instanceof Error && /^TICKET29_[A-Z0-9_]+$/u.test(error.message)
          ? error.message : "TICKET29_UNEXPECTED";
        console.error(JSON.stringify({ event: "ticket29.materialization_page_failed", code }));
        message.retry({ delaySeconds: 30 });
      }
    }
  },
} satisfies ExportedHandler<MaterializationEnv, unknown>;
