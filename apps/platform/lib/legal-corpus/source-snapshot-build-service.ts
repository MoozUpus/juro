import { z } from "zod";

import {
  legacyProjectionChunkId,
  serializeNeutralSourceSnapshotChunk,
  serializeSourceSnapshotReleaseManifest,
  snapshotProvisionCanonicalIdentity,
  sourceDocumentCanonicalIdentity,
  sourceSnapshotChunkKey,
  sourceSnapshotCanonicalIdentity,
  sourceSnapshotSha256,
  sourceSnapshotShardId,
  stableSourceSnapshotJson,
} from "./source-snapshot";

export const SOURCE_SNAPSHOT_BUILD_ROOT = "/internal/legal-corpus/source-snapshot-build/";
const START_PATH = `${SOURCE_SNAPSHOT_BUILD_ROOT}start`;
const ADVANCE_PATH = `${SOURCE_SNAPSHOT_BUILD_ROOT}advance`;
const RECONCILE_PATH = `${SOURCE_SNAPSHOT_BUILD_ROOT}reconcile`;
const FINALIZE_PATH = `${SOURCE_SNAPSHOT_BUILD_ROOT}finalize`;
const DRY_RUN_PATH = `${SOURCE_SNAPSHOT_BUILD_ROOT}dry-run`;
const REPLAY_PATH = `${SOURCE_SNAPSHOT_BUILD_ROOT}replay`;
const QUALIFY_PATH = `${SOURCE_SNAPSHOT_BUILD_ROOT}qualify`;
const RELEASE_ID = "release:staging:current:source-snapshot-v1";
const SNAPSHOT_ID = "snapshot:staging:current:source-snapshot-v1";
const BUILD_ID = "build:staging:current:source-snapshot-qualification-v2";
const CUTOFF = "2026-08-31T06:26:27.2253695Z";
const CONFIGURATION_ID = "ai-search-staging-v1";
const PROJECTION_BATCH_SIZE = 32;
const RECONCILIATION_PAGE_SIZE = 5_000;
const R2_RECONCILIATION_PAGE_SIZE = 250;

const inputSchema = z.object({
  buildId: z.literal(BUILD_ID).default(BUILD_ID),
  injectPartialFailure: z.boolean().optional(),
  lane: z.string().regex(/^[a-f0-9]{2}$/u).optional(),
  runId: z.enum(["baseline", "repeat"]).optional(),
  qualification: z.object({
    recoverySqlSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    recoverySqliteSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    validationSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    standardsReviewSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    specReviewSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  }).strict().optional(),
}).strict();

const provisionObjectSchema = z.object({
  schemaVersion: z.literal(1),
  provisionRenditionId: z.string(),
  publisherInstrumentToken: z.string(),
  publisherProvisionToken: z.string(),
  languageTag: z.enum(["uz-Latn", "uz-Cyrl", "ru", "en"]),
  actTitle: z.string(),
  documentType: z.string(),
  articleNumber: z.string(),
  articleTitle: z.string().nullable(),
  provisionSequence: z.number().int().nonnegative(),
  provisionText: z.string().min(1),
  sourceUrl: z.string().url(),
  capturedAt: z.string(),
  sourceNormalizedSha256: z.string().regex(/^[a-f0-9]{64}$/u),
}).passthrough();

type SourceSnapshotBucketObject = {
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
  customMetadata?: Record<string, string>;
};

type SourceSnapshotBucket = {
  get(key: string): Promise<SourceSnapshotBucketObject | null>;
  put(key: string, value: Uint8Array, options?: {
    onlyIf?: { etagDoesNotMatch: "*" };
    httpMetadata?: { contentType: string };
    customMetadata?: Record<string, string>;
  }): Promise<unknown>;
};

export type SourceSnapshotBuildEnv = {
  APP_ENV: "development" | "staging" | "production";
  LEGAL_DB?: D1Database;
  LEGAL_EVIDENCE_BUCKET?: SourceSnapshotBucket;
  LEGAL_EVIDENCE_BUCKET_NAME?: string;
};

type ProjectionRow = {
  snapshotProvisionId: string;
  sourceSnapshotId: string;
  sourceDocumentId: string;
  publisherDocumentToken: string;
  documentLanguageTag: "uz-Latn" | "uz-Cyrl" | "ru" | "en";
  documentSourceUrl: string;
  publisherRevisionToken: string;
  captureId: string;
  languageTag: "uz-Latn" | "uz-Cyrl" | "ru" | "en";
  capturedAt: string;
  legacyProvisionRenditionId: string;
  provisionKey: string;
  provisionBytes: number;
  provisionSha256: string;
  sourceNormalizedSha256: string;
  sourceUrl: string;
  documentType: string;
  articleNumber: string;
  articleTitle: string | null;
  sequence: number;
  sourcePositionToken: string;
  provisionLocatorId: string;
  temporalState: "current_supported" | "unknown" | "historical_only" | "disputed";
  privacyClass: "public_official_source" | "private" | "unknown";
  currentPointerId: string | null;
  quarantineId: string | null;
  aliasId: string | null;
  rawLocatorId: string;
  rawSha256: string;
  normalizedLocatorId: string;
  normalizedSha256: string;
};

function response(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
    },
  });
}

const stable = stableSourceSnapshotJson;
const sha256 = sourceSnapshotSha256;

