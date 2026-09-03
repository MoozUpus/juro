import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";

import {
  assertCompleteCorpusCutoffEvidence,
  assertCompleteCorpusR2Readback,
  completeCorpusLegalIdentitySha256,
  completeCorpusPricing,
  completeCorpusPublisherRevisionToken,
  completeCorpusSourceLaneBounds,
} from "../lib/legal-corpus/complete-corpus-audit";
import {
  buildRetrievalChunks,
  CUSTOM_EMBEDDING_DIMENSIONS,
  CUSTOM_EMBEDDING_INPUT_VERSION,
  CUSTOM_EMBEDDING_MODEL,
  CUSTOM_EMBEDDING_TRANSFORM_VERSION,
  CUSTOM_RETRIEVAL_CHUNK_POLICY_VERSION,
  serializeCustomEmbeddingInput,
} from "../lib/legal-corpus/custom-hybrid-index";
import { stableSourceSnapshotJson } from "../lib/legal-corpus/source-snapshot";

const ACCOUNT_ID = "e22babd36b65c99b69adf3de50df5227";
const SOURCE_DATABASE_ID = "bb716a96-b2fb-4823-90d6-6c228fed181a";
const TARGET_DATABASE_ID = "23863e4f-6a11-4c25-888a-63abf695248b";
const CUTOFF = "2026-08-31T06:26:27.2253695Z";
const SOURCE_TIME_TRAVEL_BOOKMARK = "00001fc0-00000006-000050d8-8d0a7d4edf4ab919646c241f8e32cde1";
const SOURCE_R2_BUCKET = "juro-staging-files";
const SOURCE_R2_INVENTORY_SHA256 = "cad0c9ad590329403ac498293235153535acb04d70555094906b84eb0bd6daa8";
const EXPECTED_SOURCE_RECORDS = 1_299_828;
const EXPECTED_HISTORICAL_CANDIDATES = 1_295_149;
const EXPECTED_TEMPORAL_GAPS = 4_679;
const EXPECTED_QUALIFIED_CURRENT = 160_978;
const PAGE_SIZE = 1_000;
const BATCH_PRICE_USD_PER_MILLION = 0.065;
const STANDARD_PRICE_USD_PER_MILLION = 0.13;
const LANES = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const retainedSourceEvidence = [
  {
    path: "evidence/ticket-12-cutoff-20260831/CUTOFF-REPORT.md",
    byteCount: 8_642,
    sha256: "fb26ce555798f5fbb85f64c5e31410914ba9597e17a59eeac73723dfc90fb5e0",
  },
  {
    path: "evidence/ticket-12-final-audit-20260902/deferred-and-post-cutoff-reconciliation.json",
    byteCount: 2_141_960,
    sha256: "bb66cc22f0294ccd4ac2c2d1c84e35832d49ffdd7537a3bde0a61953facc476e",
  },
  {
    path: "evidence/ticket-12-final-audit-20260902/current-source-r2-reconciliation.json",
    byteCount: 4_126_095,
    sha256: "90ed19625fa29b35fc70c0345654d67a94d608f7cb3dcd9ac28e46c8addea00c",
  },
  {
    path: "evidence/ticket-12-final-audit-20260902/canonicalization-report.json",
    byteCount: 2_971,
    sha256: "79104c8eac4d99f61b91f405a5097dc4c637cd6a4f735ae07768e0f517c7916a",
  },
] as const;
const providerCapacityEvidence = [
  {
    path: "evidence/ticket-25-custom-current-20260903/provider-credit-blocker.json",
    byteCount: 2_336,
    sha256: "24ca615bec7f46f07d29dca79595be0a63c667a222eb1d276258b804c0979401",
  },
  {
    path: "evidence/ticket-25-custom-current-20260903/provider-credit-recheck-20260904.json",
    byteCount: 1_244,
    sha256: "4c34437133dc89691092ddd089e5320daffabe3ba66d01c16a3ba719e8d180b2",
  },
] as const;

type SourceRow = {
  id: string;
  documentId: string;
  versionId: string;
  versionNumber: number;
  versionDate: string | null;
  versionContentSha256: string;
  rawObjectKey: string;
  normalizedObjectKey: string;
  language: "uz-Latn" | "uz-Cyrl" | "ru" | "en";
  articleNumber: string | null;
  articleNumberNormalized: string | null;
  articleTitle: string | null;
  part: string | null;
  chapter: string | null;
  section: string | null;
  sequence: number;
  text: string;
  contentSha256: string;
  validFrom: string | null;
  validTo: string | null;
  status: string;
};

type D1Result<Row> = {
  results?: Row[];
  meta?: { changed_db?: boolean; rows_written?: number };
};

type Arguments = {
  state: string;
  report: string;
  sourceR2Inventory: string;
  maxPages: number | null;
  verifiedReuseManifest: string | null;
  lanes: ReadonlyArray<typeof LANES[number]>;
  deferR2Verification: boolean;
  r2Concurrency: number;
};

function argument(name: string): string | null {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
}

