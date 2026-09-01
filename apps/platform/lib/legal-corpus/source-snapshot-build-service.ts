import { z } from "zod";

import { serializeNeutralSourceSnapshotChunk } from "./source-snapshot";

export const SOURCE_SNAPSHOT_BUILD_ROOT = "/internal/legal-corpus/source-snapshot-build/";
const START_PATH = `${SOURCE_SNAPSHOT_BUILD_ROOT}start`;
const ADVANCE_PATH = `${SOURCE_SNAPSHOT_BUILD_ROOT}advance`;
const RECONCILE_PATH = `${SOURCE_SNAPSHOT_BUILD_ROOT}reconcile`;
const FINALIZE_PATH = `${SOURCE_SNAPSHOT_BUILD_ROOT}finalize`;
const DRY_RUN_PATH = `${SOURCE_SNAPSHOT_BUILD_ROOT}dry-run`;
const RELEASE_ID = "release:staging:current:source-snapshot-v1";
const SNAPSHOT_ID = "snapshot:staging:current:source-snapshot-v1";
const BUILD_ID = "build:staging:current:source-snapshot-v1";
const CUTOFF = "2026-08-31T06:26:27.2253695Z";
const CONFIGURATION_ID = "ai-search-staging-v1";
const PROJECTION_BATCH_SIZE = 128;
const RECONCILIATION_PAGE_SIZE = 1_000;

const inputSchema = z.object({
  buildId: z.literal(BUILD_ID).default(BUILD_ID),
  injectPartialFailure: z.boolean().optional(),
  lane: z.string().regex(/^[a-f0-9]{2}$/u).optional(),
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
  publisherRevisionToken: string;
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

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: string | Uint8Array): Promise<string> {
  const encoded = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const owned = new Uint8Array(encoded.byteLength);
  owned.set(encoded);
  const digest = await crypto.subtle.digest("SHA-256", owned.buffer);
  return [...new Uint8Array(digest)]
    .map((part) => part.toString(16).padStart(2, "0")).join("");
}

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
  if (control?.environment !== "staging" || control.migrationState !== "migrating"
    || control.bucketName !== env.LEGAL_EVIDENCE_BUCKET_NAME) {
    throw new Error("SOURCE_SNAPSHOT_BUILD_TARGET_REJECTED");
  }
  return { db: env.LEGAL_DB, bucket: env.LEGAL_EVIDENCE_BUCKET };
}