function sql(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function values(rows: readonly unknown[][]): string {
  return rows.map((row) => `(${row.map(sql).join(",")})`).join(",");
}

async function requireTarget(env: SourceSnapshotBuildEnv) {
  if (env.APP_ENV !== "staging" || !env.LEGAL_DB || !env.LEGAL_EVIDENCE_BUCKET
    || env.LEGAL_EVIDENCE_BUCKET_NAME !== "juro-legal-evidence-staging-green2-20260831") {
    throw new Error("SOURCE_SNAPSHOT_BUILD_TARGET_REJECTED");
  }
  const control = await env.LEGAL_DB.prepare(`SELECT environment,migration_state AS migrationState,
      evidence_bucket_name AS bucketName FROM legal_target_control WHERE control_key='environment'`)
    .first<{ environment: string; migrationState: string; bucketName: string }>();
  if (control?.environment !== "staging" || !["migrating", "ready"].includes(control.migrationState)
    || control.bucketName !== env.LEGAL_EVIDENCE_BUCKET_NAME) {
    throw new Error("SOURCE_SNAPSHOT_BUILD_TARGET_REJECTED");
  }
  return { db: env.LEGAL_DB, bucket: env.LEGAL_EVIDENCE_BUCKET };
}

const deferredInventoryRows = [
  ["deferred:juro-staging", 43_484,
    "df0ec42b461c15c617e143fa8852012a89e8654feb1d799fa212a2a5a5458274"],
  ["progressed:juro-staging", 29,
    "2796403ed5c5c25c562d23a67ab0cba2b25c897069a1bc16d8d2f07b19337a8a"],
  ["deferred:juro-staging-corpus-v2", 27_689,
    "f3810a062e91b2f1694d8e599925fbac8b232453aff6081934521ef8798afac8"],
  ["deferred:juro-staging-corpus-shard-1", 0,
    "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"],
  ["deferred:juro-staging-corpus-shard-2", 0,
    "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"],
  ["deferred:juro-staging-corpus-shard-3", 23_768,
    "093eee8caa65107b234a0fc5815f021dc2087bcd4b5fbd003e6712f654308307"],
  ["progressed:juro-staging-corpus-shard-3", 2_741,
    "0a43924ad277f96ac7aca10ad564cf6d4d3642772786b9adc7afae211de3a7bd"],
  ["post-cutoff:jobs", 56,
    "7a3743e01168ed3e382c9356310321b9a8cbc8bf76689c8484ed24423edfe999"],
  ["post-cutoff:versions", 29,
    "24ff7426658557b67ecf8e05b51a648c4717be5377a2332c76bd046306808ab0"],
  ["post-cutoff:variants", 24,
    "1b51e7ae6b4ea4dea15e3d7f99a3a046e221bee3391dd8e28d1d5bebd7a08281"],
  ["source-r2:cutoff-missing-outside-selection", 994,
    "a138be90469ff540dfdeaaaa95a18d4243cde18708e5ba6367c46df1829f12c8"],
  ["source-r2:post-cutoff", 5_607,
    "ae069fdfda5ae57e86272563b255c8ffc661ffdf1ba4c624b01b6a164aeee718"],
] as const;

async function startBuild(env: SourceSnapshotBuildEnv) {
  const { db } = await requireTarget(env);
  const existing = await db.prepare(`SELECT id,status,phase FROM legal_source_snapshot_builds WHERE id=?`)
    .bind(BUILD_ID).first<{ id: string; status: string; phase: string }>();
  if (existing) return { status: existing.status, phase: existing.phase, resumed: true };
  const documentsWithoutSnapshots = await db.prepare(`SELECT id,publisher,publisher_document_token AS token,
      language_tag AS languageTag,source_url AS sourceUrl FROM legal_source_documents
    WHERE legacy_expression_id IS NULL ORDER BY id`).all<{
      id: string; publisher: "lex.uz"; token: string; languageTag: string; sourceUrl: string;
    }>();
  const standaloneDocumentIdentities = await Promise.all(documentsWithoutSnapshots.results.map(async (row) => [
    "source_document", row.id, await sourceDocumentCanonicalIdentity({
      publisher: row.publisher, publisherDocumentToken: row.token,
      languageTag: row.languageTag, sourceUrl: row.sourceUrl,
    }), stable({ publisher: row.publisher, publisherDocumentToken: row.token,
      languageTag: row.languageTag, sourceUrl: row.sourceUrl }), CUTOFF,
  ]));
  const statements = [
    db.prepare(`INSERT INTO legal_source_snapshot_builds
      (id,environment,cutoff_at,release_id,configuration_identity,shard_count,status,phase,
       cursor,processed_count,eligible_count,excluded_count,created_at,updated_at)
      VALUES (?,?,?,?,?,1,'building','inventory',NULL,0,0,0,?,?)`).bind(
      BUILD_ID, "staging", CUTOFF, RELEASE_ID, CONFIGURATION_ID, CUTOFF, CUTOFF,
    ),
    ...(standaloneDocumentIdentities.length === 0 ? [] : [db.prepare(`INSERT INTO
      legal_source_snapshot_stable_identities
      (subject_type,subject_id,canonical_identity_sha256,identity_evidence_json,recorded_at)
      VALUES ${values(standaloneDocumentIdentities)}`)]),
    db.prepare(`INSERT INTO legal_source_snapshot_current_pointers
      (id,build_id,source_document_id,source_snapshot_id,evidence_url,verified_at,recorded_at)
      SELECT 'current-pointer:'||snapshot.source_document_id||':'||?, ?,
        snapshot.source_document_id,snapshot.id,expression.source_url,?,?
      FROM legal_source_snapshots snapshot
      JOIN legal_text_revisions revision ON revision.id=snapshot.legacy_text_revision_id
      JOIN legal_official_expressions expression ON expression.id=revision.official_expression_id
      WHERE EXISTS (SELECT 1 FROM legal_snapshot_provisions provision
        JOIN legal_current_provision_pointers pointer
          ON pointer.provision_rendition_id=provision.legacy_provision_rendition_id
        WHERE provision.source_snapshot_id=snapshot.id)
      ORDER BY snapshot.source_document_id`).bind(BUILD_ID, BUILD_ID, CUTOFF, CUTOFF),
    ...deferredInventoryRows.map(([kind, count, inventorySha256]) => db.prepare(`INSERT INTO
      legal_source_snapshot_deferred_inventories
      (build_id,inventory_kind,item_count,inventory_sha256,evidence_json,recorded_at)
      VALUES (?,?,?,?,?,?)`).bind(BUILD_ID, kind, count, inventorySha256, JSON.stringify({
      cutoff: CUTOFF,
      sourceEvidence: "ticket-12-final-audit-20260902/deferred-and-post-cutoff-reconciliation.json",
      selectedCurrentCorpusMissingR2Objects: 0,
    }), CUTOFF)),
    db.prepare(`UPDATE legal_target_control SET migration_state='migrating',updated_at=?
      WHERE control_key='environment' AND migration_state='ready'`).bind(new Date().toISOString()),
    db.prepare(`UPDATE legal_source_snapshot_builds SET phase='projections',cursor=NULL,
      updated_at=? WHERE id=?`).bind(CUTOFF, BUILD_ID),
  ];
  await db.batch(statements);
  return { status: "building", phase: "projections", resumed: false };
}

async function verifiedObject(
  bucket: SourceSnapshotBucket,
  key: string,
  byteCount: number,
  expectedSha256: string,
): Promise<Uint8Array> {
  const object = await bucket.get(key);
  if (!object || object.size !== byteCount) throw new Error("SOURCE_SNAPSHOT_R2_INTEGRITY_FAILED");
  const objectBytes = new Uint8Array(await object.arrayBuffer());
  if (await sha256(objectBytes) !== expectedSha256) throw new Error("SOURCE_SNAPSHOT_R2_INTEGRITY_FAILED");
  return objectBytes;
}

async function immutablePut(
  bucket: SourceSnapshotBucket,
  key: string,
  objectBytes: Uint8Array,
  metadata: Record<string, string>,
): Promise<void> {
  await bucket.put(key, objectBytes, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: metadata,
  });
  const readback = await bucket.get(key);
  if (!readback || readback.size !== objectBytes.byteLength
    || await sha256(new Uint8Array(await readback.arrayBuffer())) !== await sha256(objectBytes)) {
    throw new Error("SOURCE_SNAPSHOT_R2_WRITE_VERIFICATION_FAILED");
  }
}

async function projectVerifiedRow(bucket: SourceSnapshotBucket, row: ProjectionRow) {
  const sourceBytes = await verifiedObject(bucket, row.provisionKey, row.provisionBytes, row.provisionSha256);
  const source = provisionObjectSchema.parse(JSON.parse(new TextDecoder().decode(sourceBytes)) as unknown);
  if (source.provisionRenditionId !== row.legacyProvisionRenditionId
    || source.sourceNormalizedSha256 !== row.sourceNormalizedSha256
    || source.languageTag !== row.languageTag || source.sourceUrl !== row.sourceUrl) {
    throw new Error("SOURCE_SNAPSHOT_PROVENANCE_MISMATCH");
  }
  const sourceDocumentIdentity = await sourceDocumentCanonicalIdentity({
    publisher: "lex.uz", publisherDocumentToken: row.publisherDocumentToken,
    languageTag: row.documentLanguageTag, sourceUrl: row.documentSourceUrl,
  });
  const sourceSnapshotIdentity = await sourceSnapshotCanonicalIdentity({
    sourceDocumentCanonicalIdentity: sourceDocumentIdentity,
    publisherRevisionToken: row.publisherRevisionToken, languageTag: row.languageTag,
    captureId: row.captureId, rawLocatorId: row.rawLocatorId, rawSha256: row.rawSha256,
    normalizedLocatorId: row.normalizedLocatorId, normalizedSha256: row.normalizedSha256,
  });
  const normalizedTextSha256 = await sha256(source.provisionText);
  const snapshotProvisionIdentity = await snapshotProvisionCanonicalIdentity({
    sourceSnapshotCanonicalIdentity: sourceSnapshotIdentity,
    sourcePositionToken: row.sourcePositionToken, normalizedTextSha256,
    provisionLocatorId: row.provisionLocatorId, provisionObjectSha256: row.provisionSha256,
  });
  const canonicalChunkIdValue = legacyProjectionChunkId(row.legacyProvisionRenditionId);
  const shardId = await sourceSnapshotShardId(canonicalChunkIdValue, 1);
  const key = sourceSnapshotChunkKey(RELEASE_ID, shardId, canonicalChunkIdValue);
  const artifact = serializeNeutralSourceSnapshotChunk({
    sourceDocumentId: row.sourceDocumentId, sourceSnapshotId: row.sourceSnapshotId,
    snapshotProvisionId: row.snapshotProvisionId, canonicalChunkId: canonicalChunkIdValue,
    publisher: "lex.uz", publisherDocumentToken: row.publisherDocumentToken,
    publisherRevisionToken: row.publisherRevisionToken, languageTag: row.languageTag,
    sourceUrl: row.sourceUrl, capturedAt: row.capturedAt, documentType: row.documentType,
    articleNumber: row.articleNumber, articleTitle: row.articleTitle, sequence: row.sequence,
    provisionText: source.provisionText, sourceProvisionSha256: row.provisionSha256,
    sourceNormalizedSha256: row.sourceNormalizedSha256,
  });
  const artifactSha256 = await sha256(artifact);
  await verifiedObject(bucket, key, artifact.byteLength, artifactSha256);
  const officialSourceVerified = [row.documentSourceUrl, row.sourceUrl].every((value) => {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && ["lex.uz", "www.lex.uz"].includes(parsed.hostname);
  });
  const reasonCodes = [
    !officialSourceVerified ? "OFFICIAL_SOURCE_IDENTITY_UNSUPPORTED" : null,
    row.currentPointerId === null ? "CURRENT_POINTER_UNVERIFIED" : null,
    row.temporalState !== "current_supported" ? "CURRENT_TEMPORAL_STATE_UNKNOWN" : null,
    row.privacyClass !== "public_official_source" ? "PRIVACY_CLASS_UNSUPPORTED" : null,
    row.quarantineId !== null ? "QUARANTINED" : null,
    row.aliasId !== null ? "CANONICALIZATION_CONFLICT" : null,
  ].filter((reason): reason is string => reason !== null);
  return { row, canonicalChunkId: canonicalChunkIdValue, key, byteCount: artifact.byteLength,
    sha256: artifactSha256, sourceDocumentIdentity, sourceSnapshotIdentity,
    snapshotProvisionIdentity, normalizedTextSha256, officialSourceVerified, reasonCodes };
}

