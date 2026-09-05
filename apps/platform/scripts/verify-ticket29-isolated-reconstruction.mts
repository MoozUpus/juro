import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  ticket29ManifestRoot,
  type Ticket29BodyFreeRecord,
} from "../lib/legal-corpus/complete-corpus-materialization";
import { stableSourceSnapshotJson } from "../lib/legal-corpus/source-snapshot";
import {
  assertTicket29BodyFreeSchema,
  assertTicket29DistinctArtifactPaths,
} from "./ticket29-isolated-artifact-paths";
import {
  countTicket29IdentityMismatches,
  publisherTokensMatch,
} from "./ticket29-isolated-identity";
import { countTicket29OrphanObjects } from "./ticket29-isolated-object-reconciliation";
import { countTicket29ProvenanceGaps } from "./ticket29-isolated-provenance-reconciliation";
import {
  buildExpectedTicket29ReconstructionLaneReports,
  ticket29ReconstructionLaneReportMatches,
} from "./ticket29-isolated-reconstruction-reports";
import { reconstructTicket28Roots } from "./ticket29-isolated-ticket28-roots";

const ACCOUNT_ID = "e22babd36b65c99b69adf3de50df5227";
const BUCKET = "juro-legal-evidence-staging-green2-20260831";
const RUN_ID = "ticket29:cutoff-20260831:complete-corpus-v2";
const SOURCE_INVENTORY_SHA256 = "2105a4d39465ae8e0b923ab89a08dddf2599d57b9e1517490a8d2f1996fe4c00";
const SOURCE_CANONICAL_SHA256 = "e527fa5221acf6063defa5f944d9ef54ca7e8b2667c47df34ba8135ef879f830";
const SOURCE_ALIAS_SHA256 = "5ff75e07391b9acd01699d8aca2bbaa32684c402e3470e42660d66fdd064f201";
// Keep the isolated verifier's run and namespace pins independent from the
// production Worker so a shared constant cannot make a wrong deployment self-validating.
const EVIDENCE_PREFIX = "legal-corpus/complete-v2/";
const REQUEST_INTERVAL_MS = 275;
let requestGate = Promise.resolve();
let nextRequestAt = 0;

function argument(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableArrayRoot(values: Iterable<unknown>): string {
  const hash = createHash("sha256");
  hash.update("[");
  let first = true;
  for (const value of values) {
    if (!first) hash.update(",");
    first = false;
    hash.update(stableSourceSnapshotJson(value));
  }
  hash.update("]");
  return hash.digest("hex");
}

async function token(): Promise<string> {
  if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_ACCOUNT_ID !== ACCOUNT_ID) {
    throw new Error("TICKET29_CLOUDFLARE_ACCOUNT_MISMATCH");
  }
  const contents = await readFile(resolve(process.cwd(), "../../.env"), "utf8");
  const line = contents.split(/\r?\n/u).find((item) => item.startsWith("CLOUDFLARE_API_TOKEN="));
  const value = line?.slice("CLOUDFLARE_API_TOKEN=".length).trim().replace(/^['"]|['"]$/gu, "");
  if (!value) throw new Error("TICKET29_CLOUDFLARE_API_TOKEN_REQUIRED");
  return value;
}

type ObjectRow = {
  objectKind: string;
  sha256: string;
  r2Key: string;
  byteCount: number;
  materializationDisposition: "created" | "reused";
  mediaType: string;
  schemaVersion: string;
  normalizationVersion: string;
  sourceR2Key: string | null;
  sourceSha256: string | null;
  sourceNormalizedSha256: string | null;
  descriptorSha256: string;
};

async function requestSlot(): Promise<void> {
  const turn = requestGate.then(async () => {
    const delay = Math.max(0, nextRequestAt - Date.now());
    if (delay > 0) await new Promise((accept) => setTimeout(accept, delay));
    nextRequestAt = Date.now() + REQUEST_INTERVAL_MS;
  });
  requestGate = turn.catch(() => undefined);
  await turn;
}

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const instant = Date.parse(header);
    if (Number.isFinite(instant)) return Math.max(0, instant - Date.now());
  }
  return Math.min(60_000, attempt * 2_000);
}

async function readVerifiedObject(apiToken: string, row: ObjectRow): Promise<Uint8Array> {
  const key = row.r2Key.split("/").map(encodeURIComponent).join("/");
  let lastError: unknown;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      await requestSlot();
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects/${key}`,
        { headers: { authorization: `Bearer ${apiToken}` } },
      );
      if (response.status === 429 && attempt < 12) {
        await new Promise((accept) => setTimeout(accept, retryDelay(response, attempt)));
        continue;
      }
      if (!response.ok || !response.body) throw new Error(`TICKET29_R2_READ_FAILED:${response.status}`);
      const hash = createHash("sha256");
      let byteCount = 0;
      const chunks: Uint8Array[] = [];
      const reader = response.body.getReader();
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        hash.update(result.value);
        chunks.push(result.value);
        byteCount += result.value.byteLength;
      }
      if (byteCount !== row.byteCount || hash.digest("hex") !== row.sha256) {
        throw new Error("TICKET29_R2_OBJECT_MISMATCH");
      }
      const bytes = new Uint8Array(byteCount);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return bytes;
    } catch (error) {
      lastError = error;
      if (attempt < 12) {
        await new Promise((accept) => setTimeout(accept, Math.min(30_000, attempt * 1_000)));
      }
    }
  }
  throw lastError;
}

type ListedObject = { key: string; size: number; etag: string;
  http_metadata?: { contentType?: string }; custom_metadata?: Record<string, string> };

async function listEvidenceObjects(apiToken: string, prefix: string): Promise<ListedObject[]> {
  const objects: ListedObject[] = [];
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ prefix, per_page: "1000" });
    if (cursor) query.set("cursor", cursor);
    await requestSlot();
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects?${query}`,
      { headers: { authorization: `Bearer ${apiToken}` } });
    if (!response.ok) throw new Error(`TICKET29_R2_LIST_FAILED:${response.status}`);
    const body = await response.json() as { success: boolean; result?: ListedObject[];
      result_info?: { is_truncated?: boolean; cursor?: string } };
    if (!body.success || !body.result) throw new Error("TICKET29_R2_LIST_INVALID");
    objects.push(...body.result);
    cursor = body.result_info?.is_truncated ? body.result_info.cursor ?? null : null;
    if (body.result_info?.is_truncated && !cursor) throw new Error("TICKET29_R2_LIST_CURSOR_MISSING");
  } while (cursor);
  return objects.sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
}

async function fileDigest(path: string): Promise<{ sha256: string; byteCount: number }> {
  const hash = createHash("sha256");
  let byteCount = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    byteCount += chunk.length;
  }
  return { sha256: hash.digest("hex"), byteCount };
}

type RecordRow = {
  sourceId: string; sourceDocumentId: string; sourceVersionId: string;
  instrumentId: string; officialExpressionId: string; textRevisionId: string;
  provisionConceptId: string; provisionRenditionId: string; legacyCurrentRenditionId: string;
  publisherRevisionToken: string; legacyTargetPublisherRevisionToken: string;
  publisherProvisionToken: string; applicabilityIdentity: string;
  sourcePublisherRevisionToken: string;
  identityStage: "ticket29-provisional-v1";
  textualAuthority: string; provisionSourceUrl: string | null; versionSourceUrl: string | null;
  previousSourceVersionId: string | null; sourceChangeType: string;
  sourceRevisionSha256: string; objectMetadataRevisionSha256: string;
  recordSha256: string;
  legalIdentitySha256: string; materialSha256: string; contentSha256: string;
  rawSourceKey: string; rawSourceSha256: string; normalizedSourceKey: string;
  normalizedSourceSha256: string; rawObjectKey: string; normalizedObjectKey: string;
  provisionObjectKey: string; provisionObjectSha256: string;
  language: "uz-Latn" | "uz-Cyrl" | "ru" | "en";
  script: "Latn" | "Cyrl"; ordinal: number; validFrom: string | null; validTo: string | null;
  currentEligible: number; historicalEligible: number; temporalGap: number; quarantined: number;
};