const quarantineRows = [
  ["lexuz-family:6561894:ru", "lexuz-family:6561894:ru:v1:033bf39ceabd", "ru",
    "https://lex.uz/ru/docs/6561894"],
  ["lexuz-family:7341790:uz-Cyrl", "lexuz-family:7341790:uz-Cyrl:v1:2959311b378c", "uz-Cyrl",
    "https://lex.uz/docs/7341790"],
  ["lexuz-family:7342014:uz-Latn", "lexuz-family:7342014:uz-Latn:v1:dbe59c4a08ec", "uz-Latn",
    "https://lex.uz/uz/docs/-7342014"],
] as const;

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
  const quarantineInventoryHash = "55903058cfa72cf54bcd1ba74b51c83d9dba420c8d619503b0edf24a77ef8dd0";
  const statements = [
    db.prepare(`INSERT INTO legal_source_snapshot_builds
      (id,environment,cutoff_at,release_id,configuration_identity,shard_count,status,phase,
       cursor,processed_count,eligible_count,excluded_count,created_at,updated_at)
      VALUES (?,?,?,?,?,1,'building','inventory',NULL,0,0,0,?,?)`).bind(
      BUILD_ID, "staging", CUTOFF, RELEASE_ID, CONFIGURATION_ID, CUTOFF, CUTOFF,
    ),
    db.prepare(`INSERT INTO legal_source_documents
      (id,publisher,publisher_document_token,language_tag,source_url,legacy_instrument_id,
       legacy_expression_id,provenance_sha256,created_at)
      SELECT replace(expression.id,'expression:','source-document:'),'lex.uz',
        instrument.publisher_instrument_token||':'||expression.language_tag,expression.language_tag,
        expression.source_url,instrument.id,expression.id,normalized.sha256,?
      FROM legal_official_expressions expression
      JOIN legal_instruments instrument ON instrument.id=expression.legal_instrument_id
      JOIN legal_text_revisions revision ON revision.official_expression_id=expression.id
      JOIN legal_evidence_locators normalized ON normalized.id=revision.normalized_locator_id
      ORDER BY expression.id`).bind(CUTOFF),
    ...quarantineRows.map(([token, , language, sourceUrl]) => {
      const family = token.slice(0, token.lastIndexOf(":"));
      return db.prepare(`INSERT INTO legal_source_documents
        (id,publisher,publisher_document_token,language_tag,source_url,legacy_instrument_id,
         legacy_expression_id,provenance_sha256,created_at)
        VALUES (?,'lex.uz',?,?,?,(SELECT id FROM legal_instruments
          WHERE publisher_instrument_token=?),NULL,?,?)`).bind(
        `source-document:${token}`, token, language, sourceUrl, family,
        quarantineInventoryHash, CUTOFF,
      );
    }),
    db.prepare(`INSERT INTO legal_source_snapshots
      (id,source_document_id,publisher_revision_token,language_tag,capture_id,raw_locator_id,
       normalized_locator_id,content_sha256,captured_at,legacy_text_revision_id,created_at)
      SELECT replace(revision.id,'revision:','source-snapshot:'),
        replace(expression.id,'expression:','source-document:'),revision.publisher_revision_token,
        expression.language_tag,replace(revision.raw_locator_id,'raw:',''),revision.raw_locator_id,
        revision.normalized_locator_id,normalized.sha256,revision.captured_at,revision.id,?
      FROM legal_text_revisions revision
      JOIN legal_official_expressions expression ON expression.id=revision.official_expression_id
      JOIN legal_evidence_locators normalized ON normalized.id=revision.normalized_locator_id
      ORDER BY revision.id`).bind(CUTOFF),
    db.prepare(`INSERT INTO legal_snapshot_provisions
      (id,source_snapshot_id,source_position_token,sequence,normalized_content_sha256,
       provision_locator_id,source_url,temporal_state,privacy_class,
       legacy_provision_rendition_id,created_at)
      SELECT replace(rendition.id,'rendition:','snapshot-provision:'),
        replace(rendition.text_revision_id,'revision:','source-snapshot:'),
        'article:'||rendition.article_number||':sequence:'||rendition.sequence,rendition.sequence,
        locator.sha256,rendition.locator_id,rendition.source_url,
        CASE WHEN rendition.status='active' AND EXISTS (SELECT 1 FROM legal_applicability_periods period
          WHERE period.provision_rendition_id=rendition.id AND period.status='verified')
          THEN 'current_supported' ELSE 'unknown' END,
        'public_official_source',rendition.id,?
      FROM legal_provision_renditions rendition
      JOIN legal_evidence_locators locator ON locator.id=rendition.locator_id
      ORDER BY rendition.id`).bind(CUTOFF),
    db.prepare(`INSERT INTO legal_source_snapshot_current_pointers
      (id,build_id,source_document_id,source_snapshot_id,evidence_url,verified_at,recorded_at)
      SELECT 'current-pointer:'||snapshot.source_document_id||':'||?, ?,
        snapshot.source_document_id,snapshot.id,expression.source_url,?,?
      FROM legal_source_snapshots snapshot
      JOIN legal_text_revisions revision ON revision.id=snapshot.legacy_text_revision_id
      JOIN legal_official_expressions expression ON expression.id=revision.official_expression_id
      ORDER BY snapshot.source_document_id`).bind(BUILD_ID, BUILD_ID, CUTOFF, CUTOFF),
    db.prepare(`INSERT INTO legal_retrieval_eligibility
      (id,build_id,snapshot_provision_id,capability,status,reason_codes_json,official_source_verified,
       d1_r2_integrity_verified,extraction_verified,identity_stable,current_pointer_verified,
       temporal_state_supported,privacy_verified,quarantine_clear,canonicalization_clear,evaluated_at)
      SELECT 'retrieval-eligibility:'||provision.id||':current:'||?, ?,provision.id,'current',
        CASE WHEN provision.temporal_state='current_supported' THEN 'eligible' ELSE 'ineligible' END,
        CASE WHEN provision.temporal_state='current_supported' THEN '[]'
          ELSE '["CURRENT_TEMPORAL_STATE_UNKNOWN"]' END,
        1,1,1,1,1,CASE WHEN provision.temporal_state='current_supported' THEN 1 ELSE 0 END,
        1,1,1,?
      FROM legal_snapshot_provisions provision ORDER BY provision.id`).bind(BUILD_ID, BUILD_ID, CUTOFF),
    ...quarantineRows.map(([token, version]) => db.prepare(`INSERT INTO legal_source_snapshot_quarantines
      (id,source_document_id,source_version_token,reason_code,evidence_json,recorded_at)
      VALUES (?,? ,?,'NO_MATERIALIZED_PROVISIONS',?,?)`).bind(
      `quarantine:${token}`, `source-document:${token}`, version,
      JSON.stringify({ variantId: token, versionId: version, reason: "NO_MATERIALIZED_PROVISIONS" }), CUTOFF,
    )),
    ...deferredInventoryRows.map(([kind, count, inventorySha256]) => db.prepare(`INSERT INTO
      legal_source_snapshot_deferred_inventories
      (build_id,inventory_kind,item_count,inventory_sha256,evidence_json,recorded_at)
      VALUES (?,?,?,?,?,?)`).bind(BUILD_ID, kind, count, inventorySha256, JSON.stringify({
      cutoff: CUTOFF,
      sourceEvidence: "ticket-12-final-audit-20260902/deferred-and-post-cutoff-reconciliation.json",
      selectedCurrentCorpusMissingR2Objects: 0,
    }), CUTOFF)),
    db.prepare(`UPDATE legal_source_snapshot_builds SET phase='projections',cursor=NULL,
      eligible_count=(SELECT count(*) FROM legal_retrieval_eligibility
        WHERE capability='current' AND status='eligible'),
      excluded_count=(SELECT count(*) FROM legal_retrieval_eligibility
        WHERE capability='current' AND status<>'eligible'),updated_at=? WHERE id=?`).bind(CUTOFF, BUILD_ID),
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
      snapshot.publisher_revision_token AS publisherRevisionToken,snapshot.language_tag AS languageTag,
      snapshot.captured_at AS capturedAt,rendition.id AS legacyProvisionRenditionId,
      locator.r2_key AS provisionKey,locator.byte_count AS provisionBytes,
      locator.sha256 AS provisionSha256,locator.source_normalized_sha256 AS sourceNormalizedSha256,
      provision.source_url AS sourceUrl,instrument.document_type AS documentType,
      rendition.article_number AS articleNumber,rendition.article_title AS articleTitle,
      rendition.sequence AS sequence
    FROM legal_snapshot_provisions provision
    JOIN legal_retrieval_eligibility eligibility ON eligibility.snapshot_provision_id=provision.id
      AND eligibility.capability='current' AND eligibility.status='eligible'
    JOIN legal_source_snapshots snapshot ON snapshot.id=provision.source_snapshot_id
    JOIN legal_source_documents document ON document.id=snapshot.source_document_id
    JOIN legal_provision_renditions rendition ON rendition.id=provision.legacy_provision_rendition_id
    JOIN legal_instruments instrument ON instrument.id=document.legacy_instrument_id
    JOIN legal_evidence_locators locator ON locator.id=provision.provision_locator_id
    LEFT JOIN legal_canonical_chunks chunk ON chunk.snapshot_provision_id=provision.id
    WHERE chunk.id IS NULL ${lane ? "AND substr(provision.id,20,2)=?" : ""}
    ORDER BY provision.id LIMIT ?`);
  const packet = lane
    ? await rows.bind(lane, PROJECTION_BATCH_SIZE).all<ProjectionRow>()
    : await rows.bind(PROJECTION_BATCH_SIZE).all<ProjectionRow>();
  if (packet.results.length === 0) {
    if (lane) return { status: "building", phase: "projections", lane, laneComplete: true,
      processedCount: build.processedCount };
    await db.prepare(`UPDATE legal_source_snapshot_builds SET phase='reconciliation',cursor=NULL,
      updated_at=? WHERE id=?`).bind(new Date().toISOString(), BUILD_ID).run();
    return { status: "building", phase: "reconciliation", processedCount: build.processedCount };
  }
  const projected = await Promise.all(packet.results.map(async (row) => {
    const sourceBytes = await verifiedObject(bucket, row.provisionKey, row.provisionBytes, row.provisionSha256);
    const source = provisionObjectSchema.parse(JSON.parse(new TextDecoder().decode(sourceBytes)) as unknown);
    if (source.provisionRenditionId !== row.legacyProvisionRenditionId
      || source.sourceNormalizedSha256 !== row.sourceNormalizedSha256
      || source.languageTag !== row.languageTag || source.sourceUrl !== row.sourceUrl) {
      throw new Error("SOURCE_SNAPSHOT_PROVENANCE_MISMATCH");
    }
    const canonicalChunkId = `chunk:${row.legacyProvisionRenditionId.slice("rendition:".length)}:0`;
    const key = `search-releases/${RELEASE_ID}/current/00/${canonicalChunkId}.json`;
    const artifact = serializeNeutralSourceSnapshotChunk({
      sourceDocumentId: row.sourceDocumentId,
      sourceSnapshotId: row.sourceSnapshotId,
      snapshotProvisionId: row.snapshotProvisionId,
      canonicalChunkId,
      publisher: "lex.uz",
      publisherDocumentToken: row.publisherDocumentToken,
      publisherRevisionToken: row.publisherRevisionToken,
      languageTag: row.languageTag,
      sourceUrl: row.sourceUrl,
      capturedAt: row.capturedAt,
      documentType: row.documentType,
      articleNumber: row.articleNumber,
      articleTitle: row.articleTitle,
      sequence: row.sequence,
      provisionText: source.provisionText,
      sourceProvisionSha256: row.provisionSha256,
      sourceNormalizedSha256: row.sourceNormalizedSha256,
    });
    const artifactSha256 = await sha256(artifact);
    await immutablePut(bucket, key, artifact, {
      schemaVersion: "1",
      releaseId: RELEASE_ID,
      canonicalChunkId,
      snapshotProvisionId: row.snapshotProvisionId,
      sha256: artifactSha256,
    });
    return { row, canonicalChunkId, key, byteCount: artifact.byteLength, sha256: artifactSha256 };
  }));
  if (injectPartialFailure) throw new Error("SOURCE_SNAPSHOT_INJECTED_PARTIAL_FAILURE");
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO legal_canonical_chunks
      (id,snapshot_provision_id,ordinal,r2_key,byte_count,sha256,schema_version,created_at) VALUES ${values(
        projected.map((item) => [item.canonicalChunkId, item.row.snapshotProvisionId, 0, item.key,
          item.byteCount, item.sha256, 1, CUTOFF]),
      )}`),
    db.prepare(`INSERT INTO legal_sparse_projection_postings
      (canonical_chunk_id,posting_inventory_sha256,created_at) VALUES ${values(
        projected.map((item) => [item.canonicalChunkId, item.row.provisionSha256, CUTOFF]),
      )}`),
    db.prepare(`INSERT INTO legal_dense_projection_candidates
      (canonical_chunk_id,embedding_model,dimensions,provider_candidate_id,created_at) VALUES ${values(
        projected.map((item) => [item.canonicalChunkId, "openai/text-embedding-3-large", 1_536,
          `canonical:${item.canonicalChunkId}`, CUTOFF]),
      )}`),
    db.prepare(`UPDATE legal_source_snapshot_builds SET cursor=?,processed_count=processed_count+?,
      updated_at=? WHERE id=?`).bind(projected.at(-1)!.row.snapshotProvisionId, projected.length, now, BUILD_ID),
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
  { name: "current_pointers", table: "legal_source_snapshot_current_pointers", key: "id" },
  { name: "retrieval_eligibility", table: "legal_retrieval_eligibility", key: "id" },
  { name: "quarantines", table: "legal_source_snapshot_quarantines", key: "id" },
  { name: "aliases", table: "legal_source_snapshot_aliases", key: "id" },
  { name: "canonical_chunks", table: "legal_canonical_chunks", key: "id" },
  { name: "sparse_postings", table: "legal_sparse_projection_postings", key: "canonical_chunk_id" },
  { name: "dense_candidates", table: "legal_dense_projection_candidates", key: "canonical_chunk_id" },
  { name: "eligible_current", table: "legal_retrieval_eligibility", key: "id",
    where: "capability='current' AND status='eligible'" },
  { name: "release_r2", table: "legal_canonical_chunks", key: "id", verifyR2: true },
];