async function advanceBuild(
  env: SourceSnapshotBuildEnv,
  injectPartialFailure: boolean,
  lane?: string,
) {
  const { db, bucket } = await requireTarget(env);
  const build = await db.prepare(`SELECT status,phase,processed_count AS processedCount
    FROM legal_source_snapshot_builds WHERE id=?`).bind(BUILD_ID)
    .first<{ status: string; phase: string; processedCount: number }>();
  if (!build || build.status !== "building") throw new Error("SOURCE_SNAPSHOT_BUILD_NOT_RUNNING");
  if (build.phase !== "projections") return { status: build.status, phase: build.phase, processedCount: build.processedCount };
  const rows = await db.prepare(`SELECT provision.id AS snapshotProvisionId,
      snapshot.id AS sourceSnapshotId,document.id AS sourceDocumentId,
      document.publisher_document_token AS publisherDocumentToken,
      document.language_tag AS documentLanguageTag,document.source_url AS documentSourceUrl,
      snapshot.publisher_revision_token AS publisherRevisionToken,snapshot.capture_id AS captureId,
      snapshot.language_tag AS languageTag,
      snapshot.captured_at AS capturedAt,rendition.id AS legacyProvisionRenditionId,
      locator.r2_key AS provisionKey,locator.byte_count AS provisionBytes,
      locator.sha256 AS provisionSha256,locator.source_normalized_sha256 AS sourceNormalizedSha256,
      provision.source_url AS sourceUrl,instrument.document_type AS documentType,
      rendition.article_number AS articleNumber,rendition.article_title AS articleTitle,
      rendition.sequence AS sequence,provision.source_position_token AS sourcePositionToken,
      provision.provision_locator_id AS provisionLocatorId,provision.temporal_state AS temporalState,
      provision.privacy_class AS privacyClass,pointer.provision_rendition_id AS currentPointerId,
      quarantine.id AS quarantineId,alias.id AS aliasId,snapshot.raw_locator_id AS rawLocatorId,
      raw.sha256 AS rawSha256,snapshot.normalized_locator_id AS normalizedLocatorId,
      normalized.sha256 AS normalizedSha256
    FROM legal_snapshot_provisions provision
    JOIN legal_source_snapshots snapshot ON snapshot.id=provision.source_snapshot_id
    JOIN legal_source_documents document ON document.id=snapshot.source_document_id
    JOIN legal_provision_renditions rendition ON rendition.id=provision.legacy_provision_rendition_id
    JOIN legal_instruments instrument ON instrument.id=document.legacy_instrument_id
    JOIN legal_evidence_locators locator ON locator.id=provision.provision_locator_id
    JOIN legal_evidence_locators raw ON raw.id=snapshot.raw_locator_id
    JOIN legal_evidence_locators normalized ON normalized.id=snapshot.normalized_locator_id
    JOIN legal_canonical_chunks chunk ON chunk.snapshot_provision_id=provision.id AND chunk.ordinal=0
    LEFT JOIN legal_retrieval_eligibility eligibility ON eligibility.snapshot_provision_id=provision.id
      AND eligibility.capability='current' AND eligibility.build_id=?
    LEFT JOIN legal_current_provision_pointers pointer
      ON pointer.provision_rendition_id=rendition.id
    LEFT JOIN legal_source_snapshot_quarantines quarantine
      ON quarantine.source_document_id=document.id
    LEFT JOIN legal_source_snapshot_aliases alias
      ON alias.subject_type='snapshot_provision' AND alias.alias_identity=provision.id
    WHERE eligibility.id IS NULL ${lane ? "AND substr(provision.id,20,2)=?" : ""}
    ORDER BY provision.id LIMIT ?`);
  const packet = lane
    ? await rows.bind(BUILD_ID, lane, PROJECTION_BATCH_SIZE).all<ProjectionRow>()
    : await rows.bind(BUILD_ID, PROJECTION_BATCH_SIZE).all<ProjectionRow>();
  if (packet.results.length === 0) {
    if (lane) return { status: "building", phase: "projections", lane, laneComplete: true,
      processedCount: build.processedCount };
    await db.prepare(`UPDATE legal_source_snapshot_builds SET phase='reconciliation',cursor=NULL,
      updated_at=? WHERE id=?`).bind(new Date().toISOString(), BUILD_ID).run();
    return { status: "building", phase: "reconciliation", processedCount: build.processedCount };
  }
  const projected = await Promise.all(packet.results.map((row) => projectVerifiedRow(bucket, row)));
  if (injectPartialFailure) throw new Error("SOURCE_SNAPSHOT_INJECTED_PARTIAL_FAILURE");
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO legal_source_snapshot_stable_identities
      (subject_type,subject_id,canonical_identity_sha256,identity_evidence_json,recorded_at) VALUES ${values(
        projected.flatMap((item) => [
          ["source_document", item.row.sourceDocumentId, item.sourceDocumentIdentity,
            stable({ publisher: "lex.uz", publisherDocumentToken: item.row.publisherDocumentToken,
              languageTag: item.row.documentLanguageTag, sourceUrl: item.row.documentSourceUrl }), CUTOFF],
          ["source_snapshot", item.row.sourceSnapshotId, item.sourceSnapshotIdentity,
            stable({ sourceDocumentCanonicalIdentity: item.sourceDocumentIdentity,
              publisherRevisionToken: item.row.publisherRevisionToken, languageTag: item.row.languageTag,
              captureId: item.row.captureId, rawLocatorId: item.row.rawLocatorId,
              rawSha256: item.row.rawSha256, normalizedLocatorId: item.row.normalizedLocatorId,
              normalizedSha256: item.row.normalizedSha256 }), CUTOFF],
          ["snapshot_provision", item.row.snapshotProvisionId, item.snapshotProvisionIdentity,
            stable({ sourceSnapshotCanonicalIdentity: item.sourceSnapshotIdentity,
              sourcePositionToken: item.row.sourcePositionToken,
              normalizedTextSha256: item.normalizedTextSha256,
              provisionLocatorId: item.row.provisionLocatorId,
              provisionObjectSha256: item.row.provisionSha256 }), CUTOFF],
        ]),
      )}`),
    db.prepare(`INSERT INTO legal_source_snapshot_integrity_attestations
      (build_id,snapshot_provision_id,source_object_r2_key,source_object_byte_count,
       source_object_sha256,normalized_text_sha256,verified_at) VALUES ${values(projected.map((item) => [
      BUILD_ID, item.row.snapshotProvisionId, item.row.provisionKey, item.row.provisionBytes,
      item.row.provisionSha256, item.normalizedTextSha256, now,
    ]))}`),
    db.prepare(`INSERT INTO legal_retrieval_eligibility
      (id,build_id,snapshot_provision_id,capability,status,reason_codes_json,official_source_verified,
       d1_r2_integrity_verified,extraction_verified,identity_stable,current_pointer_verified,
       temporal_state_supported,privacy_verified,quarantine_clear,canonicalization_clear,evaluated_at)
      VALUES ${values(projected.map((item) => [
      `retrieval-eligibility:${item.row.snapshotProvisionId}:current:${BUILD_ID}`, BUILD_ID,
      item.row.snapshotProvisionId, "current", item.reasonCodes.length === 0 ? "eligible" : "ineligible",
      JSON.stringify(item.reasonCodes), item.officialSourceVerified ? 1 : 0, 1, 1, 1,
      item.row.currentPointerId === null ? 0 : 1,
      item.row.temporalState === "current_supported" ? 1 : 0,
      item.row.privacyClass === "public_official_source" ? 1 : 0,
      item.row.quarantineId === null ? 1 : 0, item.row.aliasId === null ? 1 : 0, now,
    ]))}`),
    db.prepare(`UPDATE legal_source_snapshot_builds SET cursor=?,processed_count=processed_count+?,
      eligible_count=eligible_count+?,excluded_count=excluded_count+?,updated_at=? WHERE id=?`).bind(
      projected.at(-1)!.row.snapshotProvisionId, projected.length,
      projected.filter((item) => item.reasonCodes.length === 0).length,
      projected.filter((item) => item.reasonCodes.length > 0).length, now, BUILD_ID),
  ]);
  return { status: "building", phase: "projections",
    processedCount: build.processedCount + projected.length, batchCount: projected.length, lane };
}

type InventoryKind = {
  name: string;
  table: string;
  key: string;
  where?: string;
  verifyR2?: boolean;
};

const inventoryKinds: readonly InventoryKind[] = [
  { name: "source_documents", table: "legal_source_documents", key: "id" },
  { name: "source_snapshots", table: "legal_source_snapshots", key: "id" },
  { name: "snapshot_provisions", table: "legal_snapshot_provisions", key: "id" },
  { name: "current_pointers", table: "legal_source_snapshot_current_pointers", key: "id",
    where: `build_id='${BUILD_ID}'` },
  { name: "retrieval_eligibility", table: "legal_retrieval_eligibility", key: "id",
    where: `build_id='${BUILD_ID}'` },
  { name: "quarantines", table: "legal_source_snapshot_quarantines", key: "id" },
  { name: "aliases", table: "legal_source_snapshot_aliases", key: "id" },
  { name: "canonical_chunks", table: "legal_canonical_chunks", key: "id" },
  { name: "sparse_postings", table: "legal_sparse_projection_postings", key: "canonical_chunk_id" },
  { name: "dense_candidates", table: "legal_dense_projection_candidates", key: "canonical_chunk_id" },
  { name: "eligible_current", table: "legal_retrieval_eligibility", key: "id",
    where: `build_id='${BUILD_ID}' AND capability='current' AND status='eligible'` },
  { name: "stable_identities", table: "legal_source_snapshot_stable_identities",
    key: "canonical_identity_sha256" },
  { name: "integrity_attestations", table: "legal_source_snapshot_integrity_attestations",
    key: "snapshot_provision_id", where: `build_id='${BUILD_ID}'` },
  { name: "release_items", table: "legal_search_release_items", key: "canonical_chunk_id",
    where: `search_release_id='${RELEASE_ID}'` },
  { name: "release_members", table: "legal_source_snapshot_release_members", key: "canonical_chunk_id",
    where: `search_release_id='${RELEASE_ID}'` },
  { name: "release_governance", table: "legal_search_release_governance", key: "id",
    where: `search_release_id='${RELEASE_ID}'` },
  { name: "release_shards", table: "legal_search_release_shards", key: "shard_id",
    where: `search_release_id='${RELEASE_ID}'` },
  { name: "release_r2", table: "legal_canonical_chunks", key: "id", verifyR2: true },
];

type ReconciliationCursor = { kind: number; after: string | null; page: number };

async function reconcileReleaseR2Lane(
  db: D1Database,
  bucket: SourceSnapshotBucket,
  lane: string,
) {
  const latest = await db.prepare(`SELECT inventory_kind AS inventoryKind,inventory_json AS inventoryJson
    FROM legal_source_snapshot_inventories WHERE build_id=? AND inventory_kind LIKE ?
    ORDER BY inventory_kind DESC LIMIT 1`).bind(BUILD_ID, `page:release_r2:${lane}:%`)
    .first<{ inventoryKind: string; inventoryJson: string }>();
  const previous = latest ? z.object({ last: z.string() }).parse(JSON.parse(latest.inventoryJson)) : null;
  const page = latest ? Number(latest.inventoryKind.slice(latest.inventoryKind.lastIndexOf(":") + 1)) + 1 : 0;
  const query = `SELECT * FROM legal_canonical_chunks
    WHERE substr(snapshot_provision_id,20,2)=? ${previous ? "AND id>?" : ""}
    ORDER BY id LIMIT ?`;
  const packet = previous
    ? await db.prepare(query).bind(lane, previous.last, R2_RECONCILIATION_PAGE_SIZE)
      .all<Record<string, unknown>>()
    : await db.prepare(query).bind(lane, R2_RECONCILIATION_PAGE_SIZE).all<Record<string, unknown>>();
  if (packet.results.length === 0) {
    const pages = await db.prepare(`SELECT inventory_kind AS inventoryKind,item_count AS itemCount,
        inventory_sha256 AS inventorySha256 FROM legal_source_snapshot_inventories
      WHERE build_id=? AND inventory_kind LIKE ? ORDER BY inventory_kind`).bind(
      BUILD_ID, `page:release_r2:${lane}:%`,
    ).all<{ inventoryKind: string; itemCount: number; inventorySha256: string }>();
    const itemCount = pages.results.reduce((sum, item) => sum + item.itemCount, 0);
    await db.prepare(`INSERT OR IGNORE INTO legal_source_snapshot_inventories
      (build_id,inventory_kind,item_count,inventory_sha256,inventory_json,recorded_at)
      VALUES (?,?,?,?,?,?)`).bind(BUILD_ID, `summary:release_r2:${lane}`, itemCount,
      await sha256(stable(pages.results)), JSON.stringify({ lane, pages: pages.results.length, itemCount }), CUTOFF).run();
    return { status: "building", phase: "reconciliation", kind: "release_r2", lane,
      laneComplete: true, itemCount };
  }
  await Promise.all(packet.results.map(async (row) => {
    await verifiedObject(bucket, String(row.r2_key), Number(row.byte_count), String(row.sha256));
  }));
  const last = String(packet.results.at(-1)!.id);
  await db.prepare(`INSERT INTO legal_source_snapshot_inventories
    (build_id,inventory_kind,item_count,inventory_sha256,inventory_json,recorded_at)
    VALUES (?,?,?,?,?,?)`).bind(BUILD_ID,
    `page:release_r2:${lane}:${String(page).padStart(6, "0")}`, packet.results.length,
    await sha256(stable(packet.results)), JSON.stringify({ lane, first: packet.results[0]!.id, last }), CUTOFF).run();
  return { status: "building", phase: "reconciliation", kind: "release_r2", lane,
    laneComplete: false, page, itemCount: packet.results.length };
}

async function reconcileBuild(env: SourceSnapshotBuildEnv, lane?: string) {
  const { db, bucket } = await requireTarget(env);
  const build = await db.prepare(`SELECT status,phase,cursor FROM legal_source_snapshot_builds WHERE id=?`)
    .bind(BUILD_ID).first<{ status: string; phase: string; cursor: string | null }>();
  if (!build || build.status !== "building") throw new Error("SOURCE_SNAPSHOT_BUILD_NOT_RUNNING");
  if (build.phase !== "reconciliation") return { status: build.status, phase: build.phase };
  const cursor: ReconciliationCursor = build.cursor
    ? z.object({ kind: z.number().int(), after: z.string().nullable(), page: z.number().int() })
      .parse(JSON.parse(build.cursor) as unknown)
    : { kind: 0, after: null, page: 0 };
  if (cursor.kind >= inventoryKinds.length) {
    await db.prepare(`UPDATE legal_source_snapshot_builds SET phase='release',cursor=NULL,updated_at=? WHERE id=?`)
      .bind(new Date().toISOString(), BUILD_ID).run();
    return { status: "building", phase: "release" };
  }
  const kind = inventoryKinds[cursor.kind]!;
  if (kind.verifyR2 && lane) return reconcileReleaseR2Lane(db, bucket, lane);
  if (kind.verifyR2) {
    const laneSummaries = await db.prepare(`SELECT inventory_kind AS inventoryKind,
        item_count AS itemCount,inventory_sha256 AS inventorySha256
      FROM legal_source_snapshot_inventories WHERE build_id=?
        AND inventory_kind LIKE 'summary:release_r2:__' ORDER BY inventory_kind`)
      .bind(BUILD_ID).all<{ inventoryKind: string; itemCount: number; inventorySha256: string }>();
    if (laneSummaries.results.length < 256) return { status: "building", phase: "reconciliation",
      kind: "release_r2", laneRequired: true, completedLanes: laneSummaries.results.length };
    const itemCount = laneSummaries.results.reduce((sum, item) => sum + item.itemCount, 0);
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO legal_source_snapshot_inventories
        (build_id,inventory_kind,item_count,inventory_sha256,inventory_json,recorded_at)
        VALUES (?,?,?,?,?,?)`).bind(BUILD_ID, "summary:release_r2", itemCount,
        await sha256(stable(laneSummaries.results)), JSON.stringify({ lanes: 256, itemCount }), CUTOFF),
      db.prepare(`UPDATE legal_source_snapshot_builds SET cursor=?,updated_at=? WHERE id=?`).bind(
        JSON.stringify({ kind: cursor.kind + 1, after: null, page: 0 }), new Date().toISOString(), BUILD_ID,
      ),
    ]);
    return { status: "building", phase: "reconciliation", kind: "release_r2", itemCount, complete: true };
  }
  const where = [kind.where, cursor.after ? `${kind.key}>?` : null].filter(Boolean).join(" AND ");
  const query = `SELECT * FROM ${kind.table}${where ? ` WHERE ${where}` : ""}
    ORDER BY ${kind.key} LIMIT ?`;
  const packet = cursor.after
    ? await db.prepare(query).bind(cursor.after, RECONCILIATION_PAGE_SIZE).all<Record<string, unknown>>()
    : await db.prepare(query).bind(RECONCILIATION_PAGE_SIZE).all<Record<string, unknown>>();
  if (packet.results.length === 0) {
    const pages = await db.prepare(`SELECT inventory_kind AS inventoryKind,item_count AS itemCount,
        inventory_sha256 AS inventorySha256 FROM legal_source_snapshot_inventories
      WHERE build_id=? AND inventory_kind LIKE ? ORDER BY inventory_kind`).bind(
      BUILD_ID, `page:${kind.name}:%`,
    ).all<{ inventoryKind: string; itemCount: number; inventorySha256: string }>();
    const itemCount = pages.results.reduce((sum, page) => sum + page.itemCount, 0);
    const root = await sha256(stable(pages.results));
    await db.batch([
      db.prepare(`INSERT INTO legal_source_snapshot_inventories
        (build_id,inventory_kind,item_count,inventory_sha256,inventory_json,recorded_at)
        VALUES (?,?,?,?,?,?)`).bind(BUILD_ID, `summary:${kind.name}`, itemCount, root,
        JSON.stringify({ schemaVersion: 1, kind: kind.name, pages: pages.results.length, itemCount }), CUTOFF),
      db.prepare(`UPDATE legal_source_snapshot_builds SET cursor=?,updated_at=? WHERE id=?`).bind(
        JSON.stringify({ kind: cursor.kind + 1, after: null, page: 0 }), new Date().toISOString(), BUILD_ID,
      ),
    ]);
    return { status: "building", phase: "reconciliation", kind: kind.name, itemCount, complete: true };
  }
  const pageIdentity = await sha256(stable(packet.results));
  const last = String(packet.results.at(-1)![kind.key]);
  await db.batch([
    db.prepare(`INSERT INTO legal_source_snapshot_inventories
      (build_id,inventory_kind,item_count,inventory_sha256,inventory_json,recorded_at)
      VALUES (?,?,?,?,?,?)`).bind(BUILD_ID, `page:${kind.name}:${String(cursor.page).padStart(6, "0")}`,
      packet.results.length, pageIdentity, JSON.stringify({ first: packet.results[0]![kind.key], last }), CUTOFF),
    db.prepare(`UPDATE legal_source_snapshot_builds SET cursor=?,updated_at=? WHERE id=?`).bind(
      JSON.stringify({ kind: cursor.kind, after: last, page: cursor.page + 1 }), new Date().toISOString(), BUILD_ID,
    ),
  ]);
  return { status: "building", phase: "reconciliation", kind: kind.name,
    page: cursor.page, itemCount: packet.results.length, complete: false };
}