function argumentsFromProcess(): Arguments {
  const state = argument("state");
  const report = argument("report");
  const sourceR2Inventory = argument("source-r2-inventory");
  const rawMaxPages = argument("max-pages");
  const rawLanes = argument("lanes");
  const rawR2Concurrency = argument("r2-concurrency");
  if (!state || !report || !sourceR2Inventory) throw new Error("TICKET28_OUTPUT_PATHS_REQUIRED");
  const maxPages = rawMaxPages === null ? null : Number(rawMaxPages);
  if (maxPages !== null && (!Number.isSafeInteger(maxPages) || maxPages < 1)) {
    throw new Error("TICKET28_MAX_PAGES_INVALID");
  }
  const lanes = rawLanes === null ? [...LANES] : rawLanes.split(",");
  if (lanes.length === 0 || new Set(lanes).size !== lanes.length
    || lanes.some((lane) => !LANES.includes(lane as typeof LANES[number]))) {
    throw new Error("TICKET28_LANES_INVALID");
  }
  const r2Concurrency = rawR2Concurrency === null ? 4 : Number(rawR2Concurrency);
  if (!Number.isSafeInteger(r2Concurrency) || r2Concurrency < 1 || r2Concurrency > 32) {
    throw new Error("TICKET28_R2_CONCURRENCY_INVALID");
  }
  return {
    state: resolve(state),
    report: resolve(report),
    sourceR2Inventory: resolve(sourceR2Inventory),
    maxPages,
    verifiedReuseManifest: argument("verified-reuse-manifest")
      ? resolve(argument("verified-reuse-manifest")!)
      : null,
    lanes: lanes as Array<typeof LANES[number]>,
    deferR2Verification: process.argv.includes("--defer-r2-verification"),
    r2Concurrency,
  };
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function dateInstant(value: string): string {
  return value.length === 10 ? `${value}T00:00:00.000Z` : value;
}

function epoch(value: string | null): number | null {
  if (value === null) return null;
  const milliseconds = Date.parse(dateInstant(value));
  if (!Number.isFinite(milliseconds)) throw new Error("TICKET28_APPLICABILITY_INVALID");
  return Math.floor(milliseconds / 1_000);
}

function scriptFor(language: SourceRow["language"]): "Latn" | "Cyrl" {
  return language === "ru" || language === "uz-Cyrl" ? "Cyrl" : "Latn";
}

function identifier(kind: string, identity: string): string {
  return `${kind}:${sha256(identity)}`;
}

function legacyTargetRenditionId(row: SourceRow): string {
  const script = scriptFor(row.language);
  const instrumentId = identifier("instrument", row.documentId);
  const expressionId = identifier(
    "expression",
    `${instrumentId}\u0000${row.language}\u0000${script}\u0000unknown`,
  );
  const revisionId = identifier("revision", `${expressionId}\u0000${row.versionContentSha256}`);
  const publisherProvisionToken = row.articleNumberNormalized
    ? `article:${row.articleNumberNormalized}:sequence:${row.sequence}`
    : `unnumbered:sequence:${row.sequence}`;
  const conceptId = identifier("concept", `${instrumentId}\u0000${publisherProvisionToken}`);
  return identifier("rendition", `${conceptId}\u0000${revisionId}`);
}

async function sourceLegalIdentitySha256(row: SourceRow, articleNumber: string): Promise<string> {
  return completeCorpusLegalIdentitySha256({
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
}

async function loadRootToken(): Promise<string> {
  if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_ACCOUNT_ID !== ACCOUNT_ID) {
    throw new Error("TICKET28_CLOUDFLARE_ACCOUNT_MISMATCH");
  }
  const rootEnvironment = await readFile(resolve(process.cwd(), "../../.env"), "utf8");
  const tokenLine = rootEnvironment.split(/\r?\n/u)
    .find((line) => line.startsWith("CLOUDFLARE_API_TOKEN="));
  const token = tokenLine?.slice("CLOUDFLARE_API_TOKEN=".length).trim()
    .replace(/^['"]|['"]$/gu, "");
  if (!token) throw new Error("TICKET28_CLOUDFLARE_API_TOKEN_REQUIRED");
  return token;
}

async function query<Row>(token: string, databaseId: string, sql: string, params: unknown[]): Promise<Row[]> {
  let lastFailure: unknown;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${databaseId}/query`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ sql, params }),
        },
      );
      const body = await response.json() as {
        success: boolean;
        errors?: unknown[];
        result?: Array<D1Result<Row>>;
      };
      const result = body.result?.[0];
      if (!response.ok || !body.success || !result || result.meta?.changed_db
        || Number(result.meta?.rows_written ?? 0) !== 0) {
        throw new Error(`TICKET28_D1_READ_FAILED:${response.status}:${stableSourceSnapshotJson(body.errors ?? [])}`);
      }
      return result.results ?? [];
    } catch (error) {
      lastFailure = error;
      if (attempt < 5) await new Promise((accept) => setTimeout(accept, attempt * 1_000));
    }
  }
  throw lastFailure;
}

function initialize(db: DatabaseSync): void {
  db.exec("PRAGMA busy_timeout=30000;");
  db.exec(`PRAGMA journal_mode=WAL;
    PRAGMA synchronous=FULL;
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS configuration (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS qualified_current (
      rendition_id TEXT PRIMARY KEY
    ) STRICT;
    CREATE TABLE IF NOT EXISTS cursors (
      lane TEXT PRIMARY KEY,
      source_cursor TEXT NOT NULL,
      page_count INTEGER NOT NULL,
      complete INTEGER NOT NULL CHECK (complete IN (0,1))
    ) STRICT;
    CREATE TABLE IF NOT EXISTS records (
      source_id TEXT PRIMARY KEY,
      legal_identity_sha256 TEXT NOT NULL UNIQUE,
      target_rendition_id TEXT NOT NULL UNIQUE,
      material_sha256 TEXT NOT NULL,
      content_sha256 TEXT NOT NULL,
      raw_object_key TEXT NOT NULL,
      normalized_object_key TEXT NOT NULL,
      current_eligible INTEGER NOT NULL CHECK (current_eligible IN (0,1)),
      historical_eligible INTEGER NOT NULL CHECK (historical_eligible IN (0,1)),
      temporal_gap INTEGER NOT NULL CHECK (temporal_gap IN (0,1))
    ) STRICT;
    CREATE TABLE IF NOT EXISTS chunks (
      chunk_id TEXT PRIMARY KEY,
      legal_identity_sha256 TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      official_text_sha256 TEXT NOT NULL,
      input_sha256 TEXT NOT NULL,
      token_count INTEGER NOT NULL,
      current_eligible INTEGER NOT NULL CHECK (current_eligible IN (0,1)),
      historical_eligible INTEGER NOT NULL CHECK (historical_eligible IN (0,1)),
      UNIQUE (legal_identity_sha256, ordinal)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS inputs (
      input_sha256 TEXT PRIMARY KEY,
      token_count INTEGER NOT NULL,
      occurrence_count INTEGER NOT NULL,
      current_occurrence_count INTEGER NOT NULL,
      historical_occurrence_count INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS verified_reuse (
      input_sha256 TEXT PRIMARY KEY,
      artifact_key TEXT NOT NULL,
      vector_sha256 TEXT NOT NULL,
      byte_count INTEGER NOT NULL,
      readback_sha256 TEXT NOT NULL,
      bucket_name TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS reusable_artifacts (
      bucket_name TEXT NOT NULL,
      artifact_key TEXT NOT NULL,
      input_sha256 TEXT NOT NULL,
      vector_sha256 TEXT NOT NULL,
      byte_count INTEGER NOT NULL,
      readback_sha256 TEXT NOT NULL,
      PRIMARY KEY (bucket_name,artifact_key)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS source_r2_inventory (
      object_key TEXT PRIMARY KEY,
      byte_count INTEGER NOT NULL,
      etag TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      source_sha256 TEXT,
      normalized_sha256 TEXT,
      version_sha256 TEXT
    ) STRICT;
    CREATE TABLE IF NOT EXISTS required_source_objects (
      object_key TEXT PRIMARY KEY,
      role TEXT NOT NULL CHECK (role IN ('raw','normalized')),
      byte_count INTEGER NOT NULL,
      etag TEXT NOT NULL,
      verified_sha256 TEXT,
      verified_at TEXT,
      FOREIGN KEY (object_key) REFERENCES source_r2_inventory(object_key)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS source_revision_object_aliases (
      source_id TEXT PRIMARY KEY,
      normalized_object_key TEXT NOT NULL,
      revision_version_sha256 TEXT NOT NULL,
      object_metadata_version_sha256 TEXT NOT NULL,
      FOREIGN KEY (source_id) REFERENCES records(source_id),
      FOREIGN KEY (normalized_object_key) REFERENCES source_r2_inventory(object_key)
    ) STRICT;`);
  const configuration = {
    accountId: ACCOUNT_ID,
    sourceDatabaseId: SOURCE_DATABASE_ID,
    targetDatabaseId: TARGET_DATABASE_ID,
    cutoff: CUTOFF,
    sourceTimeTravelBookmark: SOURCE_TIME_TRAVEL_BOOKMARK,
    sourceR2Bucket: SOURCE_R2_BUCKET,
    sourceR2InventorySha256: SOURCE_R2_INVENTORY_SHA256,
    pageSize: PAGE_SIZE,
    chunkPolicy: CUSTOM_RETRIEVAL_CHUNK_POLICY_VERSION,
    targetTokens: 512,
    overlapTokens: 0,
    tokenizer: "cl100k_base:gpt-tokenizer@4.0.0",
    provider: "openai",
    model: CUSTOM_EMBEDDING_MODEL,
    dimensions: CUSTOM_EMBEDDING_DIMENSIONS,
    inputVersion: CUSTOM_EMBEDDING_INPUT_VERSION,
    transformVersion: CUSTOM_EMBEDDING_TRANSFORM_VERSION,
  };
  const value = stableSourceSnapshotJson(configuration);
  const stored = db.prepare("SELECT value FROM configuration WHERE key='identity'").get() as
    | { value: string }
    | undefined;
  if (stored && stored.value !== value) throw new Error("TICKET28_STATE_CONFIGURATION_MISMATCH");
  db.prepare("INSERT OR IGNORE INTO configuration (key,value) VALUES ('identity',?)").run(value);
  const insertCursor = db.prepare(`INSERT OR IGNORE INTO cursors
    (lane,source_cursor,page_count,complete) VALUES (?, '', 0, 0)`);
  for (const lane of LANES) insertCursor.run(lane);
}

type CutoffR2Object = {
  key: string;
  size: number;
  etag: string;
  uploaded: string;
  customMetadata?: {
    sourceSha256?: string;
    normalizedSha256?: string;
    versionSha256?: string;
  };
};

async function loadSourceR2Inventory(db: DatabaseSync, inventoryPath: string): Promise<void> {
  const parsed = JSON.parse(await readFile(inventoryPath, "utf8")) as {
    bucket?: string;
    cutoff?: string;
    cutoffInventorySha256?: string;
    cutoffObjects?: CutoffR2Object[];
  };
  if (parsed.bucket !== SOURCE_R2_BUCKET || parsed.cutoff !== CUTOFF
    || !Array.isArray(parsed.cutoffObjects)) {
    throw new Error("TICKET28_SOURCE_R2_INVENTORY_INVALID");
  }
  assertCompleteCorpusCutoffEvidence({
    expectedCutoff: CUTOFF,
    actualCutoff: parsed.cutoff,
    expectedBookmark: SOURCE_TIME_TRAVEL_BOOKMARK,
    actualBookmark: SOURCE_TIME_TRAVEL_BOOKMARK,
    expectedInventorySha256: SOURCE_R2_INVENTORY_SHA256,
    actualInventorySha256: sha256(JSON.stringify(parsed.cutoffObjects)),
  });
  const existing = scalar(db, "SELECT COUNT(*) value FROM source_r2_inventory");
  if (existing > 0) return;
  const insert = db.prepare(`INSERT INTO source_r2_inventory
    (object_key,byte_count,etag,uploaded_at,source_sha256,normalized_sha256,version_sha256)
    VALUES (?,?,?,?,?,?,?)`);
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const object of parsed.cutoffObjects) {
      if (!object.key.startsWith("legal-corpus/lex-uz/")
        || (!object.key.endsWith("/raw.html") && !object.key.endsWith("/normalized.json"))) continue;
      if (!Number.isSafeInteger(object.size) || object.size < 1 || !/^[a-f0-9]{32}$/u.test(object.etag)
        || object.uploaded > CUTOFF) throw new Error("TICKET28_SOURCE_R2_OBJECT_INVALID");
      insert.run(object.key, object.size, object.etag, object.uploaded,
        object.customMetadata?.sourceSha256 ?? null,
        object.customMetadata?.normalizedSha256 ?? null,
        object.customMetadata?.versionSha256 ?? null);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  if (scalar(db, "SELECT COUNT(*) value FROM source_r2_inventory") !== 43_680) {
    throw new Error("TICKET28_SOURCE_R2_LEGAL_INVENTORY_COUNT_MISMATCH");
  }
}

async function populateQualifiedCurrent(db: DatabaseSync, token: string): Promise<void> {
  const expected = db.prepare("SELECT COUNT(*) count FROM qualified_current").get() as { count: number };
  if (Number(expected.count) === EXPECTED_QUALIFIED_CURRENT) return;
  if (Number(expected.count) !== 0) throw new Error("TICKET28_QUALIFIED_CURRENT_PARTIAL");
  let cursor = "";
  const insert = db.prepare("INSERT INTO qualified_current (rendition_id) VALUES (?)");
  for (;;) {
    const rows = await query<{ renditionId: string }>(token, TARGET_DATABASE_ID, `SELECT
        member.provision_rendition_id AS renditionId
      FROM legal_corpus_snapshot_members member
      JOIN legal_snapshot_provisions provision
        ON provision.legacy_provision_rendition_id=member.provision_rendition_id
      JOIN legal_retrieval_eligibility eligibility
        ON eligibility.snapshot_provision_id=provision.id
        AND eligibility.build_id=? AND eligibility.capability='current'
        AND eligibility.status='eligible' AND eligibility.official_source_verified=1
        AND eligibility.d1_r2_integrity_verified=1 AND eligibility.extraction_verified=1
        AND eligibility.identity_stable=1 AND eligibility.current_pointer_verified=1
        AND eligibility.temporal_state_supported=1 AND eligibility.privacy_verified=1
        AND eligibility.quarantine_clear=1 AND eligibility.canonicalization_clear=1
      WHERE member.corpus_snapshot_id=? AND member.provision_rendition_id>?
      ORDER BY member.provision_rendition_id LIMIT ?`, [
      "build:staging:current:source-snapshot-qualification-v2",
      "snapshot:staging:current:source-snapshot-v1",
      cursor,
      PAGE_SIZE,
    ]);
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const row of rows) insert.run(row.renditionId);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    if (rows.length < PAGE_SIZE) break;
    cursor = rows.at(-1)!.renditionId;
  }
  const actual = db.prepare("SELECT COUNT(*) count FROM qualified_current").get() as { count: number };
  if (Number(actual.count) !== EXPECTED_QUALIFIED_CURRENT) {
    throw new Error(`TICKET28_QUALIFIED_CURRENT_COUNT_MISMATCH:${actual.count}`);
  }
}

const sourceSql = `SELECT p.id,p.document_id AS documentId,v.id AS versionId,
  v.version_number AS versionNumber,v.version_date AS versionDate,
  v.content_sha256 AS versionContentSha256,
  v.raw_object_key AS rawObjectKey,v.normalized_object_key AS normalizedObjectKey,
  p.language,p.article_number AS articleNumber,p.article_number_normalized AS articleNumberNormalized,
  p.article_title AS articleTitle,p.part,p.chapter,p.section,p.sequence,p.text,
  p.content_sha256 AS contentSha256,p.valid_from AS validFrom,p.valid_to AS validTo,p.status
  FROM legal_corpus_provisions p
  JOIN legal_corpus_versions v ON v.id=p.version_id
  WHERE p.id>? AND p.id>=? AND p.id<? AND p.created_at<=? AND v.created_at<=?
  ORDER BY p.id LIMIT ?`;

type Inserters = {
  qualified: StatementSync;
  sourceObject: StatementSync;
  requireSourceObject: StatementSync;
  verifySourceObject: StatementSync;
  revisionObjectAlias: StatementSync;
  record: StatementSync;
  priorRecord: StatementSync;
  chunk: StatementSync;
  input: StatementSync;
  cursor: StatementSync;
};

type RecordInsert = readonly [
  string, string, string, string, string, string, string, number, number, number,
];
type ChunkInsert = readonly [string, string, number, string, string, number, number, number];
type SourceObjectInsert = readonly [string, "raw" | "normalized", number, string, string | null];

function inserters(db: DatabaseSync): Inserters {
  return {
    qualified: db.prepare("SELECT 1 found FROM qualified_current WHERE rendition_id=?"),
    sourceObject: db.prepare(`SELECT byte_count AS byteCount,etag,source_sha256 AS sourceSha256,
      normalized_sha256 AS normalizedSha256,version_sha256 AS versionSha256
      FROM source_r2_inventory WHERE object_key=?`),
    requireSourceObject: db.prepare(`INSERT OR IGNORE INTO required_source_objects
      (object_key,role,byte_count,etag) VALUES (?,?,?,?)`),
    verifySourceObject: db.prepare(`UPDATE required_source_objects SET verified_sha256=?,verified_at=?
      WHERE object_key=? AND (verified_sha256 IS NULL OR verified_sha256=?)`),
    revisionObjectAlias: db.prepare(`INSERT OR IGNORE INTO source_revision_object_aliases
      (source_id,normalized_object_key,revision_version_sha256,object_metadata_version_sha256)
      VALUES (?,?,?,?)`),
    record: db.prepare(`INSERT OR IGNORE INTO records
      (source_id,legal_identity_sha256,target_rendition_id,material_sha256,content_sha256,
       raw_object_key,normalized_object_key,current_eligible,historical_eligible,temporal_gap)
      VALUES (?,?,?,?,?,?,?,?,?,?)`),
    priorRecord: db.prepare(`SELECT source_id AS sourceId,material_sha256 AS materialSha256
      FROM records WHERE legal_identity_sha256=?`),
    chunk: db.prepare(`INSERT OR IGNORE INTO chunks
      (chunk_id,legal_identity_sha256,ordinal,official_text_sha256,input_sha256,token_count,
       current_eligible,historical_eligible) VALUES (?,?,?,?,?,?,?,?)`),
    input: db.prepare(`INSERT INTO inputs
      (input_sha256,token_count,occurrence_count,current_occurrence_count,historical_occurrence_count)
      VALUES (?,?,1,?,?) ON CONFLICT(input_sha256) DO UPDATE SET
        occurrence_count=occurrence_count+1,
        current_occurrence_count=current_occurrence_count+excluded.current_occurrence_count,
        historical_occurrence_count=historical_occurrence_count+excluded.historical_occurrence_count
      WHERE inputs.token_count=excluded.token_count`),
    cursor: db.prepare(`UPDATE cursors SET source_cursor=?,page_count=page_count+1,complete=?
      WHERE lane=?`),
  };
}

async function prepareRow(
  row: SourceRow,
  statements: Inserters,
  normalizedEvidence: { documentTitle: string; verifiedSha256: string },
): Promise<{
  record: RecordInsert;
  chunks: ChunkInsert[];
  sourceObjects: SourceObjectInsert[];
  revisionObjectAlias: readonly [string, string, string, string] | null;
}> {
  if (sha256(row.text) !== row.contentSha256) throw new Error("TICKET28_SOURCE_TEXT_HASH_MISMATCH");
  if (!row.rawObjectKey || !row.normalizedObjectKey) throw new Error("TICKET28_SOURCE_LOCATOR_MISSING");
  type InventoryObject = {
    byteCount: number;
    etag: string;
    sourceSha256: string | null;
    normalizedSha256: string | null;
    versionSha256: string | null;
  };
  const raw = statements.sourceObject.get(row.rawObjectKey) as InventoryObject | undefined;
  const normalized = statements.sourceObject.get(row.normalizedObjectKey) as InventoryObject | undefined;
  if (!raw || !normalized) throw new Error("TICKET28_SOURCE_R2_CUTOFF_LOCATOR_MISSING");
  if (raw.sourceSha256 === null || normalized.sourceSha256 !== raw.sourceSha256) {
    throw new Error("TICKET28_SOURCE_R2_CAPTURE_IDENTITY_MISMATCH");
  }
  if (normalized.normalizedSha256 === null) {
    throw new Error("TICKET28_SOURCE_R2_NORMALIZED_HASH_MISSING");
  }
  const articleNumber = row.articleNumber?.trim()
    || row.articleNumberNormalized?.trim()
    || `unnumbered-${row.sequence}`;
  const renditionId = legacyTargetRenditionId(row);
  const legalIdentitySha256 = await sourceLegalIdentitySha256(row, articleNumber);
  const currentEligible = statements.qualified.get(renditionId) ? 1 : 0;
  const historicalEligible = row.validFrom === null ? 0 : 1;
  const temporalGap = row.validFrom === null ? 1 : 0;
  const materialSha256 = sha256(stableSourceSnapshotJson({
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
  const prior = statements.priorRecord.get(legalIdentitySha256) as
    | { sourceId: string; materialSha256: string }
    | undefined;
  if (prior && (prior.sourceId !== row.id || prior.materialSha256 !== materialSha256)) {
    throw new Error("TICKET28_CANONICAL_IDENTITY_CONFLICT");
  }
  const record = [
    row.id, legalIdentitySha256, renditionId, materialSha256, row.contentSha256,
    row.rawObjectKey, row.normalizedObjectKey, currentEligible, historicalEligible, temporalGap,
  ] as RecordInsert;
  const sourceObjects = [
    [row.rawObjectKey, "raw", raw.byteCount, raw.etag, null],
    [row.normalizedObjectKey, "normalized", normalized.byteCount, normalized.etag,
      normalizedEvidence.verifiedSha256],
  ] satisfies SourceObjectInsert[];
  const revisionObjectAlias = normalized.versionSha256 === row.versionContentSha256
    ? null
    : [row.id, row.normalizedObjectKey, row.versionContentSha256, normalized.versionSha256 ?? ""] as const;
  if (revisionObjectAlias && !/^[a-f0-9]{64}$/u.test(revisionObjectAlias[3])) {
    throw new Error("TICKET28_SOURCE_R2_VERSION_METADATA_INVALID");
  }
  if (temporalGap) return { record, chunks: [], sourceObjects: [...sourceObjects], revisionObjectAlias };
  const chunks = await buildRetrievalChunks({
    snapshotProvisionId: `audit:${legalIdentitySha256}`,
    sourceDocumentTitle: normalizedEvidence.documentTitle,
    documentType: "unknown",
    articleNumber,
    articleTitle: row.articleTitle,
    hierarchy: [row.part, row.chapter, row.section]
      .map((value) => value?.trim() ?? "")
      .filter(Boolean),
    language: row.language,
    script: scriptFor(row.language),
    officialText: row.text,
    validFromEpoch: epoch(row.validFrom)!,
    validToEpoch: epoch(row.validTo),
  }, { targetTokens: 512 });
  return {
    record,
    sourceObjects: [...sourceObjects],
    revisionObjectAlias,
    chunks: chunks.map((chunk) => {
      const inputSha256 = sha256(serializeCustomEmbeddingInput(chunk));
      return [
        chunk.id, legalIdentitySha256, chunk.ordinal, chunk.officialTextSha256,
        inputSha256, chunk.embeddingTokenCount, currentEligible, historicalEligible,
      ] as const;
    }),
  };
}

async function processLane(input: {
  db: DatabaseSync;
  token: string;
  lane: typeof LANES[number];
  statements: Inserters;
  pageBudget: { remaining: number | null };
}): Promise<void> {
  const checkpoint = input.db.prepare(`SELECT source_cursor AS sourceCursor,complete
    FROM cursors WHERE lane=?`).get(input.lane) as { sourceCursor: string; complete: number };
  if (checkpoint.complete) return;
  let cursor = checkpoint.sourceCursor;
  const normalizedCache = new Map<string, { documentTitle: string; verifiedSha256: string }>();
  const { lower, upper } = completeCorpusSourceLaneBounds(input.lane);
  for (;;) {
    if (input.pageBudget.remaining !== null && input.pageBudget.remaining <= 0) return;
    if (input.pageBudget.remaining !== null) input.pageBudget.remaining -= 1;
    const rows = await query<SourceRow>(input.token, SOURCE_DATABASE_ID, sourceSql, [
      cursor, lower, upper, CUTOFF, CUTOFF, PAGE_SIZE,
    ]);
    const prepared = [];
    for (const row of rows) {
      let normalizedEvidence = normalizedCache.get(row.normalizedObjectKey);
      if (!normalizedEvidence) {
        const inventory = input.statements.sourceObject.get(row.normalizedObjectKey) as
          | { byteCount: number; etag: string; normalizedSha256: string | null }
          | undefined;
        if (!inventory) throw new Error("TICKET28_SOURCE_R2_CUTOFF_LOCATOR_MISMATCH");
        const readback = await fetchAndVerifySourceObject(input.token, {
          objectKey: row.normalizedObjectKey,
          byteCount: inventory.byteCount,
          etag: inventory.etag,
        }, true);
        if (!readback.bytes) throw new Error("TICKET28_NORMALIZED_EVIDENCE_MISSING");
        if (readback.sha256 !== inventory.normalizedSha256) {
          throw new Error("TICKET28_NORMALIZED_EVIDENCE_SHA256_MISMATCH");
        }
        const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(readback.bytes)) as {
          documentTitle?: unknown;
        };
        if (typeof parsed.documentTitle !== "string" || parsed.documentTitle.trim().length === 0
          || parsed.documentTitle.length > 2_000) {
          throw new Error("TICKET28_NORMALIZED_EVIDENCE_INVALID");
        }
        normalizedEvidence = { documentTitle: parsed.documentTitle, verifiedSha256: readback.sha256 };
        normalizedCache.set(row.normalizedObjectKey, normalizedEvidence);
      }
      prepared.push(await prepareRow(row, input.statements, normalizedEvidence));
    }
    const complete = rows.length < PAGE_SIZE ? 1 : 0;
    const nextCursor = rows.at(-1)?.id ?? cursor;
    input.db.exec("BEGIN IMMEDIATE");
    try {
      for (const item of prepared) {
        const inserted = input.statements.record.run(...item.record);
        for (const sourceObject of item.sourceObjects) {
          input.statements.requireSourceObject.run(
            sourceObject[0], sourceObject[1], sourceObject[2], sourceObject[3],
          );
          if (sourceObject[4]) {
            input.statements.verifySourceObject.run(
              sourceObject[4], new Date().toISOString(), sourceObject[0], sourceObject[4],
            );
          }
        }
        if (item.revisionObjectAlias) {
          input.statements.revisionObjectAlias.run(...item.revisionObjectAlias);
        }
        if (Number(inserted.changes) === 0) continue;
        for (const chunk of item.chunks) {
          input.statements.chunk.run(...chunk);
          input.statements.input.run(chunk[4], chunk[5], chunk[6], chunk[7]);
        }
      }
      input.statements.cursor.run(nextCursor, complete, input.lane);
      input.db.exec("COMMIT");
    } catch (error) {
      input.db.exec("ROLLBACK");
      throw error;
    }
    cursor = nextCursor;
    if (complete) return;
  }
}

async function verifySourceCutoffControls(db: DatabaseSync, token: string): Promise<void> {
  const bookmarkUrl = new URL(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${SOURCE_DATABASE_ID}/time_travel/bookmark`,
  );
  bookmarkUrl.searchParams.set("timestamp", CUTOFF);
  const response = await fetch(bookmarkUrl, { headers: { authorization: `Bearer ${token}` } });
  const payload = await response.json() as {
    success?: boolean;
    result?: { bookmark?: string };
  };
  if (!response.ok || !payload.success || payload.result?.bookmark !== SOURCE_TIME_TRAVEL_BOOKMARK) {
    throw new Error("TICKET28_SOURCE_CUTOFF_BOOKMARK_MISMATCH");
  }
  assertCompleteCorpusCutoffEvidence({
    expectedCutoff: CUTOFF,
    actualCutoff: CUTOFF,
    expectedBookmark: SOURCE_TIME_TRAVEL_BOOKMARK,
    actualBookmark: payload.result.bookmark,
    expectedInventorySha256: SOURCE_R2_INVENTORY_SHA256,
    actualInventorySha256: SOURCE_R2_INVENTORY_SHA256,
  });
  const triggers = await query<{ name: string; sql: string }>(token, SOURCE_DATABASE_ID, `SELECT name,sql
    FROM sqlite_master WHERE type='trigger' AND name IN (
      'legal_corpus_versions_immutable_guard','legal_corpus_versions_no_delete',
      'legal_corpus_provisions_immutable_guard','legal_corpus_provisions_no_delete'
    ) ORDER BY name`, []);
  if (triggers.length !== 4 || triggers.some((trigger) => !trigger.sql.includes("RAISE(ABORT"))) {
    throw new Error("TICKET28_SOURCE_IMMUTABILITY_GUARD_MISSING");
  }
  const insert = db.prepare("INSERT OR IGNORE INTO configuration (key,value) VALUES (?,?)");
  insert.run("source_cutoff_bookmark_verified", SOURCE_TIME_TRAVEL_BOOKMARK);
  insert.run("source_immutability_guard_sha256", sha256(stableSourceSnapshotJson(triggers)));
}

async function fetchAndVerifySourceObject(token: string, input: {
  objectKey: string;
  byteCount: number;
  etag: string;
}, collectBytes = false): Promise<{ sha256: string; bytes?: Uint8Array }> {
  let lastFailure: unknown;
  const encodedKey = input.objectKey.split("/").map((part) => encodeURIComponent(part)).join("/");
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${SOURCE_R2_BUCKET}/objects/${encodedKey}`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (response.status === 429 && attempt < 12) {
        const retryAfterSeconds = Number(response.headers.get("retry-after"));
        const delayMilliseconds = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? Math.min(60_000, retryAfterSeconds * 1_000)
          : Math.min(30_000, attempt * 2_000);
        await new Promise((accept) => setTimeout(accept, delayMilliseconds));
        continue;
      }
      if (!response.ok || !response.body) throw new Error(`TICKET28_SOURCE_R2_READ_FAILED:${response.status}`);
      const sha = createHash("sha256");
      const md5 = createHash("md5");
      let byteCount = 0;
      const chunks: Uint8Array[] = [];
      const reader = response.body.getReader();
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        sha.update(result.value);
        md5.update(result.value);
        byteCount += result.value.byteLength;
        if (collectBytes) chunks.push(result.value);
      }
      assertCompleteCorpusR2Readback({
        expectedByteCount: input.byteCount,
        actualByteCount: byteCount,
        expectedEtag: input.etag,
        actualMd5: md5.digest("hex"),
      });
      const verifiedSha256 = sha.digest("hex");
      if (!collectBytes) return { sha256: verifiedSha256 };
      const bytes = new Uint8Array(byteCount);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return { sha256: verifiedSha256, bytes };
    } catch (error) {
      lastFailure = error;
      if (attempt < 12) {
        await new Promise((accept) => setTimeout(accept, Math.min(30_000, attempt * 2_000)));
      }
    }
  }
  throw lastFailure;
}

async function verifyRequiredSourceObjects(
  db: DatabaseSync,
  token: string,
  concurrency = 4,
): Promise<void> {
  const rows = db.prepare(`SELECT required.object_key AS objectKey,
      required.byte_count AS byteCount,required.etag,
      CASE required.role WHEN 'raw' THEN inventory.source_sha256
        ELSE inventory.normalized_sha256 END AS expectedSha256
    FROM required_source_objects required
    JOIN source_r2_inventory inventory ON inventory.object_key=required.object_key
    WHERE required.verified_sha256 IS NULL
    ORDER BY required.byte_count DESC,required.object_key`).all() as Array<{
      objectKey: string;
      byteCount: number;
      etag: string;
      expectedSha256: string;
    }>;
  const update = db.prepare(`UPDATE required_source_objects SET verified_sha256=?,verified_at=?
    WHERE object_key=? AND verified_sha256 IS NULL`);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      const row = rows[index];
      if (!row) return;
      const readback = await fetchAndVerifySourceObject(token, row);
      if (readback.sha256 !== row.expectedSha256) {
        throw new Error("TICKET28_SOURCE_R2_SHA256_MISMATCH");
      }
      update.run(readback.sha256, new Date().toISOString(), row.objectKey);
    }
  }));
}

async function loadVerifiedReuse(db: DatabaseSync, manifestPath: string | null): Promise<void> {
  if (!manifestPath) return;
  const parsed = JSON.parse(await readFile(manifestPath, "utf8")) as {
    artifacts?: Array<{
      inputSha256: string;
      artifactKey: string;
      vectorSha256: string;
      byteCount: number;
      readbackSha256: string;
      bucketName: string;
      verified: boolean;
    }>;
  };
  const insert = db.prepare(`INSERT OR REPLACE INTO verified_reuse
    (input_sha256,artifact_key,vector_sha256,byte_count,readback_sha256,bucket_name)
    VALUES (?,?,?,?,?,?)`);
  const insertArtifact = db.prepare(`INSERT OR REPLACE INTO reusable_artifacts
    (bucket_name,artifact_key,input_sha256,vector_sha256,byte_count,readback_sha256)
    VALUES (?,?,?,?,?,?)`);
  for (const item of parsed.artifacts ?? []) {
    if (!item.verified || item.byteCount !== CUSTOM_EMBEDDING_DIMENSIONS * 4
      || item.vectorSha256 !== item.readbackSha256
      || !/^[a-f0-9]{64}$/u.test(item.inputSha256)
      || !/^[a-f0-9]{64}$/u.test(item.vectorSha256)) {
      throw new Error("TICKET28_REUSE_MANIFEST_UNVERIFIED");
    }
    insert.run(item.inputSha256, item.artifactKey, item.vectorSha256, item.byteCount,
      item.readbackSha256, item.bucketName);
    insertArtifact.run(item.bucketName, item.artifactKey, item.inputSha256, item.vectorSha256,
      item.byteCount, item.readbackSha256);
  }
}

function scalar(db: DatabaseSync, sql: string): number {
  const row = db.prepare(sql).get() as { value: number };
  return Number(row.value);
}

function manifestRoot(db: DatabaseSync, sql: string): string {
  const digest = createHash("sha256");
  for (const row of db.prepare(sql).iterate() as Iterable<Record<string, unknown>>) {
    digest.update(stableSourceSnapshotJson(row));
    digest.update("\n");
  }
  return digest.digest("hex");
}

function tokenAt(db: DatabaseSync, offset: number): number {
  if (offset < 0) return 0;
  const row = db.prepare(`SELECT token_count AS value FROM inputs
    WHERE input_sha256 NOT IN (SELECT input_sha256 FROM verified_reuse)
    ORDER BY token_count,input_sha256 LIMIT 1 OFFSET ?`).get(offset) as { value: number } | undefined;
  return Number(row?.value ?? 0);
}

async function writeReport(db: DatabaseSync, output: string, elapsedMilliseconds: number): Promise<void> {
  const incomplete = scalar(db, "SELECT COUNT(*) value FROM cursors WHERE complete=0");
  const sourceRecords = scalar(db, "SELECT COUNT(*) value FROM records");
  const historicalCandidates = scalar(db, "SELECT SUM(historical_eligible) value FROM records");
  const temporalGaps = scalar(db, "SELECT SUM(temporal_gap) value FROM records");
  const qualifiedCurrent = scalar(db, "SELECT SUM(current_eligible) value FROM records");
  const retrievalChunks = scalar(db, "SELECT COUNT(*) value FROM chunks");
  const currentChunks = scalar(db, "SELECT SUM(current_eligible) value FROM chunks");
  const historicalChunks = scalar(db, "SELECT SUM(historical_eligible) value FROM chunks");
  const currentHistoricalChunks = scalar(db, `SELECT COUNT(*) value FROM chunks
    WHERE current_eligible=1 AND historical_eligible=1`);
  const distinctInputs = scalar(db, "SELECT COUNT(*) value FROM inputs");
  const currentInputs = scalar(db, `SELECT COUNT(*) value FROM inputs
    WHERE current_occurrence_count>0`);
  const historicalInputs = scalar(db, `SELECT COUNT(*) value FROM inputs
    WHERE historical_occurrence_count>0`);
  const currentHistoricalInputs = scalar(db, `SELECT COUNT(*) value FROM inputs
    WHERE current_occurrence_count>0 AND historical_occurrence_count>0`);
  const reusableInputs = scalar(db, `SELECT COUNT(*) value FROM inputs
    WHERE input_sha256 IN (SELECT input_sha256 FROM verified_reuse)`);
  const reusableArtifactCandidates = scalar(db, "SELECT COUNT(*) value FROM reusable_artifacts");
  const missingInputs = distinctInputs - reusableInputs;
  const exactMissingTokens = scalar(db, `SELECT COALESCE(SUM(token_count),0) value FROM inputs
    WHERE input_sha256 NOT IN (SELECT input_sha256 FROM verified_reuse)`);
  const currentMissingInputs = scalar(db, `SELECT COUNT(*) value FROM inputs
    WHERE current_occurrence_count>0
      AND input_sha256 NOT IN (SELECT input_sha256 FROM verified_reuse)`);
  const historicalMissingInputs = scalar(db, `SELECT COUNT(*) value FROM inputs
    WHERE historical_occurrence_count>0
      AND input_sha256 NOT IN (SELECT input_sha256 FROM verified_reuse)`);
  const currentHistoricalMissingInputs = scalar(db, `SELECT COUNT(*) value FROM inputs
    WHERE current_occurrence_count>0 AND historical_occurrence_count>0
      AND input_sha256 NOT IN (SELECT input_sha256 FROM verified_reuse)`);
  const currentMissingTokens = scalar(db, `SELECT COALESCE(SUM(token_count),0) value FROM inputs
    WHERE current_occurrence_count>0
      AND input_sha256 NOT IN (SELECT input_sha256 FROM verified_reuse)`);
  const historicalMissingTokens = scalar(db, `SELECT COALESCE(SUM(token_count),0) value FROM inputs
    WHERE historical_occurrence_count>0
      AND input_sha256 NOT IN (SELECT input_sha256 FROM verified_reuse)`);
  const distinctProvisionBodies = scalar(db, "SELECT COUNT(DISTINCT content_sha256) value FROM records");
  const requiredSourceObjects = scalar(db, "SELECT COUNT(*) value FROM required_source_objects");
  const verifiedSourceObjects = scalar(db, `SELECT COUNT(*) value FROM required_source_objects
    WHERE verified_sha256 IS NOT NULL`);
  const requiredSourceBytes = scalar(db, "SELECT COALESCE(SUM(byte_count),0) value FROM required_source_objects");
  const revisionObjectAliases = scalar(db, "SELECT COUNT(*) value FROM source_revision_object_aliases");
  const complete = incomplete === 0 && requiredSourceObjects > 0
    && verifiedSourceObjects === requiredSourceObjects;
  if (complete && (sourceRecords !== EXPECTED_SOURCE_RECORDS
    || historicalCandidates !== EXPECTED_HISTORICAL_CANDIDATES
    || temporalGaps !== EXPECTED_TEMPORAL_GAPS
    || qualifiedCurrent !== EXPECTED_QUALIFIED_CURRENT)) {
    throw new Error(`TICKET28_EXACT_RECONCILIATION_FAILED:${stableSourceSnapshotJson({
      sourceRecords, historicalCandidates, temporalGaps, qualifiedCurrent,
    })}`);
  }
  const batchPrice = completeCorpusPricing(exactMissingTokens, BATCH_PRICE_USD_PER_MILLION);
  const standardPrice = completeCorpusPricing(exactMissingTokens, STANDARD_PRICE_USD_PER_MILLION);
  const rawBatchCost = batchPrice.rawUsd;
  const rawStandardCost = standardPrice.rawUsd;
  const report = {
    schemaVersion: 1,
    status: complete ? "complete" : "interrupted",
    contentFree: true,
    readOnlySource: true,
    providerUploads: 0,
    providerRequests: 0,
    accountId: ACCOUNT_ID,
    sourceDatabaseId: SOURCE_DATABASE_ID,
    qualifiedCurrentDatabaseId: TARGET_DATABASE_ID,
    cutoff: CUTOFF,
    sourceTimeTravelBookmark: SOURCE_TIME_TRAVEL_BOOKMARK,
    sourceCutoffControls: {
      bookmarkVerified: (db.prepare(`SELECT value FROM configuration
        WHERE key='source_cutoff_bookmark_verified'`).get() as { value?: string } | undefined)?.value
        === SOURCE_TIME_TRAVEL_BOOKMARK,
      sourceRowsBoundedByCreatedAt: true,
      immutableVersionAndProvisionGuardSha256: (db.prepare(`SELECT value FROM configuration
        WHERE key='source_immutability_guard_sha256'`).get() as { value?: string } | undefined)?.value ?? null,
      mutableDocumentProjectionUsed: false,
      normalizedDocumentTitleReadFromCutoffR2: true,
    },
    sourceR2Integrity: {
      bucket: SOURCE_R2_BUCKET,
      cutoffInventorySha256: SOURCE_R2_INVENTORY_SHA256,
      requiredObjects: requiredSourceObjects,
      verifiedObjects: verifiedSourceObjects,
      requiredBytes: requiredSourceBytes,
      missingOrMismatchedObjects: requiredSourceObjects - verifiedSourceObjects,
      revisionObjectMetadataAliases: revisionObjectAliases,
      revisionObjectAliasSha256: complete ? manifestRoot(db, `SELECT source_id AS sourceId,
        normalized_object_key AS normalizedObjectKey,revision_version_sha256 AS revisionVersionSha256,
        object_metadata_version_sha256 AS objectMetadataVersionSha256
        FROM source_revision_object_aliases ORDER BY source_id`) : null,
      exact: verifiedSourceObjects === requiredSourceObjects,
      verificationSha256: complete ? manifestRoot(db, `SELECT object_key AS objectKey,role,
        byte_count AS byteCount,etag,verified_sha256 AS verifiedSha256
        FROM required_source_objects ORDER BY object_key`) : null,
    },
    contracts: {
      chunkPolicy: CUSTOM_RETRIEVAL_CHUNK_POLICY_VERSION,
      targetTokens: 512,
      overlapTokens: 0,
      tokenizer: "cl100k_base:gpt-tokenizer@4.0.0",
      provider: "openai",
      model: CUSTOM_EMBEDDING_MODEL,
      dimensions: CUSTOM_EMBEDDING_DIMENSIONS,
      inputVersion: CUSTOM_EMBEDDING_INPUT_VERSION,
      transformVersion: CUSTOM_EMBEDDING_TRANSFORM_VERSION,
    },
    reconciliation: {
      expectedSourceRecords: EXPECTED_SOURCE_RECORDS,
      sourceRecords,
      expectedHistoricalCandidates: EXPECTED_HISTORICAL_CANDIDATES,
      historicalCandidates,
      expectedTemporalGaps: EXPECTED_TEMPORAL_GAPS,
      temporalGaps,
      expectedQualifiedCurrent: EXPECTED_QUALIFIED_CURRENT,
      qualifiedCurrent,
      incompleteLanes: incomplete,
      exact: complete,
      retainedSources: {
        classification: "overlapping-retained-sources-not-additive-union",
        authoritativeCutoffInventory: "juro-staging",
        deferredAndPostCutoffItemsExcluded: true,
        evidence: retainedSourceEvidence,
        evidenceRootSha256: sha256(stableSourceSnapshotJson(retainedSourceEvidence)),
      },
    },
    deduplication: {
      canonicalLegalRecords: sourceRecords,
      distinctProvisionBodies,
      duplicateProvisionBodyReferences: sourceRecords - distinctProvisionBodies,
      retrievalChunks,
      distinctStructuredInputs: distinctInputs,
      duplicateStructuredInputs: retrievalChunks - distinctInputs,
      completeChunkToInputMappings: retrievalChunks,
      verifiedReusableInputs: reusableInputs,
      verifiedReusableArtifactCandidates: reusableArtifactCandidates,
      uniqueMissingInputs: missingInputs,
      capabilities: {
        current: {
          records: qualifiedCurrent,
          chunks: currentChunks,
          distinctStructuredInputs: currentInputs,
          uniqueMissingInputs: currentMissingInputs,
          exactMissingTokens: currentMissingTokens,
        },
        history: {
          records: historicalCandidates,
          chunks: historicalChunks,
          distinctStructuredInputs: historicalInputs,
          uniqueMissingInputs: historicalMissingInputs,
          exactMissingTokens: historicalMissingTokens,
        },
        overlap: {
          records: qualifiedCurrent,
          chunks: currentHistoricalChunks,
          distinctStructuredInputs: currentHistoricalInputs,
          uniqueMissingInputs: currentHistoricalMissingInputs,
        },
        union: {
          records: sourceRecords - temporalGaps,
          chunks: retrievalChunks,
          distinctStructuredInputs: distinctInputs,
          uniqueMissingInputs: missingInputs,
          exactMissingTokens,
        },
      },
    },
    tokens: {
      exactMissingTokens,
      distribution: {
        minimum: tokenAt(db, 0),
        p50: tokenAt(db, Math.ceil(missingInputs * 0.5) - 1),
        p95: tokenAt(db, Math.ceil(missingInputs * 0.95) - 1),
        maximum: tokenAt(db, missingInputs - 1),
      },
    },
    costsUsd: {
      batch: {
        perMillionTokens: BATCH_PRICE_USD_PER_MILLION,
        raw: rawBatchCost,
        authorizationMargin: batchPrice.authorizationMargin,
        withAuthorizationMargin: batchPrice.withAuthorizationMarginUsd,
      },
      standard: {
        perMillionTokens: STANDARD_PRICE_USD_PER_MILLION,
        raw: rawStandardCost,
        authorizationMargin: standardPrice.authorizationMargin,
        withAuthorizationMargin: standardPrice.withAuthorizationMarginUsd,
      },
      priceObservedOn: "2026-09-04",
      officialModelPriceUrl: "https://developers.openai.com/api/docs/models/text-embedding-3-large",
      officialBatchContractUrl: "https://platform.openai.com/docs/api-reference/batch/object",
      circuits: {
        currentLimitUsd: 50,
        currentWithAuthorizationMarginUsd:
          currentMissingTokens / 1_000_000 * BATCH_PRICE_USD_PER_MILLION * 1.25,
        currentPassed:
          currentMissingTokens / 1_000_000 * BATCH_PRICE_USD_PER_MILLION * 1.25 <= 50,
        completeLimitUsd: 450,
        completeWithAuthorizationMarginUsd: rawBatchCost * 1.25,
        completePassed: rawBatchCost * 1.25 <= 450,
      },
    },
    capacity: {
      observedEffectiveProviderCapacityTokens: 0,
      blocker: "credit_balance_exhausted",
      evidence: providerCapacityEvidence,
      evidenceRootSha256: sha256(stableSourceSnapshotJson(providerCapacityEvidence)),
      exactCompletionElapsedTime: null,
      completionState: "blocked-until-provider-credit-and-capacity-are-available",
      batchCompletionWindowHours: 24,
      maximumEmbeddingInputsPerBatch: 50_000,
      exactMinimumBatchFiles: Math.ceil(missingInputs / 50_000),
      implementationMaximumInputsPerStandardRequest: 64,
      exactStandardRequestCount: Math.ceil(missingInputs / 64),
      organizationTier: null,
      organizationBatchQueuedTokenLimit: null,
      exactQueueWavesAtObservedCapacity: null,
      honestBestCaseElapsedTime: null,
      honestConservativeElapsedTime: null,
      elapsedTimeReason: "Effective provider capacity is exactly zero and the 429 responses expose no rate-limit headers; finite completion time would be an extrapolation.",
      extrapolated: false,
    },
    manifests: complete ? {
      inventorySha256: manifestRoot(db, `SELECT source_id AS sourceId,
        legal_identity_sha256 AS legalIdentitySha256,material_sha256 AS materialSha256,
        content_sha256 AS contentSha256,raw_object_key AS rawObjectKey,
        normalized_object_key AS normalizedObjectKey,current_eligible AS currentEligible,
        historical_eligible AS historicalEligible,temporal_gap AS temporalGap
        FROM records ORDER BY source_id`),
      canonicalSha256: manifestRoot(db, `SELECT legal_identity_sha256 AS legalIdentitySha256,
        material_sha256 AS materialSha256,content_sha256 AS contentSha256,
        current_eligible AS currentEligible,historical_eligible AS historicalEligible,
        temporal_gap AS temporalGap FROM records ORDER BY legal_identity_sha256`),
      inputSha256: manifestRoot(db, `SELECT input_sha256 AS inputSha256,token_count AS tokenCount,
        occurrence_count AS occurrenceCount,current_occurrence_count AS currentOccurrenceCount,
        historical_occurrence_count AS historicalOccurrenceCount FROM inputs ORDER BY input_sha256`),
      mappingSha256: manifestRoot(db, `SELECT chunk_id AS chunkId,
        legal_identity_sha256 AS legalIdentitySha256,ordinal,
        official_text_sha256 AS officialTextSha256,input_sha256 AS inputSha256,
        token_count AS tokenCount,current_eligible AS currentEligible,
        historical_eligible AS historicalEligible FROM chunks ORDER BY chunk_id`),
      reusableSha256: manifestRoot(db, `SELECT input_sha256 AS inputSha256,
        artifact_key AS artifactKey,vector_sha256 AS vectorSha256,byte_count AS byteCount,
        readback_sha256 AS readbackSha256,bucket_name AS bucketName
        FROM verified_reuse ORDER BY input_sha256`),
      reusableArtifactInventorySha256: manifestRoot(db, `SELECT bucket_name AS bucketName,
        artifact_key AS artifactKey,input_sha256 AS inputSha256,vector_sha256 AS vectorSha256,
        byte_count AS byteCount,readback_sha256 AS readbackSha256
        FROM reusable_artifacts ORDER BY bucket_name,artifact_key`),
    } : null,
    auditElapsedMilliseconds: elapsedMilliseconds,
  };
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({ report: output, status: report.status,
    sourceRecords, retrievalChunks, distinctInputs, exactMissingTokens })}\n`);
}

const started = performance.now();
const args = argumentsFromProcess();
const token = await loadRootToken();
const db = new DatabaseSync(args.state);
try {
  initialize(db);
  await verifySourceCutoffControls(db, token);
  await loadSourceR2Inventory(db, args.sourceR2Inventory);
  await populateQualifiedCurrent(db, token);
  await loadVerifiedReuse(db, args.verifiedReuseManifest);
  const statements = inserters(db);
  const pageBudget = { remaining: args.maxPages };
  await Promise.all(args.lanes.map((lane) => processLane({ db, token, lane, statements, pageBudget })));
  if (!args.deferR2Verification) {
    await verifyRequiredSourceObjects(db, token, args.r2Concurrency);
  }
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  await writeReport(db, args.report, Math.round(performance.now() - started));
} finally {
  db.close();
}