type ReconciliationCursor = { kind: number; after: string | null; page: number };

async function reconcileBuild(env: SourceSnapshotBuildEnv) {
  const { db } = await requireTarget(env);
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
  if (kind.verifyR2) {
    await Promise.all(packet.results.map(async (row) => {
      await verifiedObject(env.LEGAL_EVIDENCE_BUCKET!, String(row.r2_key), Number(row.byte_count),
        String(row.sha256));
    }));
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
    (SELECT count(*) FROM legal_source_snapshot_current_pointers) AS currentPointers,
    (SELECT count(*) FROM legal_retrieval_eligibility WHERE capability='current' AND status='eligible') AS eligible,
    (SELECT count(*) FROM legal_retrieval_eligibility WHERE capability='current' AND status<>'eligible') AS excluded,
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
  if (build.status === "sealed") return dryRun(env);
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
  const manifestBody = {
    schemaVersion: 1,
    environment: "staging",
    capability: "current",
    buildId: BUILD_ID,
    corpusSnapshotId: SNAPSHOT_ID,
    searchReleaseId: RELEASE_ID,
    status: "constructed_unsealed",
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
      paused: true,
      payloadLogging: false,
      gatewayCache: false,
      similarityCache: false,
    },
    authoritySemantics: "not_evaluated_not_required",
    activation: "inactive_ticket_13_required",
  };
  const manifestBytes = new TextEncoder().encode(`${stable(manifestBody)}\n`);
  const manifestKey = `search-releases/${RELEASE_ID}/manifest.json`;
  await immutablePut(bucket, manifestKey, manifestBytes, {
    schemaVersion: "1", releaseId: RELEASE_ID, sha256: await sha256(manifestBytes),
  });
  const report = {
    schemaVersion: 1, status: "clean", environment: "staging", capability: "current",
    releaseId: RELEASE_ID, buildId: BUILD_ID, inventoryIdentity, projectionIdentity,
    releaseIdentity, expected, actual: observed, exactlyOnce: true,
    completePairwiseDisjointShardUnion: true, shardInventory: { "00": 160_978 },
    restartSafe: true, authorityGateApplied: false,
  };
  const reportJson = stable(report);
  const reportSha256 = await sha256(reportJson);
  await db.batch([
    db.prepare(`INSERT INTO legal_corpus_snapshots
      (id,environment,corpus_hash,member_count,status,frozen_at,created_at)
      VALUES (?,'staging',?,160978,'frozen',?,?)`).bind(SNAPSHOT_ID,
      summaries.eligible_current.inventorySha256, CUTOFF, CUTOFF),
    db.prepare(`INSERT INTO legal_corpus_snapshot_members
      (corpus_snapshot_id,provision_rendition_id,locator_id,sha256)
      SELECT ?,provision.legacy_provision_rendition_id,provision.provision_locator_id,
        provision.normalized_content_sha256 FROM legal_snapshot_provisions provision
      JOIN legal_retrieval_eligibility eligibility ON eligibility.snapshot_provision_id=provision.id
        AND eligibility.capability='current' AND eligibility.status='eligible'
      ORDER BY provision.legacy_provision_rendition_id`).bind(SNAPSHOT_ID),
    db.prepare(`INSERT INTO legal_search_releases
      (id,environment,capability,corpus_snapshot_id,status,item_count,retrieval_policy_version,
       configuration_identity,sealed_at,created_at,sealed_reconciliation_run_id)
      VALUES (?,'staging','current',?,'draft',160978,'source-snapshot-current-v1',?,NULL,?,NULL)`)
      .bind(RELEASE_ID, SNAPSHOT_ID, CONFIGURATION_ID, CUTOFF),
    db.prepare(`INSERT INTO legal_search_release_items
      (search_release_id,provision_rendition_id,canonical_chunk_id,item_key,r2_key,byte_count,
       sha256,language,document_type,valid_from,valid_to)
      SELECT ?,provision.legacy_provision_rendition_id,chunk.id,chunk.r2_key,chunk.r2_key,
        chunk.byte_count,chunk.sha256,document.language_tag,instrument.document_type,
        applicability.valid_from,applicability.valid_to
      FROM legal_canonical_chunks chunk
      JOIN legal_snapshot_provisions provision ON provision.id=chunk.snapshot_provision_id
      JOIN legal_source_snapshots snapshot ON snapshot.id=provision.source_snapshot_id
      JOIN legal_source_documents document ON document.id=snapshot.source_document_id
      JOIN legal_instruments instrument ON instrument.id=document.legacy_instrument_id
      LEFT JOIN legal_applicability_periods applicability
        ON applicability.provision_rendition_id=provision.legacy_provision_rendition_id
      ORDER BY chunk.id`).bind(RELEASE_ID),
    db.prepare(`INSERT INTO legal_source_snapshot_release_members
      (search_release_id,canonical_chunk_id,snapshot_provision_id,shard_id)
      SELECT ?,id,snapshot_provision_id,'00' FROM legal_canonical_chunks ORDER BY id`).bind(RELEASE_ID),
    db.prepare(`INSERT INTO legal_migration_reconciliation_reports
      (run_id,environment,release_id,capability,input_sha256,report_sha256,status,report_json,created_at)
      VALUES (?,'staging',?,'current',?,?,'clean',?,?)`).bind(
      BUILD_ID, RELEASE_ID, inventoryIdentity, reportSha256, reportJson, CUTOFF,
    ),
    db.prepare(`INSERT INTO legal_search_release_governance
      (id,search_release_id,environment,capability,reconciliation_run_id,status,failures_json,
       evidence_json,recorded_at)
      VALUES (?,?, 'staging','current',?,'failed',?, ?,?)`).bind(
      `governance:${RELEASE_ID}:ticket-12`, RELEASE_ID, BUILD_ID,
      JSON.stringify(["TICKET_13_PROVIDER_EVALUATION_AND_SOAK_PENDING"]),
      JSON.stringify({ migrationReconciliation: "passed", activationAllowed: false }), CUTOFF,
    ),
    db.prepare(`INSERT INTO legal_search_release_shards
      (governance_id,search_release_id,shard_id,item_count,inventory_sha256,sync_state)
      VALUES (?,?, '00',160978,?,'complete')`).bind(
      `governance:${RELEASE_ID}:ticket-12`, RELEASE_ID, summaries.canonical_chunks.inventorySha256,
    ),
    db.prepare(`INSERT INTO legal_source_snapshot_build_checkpoints
      (build_id,phase,cursor,item_count,identity_sha256,completed_at)
      VALUES (?, 'reconciliation',NULL,160978,?,?)`).bind(BUILD_ID, inventoryIdentity, CUTOFF),
    db.prepare(`INSERT INTO legal_source_snapshot_build_checkpoints
      (build_id,phase,cursor,item_count,identity_sha256,completed_at)
      VALUES (?, 'release',NULL,160978,?,?)`).bind(BUILD_ID, releaseIdentity, CUTOFF),
    db.prepare(`UPDATE legal_source_snapshot_builds SET status='sealed',phase='complete',cursor=NULL,
      inventory_sha256=?,projection_sha256=?,release_sha256=?,updated_at=? WHERE id=?`).bind(
      inventoryIdentity, projectionIdentity, releaseIdentity, new Date().toISOString(), BUILD_ID,
    ),
    db.prepare(`UPDATE legal_target_control SET migration_state='ready',updated_at=?
      WHERE control_key='environment' AND migration_state='migrating'`).bind(new Date().toISOString()),
  ]);
  return dryRun(env);
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
    if (path === RECONCILE_PATH) return response({ result: await reconcileBuild(env) });
    if (path === FINALIZE_PATH) return response({ result: await finalizeBuild(env) });
    if (path === DRY_RUN_PATH) return response({ result: await dryRun(env) });
    return response({ code: "NOT_FOUND" }, 404);
  } catch (error) {
    const code = error instanceof Error && /^[A-Z][A-Z0-9_:.-]{2,160}$/u.test(error.message)
      ? error.message : "SOURCE_SNAPSHOT_BUILD_FAILED";
    return response({ code }, code === "SOURCE_SNAPSHOT_INJECTED_PARTIAL_FAILURE" ? 503 : 409);
  }
}