async function inventorySummary(db: D1Database, name: string) {
  const row = await db.prepare(`SELECT item_count AS itemCount,inventory_sha256 AS inventorySha256
    FROM legal_source_snapshot_inventories WHERE build_id=? AND inventory_kind=?`).bind(
    BUILD_ID, `summary:${name}`,
  ).first<{ itemCount: number; inventorySha256: string }>();
  if (!row) throw new Error("SOURCE_SNAPSHOT_RECONCILIATION_INCOMPLETE");
  return row;
}

async function counts(db: D1Database) {
  return db.prepare(`SELECT
    (SELECT count(*) FROM legal_source_documents) AS sourceDocuments,
    (SELECT count(*) FROM legal_source_snapshots) AS sourceSnapshots,
    (SELECT count(*) FROM legal_snapshot_provisions) AS snapshotProvisions,
    (SELECT count(*) FROM legal_source_snapshot_current_pointers WHERE build_id='${BUILD_ID}') AS currentPointers,
    (SELECT count(*) FROM legal_retrieval_eligibility WHERE build_id='${BUILD_ID}'
      AND capability='current' AND status='eligible') AS eligible,
    (SELECT count(*) FROM legal_retrieval_eligibility WHERE build_id='${BUILD_ID}'
      AND capability='current' AND status<>'eligible') AS excluded,
    (SELECT count(*) FROM legal_source_snapshot_quarantines) AS quarantines,
    (SELECT count(*) FROM legal_source_snapshot_aliases) AS aliases,
    (SELECT count(*) FROM legal_canonical_chunks) AS chunks,
    (SELECT count(*) FROM legal_sparse_projection_postings) AS sparse,
    (SELECT count(*) FROM legal_dense_projection_candidates) AS dense`)
    .first<Record<string, number>>();
}