const recordSelect = `SELECT source_id AS sourceId,source_document_id AS sourceDocumentId,
  source_version_id AS sourceVersionId,instrument_id AS instrumentId,
  official_expression_id AS officialExpressionId,text_revision_id AS textRevisionId,
  provision_concept_id AS provisionConceptId,provision_rendition_id AS provisionRenditionId,
  legacy_current_rendition_id AS legacyCurrentRenditionId,textual_authority AS textualAuthority,
  publisher_revision_token AS publisherRevisionToken,publisher_provision_token AS publisherProvisionToken,
  legacy_target_publisher_revision_token AS legacyTargetPublisherRevisionToken,
  applicability_identity AS applicabilityIdentity,
  source_publisher_revision_token AS sourcePublisherRevisionToken,
  identity_stage AS identityStage,
  provision_source_url AS provisionSourceUrl,version_source_url AS versionSourceUrl,
  previous_source_version_id AS previousSourceVersionId,source_change_type AS sourceChangeType,
  source_revision_sha256 AS sourceRevisionSha256,
  object_metadata_revision_sha256 AS objectMetadataRevisionSha256,
  record_sha256 AS recordSha256,
  legal_identity_sha256 AS legalIdentitySha256,material_sha256 AS materialSha256,
  content_sha256 AS contentSha256,raw_source_r2_key AS rawSourceKey,
  raw_source_sha256 AS rawSourceSha256,normalized_source_r2_key AS normalizedSourceKey,
  normalized_source_sha256 AS normalizedSourceSha256,raw_object_r2_key AS rawObjectKey,
  normalized_object_r2_key AS normalizedObjectKey,provision_object_r2_key AS provisionObjectKey,
  provision_object_sha256 AS provisionObjectSha256,
  language,script,ordinal,valid_from AS validFrom,valid_to AS validTo,
  current_eligible AS currentEligible,historical_eligible AS historicalEligible,
  temporal_gap AS temporalGap,quarantined FROM legal_complete_corpus_records`;

function bodyFree(row: RecordRow): Ticket29BodyFreeRecord {
  return { runId: RUN_ID, sourceId: row.sourceId, sourceDocumentId: row.sourceDocumentId,
    sourceVersionId: row.sourceVersionId, instrumentId: row.instrumentId,
    officialExpressionId: row.officialExpressionId, textRevisionId: row.textRevisionId,
    provisionConceptId: row.provisionConceptId, provisionRenditionId: row.provisionRenditionId,
    legacyCurrentRenditionId: row.legacyCurrentRenditionId, textualAuthority: row.textualAuthority,
    publisherRevisionToken: row.publisherRevisionToken,
    legacyTargetPublisherRevisionToken: row.legacyTargetPublisherRevisionToken,
    sourcePublisherRevisionToken: row.sourcePublisherRevisionToken,
    publisherProvisionToken: row.publisherProvisionToken,
    applicabilityIdentity: row.applicabilityIdentity,
    identityStage: row.identityStage,
    provisionSourceUrl: row.provisionSourceUrl, versionSourceUrl: row.versionSourceUrl,
    previousSourceVersionId: row.previousSourceVersionId, sourceChangeType: row.sourceChangeType,
    sourceRevisionSha256: row.sourceRevisionSha256,
    objectMetadataRevisionSha256: row.objectMetadataRevisionSha256,
    legalIdentitySha256: row.legalIdentitySha256, materialSha256: row.materialSha256,
    contentSha256: row.contentSha256, rawSourceKey: row.rawSourceKey,
    rawSourceKeySha256: row.rawSourceSha256, normalizedSourceKey: row.normalizedSourceKey,
    normalizedSourceKeySha256: row.normalizedSourceSha256, rawObjectKey: row.rawObjectKey,
    normalizedObjectKey: row.normalizedObjectKey, provisionObjectKey: row.provisionObjectKey,
    provisionObjectSha256: row.provisionObjectSha256,
    language: row.language, script: row.script, ordinal: row.ordinal, validFrom: row.validFrom,
    validTo: row.validTo, currentEligible: row.currentEligible === 1,
    historicalEligible: row.historicalEligible === 1, temporalGap: row.temporalGap === 1,
    quarantined: row.quarantined === 1 };
}

function recordHashInput(row: RecordRow): Record<string, unknown> {
  return { ...bodyFree(row), sourceId: row.sourceId,
    legalIdentitySha256: row.legalIdentitySha256, materialSha256: row.materialSha256,
    contentSha256: row.contentSha256, rawSourceKey: row.rawSourceKey,
    rawSourceSha256: row.rawSourceSha256, normalizedSourceKey: row.normalizedSourceKey,
    normalizedSourceSha256: row.normalizedSourceSha256, sourceDocumentId: row.sourceDocumentId,
    sourceVersionId: row.sourceVersionId, instrumentId: row.instrumentId,
    officialExpressionId: row.officialExpressionId, textRevisionId: row.textRevisionId,
    provisionConceptId: row.provisionConceptId, provisionRenditionId: row.provisionRenditionId,
    legacyCurrentRenditionId: row.legacyCurrentRenditionId,
    publisherRevisionToken: row.publisherRevisionToken,
    legacyTargetPublisherRevisionToken: row.legacyTargetPublisherRevisionToken,
    sourcePublisherRevisionToken: row.sourcePublisherRevisionToken,
    publisherProvisionToken: row.publisherProvisionToken,
    applicabilityIdentity: row.applicabilityIdentity,
    identityStage: row.identityStage,
    sourceRevisionSha256: row.sourceRevisionSha256,
    objectMetadataRevisionSha256: row.objectMetadataRevisionSha256,
    provisionSourceUrl: row.provisionSourceUrl, versionSourceUrl: row.versionSourceUrl,
    previousSourceVersionId: row.previousSourceVersionId, sourceChangeType: row.sourceChangeType,
    textualAuthority: row.textualAuthority, language: row.language, script: row.script,
    ordinal: row.ordinal, validFrom: row.validFrom, validTo: row.validTo,
    currentEligible: row.currentEligible === 1, historicalEligible: row.historicalEligible === 1,
    temporalGap: row.temporalGap === 1 };
}