async function finalizeBuild(env: SourceSnapshotBuildEnv) {
  const { db, bucket } = await requireTarget(env);
  const build = await db.prepare(`SELECT status,phase FROM legal_source_snapshot_builds WHERE id=?`)
    .bind(BUILD_ID).first<{ status: string; phase: string }>();
  if (!build) throw new Error("SOURCE_SNAPSHOT_BUILD_NOT_FOUND");
  if (["complete", "sealed"].includes(build.status)) return dryRun(env);
  if (build.status !== "building" || build.phase !== "release") {
    throw new Error("SOURCE_SNAPSHOT_BUILD_NOT_READY");
  }
  const observed = await counts(db);
  const expected = {
    sourceDocuments: 6_895, sourceSnapshots: 6_892, snapshotProvisions: 165_852,
    currentPointers: 6_892, eligible: 160_978, excluded: 4_874, quarantines: 3,
    aliases: 0, chunks: 160_978, sparse: 160_978, dense: 160_978,
  };
  if (stable(observed) !== stable(expected)) throw new Error("SOURCE_SNAPSHOT_COUNT_RECONCILIATION_FAILED");
  const summaries = Object.fromEntries(await Promise.all(inventoryKinds.map(async ({ name }) => {
    const summary = await inventorySummary(db, name);
    return [name, summary] as const;
  })));
  const inventoryIdentity = await sha256(stable({ cutoff: CUTOFF, expected, summaries }));
  const projectionIdentity = await sha256(stable({
    chunks: summaries.canonical_chunks,
    sparse: summaries.sparse_postings,
    dense: summaries.dense_candidates,
    r2: summaries.release_r2,
  }));
  const releaseIdentity = await sha256(stable({
    releaseId: RELEASE_ID,
    corpusSnapshotId: SNAPSHOT_ID,
    configurationIdentity: CONFIGURATION_ID,
    eligible: summaries.eligible_current,
    projectionIdentity,
    shard: "00",
  }));
  const membership = await db.prepare(`SELECT
      (SELECT count(*) FROM legal_search_release_items WHERE search_release_id=?) AS releaseItems,
      (SELECT count(*) FROM legal_source_snapshot_release_members WHERE search_release_id=?) AS releaseMembers,
      (SELECT count(*) FROM legal_search_release_items item
        LEFT JOIN legal_retrieval_eligibility eligibility
          ON eligibility.snapshot_provision_id=replace(item.provision_rendition_id,'rendition:','snapshot-provision:')
          AND eligibility.build_id=? AND eligibility.capability='current' AND eligibility.status='eligible'
        WHERE item.search_release_id=? AND eligibility.id IS NULL) AS releaseWithoutEligible,
      (SELECT count(*) FROM legal_retrieval_eligibility eligibility
        LEFT JOIN legal_source_snapshot_release_members member
          ON member.snapshot_provision_id=eligibility.snapshot_provision_id AND member.search_release_id=?
        WHERE eligibility.build_id=? AND eligibility.capability='current'
          AND eligibility.status='eligible' AND member.canonical_chunk_id IS NULL) AS eligibleWithoutRelease,
      (SELECT count(*) FROM legal_source_snapshot_release_members member
        LEFT JOIN legal_search_release_items item ON item.search_release_id=member.search_release_id
          AND item.canonical_chunk_id=member.canonical_chunk_id
        WHERE member.search_release_id=? AND item.canonical_chunk_id IS NULL) AS memberWithoutItem,
      (SELECT count(*) FROM legal_search_release_shards shard
        WHERE shard.search_release_id=?) AS shardCount,
      (SELECT coalesce(sum(item_count),0) FROM legal_search_release_shards shard
        WHERE shard.search_release_id=?) AS shardItemCount`).bind(
    RELEASE_ID, RELEASE_ID, BUILD_ID, RELEASE_ID, RELEASE_ID, BUILD_ID, RELEASE_ID, RELEASE_ID, RELEASE_ID,
  ).first<Record<string, number>>();
  if (!membership || Number(membership.releaseItems) !== 160_978
    || Number(membership.releaseMembers) !== 160_978 || Number(membership.releaseWithoutEligible) !== 0
    || Number(membership.eligibleWithoutRelease) !== 0 || Number(membership.memberWithoutItem) !== 0
    || Number(membership.shardCount) !== 1 || Number(membership.shardItemCount) !== 160_978) {
    throw new Error("SOURCE_SNAPSHOT_RELEASE_MEMBERSHIP_RECONCILIATION_FAILED");
  }
  const release = await db.prepare(`SELECT status,item_count AS itemCount,sealed_at AS sealedAt
    FROM legal_search_releases WHERE id=?`).bind(RELEASE_ID)
    .first<{ status: string; itemCount: number; sealedAt: string | null }>();
  if (release?.status !== "draft" || release.itemCount !== 160_978 || release.sealedAt !== null) {
    throw new Error("SOURCE_SNAPSHOT_RELEASE_STATE_INVALID");
  }
  const originalManifestKey = `search-releases/${RELEASE_ID}/manifest.json`;
  const originalManifest = await bucket.get(originalManifestKey);
  if (!originalManifest) throw new Error("SOURCE_SNAPSHOT_RELEASE_MANIFEST_MISSING");
  const originalManifestBytes = new Uint8Array(await originalManifest.arrayBuffer());
  const manifestBody = {
    schemaVersion: 1,
    evidenceKind: "ticket_12_post_materialization_qualification",
    environment: "staging",
    capability: "current",
    buildId: BUILD_ID,
    corpusSnapshotId: SNAPSHOT_ID,
    searchReleaseId: RELEASE_ID,
    cutoffAt: CUTOFF,
    counts: expected,
    exclusions: { CURRENT_TEMPORAL_STATE_UNKNOWN: 4_874, NO_MATERIALIZED_PROVISIONS: 3 },
    shardInventory: { "00": 160_978 },
    completePairwiseDisjointUnion: true,
    inventoryIdentity,
    projectionIdentity,
    releaseIdentity,
    configuration: {
      identity: CONFIGURATION_ID,
      embeddingModel: "openai/text-embedding-3-large",
      dimensions: 1_536,
      keywordTokenizer: "porter",
      metadataSchema: "language:text,document_type:text,valid_from:datetime,valid_to:datetime",
      sourcePrefix: `search-releases/${RELEASE_ID}/current/`,
      maximumFileBytes: 4_000_000,
      maximumResultsPerInstance: 50,
      maximumInstancesPerQuery: 10,
      embeddingInputTokenCeiling: 8_191,
      embeddingPriceUsdPerMillionTokens: 0.13,
      currentMigrationCostCircuitUsd: 50,
      productionMonthlyQueryCostCircuitUsd: 25,
      paused: true,
      payloadLogging: false,
      gatewayCache: false,
      similarityCache: false,
    },
    authoritySemantics: "not_evaluated_not_required",
    activation: "inactive_ticket_13_required",
    originalManifest: { key: originalManifestKey, byteCount: originalManifestBytes.byteLength,
      sha256: await sha256(originalManifestBytes) },
  };
  const manifestBytes = serializeSourceSnapshotReleaseManifest(manifestBody);
  const manifestKey = `search-releases/${RELEASE_ID}/qualification-v2.json`;
  await immutablePut(bucket, manifestKey, manifestBytes, {
    schemaVersion: "1", releaseId: RELEASE_ID, sha256: await sha256(manifestBytes),
  });
  const report = {
    schemaVersion: 1, status: "clean", environment: "staging", capability: "current",
    releaseId: RELEASE_ID, buildId: BUILD_ID, inventoryIdentity, projectionIdentity,
    releaseIdentity, expected, actual: observed, exactlyOnce: true,
    completePairwiseDisjointShardUnion: true, shardInventory: { "00": 160_978 },
    restartSafe: false, authorityGateApplied: false, membership,
    postMaterializationReconciled: true, qualificationPending: true,
  };
  const reportJson = stable(report);
  const reportSha256 = await sha256(reportJson);
  await db.batch([
    db.prepare(`INSERT INTO legal_migration_reconciliation_reports
      (run_id,environment,release_id,capability,input_sha256,report_sha256,status,report_json,created_at)
      VALUES (?,'staging',?,'current',?,?,'clean',?,?)`).bind(
      BUILD_ID, RELEASE_ID, inventoryIdentity, reportSha256, reportJson, CUTOFF,
    ),
    db.prepare(`INSERT INTO legal_source_snapshot_build_checkpoints
      (build_id,phase,cursor,item_count,identity_sha256,completed_at)
      VALUES (?, 'reconciliation',NULL,160978,?,?)`).bind(BUILD_ID, inventoryIdentity, CUTOFF),
    db.prepare(`INSERT INTO legal_source_snapshot_build_checkpoints
      (build_id,phase,cursor,item_count,identity_sha256,completed_at)
      VALUES (?, 'release',NULL,160978,?,?)`).bind(BUILD_ID, releaseIdentity, CUTOFF),
    db.prepare(`UPDATE legal_source_snapshot_builds SET status='complete',phase='complete',cursor=NULL,
      inventory_sha256=?,projection_sha256=?,release_sha256=?,updated_at=? WHERE id=?`).bind(
      inventoryIdentity, projectionIdentity, releaseIdentity, new Date().toISOString(), BUILD_ID,
    ),
  ]);
  return dryRun(env);
}

type ReplayRow = ProjectionRow & {
  expectedChunkId: string;
  expectedChunkKey: string;
  expectedChunkBytes: number;
  expectedChunkSha256: string;
  expectedPostingSha256: string;
  expectedEmbeddingModel: string;
  expectedDimensions: number;
  expectedProviderCandidateId: string;
  expectedItemKey: string;
  expectedItemR2Key: string;
  expectedItemBytes: number;
  expectedItemSha256: string;
  expectedShardId: string;
  expectedSourceDocumentIdentity: string;
  expectedSourceSnapshotIdentity: string;
  expectedSnapshotProvisionIdentity: string;
  expectedNormalizedTextSha256: string;
};

async function replayBuild(env: SourceSnapshotBuildEnv, runId: "baseline" | "repeat", lane?: string) {
  const { db, bucket } = await requireTarget(env);
  const build = await db.prepare(`SELECT status,phase FROM legal_source_snapshot_builds WHERE id=?`)
    .bind(BUILD_ID).first<{ status: string; phase: string }>();
  if (!build || !["complete", "sealed"].includes(build.status) || build.phase !== "complete") {
    throw new Error("SOURCE_SNAPSHOT_REPLAY_NOT_READY");
  }
  const completed = await db.prepare(`SELECT item_count AS itemCount,identity_sha256 AS identitySha256
    FROM legal_source_snapshot_replay_runs WHERE build_id=? AND run_id=?`).bind(BUILD_ID, runId)
    .first<{ itemCount: number; identitySha256: string }>();
  if (completed) return { status: "clean", runId, complete: true, ...completed };
  if (!lane) {
    const pages = await db.prepare(`SELECT lane,page,item_count AS itemCount,
        identity_sha256 AS identitySha256 FROM legal_source_snapshot_replay_pages
      WHERE build_id=? AND run_id=? ORDER BY lane,page`).bind(BUILD_ID, runId)
      .all<{ lane: string; page: number; itemCount: number; identitySha256: string }>();
    const itemCount = pages.results.reduce((sum, page) => sum + page.itemCount, 0);
    if (itemCount !== 160_978) return { status: "building", runId, complete: false, laneRequired: true,
      itemCount };
    const identitySha256 = await sha256(stable(pages.results));
    const otherRunId = runId === "baseline" ? "repeat" : "baseline";
    const other = await db.prepare(`SELECT item_count AS itemCount,identity_sha256 AS identitySha256
      FROM legal_source_snapshot_replay_runs WHERE build_id=? AND run_id=?`).bind(BUILD_ID, otherRunId)
      .first<{ itemCount: number; identitySha256: string }>();
    if (other && (other.itemCount !== itemCount || other.identitySha256 !== identitySha256)) {
      throw new Error("SOURCE_SNAPSHOT_REPEATED_BUILD_IDENTITY_MISMATCH");
    }
    await db.prepare(`INSERT INTO legal_source_snapshot_replay_runs
      (build_id,run_id,item_count,identity_sha256,status,completed_at)
      VALUES (?,?,?,?,'clean',?)`).bind(BUILD_ID, runId, itemCount, identitySha256, CUTOFF).run();
    return { status: "clean", runId, complete: true, itemCount, identitySha256 };
  }
  const latest = await db.prepare(`SELECT page,last_snapshot_provision_id AS lastId
    FROM legal_source_snapshot_replay_pages WHERE build_id=? AND run_id=? AND lane=?
    ORDER BY page DESC LIMIT 1`).bind(BUILD_ID, runId, lane)
    .first<{ page: number; lastId: string }>();
  const query = `SELECT provision.id AS snapshotProvisionId,
      snapshot.id AS sourceSnapshotId,document.id AS sourceDocumentId,
      document.publisher_document_token AS publisherDocumentToken,
      document.language_tag AS documentLanguageTag,document.source_url AS documentSourceUrl,
      snapshot.publisher_revision_token AS publisherRevisionToken,snapshot.capture_id AS captureId,
      snapshot.language_tag AS languageTag,snapshot.captured_at AS capturedAt,
      rendition.id AS legacyProvisionRenditionId,locator.r2_key AS provisionKey,
      locator.byte_count AS provisionBytes,locator.sha256 AS provisionSha256,
      locator.source_normalized_sha256 AS sourceNormalizedSha256,provision.source_url AS sourceUrl,
      instrument.document_type AS documentType,rendition.article_number AS articleNumber,
      rendition.article_title AS articleTitle,rendition.sequence AS sequence,
      provision.source_position_token AS sourcePositionToken,
      provision.provision_locator_id AS provisionLocatorId,provision.temporal_state AS temporalState,
      provision.privacy_class AS privacyClass,pointer.provision_rendition_id AS currentPointerId,
      quarantine.id AS quarantineId,alias.id AS aliasId,snapshot.raw_locator_id AS rawLocatorId,
      raw.sha256 AS rawSha256,snapshot.normalized_locator_id AS normalizedLocatorId,
      normalized.sha256 AS normalizedSha256,chunk.id AS expectedChunkId,
      chunk.r2_key AS expectedChunkKey,chunk.byte_count AS expectedChunkBytes,
      chunk.sha256 AS expectedChunkSha256,posting.posting_inventory_sha256 AS expectedPostingSha256,
      dense.embedding_model AS expectedEmbeddingModel,dense.dimensions AS expectedDimensions,
      dense.provider_candidate_id AS expectedProviderCandidateId,item.item_key AS expectedItemKey,
      item.r2_key AS expectedItemR2Key,item.byte_count AS expectedItemBytes,
      item.sha256 AS expectedItemSha256,member.shard_id AS expectedShardId,
      documentIdentity.canonical_identity_sha256 AS expectedSourceDocumentIdentity,
      snapshotIdentity.canonical_identity_sha256 AS expectedSourceSnapshotIdentity,
      provisionIdentity.canonical_identity_sha256 AS expectedSnapshotProvisionIdentity,
      attestation.normalized_text_sha256 AS expectedNormalizedTextSha256
    FROM legal_retrieval_eligibility eligibility
    JOIN legal_snapshot_provisions provision ON provision.id=eligibility.snapshot_provision_id
    JOIN legal_source_snapshots snapshot ON snapshot.id=provision.source_snapshot_id
    JOIN legal_source_documents document ON document.id=snapshot.source_document_id
    JOIN legal_provision_renditions rendition ON rendition.id=provision.legacy_provision_rendition_id
    JOIN legal_instruments instrument ON instrument.id=document.legacy_instrument_id
    JOIN legal_evidence_locators locator ON locator.id=provision.provision_locator_id
    JOIN legal_evidence_locators raw ON raw.id=snapshot.raw_locator_id
    JOIN legal_evidence_locators normalized ON normalized.id=snapshot.normalized_locator_id
    JOIN legal_current_provision_pointers pointer ON pointer.provision_rendition_id=rendition.id
    LEFT JOIN legal_source_snapshot_quarantines quarantine ON quarantine.source_document_id=document.id
    LEFT JOIN legal_source_snapshot_aliases alias
      ON alias.subject_type='snapshot_provision' AND alias.alias_identity=provision.id
    JOIN legal_canonical_chunks chunk ON chunk.snapshot_provision_id=provision.id AND chunk.ordinal=0
    JOIN legal_sparse_projection_postings posting ON posting.canonical_chunk_id=chunk.id
    JOIN legal_dense_projection_candidates dense ON dense.canonical_chunk_id=chunk.id
    JOIN legal_search_release_items item ON item.search_release_id=? AND item.canonical_chunk_id=chunk.id
    JOIN legal_source_snapshot_release_members member
      ON member.search_release_id=item.search_release_id AND member.canonical_chunk_id=chunk.id
    JOIN legal_source_snapshot_stable_identities documentIdentity
      ON documentIdentity.subject_type='source_document' AND documentIdentity.subject_id=document.id
    JOIN legal_source_snapshot_stable_identities snapshotIdentity
      ON snapshotIdentity.subject_type='source_snapshot' AND snapshotIdentity.subject_id=snapshot.id
    JOIN legal_source_snapshot_stable_identities provisionIdentity
      ON provisionIdentity.subject_type='snapshot_provision' AND provisionIdentity.subject_id=provision.id
    JOIN legal_source_snapshot_integrity_attestations attestation
      ON attestation.build_id=eligibility.build_id AND attestation.snapshot_provision_id=provision.id
    WHERE eligibility.build_id=? AND eligibility.capability='current' AND eligibility.status='eligible'
      AND substr(provision.id,20,2)=? ${latest ? "AND provision.id>?" : ""}
    ORDER BY provision.id LIMIT ?`;
  const packet = latest
    ? await db.prepare(query).bind(RELEASE_ID, BUILD_ID, lane, latest.lastId, PROJECTION_BATCH_SIZE)
      .all<ReplayRow>()
    : await db.prepare(query).bind(RELEASE_ID, BUILD_ID, lane, PROJECTION_BATCH_SIZE).all<ReplayRow>();
  if (packet.results.length === 0) return { status: "building", runId, lane, laneComplete: true };
  const regenerated = await Promise.all(packet.results.map((row) => projectVerifiedRow(bucket, row)));
  const evidence = regenerated.map((item, index) => {
    const expected = packet.results[index]!;
    if (item.reasonCodes.length !== 0 || item.canonicalChunkId !== expected.expectedChunkId
      || item.key !== expected.expectedChunkKey || item.byteCount !== expected.expectedChunkBytes
      || item.sha256 !== expected.expectedChunkSha256
      || expected.expectedPostingSha256 !== expected.provisionSha256
      || expected.expectedEmbeddingModel !== "openai/text-embedding-3-large"
      || expected.expectedDimensions !== 1_536
      || expected.expectedProviderCandidateId !== `canonical:${item.canonicalChunkId}`
      || expected.expectedItemKey !== item.key || expected.expectedItemR2Key !== item.key
      || expected.expectedItemBytes !== item.byteCount || expected.expectedItemSha256 !== item.sha256
      || expected.expectedShardId !== "00"
      || expected.expectedSourceDocumentIdentity !== item.sourceDocumentIdentity
      || expected.expectedSourceSnapshotIdentity !== item.sourceSnapshotIdentity
      || expected.expectedSnapshotProvisionIdentity !== item.snapshotProvisionIdentity
      || expected.expectedNormalizedTextSha256 !== item.normalizedTextSha256) {
      throw new Error("SOURCE_SNAPSHOT_REPLAY_MISMATCH");
    }
    return {
      snapshotProvisionCanonicalIdentity: item.snapshotProvisionIdentity,
      sourceObject: { key: expected.provisionKey, bytes: expected.provisionBytes,
        sha256: expected.provisionSha256, normalizedTextSha256: item.normalizedTextSha256 },
      chunk: { id: item.canonicalChunkId, key: item.key, bytes: item.byteCount, sha256: item.sha256 },
      sparse: expected.expectedPostingSha256,
      dense: { model: expected.expectedEmbeddingModel, dimensions: expected.expectedDimensions,
        candidateId: expected.expectedProviderCandidateId },
      release: { id: RELEASE_ID, itemKey: expected.expectedItemKey, shardId: expected.expectedShardId },
    };
  });
  const page = (latest?.page ?? -1) + 1;
  const lastId = packet.results.at(-1)!.snapshotProvisionId;
  await db.prepare(`INSERT INTO legal_source_snapshot_replay_pages
    (build_id,run_id,lane,page,last_snapshot_provision_id,item_count,identity_sha256,completed_at)
    VALUES (?,?,?,?,?,?,?,?)`).bind(BUILD_ID, runId, lane, page, lastId, evidence.length,
    await sha256(stable(evidence)), CUTOFF).run();
  return { status: "building", runId, lane, laneComplete: false, page, itemCount: evidence.length };
}