async function main(): Promise<void> {
  const started = performance.now();
  const databasePath = argument("database");
  const reportPath = argument("report");
  const checkpointPath = argument("checkpoint");
  if (!databasePath || !reportPath || !checkpointPath) {
    throw new Error("usage: --database=<export.sqlite> --report=<report.json> --checkpoint=<checkpoint.sqlite>");
  }
  const {
    databasePath: resolvedDatabasePath,
    checkpointPath: resolvedCheckpointPath,
    reportPath: resolvedReportPath,
  } = await assertTicket29DistinctArtifactPaths({ databasePath, checkpointPath, reportPath });
  const database = new DatabaseSync(resolvedDatabasePath, { readOnly: true });
  const integrity = database.prepare("PRAGMA integrity_check").get() as { integrity_check?: string };
  const foreignKeys = database.prepare("PRAGMA foreign_key_check").all();
  if (integrity.integrity_check !== "ok" || foreignKeys.length !== 0) {
    throw new Error("TICKET29_EXPORTED_D1_INTEGRITY_FAILED");
  }
  const columns = database.prepare(`SELECT m.name AS tableName,p.name AS columnName
    FROM sqlite_master m JOIN pragma_table_info(m.name) p WHERE m.type='table'
      AND m.name LIKE 'legal_complete_corpus_%' ORDER BY m.name,p.cid`).all() as Array<{
    tableName: string; columnName: string;
  }>;
  assertTicket29BodyFreeSchema(columns);
  const run = database.prepare(`SELECT id,status,source_cutoff AS sourceCutoff,
      source_bookmark AS sourceBookmark,
      source_inventory_sha256 AS sourceInventorySha256,source_canonical_sha256 AS sourceCanonicalSha256,
      source_alias_sha256 AS sourceAliasSha256,plan_r2_key AS planR2Key,plan_sha256 AS planSha256
    FROM legal_complete_corpus_runs WHERE id=?`).get(RUN_ID) as Record<string, unknown> | undefined;
  if (!run || run.status !== "materialized" || run.sourceInventorySha256 !== SOURCE_INVENTORY_SHA256
    || run.sourceCanonicalSha256 !== SOURCE_CANONICAL_SHA256 || run.sourceAliasSha256 !== SOURCE_ALIAS_SHA256) {
    throw new Error("TICKET29_EXPORTED_D1_RUN_MISMATCH");
  }
  const counts = database.prepare(`SELECT count(*) AS records,sum(current_eligible) AS current,
      sum(historical_eligible) AS history,
      sum(CASE WHEN current_eligible=1 AND historical_eligible=1 THEN 1 ELSE 0 END) AS overlap,
      sum(temporal_gap) AS gaps,sum(quarantined) AS quarantines,
      count(DISTINCT content_sha256) AS distinctBodies FROM legal_complete_corpus_records WHERE run_id=?`)
    .get(RUN_ID) as Record<string, number>;
  const quarantineCount = (database.prepare(`SELECT count(*) AS count
    FROM legal_complete_corpus_quarantines WHERE run_id=?`).get(RUN_ID) as { count: number }).count;
  const sourceVersionCount = (database.prepare(`SELECT count(*) AS count FROM (
      SELECT source_version_id FROM legal_complete_corpus_records WHERE run_id=?
      UNION SELECT source_version_id FROM legal_complete_corpus_quarantines WHERE run_id=?)`)
    .get(RUN_ID, RUN_ID) as { count: number }).count;
  if (counts.records !== 1_299_828 || counts.current !== 160_978 || counts.history !== 1_295_149
    || counts.overlap !== 160_978 || counts.gaps !== 4_679 || counts.quarantines !== 0
    || counts.distinctBodies !== 166_754) {
    throw new Error("TICKET29_EXPORTED_D1_COUNT_MISMATCH");
  }
  if (quarantineCount !== 12 || sourceVersionCount !== 11_005) {
    throw new Error("TICKET29_EXPORTED_D1_VERSION_RECONCILIATION_MISMATCH");
  }
  const identityMismatches = countTicket29IdentityMismatches(database, RUN_ID);
  if (identityMismatches !== 0) throw new Error("TICKET29_TARGET_IDENTITY_MISMATCH");

  let quarantineRowMismatches = 0;
  const quarantineRows = database.prepare(`SELECT source_version_id AS sourceVersionId,
      source_document_id AS sourceDocumentId,instrument_id AS instrumentId,
      official_expression_id AS officialExpressionId,text_revision_id AS textRevisionId,
      publisher_revision_token AS publisherRevisionToken,
      legacy_target_publisher_revision_token AS legacyTargetPublisherRevisionToken,
      source_publisher_revision_token AS sourcePublisherRevisionToken,identity_stage AS identityStage,
      language,script,version_source_url AS versionSourceUrl,canonical_source_url AS canonicalSourceUrl,
      previous_source_version_id AS previousSourceVersionId,source_change_type AS sourceChangeType,
      source_availability_status AS sourceAvailabilityStatus,
      source_revision_sha256 AS sourceRevisionSha256,raw_source_r2_key AS rawSourceKey,
      raw_source_sha256 AS rawSourceSha256,normalized_source_r2_key AS normalizedSourceKey,
      normalized_source_sha256 AS normalizedSourceSha256,raw_object_r2_key AS rawObjectKey,
      normalized_object_r2_key AS normalizedObjectKey,reason,row_sha256 AS rowSha256
    FROM legal_complete_corpus_quarantines WHERE run_id=? ORDER BY source_version_id`)
    .all(RUN_ID) as Array<Record<string, unknown>>;
  for (const row of quarantineRows) {
    const { rowSha256, ...base } = row;
    if (sha256(stableSourceSnapshotJson(base)) !== rowSha256) quarantineRowMismatches += 1;
    const instrumentId = `instrument:${sha256(String(row.sourceDocumentId))}`;
    const expressionId = `expression:${sha256(`${instrumentId}\u0000${row.language}\u0000${row.script}\u0000unknown`)}`;
    const revisionId = `revision:${sha256([row.sourceDocumentId, row.language, row.script,
      "unknown", row.sourcePublisherRevisionToken].join("|"))}`;
    if (row.instrumentId !== instrumentId || row.officialExpressionId !== expressionId
      || row.textRevisionId !== revisionId || row.identityStage !== "ticket29-provisional-v1"
      || !publisherTokensMatch({ sourceVersionId: String(row.sourceVersionId),
        sourceRevisionSha256: String(row.sourceRevisionSha256),
        publisherRevisionToken: String(row.publisherRevisionToken),
        sourcePublisherRevisionToken: String(row.sourcePublisherRevisionToken),
        legacyTargetPublisherRevisionToken: String(row.legacyTargetPublisherRevisionToken) })
      || row.reason !== "NO_MATERIALIZED_PROVISIONS") quarantineRowMismatches += 1;
  }
  if (quarantineRowMismatches !== 0) throw new Error("TICKET29_QUARANTINE_ROW_MISMATCH");

  let aliasRowMismatches = 0;
  const aliasRows: Iterable<Record<string, string>> = database.prepare(`SELECT owner_kind AS ownerKind,owner_id AS ownerId,
      target_identity AS targetIdentity,alias_kind AS aliasKind,alias_sha256 AS aliasSha256,
      alias_value AS aliasValue,
      row_sha256 AS rowSha256 FROM legal_complete_corpus_aliases WHERE run_id=?`).iterate(RUN_ID) as never;
  for (const row of aliasRows) {
    if (sha256(row.aliasValue) !== row.aliasSha256
      || sha256(stableSourceSnapshotJson({ ownerKind: row.ownerKind, ownerId: row.ownerId,
      targetIdentity: row.targetIdentity, aliasKind: row.aliasKind, aliasValue: row.aliasValue }))
      !== row.rowSha256) aliasRowMismatches += 1;
  }
  let lineageRowMismatches = 0;
  const lineageRows: Iterable<Record<string, string | null>> = database.prepare(`SELECT source_version_id AS sourceVersionId,
      previous_source_version_id AS previousSourceVersionId,change_type AS changeType,
      row_sha256 AS rowSha256 FROM legal_complete_corpus_lineage_refs WHERE run_id=?`).iterate(RUN_ID) as never;
  for (const row of lineageRows) {
    if (sha256(stableSourceSnapshotJson({ sourceVersionId: row.sourceVersionId,
      previousSourceVersionId: row.previousSourceVersionId, changeType: row.changeType }))
      !== row.rowSha256) lineageRowMismatches += 1;
  }
  if (aliasRowMismatches !== 0 || lineageRowMismatches !== 0) {
    throw new Error("TICKET29_PROVENANCE_ROW_HASH_MISMATCH");
  }

  const provenanceJoinMismatches = (database.prepare(`WITH source_versions AS (
      SELECT source_version_id,raw_source_r2_key,normalized_source_r2_key,version_source_url,
        text_revision_id,previous_source_version_id,source_change_type
      FROM legal_complete_corpus_records WHERE run_id=? GROUP BY source_version_id
      UNION ALL
      SELECT source_version_id,raw_source_r2_key,normalized_source_r2_key,version_source_url,
        text_revision_id,previous_source_version_id,source_change_type
      FROM legal_complete_corpus_quarantines WHERE run_id=?
    ) SELECT count(*) AS count FROM source_versions s WHERE
      NOT EXISTS (SELECT 1 FROM legal_complete_corpus_aliases a WHERE a.run_id=?
        AND a.owner_id=s.source_version_id AND a.target_identity=s.text_revision_id
        AND a.alias_kind='raw_capture' AND a.alias_value=s.raw_source_r2_key)
      OR NOT EXISTS (SELECT 1 FROM legal_complete_corpus_aliases a WHERE a.run_id=?
        AND a.owner_id=s.source_version_id AND a.target_identity=s.text_revision_id
        AND a.alias_kind='normalized_revision' AND a.alias_value=s.normalized_source_r2_key)
      OR ((s.version_source_url IS NOT NULL AND length(s.version_source_url)>0) <>
        EXISTS (SELECT 1 FROM legal_complete_corpus_aliases a WHERE a.run_id=?
          AND a.owner_id=s.source_version_id AND a.target_identity=s.text_revision_id
          AND a.alias_kind='version_url' AND a.alias_value=s.version_source_url))
      OR NOT EXISTS (SELECT 1 FROM legal_complete_corpus_lineage_refs l WHERE l.run_id=?
        AND l.source_version_id=s.source_version_id
        AND l.previous_source_version_id IS s.previous_source_version_id
        AND l.change_type=s.source_change_type)`)
    .get(RUN_ID, RUN_ID, RUN_ID, RUN_ID, RUN_ID, RUN_ID) as { count: number }).count;
  const expectedAliasCount = (database.prepare(`WITH source_versions AS (
      SELECT source_version_id,version_source_url FROM legal_complete_corpus_records
        WHERE run_id=? GROUP BY source_version_id
      UNION ALL SELECT source_version_id,version_source_url FROM legal_complete_corpus_quarantines
        WHERE run_id=?
    ) SELECT sum(2+CASE WHEN version_source_url IS NOT NULL AND length(version_source_url)>0
      THEN 1 ELSE 0 END) AS count FROM source_versions`).get(RUN_ID, RUN_ID) as { count: number }).count;
  const actualAliasCount = (database.prepare(`SELECT count(*) AS count
    FROM legal_complete_corpus_aliases WHERE run_id=?`).get(RUN_ID) as { count: number }).count;
  const actualLineageCount = (database.prepare(`SELECT count(*) AS count
    FROM legal_complete_corpus_lineage_refs WHERE run_id=?`).get(RUN_ID) as { count: number }).count;
  if (provenanceJoinMismatches !== 0 || actualAliasCount !== expectedAliasCount
    || actualLineageCount !== sourceVersionCount) throw new Error("TICKET29_PROVENANCE_JOIN_MISMATCH");

  const { inventorySha256: inventoryRoot, canonicalSha256: canonicalRoot,
    aliasSha256: aliasRoot } = reconstructTicket28Roots(database, RUN_ID);
  if (inventoryRoot !== SOURCE_INVENTORY_SHA256 || canonicalRoot !== SOURCE_CANONICAL_SHA256
    || aliasRoot !== SOURCE_ALIAS_SHA256) throw new Error("TICKET29_TICKET28_ROOT_PARITY_FAILED");

  const computedManifests: Record<string, { count: number; rootSha256: string }> = {};
  const computedManifestPages: Record<string, Array<{
    counts: Awaited<ReturnType<typeof ticket29ManifestRoot>>["counts"];
    roots: Awaited<ReturnType<typeof ticket29ManifestRoot>>["roots"];
    descriptor: { key: string; kind: "manifest"; mediaType: string; sha256: string; byteCount: number };
  }>> = {};
  let recordHashMismatches = 0;
  for (const lane of "123456789") {
    const lower = `lexuz-family:${lane}`;
    const upper = lane === "9" ? "lexuz-family::" : `lexuz-family:${Number(lane) + 1}`;
    const pages: Array<{ counts: Awaited<ReturnType<typeof ticket29ManifestRoot>>["counts"];
      roots: Awaited<ReturnType<typeof ticket29ManifestRoot>>["roots"];
      descriptor: { key: string; kind: "manifest"; mediaType: string; sha256: string; byteCount: number } }> = [];
    const appendPage = async (rows: RecordRow[]) => {
      recordHashMismatches += rows.filter((row) =>
        sha256(stableSourceSnapshotJson(recordHashInput(row))) !== row.recordSha256).length;
      const records = rows.map(bodyFree);
      const manifest = await ticket29ManifestRoot(records);
      const pageValue = { schemaVersion: 1, runId: RUN_ID, lane, pageOrdinal: pages.length, records };
      const pageBytes = new TextEncoder().encode(`${stableSourceSnapshotJson(pageValue)}\n`);
      const pageSha256 = sha256(pageBytes);
      pages.push({ ...manifest, descriptor: {
        key: `${EVIDENCE_PREFIX}manifest/${pageSha256}.json`,
        kind: "manifest",
        mediaType: "application/json;charset=utf-8",
        sha256: pageSha256,
        byteCount: pageBytes.byteLength,
      } });
    };
    const laneRows = database.prepare(`WITH lane AS MATERIALIZED (
        ${recordSelect} WHERE run_id=? AND source_id>=? AND source_id<?
      ) SELECT * FROM lane ORDER BY legalIdentitySha256`)
      .iterate(RUN_ID, lower, upper) as Iterable<RecordRow>;
    let pageRows: RecordRow[] = [];
    for (const row of laneRows) {
      pageRows.push(row);
      if (pageRows.length === 1000) {
        await appendPage(pageRows);
        pageRows = [];
      }
    }
    if (pageRows.length > 0) await appendPage(pageRows);
    computedManifestPages[lane] = pages;
    for (const membership of ["union", "current", "history", "gaps", "quarantines"] as const) {
      const key = `${lane}:${membership}`;
      computedManifests[key] = { count: pages.reduce((sum, page) => sum + page.counts[membership], 0),
        rootSha256: sha256(stableSourceSnapshotJson(pages.map((page) => ({
          count: page.counts[membership], rootSha256: page.roots[membership],
        })))) };
    }
  }
  if (recordHashMismatches !== 0) throw new Error("TICKET29_RECORD_ROW_HASH_MISMATCH");
  const targetManifestRoots: Record<string, string> = {};
  const targetManifestLanes: Record<string, Array<{ lane: string; count: number;
    rootSha256: string }>> = {};
  const quarantineRootSha256 = sha256(stableSourceSnapshotJson(quarantineRows));
  for (const membership of ["union", "current", "history", "gaps", "quarantines"] as const) {
    const provisionLanes = [..."123456789"].map((lane) => ({ lane,
      count: computedManifests[`${lane}:${membership}`]!.count,
      rootSha256: computedManifests[`${lane}:${membership}`]!.rootSha256 }));
    const quarantineLane = { lane: "quarantine", count: 12, rootSha256: quarantineRootSha256 };
    const lanes = membership === "union" ? [...provisionLanes, quarantineLane]
      : membership === "quarantines" ? [quarantineLane] : provisionLanes;
    const rootSha256 = sha256(stableSourceSnapshotJson(lanes));
    const persisted = database.prepare(`SELECT record_count AS recordCount,root_sha256 AS rootSha256
      FROM legal_complete_corpus_manifests WHERE run_id=? AND membership=?`).get(RUN_ID, membership) as {
      recordCount: number; rootSha256: string;
    } | undefined;
    const count = lanes.reduce((sum, lane) => sum + lane.count, 0);
    if (!persisted || persisted.recordCount !== count || persisted.rootSha256 !== rootSha256) {
      throw new Error("TICKET29_TARGET_MANIFEST_ROOT_MISMATCH");
    }
    targetManifestRoots[membership] = rootSha256;
    targetManifestLanes[membership] = lanes;
  }

  const provenanceGaps = countTicket29ProvenanceGaps(database, RUN_ID);
  if (provenanceGaps !== 0) throw new Error("TICKET29_PROVENANCE_PATH_MISSING");
  const attemptParity = database.prepare(`SELECT
      (SELECT count(*) FROM legal_complete_corpus_attempt_pages WHERE run_id=?
        AND attempt_id='ticket29:first') AS firstPages,
      (SELECT count(*) FROM legal_complete_corpus_attempt_pages WHERE run_id=?
        AND attempt_id='ticket29:second') AS secondPages,
      (SELECT coalesce(sum(record_count),0) FROM legal_complete_corpus_attempt_pages WHERE run_id=?
        AND attempt_id='ticket29:first') AS firstRecords,
      (SELECT coalesce(sum(record_count),0) FROM legal_complete_corpus_attempt_pages WHERE run_id=?
        AND attempt_id='ticket29:second') AS secondRecords,
      (SELECT coalesce(sum(created_object_count),0) FROM legal_complete_corpus_attempt_pages WHERE run_id=?
        AND attempt_id='ticket29:second') AS secondCreated,
      (SELECT coalesce(sum(created_byte_count),0) FROM legal_complete_corpus_attempt_pages WHERE run_id=?
        AND attempt_id='ticket29:second') AS secondCreatedBytes,
      (SELECT coalesce(sum(reused_object_count),0) FROM legal_complete_corpus_attempt_pages WHERE run_id=?
        AND attempt_id='ticket29:second') AS secondReused,
      (SELECT coalesce(sum(reused_byte_count),0) FROM legal_complete_corpus_attempt_pages WHERE run_id=?
        AND attempt_id='ticket29:second') AS secondReusedBytes,
      (SELECT coalesce(sum(created_object_count+reused_object_count),0)
        FROM legal_complete_corpus_attempt_pages WHERE run_id=? AND attempt_id='ticket29:first') AS firstRefs,
      (SELECT coalesce(sum(created_byte_count+reused_byte_count),0)
        FROM legal_complete_corpus_attempt_pages WHERE run_id=? AND attempt_id='ticket29:first') AS firstRefBytes,
      (SELECT count(*) FROM legal_complete_corpus_attempt_pages first
        LEFT JOIN legal_complete_corpus_attempt_pages second ON second.run_id=first.run_id
          AND second.attempt_id='ticket29:second' AND second.page_sha256=first.page_sha256
        WHERE first.run_id=? AND first.attempt_id='ticket29:first'
          AND (second.page_sha256 IS NULL OR second.record_count<>first.record_count
            OR second.receipt_sha256<>first.receipt_sha256)) AS mismatches`).get(
    RUN_ID, RUN_ID, RUN_ID, RUN_ID, RUN_ID, RUN_ID, RUN_ID, RUN_ID, RUN_ID, RUN_ID, RUN_ID,
  ) as Record<string, number>;
  if (attemptParity.firstPages !== attemptParity.secondPages
    || attemptParity.firstRecords !== 1_299_828 || attemptParity.secondRecords !== 1_299_828
    || attemptParity.secondCreated !== 0 || attemptParity.secondReused !== attemptParity.firstRefs
    || attemptParity.secondCreatedBytes !== 0
    || attemptParity.secondReusedBytes !== attemptParity.firstRefBytes
    || attemptParity.mismatches !== 0) throw new Error("TICKET29_ATTEMPT_PARITY_FAILED");
  const quarantineAttemptParity = database.prepare(`SELECT
      (SELECT record_count FROM legal_complete_corpus_quarantine_attempts
        WHERE run_id=? AND attempt_id='ticket29:quarantine:first') AS firstRecords,
      (SELECT created_object_count+reused_object_count FROM legal_complete_corpus_quarantine_attempts
        WHERE run_id=? AND attempt_id='ticket29:quarantine:first') AS firstRefs,
      (SELECT created_byte_count+reused_byte_count FROM legal_complete_corpus_quarantine_attempts
        WHERE run_id=? AND attempt_id='ticket29:quarantine:first') AS firstRefBytes,
      (SELECT record_count FROM legal_complete_corpus_quarantine_attempts
        WHERE run_id=? AND attempt_id='ticket29:quarantine:second') AS secondRecords,
      (SELECT created_object_count FROM legal_complete_corpus_quarantine_attempts
        WHERE run_id=? AND attempt_id='ticket29:quarantine:second') AS secondCreated,
      (SELECT reused_object_count FROM legal_complete_corpus_quarantine_attempts
        WHERE run_id=? AND attempt_id='ticket29:quarantine:second') AS secondReused,
      (SELECT created_byte_count FROM legal_complete_corpus_quarantine_attempts
        WHERE run_id=? AND attempt_id='ticket29:quarantine:second') AS secondCreatedBytes,
      (SELECT reused_byte_count FROM legal_complete_corpus_quarantine_attempts
        WHERE run_id=? AND attempt_id='ticket29:quarantine:second') AS secondReusedBytes`)
    .get(RUN_ID, RUN_ID, RUN_ID, RUN_ID, RUN_ID, RUN_ID, RUN_ID, RUN_ID) as Record<string, number>;
  if (quarantineAttemptParity.firstRecords !== 12 || quarantineAttemptParity.secondRecords !== 12
    || quarantineAttemptParity.secondCreated !== 0 || quarantineAttemptParity.secondReused !== 24
    || quarantineAttemptParity.secondCreatedBytes !== 0
    || quarantineAttemptParity.secondReusedBytes !== quarantineAttemptParity.firstRefBytes) {
    throw new Error("TICKET29_QUARANTINE_ATTEMPT_PARITY_FAILED");
  }

  const controlAttemptRows = database.prepare(`SELECT attempt_id AS attemptId,stage,lane,
      record_count AS recordCount,created_object_count AS createdObjectCount,
      reused_object_count AS reusedObjectCount,created_byte_count AS createdByteCount,
      reused_byte_count AS reusedByteCount,root_sha256 AS rootSha256
    FROM legal_complete_corpus_control_attempts WHERE run_id=? ORDER BY attempt_id,stage,lane`)
    .all(RUN_ID) as Array<{ attemptId: string; stage: string; lane: string; recordCount: number;
      createdObjectCount: number; reusedObjectCount: number; createdByteCount: number;
      reusedByteCount: number; rootSha256: string }>;
  const expectedControlKeys = [
    ...[..."123456789"].map((lane) => `plan:${lane}`),
    ...[..."123456789"].map((lane) => `manifest:${lane}`),
    ...[..."0123456789abcdef"].map((lane) => `reconstruction:${lane}`),
    "finalize:all",
  ].sort();
  const firstControls = new Map(controlAttemptRows
    .filter((row) => row.attemptId === "ticket29:first")
    .map((row) => [`${row.stage}:${row.lane}`, row]));
  const secondControls = new Map(controlAttemptRows
    .filter((row) => row.attemptId === "ticket29:second")
    .map((row) => [`${row.stage}:${row.lane}`, row]));
  let controlMismatches = 0;
  if (JSON.stringify([...firstControls.keys()].sort()) !== JSON.stringify(expectedControlKeys)
    || JSON.stringify([...secondControls.keys()].sort()) !== JSON.stringify(expectedControlKeys)) {
    controlMismatches += 1;
  }
  for (const key of expectedControlKeys) {
    const initial = firstControls.get(key);
    const replay = secondControls.get(key);
    if (!initial || !replay || initial.recordCount !== replay.recordCount
      || initial.rootSha256 !== replay.rootSha256 || replay.createdObjectCount !== 0
      || replay.createdByteCount !== 0
      || replay.reusedObjectCount !== initial.createdObjectCount + initial.reusedObjectCount
      || replay.reusedByteCount !== initial.createdByteCount + initial.reusedByteCount) {
      controlMismatches += 1;
    }
  }
  const controlAttemptParity = {
    firstRows: firstControls.size,
    secondRows: secondControls.size,
    firstCreated: [...firstControls.values()].reduce((sum, row) =>
      sum + row.createdObjectCount, 0),
    firstReused: [...firstControls.values()].reduce((sum, row) =>
      sum + row.reusedObjectCount, 0),
    firstCreatedBytes: [...firstControls.values()].reduce((sum, row) =>
      sum + row.createdByteCount, 0),
    firstReusedBytes: [...firstControls.values()].reduce((sum, row) =>
      sum + row.reusedByteCount, 0),
    firstRefs: [...firstControls.values()].reduce((sum, row) =>
      sum + row.createdObjectCount + row.reusedObjectCount, 0),
    firstRefBytes: [...firstControls.values()].reduce((sum, row) =>
      sum + row.createdByteCount + row.reusedByteCount, 0),
    secondCreated: [...secondControls.values()].reduce((sum, row) =>
      sum + row.createdObjectCount, 0),
    secondCreatedBytes: [...secondControls.values()].reduce((sum, row) =>
      sum + row.createdByteCount, 0),
    secondReused: [...secondControls.values()].reduce((sum, row) =>
      sum + row.reusedObjectCount, 0),
    secondReusedBytes: [...secondControls.values()].reduce((sum, row) =>
      sum + row.reusedByteCount, 0),
    mismatches: controlMismatches,
  };
  if (controlAttemptParity.firstRows !== 35 || controlAttemptParity.secondRows !== 35
    || controlAttemptParity.secondCreated !== 0 || controlAttemptParity.secondCreatedBytes !== 0
    || controlAttemptParity.secondReused !== controlAttemptParity.firstRefs
    || controlAttemptParity.secondReusedBytes !== controlAttemptParity.firstRefBytes
    || controlAttemptParity.mismatches !== 0) {
    throw new Error("TICKET29_CONTROL_ATTEMPT_PARITY_FAILED");
  }

  const objects = database.prepare(`SELECT object_kind AS objectKind,sha256,r2_key AS r2Key,
      byte_count AS byteCount,materialization_disposition AS materializationDisposition,
      media_type AS mediaType,schema_version AS schemaVersion,
      normalization_version AS normalizationVersion,source_r2_key AS sourceR2Key,
      source_sha256 AS sourceSha256,source_normalized_sha256 AS sourceNormalizedSha256,
      descriptor_sha256 AS descriptorSha256
      FROM legal_complete_corpus_objects WHERE run_id=? ORDER BY r2_key`)
    .all(RUN_ID) as ObjectRow[];
  const controlObjects = objects.filter((object) =>
    ["plan", "manifest", "reconstruction", "corpus_snapshot"].includes(object.objectKind));
  const controlObjectBytes = controlObjects.reduce((sum, object) => sum + object.byteCount, 0);
  if (controlAttemptParity.firstCreated + controlAttemptParity.firstReused !== controlObjects.length
    || controlAttemptParity.firstCreatedBytes + controlAttemptParity.firstReusedBytes
      !== controlObjectBytes
    || controlObjects.some((object) => object.materializationDisposition !== "created")) {
    throw new Error("TICKET29_CONTROL_OBJECT_ACCOUNTING_MISMATCH");
  }
  if (objects.some((object) => object.materializationDisposition
    !== (object.r2Key.startsWith(EVIDENCE_PREFIX) ? "created" : "reused"))) {
    throw new Error("TICKET29_OBJECT_LIFECYCLE_DISPOSITION_MISMATCH");
  }
  const descriptorMismatches = objects.filter((row) => sha256(stableSourceSnapshotJson({
    kind: row.objectKind, sha256: row.sha256, key: row.r2Key, byteCount: row.byteCount,
    mediaType: row.mediaType, sourceR2Key: row.sourceR2Key, sourceSha256: row.sourceSha256,
    sourceNormalizedSha256: row.sourceNormalizedSha256,
    schemaVersion: row.schemaVersion, normalizationVersion: row.normalizationVersion,
  })) !== row.descriptorSha256).length;
  if (descriptorMismatches !== 0) throw new Error("TICKET29_OBJECT_DESCRIPTOR_MISMATCH");
  const locatorMismatches = (database.prepare(`SELECT
      (SELECT count(*) FROM legal_complete_corpus_records r
        LEFT JOIN legal_complete_corpus_objects raw ON raw.run_id=r.run_id
          AND raw.r2_key=r.raw_object_r2_key AND raw.object_kind='raw_capture'
          AND raw.sha256=r.raw_source_sha256
        LEFT JOIN legal_complete_corpus_objects normalized ON normalized.run_id=r.run_id
          AND normalized.r2_key=r.normalized_object_r2_key AND normalized.object_kind='normalized_revision'
          AND normalized.sha256=r.normalized_source_sha256
        LEFT JOIN legal_complete_corpus_objects provision ON provision.run_id=r.run_id
          AND provision.r2_key=r.provision_object_r2_key AND provision.object_kind='provision_rendition'
          AND provision.sha256=r.provision_object_sha256
        AND ((provision.r2_key LIKE 'legal-corpus/complete-v2/%'
                AND provision.source_normalized_sha256 IS NULL)
            OR (provision.r2_key LIKE 'corpus/%'
                AND provision.source_normalized_sha256=r.normalized_source_sha256))
        WHERE r.run_id=? AND (raw.r2_key IS NULL OR normalized.r2_key IS NULL OR provision.r2_key IS NULL))
      + (SELECT count(*) FROM legal_complete_corpus_quarantines q
        LEFT JOIN legal_complete_corpus_objects raw ON raw.run_id=q.run_id
          AND raw.r2_key=q.raw_object_r2_key AND raw.object_kind='raw_capture'
          AND raw.sha256=q.raw_source_sha256
        LEFT JOIN legal_complete_corpus_objects normalized ON normalized.run_id=q.run_id
          AND normalized.r2_key=q.normalized_object_r2_key AND normalized.object_kind='normalized_revision'
          AND normalized.sha256=q.normalized_source_sha256
        WHERE q.run_id=? AND (raw.r2_key IS NULL OR normalized.r2_key IS NULL)) AS count`)
    .get(RUN_ID, RUN_ID) as { count: number }).count;
  const orphanObjects = countTicket29OrphanObjects(database, RUN_ID);
  if (locatorMismatches !== 0) {
    throw new Error("TICKET29_OBJECT_LOCATOR_RECONCILIATION_FAILED");
  }
  const apiToken = await token();
  const objectByKey = new Map(objects.map((row) => [row.r2Key, row]));
  const expectedReconstructionProofs = new Map(buildExpectedTicket29ReconstructionLaneReports(RUN_ID, objects)
    .map((proof) => [proof.lane, proof]));
  const reconstructionLaneRows = database.prepare(`SELECT lane,r2_key AS r2Key,
      report_sha256 AS reportSha256,verified_object_count AS verifiedObjectCount,
      root_sha256 AS rootSha256 FROM legal_complete_corpus_lane_reports
      WHERE run_id=? AND report_kind='reconstruction' ORDER BY lane`).all(RUN_ID) as Array<{
        lane: string; r2Key: string; reportSha256: string;
        verifiedObjectCount: number; rootSha256: string;
      }>;
  let reconstructionContentMismatches = 0;
  let materializationVerifiedDataObjects = 0;
  let materializationVerifiedDataBytes = 0;
  if (reconstructionLaneRows.map((row) => row.lane).join("") !== "0123456789abcdef") {
    reconstructionContentMismatches += 1;
  }
  for (const row of reconstructionLaneRows) {
    const expected = expectedReconstructionProofs.get(row.lane);
    const object = objectByKey.get(row.r2Key);
    if (!expected || !object || object.objectKind !== "reconstruction"
      || object.sha256 !== row.reportSha256 || row.verifiedObjectCount !== expected.verifiedObjectCount
      || row.rootSha256 !== expected.rootSha256) {
      reconstructionContentMismatches += 1;
      continue;
    }
    const report = JSON.parse(new TextDecoder("utf-8", { fatal: true })
      .decode(await readVerifiedObject(apiToken, object))) as unknown;
    if (!ticket29ReconstructionLaneReportMatches(expected, report)) {
      reconstructionContentMismatches += 1;
      continue;
    }
    materializationVerifiedDataObjects += expected.verifiedObjectCount;
    materializationVerifiedDataBytes += expected.byteCount;
  }
  if (reconstructionContentMismatches !== 0 || materializationVerifiedDataObjects !== 242_891) {
    throw new Error("TICKET29_R2_RECONSTRUCTION_REPORT_MISMATCH");
  }
  let manifestContentMismatches = 0;
  const referencedManifestKeys = new Set<string>();
  const manifestLaneRows = database.prepare(`SELECT lane,r2_key AS r2Key,
      report_sha256 AS reportSha256 FROM legal_complete_corpus_lane_reports
      WHERE run_id=? AND report_kind='manifest' ORDER BY lane`).all(RUN_ID) as Array<{
        lane: string; r2Key: string; reportSha256: string;
      }>;
  if (manifestLaneRows.map((row) => row.lane).join("") !== "123456789") {
    manifestContentMismatches += 1;
  }
  for (const laneRow of manifestLaneRows) {
    referencedManifestKeys.add(laneRow.r2Key);
    const laneObject = objectByKey.get(laneRow.r2Key);
    if (!laneObject || laneObject.sha256 !== laneRow.reportSha256) {
      manifestContentMismatches += 1;
      continue;
    }
    const laneValue = JSON.parse(new TextDecoder("utf-8", { fatal: true })
      .decode(await readVerifiedObject(apiToken, laneObject))) as Record<string, unknown>;
    const expectedPages = computedManifestPages[laneRow.lane] ?? [];
    const pageDescriptors = Array.isArray(laneValue.pages)
      ? laneValue.pages as Array<Record<string, unknown>> : [];
    const memberships = ["union", "current", "history", "gaps", "quarantines"] as const;
    const expectedCounts = Object.fromEntries(memberships.map((membership) => [membership,
      expectedPages.reduce((sum, page) => sum + page.counts[membership], 0)]));
    const expectedRoots = Object.fromEntries(memberships.map((membership) => [membership,
      sha256(stableSourceSnapshotJson(expectedPages.map((page) => ({
        count: page.counts[membership], rootSha256: page.roots[membership],
      }))))]));
    if (laneValue.schemaVersion !== 1 || laneValue.kind !== "manifest-lane"
      || laneValue.runId !== RUN_ID || laneValue.lane !== laneRow.lane
      || laneValue.pageCount !== expectedPages.length || pageDescriptors.length !== expectedPages.length
      || stableSourceSnapshotJson(laneValue.counts) !== stableSourceSnapshotJson(expectedCounts)
      || stableSourceSnapshotJson(laneValue.roots) !== stableSourceSnapshotJson(expectedRoots)
      || stableSourceSnapshotJson(pageDescriptors)
        !== stableSourceSnapshotJson(expectedPages.map((page) => page.descriptor))) {
      manifestContentMismatches += 1;
      continue;
    }
    for (const pageDescriptor of pageDescriptors) {
      referencedManifestKeys.add(String(pageDescriptor.key));
      const pageObject = objectByKey.get(String(pageDescriptor.key));
      if (!pageObject || pageObject.objectKind !== "manifest"
        || pageObject.sha256 !== pageDescriptor.sha256 || pageObject.byteCount !== pageDescriptor.byteCount) {
        manifestContentMismatches += 1;
      }
    }
  }
  const persistedManifestObjects = database.prepare(`SELECT membership,record_count AS recordCount,
      root_sha256 AS rootSha256,r2_key AS r2Key FROM legal_complete_corpus_manifests
      WHERE run_id=? ORDER BY membership`).all(RUN_ID) as Array<{
        membership: string; recordCount: number; rootSha256: string; r2Key: string;
      }>;
  for (const persisted of persistedManifestObjects) {
    referencedManifestKeys.add(persisted.r2Key);
    const object = objectByKey.get(persisted.r2Key);
    if (!object) { manifestContentMismatches += 1; continue; }
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true })
      .decode(await readVerifiedObject(apiToken, object))) as Record<string, unknown>;
    if (value.schemaVersion !== 1 || value.kind !== "complete-corpus-manifest" || value.runId !== RUN_ID
      || value.membership !== persisted.membership || value.count !== persisted.recordCount
      || value.rootSha256 !== persisted.rootSha256
      || value.sourceCutoff !== run.sourceCutoff
      || value.sourceInventorySha256 !== SOURCE_INVENTORY_SHA256
      || value.sourceCanonicalSha256 !== SOURCE_CANONICAL_SHA256
      || value.sourceAliasSha256 !== SOURCE_ALIAS_SHA256
      || stableSourceSnapshotJson(value.lanes) !== stableSourceSnapshotJson(
        targetManifestLanes[persisted.membership])) manifestContentMismatches += 1;
  }
  const unreferencedManifestObjects = objects.filter((object) => object.objectKind === "manifest"
    && !referencedManifestKeys.has(object.r2Key)).length;
  if (orphanObjects + unreferencedManifestObjects !== 0) {
    throw new Error("TICKET29_OBJECT_LOCATOR_RECONCILIATION_FAILED");
  }
  const snapshotRow = database.prepare(`SELECT snapshot_id AS snapshotId,source_cutoff AS sourceCutoff,
      source_inventory_sha256 AS sourceInventorySha256,source_canonical_sha256 AS sourceCanonicalSha256,
      source_alias_sha256 AS sourceAliasSha256,union_root_sha256 AS unionRootSha256,
      current_root_sha256 AS currentRootSha256,history_root_sha256 AS historyRootSha256,
      gaps_root_sha256 AS gapsRootSha256,quarantines_root_sha256 AS quarantinesRootSha256,
      r2_key AS r2Key,snapshot_sha256 AS snapshotSha256,byte_count AS byteCount
    FROM legal_complete_corpus_snapshots WHERE run_id=?`).get(RUN_ID) as Record<string, unknown> | undefined;
  let snapshotContentMismatches = 0;
  if (!snapshotRow || snapshotRow.snapshotId !== RUN_ID
    || snapshotRow.unionRootSha256 !== targetManifestRoots.union
    || snapshotRow.currentRootSha256 !== targetManifestRoots.current
    || snapshotRow.historyRootSha256 !== targetManifestRoots.history
    || snapshotRow.gapsRootSha256 !== targetManifestRoots.gaps
    || snapshotRow.quarantinesRootSha256 !== targetManifestRoots.quarantines) {
    snapshotContentMismatches += 1;
  } else {
    const object = objectByKey.get(String(snapshotRow.r2Key));
    if (!object || object.sha256 !== snapshotRow.snapshotSha256 || object.byteCount !== snapshotRow.byteCount) {
      snapshotContentMismatches += 1;
    } else {
      const value = JSON.parse(new TextDecoder("utf-8", { fatal: true })
        .decode(await readVerifiedObject(apiToken, object))) as Record<string, unknown>;
      const roots = value.manifestRoots as Record<string, unknown> | undefined;
      const manifestDescriptors = value.manifests as Record<string, Record<string, unknown>> | undefined;
      const countsValue = value.counts as Record<string, unknown> | undefined;
      if (value.schemaVersion !== 1 || value.kind !== "complete-corpus-snapshot" || value.snapshotId !== RUN_ID
        || value.sourceCutoff !== run.sourceCutoff || value.sourceBookmark !== run.sourceBookmark
        || value.sourceInventorySha256 !== SOURCE_INVENTORY_SHA256
        || value.sourceCanonicalSha256 !== SOURCE_CANONICAL_SHA256
        || value.sourceAliasSha256 !== SOURCE_ALIAS_SHA256
        || !countsValue || countsValue.provisions !== 1_299_828 || countsValue.sourceVersions !== 11_005
        || countsValue.quarantines !== 12 || countsValue.union !== 1_299_840
        || countsValue.current !== 160_978 || countsValue.history !== 1_295_149
        || countsValue.gaps !== 4_679 || countsValue.distinctBodies !== 166_754
        || !manifestDescriptors || persistedManifestObjects.some((manifest) => {
          const descriptor = manifestDescriptors[manifest.membership];
          const objectRow = objectByKey.get(manifest.r2Key);
          return !descriptor || !objectRow || descriptor.key !== manifest.r2Key
            || descriptor.sha256 !== objectRow.sha256 || descriptor.byteCount !== objectRow.byteCount;
        })
        || !roots || Object.entries(targetManifestRoots).some(([key, root]) => roots[key] !== root)) {
        snapshotContentMismatches += 1;
      }
    }
  }
  if (manifestContentMismatches !== 0 || snapshotContentMismatches !== 0) {
    throw new Error("TICKET29_R2_MANIFEST_CONTENT_MISMATCH");
  }
  const listedObjects = await listEvidenceObjects(apiToken, EVIDENCE_PREFIX);
  const retainedObjects = await listEvidenceObjects(apiToken, "corpus/");
  const namespaceObjects = objects.filter((row) => row.r2Key.startsWith(EVIDENCE_PREFIX));
  const retainedKeys = new Set(objects.filter((row) => row.r2Key.startsWith("corpus/"))
    .map((row) => row.r2Key));
  const referencedRetainedObjects = retainedObjects.filter((item) => retainedKeys.has(item.key));
  const listedInventory = [...listedObjects, ...referencedRetainedObjects]
    .sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
  const listedByKey = new Map(listedInventory.map((item) => [item.key, item]));
  let listedMetadataMismatches = 0;
  for (const row of namespaceObjects) {
    const listed = listedByKey.get(row.r2Key);
    if (!listed || listed.size !== row.byteCount
      || listed.http_metadata?.contentType !== row.mediaType
      || listed.custom_metadata?.schemaVersion !== "complete-corpus-evidence-v1"
      || listed.custom_metadata?.kind !== row.objectKind
      || listed.custom_metadata?.sha256 !== row.sha256
      || listed.custom_metadata?.byteCount !== String(row.byteCount)
      || listed.custom_metadata?.mediaType !== row.mediaType
      || (listed.custom_metadata?.sourceNormalizedSha256 ?? null)
        !== row.sourceNormalizedSha256) listedMetadataMismatches += 1;
  }
  for (const row of objects.filter((item) => item.r2Key.startsWith("corpus/"))) {
    const listed = listedByKey.get(row.r2Key);
    if (!listed || listed.size !== row.byteCount
      || listed.http_metadata?.contentType !== row.mediaType
      || listed.custom_metadata?.schemaVersion !== "1"
      || listed.custom_metadata?.objectKind !== row.objectKind
      || listed.custom_metadata?.sha256 !== row.sha256) listedMetadataMismatches += 1;
  }
  const registeredKeys = new Set(namespaceObjects.map((row) => row.r2Key));
  const extraPrefixObjects = listedObjects.filter((item) => !registeredKeys.has(item.key)).length;
  if (listedMetadataMismatches !== 0 || extraPrefixObjects !== 0
    || listedObjects.length !== namespaceObjects.length) throw new Error("TICKET29_R2_PREFIX_RECONCILIATION_FAILED");
  const databaseExport = await fileDigest(resolvedDatabasePath);
  if (referencedRetainedObjects.length !== retainedKeys.size) {
    throw new Error("TICKET29_RETAINED_R2_INVENTORY_INCOMPLETE");
  }
  const evidenceRootSha256 = stableArrayRoot(listedInventory.map((item) => ({ key: item.key,
    size: item.size, etag: item.etag, httpMetadata: item.http_metadata ?? {},
    customMetadata: item.custom_metadata ?? {} })));
  const checkpoint = new DatabaseSync(resolvedCheckpointPath);
  checkpoint.exec(`CREATE TABLE IF NOT EXISTS checkpoint_identity (
    run_id TEXT PRIMARY KEY, database_export_sha256 TEXT NOT NULL,
    evidence_root_sha256 TEXT NOT NULL, created_at TEXT NOT NULL)`);
  checkpoint.exec(`CREATE TABLE IF NOT EXISTS verified_objects (
    r2_key TEXT PRIMARY KEY, sha256 TEXT NOT NULL, byte_count INTEGER NOT NULL,
    etag TEXT NOT NULL, verified_at TEXT NOT NULL)`);
  checkpoint.prepare(`INSERT OR IGNORE INTO checkpoint_identity
    (run_id,database_export_sha256,evidence_root_sha256,created_at) VALUES (?,?,?,?)`)
    .run(RUN_ID, databaseExport.sha256, evidenceRootSha256, new Date().toISOString());
  const checkpointIdentity = checkpoint.prepare(`SELECT database_export_sha256 AS databaseExportSha256,
    evidence_root_sha256 AS evidenceRootSha256 FROM checkpoint_identity WHERE run_id=?`)
    .get(RUN_ID) as { databaseExportSha256: string; evidenceRootSha256: string } | undefined;
  if (checkpointIdentity?.databaseExportSha256 !== databaseExport.sha256
    || checkpointIdentity.evidenceRootSha256 !== evidenceRootSha256) {
    throw new Error("TICKET29_CHECKPOINT_IDENTITY_MISMATCH");
  }
  const priorCheckpoint = checkpoint.prepare(`SELECT sha256,byte_count AS byteCount,etag
    FROM verified_objects WHERE r2_key=?`);
  const saveCheckpoint = checkpoint.prepare(`INSERT INTO verified_objects
    (r2_key,sha256,byte_count,etag,verified_at) VALUES (?,?,?,?,?)
    ON CONFLICT(r2_key) DO UPDATE SET sha256=excluded.sha256,byte_count=excluded.byte_count,
      etag=excluded.etag,verified_at=excluded.verified_at`);
  let resumedObjects = 0;
  const verifiedBytes = objects.reduce((sum, row) => sum + row.byteCount, 0);
  const verifiedAt = new Date().toISOString();
  checkpoint.exec("BEGIN IMMEDIATE");
  try {
    for (const row of objects) {
      const listed = listedByKey.get(row.r2Key)!;
      const prior = priorCheckpoint.get(row.r2Key) as { sha256: string; byteCount: number;
        etag: string } | undefined;
      if (prior?.sha256 === row.sha256 && prior.byteCount === row.byteCount && prior.etag === listed.etag) {
        resumedObjects += 1;
      } else {
        saveCheckpoint.run(row.r2Key, row.sha256, row.byteCount, listed.etag, verifiedAt);
      }
    }
    checkpoint.exec("COMMIT");
  } catch (error) {
    checkpoint.exec("ROLLBACK");
    throw error;
  }
  checkpoint.close();
  const objectCounts = Object.fromEntries(database.prepare(`SELECT object_kind,count(*) AS count,
      sum(byte_count) AS bytes FROM legal_complete_corpus_objects WHERE run_id=? GROUP BY object_kind
      ORDER BY object_kind`).all(RUN_ID).map((row) => {
        const value = row as { object_kind: string; count: number; bytes: number };
        return [value.object_kind, { count: value.count, bytes: value.bytes }];
      }));
  const dispositionCounts = Object.fromEntries(database.prepare(`SELECT materialization_disposition,
      count(*) AS count,sum(byte_count) AS bytes FROM legal_complete_corpus_objects WHERE run_id=?
      GROUP BY materialization_disposition ORDER BY materialization_disposition`).all(RUN_ID).map((row) => {
        const value = row as { materialization_disposition: string; count: number; bytes: number };
        return [value.materialization_disposition, { count: value.count, bytes: value.bytes }];
      }));

  const reportCounts = { ...counts, quarantines: quarantineCount, sourceVersions: sourceVersionCount,
    union: counts.records + quarantineCount };
  const report = { schemaVersion: 1, kind: "ticket29-isolated-reconstruction",
    contentFree: true, isolated: true, accountId: ACCOUNT_ID, bucket: BUCKET,
    runId: RUN_ID, sourceBindingsUsed: 0, sourceDatabaseReads: 0, providerRequests: 0,
    derivativeIndexMutations: 0, databaseExport: basename(resolvedDatabasePath),
    databaseExportSha256: databaseExport.sha256, databaseExportByteCount: databaseExport.byteCount,
    databaseIntegrity: "ok", foreignKeyViolations: 0, bodyFields: 0, counts: reportCounts,
    ticket28Roots: { inventorySha256: inventoryRoot, canonicalSha256: canonicalRoot,
      aliasSha256: aliasRoot }, targetManifestRoots, provenanceGaps: 0,
    identityMismatches, quarantineRowMismatches, aliasRowMismatches, lineageRowMismatches,
    provenanceJoinMismatches, locatorMismatches, orphanObjects, attemptParity, quarantineAttemptParity,
    controlAttemptParity,
    descriptorMismatches, recordHashMismatches, manifestContentMismatches, snapshotContentMismatches,
    reconstructionContentMismatches,
    objects: { ...objectCounts, dispositions: dispositionCounts,
      verified: objects.length, verifiedBytes,
      resumedObjects, missing: 0, hashMismatches: 0, byteCountMismatches: 0,
      verificationBasis: {
        materializationReconstructionAttempts: 2,
        materializationVerifiedDataObjects,
        materializationVerifiedDataBytes,
        isolatedManifestAndReportContent: true,
        isolatedInventoryAndMetadata: true,
      },
      listed: listedInventory.length, listedMetadataMismatches, extraPrefixObjects,
      completeNamespaceObjects: namespaceObjects.length,
      retainedObjects: referencedRetainedObjects.length,
      prefix: EVIDENCE_PREFIX, evidenceRootSha256 },
    elapsedMilliseconds: Math.round(performance.now() - started) };
  const bytes = new TextEncoder().encode(`${stableSourceSnapshotJson(report)}\n`);
  const reportSha256 = sha256(bytes);
  await writeFile(resolvedReportPath, bytes, { flag: "wx" });
  process.stdout.write(`${stableSourceSnapshotJson({ report: resolvedReportPath, reportSha256,
    byteCount: bytes.byteLength, elapsedMilliseconds: report.elapsedMilliseconds })}\n`);
  database.close();
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (import.meta.url === invokedPath) await main();