type QualificationInput = NonNullable<z.infer<typeof inputSchema>["qualification"]>;

async function qualifyBuild(env: SourceSnapshotBuildEnv, evidence: QualificationInput) {
  const { db, bucket } = await requireTarget(env);
  const existing = await db.prepare(`SELECT qualification_sha256 AS qualificationSha256
    FROM legal_source_snapshot_qualifications WHERE build_id=?`).bind(BUILD_ID)
    .first<{ qualificationSha256: string }>();
  if (existing) return { status: "sealed", ...existing };
  const [build, baseline, repeat, activation, release] = await Promise.all([
    db.prepare(`SELECT status,phase,inventory_sha256 AS inventoryIdentity,
      projection_sha256 AS projectionIdentity,release_sha256 AS releaseIdentity
      FROM legal_source_snapshot_builds WHERE id=?`).bind(BUILD_ID).first<Record<string, unknown>>(),
    db.prepare(`SELECT item_count AS itemCount,identity_sha256 AS identitySha256
      FROM legal_source_snapshot_replay_runs WHERE build_id=? AND run_id='baseline'`)
      .bind(BUILD_ID).first<{ itemCount: number; identitySha256: string }>(),
    db.prepare(`SELECT item_count AS itemCount,identity_sha256 AS identitySha256
      FROM legal_source_snapshot_replay_runs WHERE build_id=? AND run_id='repeat'`)
      .bind(BUILD_ID).first<{ itemCount: number; identitySha256: string }>(),
    db.prepare(`SELECT count(*) AS count FROM legal_active_activation_sets WHERE environment='staging'`)
      .first<{ count: number }>(),
    db.prepare(`SELECT status,sealed_at AS sealedAt,item_count AS itemCount
      FROM legal_search_releases WHERE id=?`).bind(RELEASE_ID)
      .first<{ status: string; sealedAt: string | null; itemCount: number }>(),
  ]);
  if (build?.status !== "complete" || build.phase !== "complete" || !baseline || !repeat
    || baseline.itemCount !== 160_978 || repeat.itemCount !== 160_978
    || baseline.identitySha256 !== repeat.identitySha256 || Number(activation?.count ?? 0) !== 0
    || release?.status !== "draft" || release.sealedAt !== null || release.itemCount !== 160_978) {
    throw new Error("SOURCE_SNAPSHOT_QUALIFICATION_GATES_FAILED");
  }
  const qualificationBody = { schemaVersion: 1, buildId: BUILD_ID, releaseId: RELEASE_ID,
    build, baseline, repeat, evidence, release: { status: release.status, itemCount: release.itemCount },
    activation: "inactive_ticket_13_required", authoritySemantics: "not_evaluated_not_required" };
  const qualificationSha256 = await sha256(stable(qualificationBody));
  const qualificationBytes = serializeSourceSnapshotReleaseManifest(qualificationBody);
  await immutablePut(bucket, `search-releases/${RELEASE_ID}/qualification-final.json`, qualificationBytes, {
    schemaVersion: "1", releaseId: RELEASE_ID, sha256: await sha256(qualificationBytes),
  });
  await db.batch([
    db.prepare(`INSERT INTO legal_source_snapshot_qualifications
      (build_id,release_id,recovery_sql_sha256,recovery_sqlite_sha256,validation_sha256,
       standards_review_sha256,spec_review_sha256,qualification_sha256,qualified_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).bind(BUILD_ID, RELEASE_ID, evidence.recoverySqlSha256,
      evidence.recoverySqliteSha256, evidence.validationSha256, evidence.standardsReviewSha256,
      evidence.specReviewSha256, qualificationSha256, new Date().toISOString()),
    db.prepare(`UPDATE legal_source_snapshot_builds SET status='sealed',updated_at=? WHERE id=?`)
      .bind(new Date().toISOString(), BUILD_ID),
    db.prepare(`UPDATE legal_target_control SET migration_state='ready',updated_at=?
      WHERE control_key='environment' AND migration_state='migrating'`).bind(new Date().toISOString()),
  ]);
  return { status: "sealed", qualificationSha256, replayIdentity: baseline.identitySha256 };
}

async function dryRun(env: SourceSnapshotBuildEnv) {
  if (env.APP_ENV !== "staging" || !env.LEGAL_DB || !env.LEGAL_EVIDENCE_BUCKET
    || env.LEGAL_EVIDENCE_BUCKET_NAME !== "juro-legal-evidence-staging-green2-20260831") {
    throw new Error("SOURCE_SNAPSHOT_BUILD_TARGET_REJECTED");
  }
  const control = await env.LEGAL_DB.prepare(`SELECT environment,migration_state AS migrationState,
      evidence_bucket_name AS bucketName FROM legal_target_control WHERE control_key='environment'`)
    .first<{ environment: string; migrationState: string; bucketName: string }>();
  if (control?.environment !== "staging" || !["migrating", "ready"].includes(control.migrationState)
    || control.bucketName !== env.LEGAL_EVIDENCE_BUCKET_NAME) {
    throw new Error("SOURCE_SNAPSHOT_BUILD_TARGET_REJECTED");
  }
  const db = env.LEGAL_DB;
  const [build, observed, release, activation] = await Promise.all([
    db.prepare(`SELECT status,phase,inventory_sha256 AS inventoryIdentity,
      projection_sha256 AS projectionIdentity,release_sha256 AS releaseIdentity
      FROM legal_source_snapshot_builds WHERE id=?`).bind(BUILD_ID).first(),
    counts(db),
    db.prepare(`SELECT status,item_count AS itemCount FROM legal_search_releases WHERE id=?`)
      .bind(RELEASE_ID).first(),
    db.prepare(`SELECT count(*) AS count FROM legal_active_activation_sets WHERE environment='staging'`)
      .first<{ count: number }>(),
  ]);
  return { build, counts: observed, release, activeActivationSetCount: Number(activation?.count ?? 0),
    releaseId: RELEASE_ID, corpusSnapshotId: SNAPSHOT_ID };
}

export function isSourceSnapshotBuildPath(pathname: string): boolean {
  return pathname.startsWith(SOURCE_SNAPSHOT_BUILD_ROOT);
}

export async function handleSourceSnapshotBuildRequest(
  request: Request,
  env: SourceSnapshotBuildEnv,
): Promise<Response> {
  if (request.method !== "POST") return response({ code: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const input = inputSchema.parse(await request.json());
    const path = new URL(request.url).pathname;
    if (path === START_PATH) return response({ result: await startBuild(env) });
    if (path === ADVANCE_PATH) {
      return response({ result: await advanceBuild(env, input.injectPartialFailure === true, input.lane) });
    }
    if (path === RECONCILE_PATH) return response({ result: await reconcileBuild(env, input.lane) });
    if (path === FINALIZE_PATH) return response({ result: await finalizeBuild(env) });
    if (path === REPLAY_PATH) {
      if (!input.runId) throw new Error("SOURCE_SNAPSHOT_REPLAY_RUN_REQUIRED");
      return response({ result: await replayBuild(env, input.runId, input.lane) });
    }
    if (path === QUALIFY_PATH) {
      if (!input.qualification) throw new Error("SOURCE_SNAPSHOT_QUALIFICATION_EVIDENCE_REQUIRED");
      return response({ result: await qualifyBuild(env, input.qualification) });
    }
    if (path === DRY_RUN_PATH) return response({ result: await dryRun(env) });
    return response({ code: "NOT_FOUND" }, 404);
  } catch (error) {
    const code = error instanceof Error && /^[A-Z][A-Z0-9_:.-]{2,160}$/u.test(error.message)
      ? error.message : "SOURCE_SNAPSHOT_BUILD_FAILED";
    return response({ code }, code === "SOURCE_SNAPSHOT_INJECTED_PARTIAL_FAILURE" ? 503 : 409);
  }
}
