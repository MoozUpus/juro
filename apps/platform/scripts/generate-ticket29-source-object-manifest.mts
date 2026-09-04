import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  discoverLexLanguageVariants,
  lexLanguageFamilyId,
} from "../lib/legal-corpus/lex-discovery";
import { normalizedLegalSourceSnapshotSchema } from "../lib/legal/source-parser";

const defaultDatabase = resolve(process.cwd(), "../../.scratch/legal-retrieval-architecture-evaluation/evidence/ticket-28-complete-corpus-audit-20260904/corrected-restart.sqlite");
const output = resolve(process.cwd(), "lib/legal-corpus/ticket29-source-object-manifest.generated.ts");
const accountId = "e22babd36b65c99b69adf3de50df5227";
const sourceDatabaseId = "bb716a96-b2fb-4823-90d6-6c228fed181a";
const sourceBucket = "juro-staging-files";
const cutoff = "2026-08-31T06:26:27.2253695Z";
const ticket28ReportPath = resolve(process.cwd(), "../../.scratch/legal-retrieval-architecture-evaluation/evidence/ticket-28-complete-corpus-audit-20260904/corrected-final.json");
const ticket28 = JSON.parse(readFileSync(ticket28ReportPath, "utf8")) as {
  status: string; contentFree: boolean; readOnlySource: boolean; accountId: string;
  sourceDatabaseId: string; cutoff: string;
  reconciliation: { sourceRecords: number; historicalCandidates: number; temporalGaps: number;
    qualifiedCurrent: number; exact: boolean };
  sourceR2Integrity: { requiredObjects: number; verifiedObjects: number;
    revisionObjectMetadataAliases: number; revisionObjectAliasSha256: string; exact: boolean };
  manifests: { inventorySha256: string; canonicalSha256: string };
};
if (ticket28.status !== "complete" || ticket28.contentFree !== true || ticket28.readOnlySource !== true
  || ticket28.accountId !== accountId || ticket28.sourceDatabaseId !== sourceDatabaseId
  || ticket28.cutoff !== cutoff || ticket28.reconciliation.sourceRecords !== 1_299_828
  || ticket28.reconciliation.historicalCandidates !== 1_295_149
  || ticket28.reconciliation.temporalGaps !== 4_679
  || ticket28.reconciliation.qualifiedCurrent !== 160_978 || ticket28.reconciliation.exact !== true
  || ticket28.sourceR2Integrity.requiredObjects !== 21_978
  || ticket28.sourceR2Integrity.verifiedObjects !== 21_978
  || ticket28.sourceR2Integrity.revisionObjectMetadataAliases !== 103
  || ticket28.sourceR2Integrity.revisionObjectAliasSha256 !== "5ff75e07391b9acd01699d8aca2bbaa32684c402e3470e42660d66fdd064f201"
  || ticket28.sourceR2Integrity.exact !== true
  || ticket28.manifests.inventorySha256 !== "2105a4d39465ae8e0b923ab89a08dddf2599d57b9e1517490a8d2f1996fe4c00"
  || ticket28.manifests.canonicalSha256 !== "e527fa5221acf6063defa5f944d9ef54ca7e8b2667c47df34ba8135ef879f830") {
  throw new Error("TICKET29_TICKET28_REPORT_IDENTITY_MISMATCH");
}
const database = new DatabaseSync(process.argv[2] ? resolve(process.argv[2]) : defaultDatabase, { readOnly: true });
const rows = database.prepare(`SELECT object_key AS objectKey,role,byte_count AS byteCount,etag,
    verified_sha256 AS verifiedSha256 FROM required_source_objects ORDER BY object_key`).all() as Array<{
  objectKey: string; role: "raw" | "normalized"; byteCount: number; etag: string; verifiedSha256: string;
}>;
const aliases = database.prepare(`SELECT source_id AS sourceId,normalized_object_key AS normalizedObjectKey,
  revision_version_sha256 AS sourceRevisionSha256,
  object_metadata_version_sha256 AS objectMetadataRevisionSha256
  FROM source_revision_object_aliases ORDER BY source_id`).all() as Array<{
  sourceId: string; normalizedObjectKey: string; sourceRevisionSha256: string;
  objectMetadataRevisionSha256: string;
}>;
database.close();
if (rows.length !== 21_978 || aliases.length !== 103
  || rows.some((row) => !/^[a-f0-9]{64}$/u.test(row.verifiedSha256))) {
  throw new Error("TICKET29_SOURCE_OBJECT_MANIFEST_INCOMPLETE");
}
const json = JSON.stringify(rows.map((row) => [row.objectKey, row.role, row.byteCount, row.etag, row.verifiedSha256]));
const rootSha256 = createHash("sha256").update(json).digest("hex");
const aliasJson = JSON.stringify(aliases.map((row) => [row.sourceId, row.normalizedObjectKey,
  row.sourceRevisionSha256, row.objectMetadataRevisionSha256]));
const aliasRootSha256 = createHash("sha256").update(aliasJson).digest("hex");
const rootEnvironment = readFileSync(resolve(process.cwd(), "../../.env"), "utf8");
const tokenLine = rootEnvironment.split(/\r?\n/u)
  .find((line) => line.startsWith("CLOUDFLARE_API_TOKEN="));
const token = tokenLine?.slice("CLOUDFLARE_API_TOKEN=".length).trim().replace(/^['"]|['"]$/gu, "");
if (!token) throw new Error("TICKET29_CLOUDFLARE_API_TOKEN_REQUIRED");
const queryResponse = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${sourceDatabaseId}/query`, {
  method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({ sql: `SELECT v.id AS versionId,
    v.version_number AS versionNumber,v.version_date AS versionDate,
    v.content_sha256 AS versionContentSha256,v.previous_version_id AS previousVersionId,
    v.change_type AS changeType,v.source_url AS versionSourceUrl,v.raw_object_key AS rawObjectKey,
    v.normalized_object_key AS normalizedObjectKey
    FROM legal_corpus_versions v
    WHERE v.created_at<=? AND NOT EXISTS (SELECT 1 FROM legal_corpus_provisions p
      WHERE p.version_id=v.id AND p.created_at<=?) ORDER BY v.id`, params: [cutoff, cutoff] }),
});
const queryBody = await queryResponse.json() as { success: boolean; errors?: unknown[];
  result?: Array<{ success: boolean; results: Array<Record<string, unknown>> }> };
if (!queryResponse.ok || !queryBody.success || queryBody.result?.[0]?.success !== true) {
  throw new Error("TICKET29_EMPTY_VERSION_QUERY_FAILED");
}
const emptyVersions = queryBody.result[0]!.results as Array<{
  versionId: string; versionNumber: number;
  versionDate: string | null; versionContentSha256: string; previousVersionId: string | null;
  changeType: string; versionSourceUrl: string | null; rawObjectKey: string | null;
  normalizedObjectKey: string | null;
}>;
async function sourceObject(key: string): Promise<{ sha256: string; byteCount: number; bytes: Uint8Array }> {
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${sourceBucket}/objects/${encoded}`,
    { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`TICKET29_EMPTY_VERSION_OBJECT_FAILED:${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { sha256: createHash("sha256").update(bytes).digest("hex"), byteCount: bytes.byteLength, bytes };
}
const emptyVersionManifest = await Promise.all(emptyVersions.map(async (row) => {
  if (!row.rawObjectKey || !row.normalizedObjectKey || !row.versionSourceUrl) {
    throw new Error("TICKET29_EMPTY_VERSION_LOCATOR_MISSING");
  }
  const [raw, normalized] = await Promise.all([
    sourceObject(row.rawObjectKey), sourceObject(row.normalizedObjectKey),
  ]);
  const normalizedEnvelope = normalizedLegalSourceSnapshotSchema.parse(JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(normalized.bytes),
  ));
  const localeLanguage = { uz: "uz-Latn", uzc: "uz-Cyrl", ru: "ru", en: "en" } as const;
  const locale = normalizedEnvelope.source.locale;
  const language = typeof locale === "string"
    ? localeLanguage[locale as keyof typeof localeLanguage] : undefined;
  const current = { canonicalDocumentId: normalizedEnvelope.source.canonicalId,
    language: language!, sourceUrl: normalizedEnvelope.source.canonicalUrl };
  const identityMismatches = [
    ...(!language ? ["locale"] : []),
    ...(normalizedEnvelope.source.sourceKind !== "lex" ? ["source-kind"] : []),
    ...(!/^lexuz:-?\d+$/u.test(normalizedEnvelope.source.canonicalId) ? ["canonical-id"] : []),
    ...(normalizedEnvelope.source.rawContentSha256 !== raw.sha256 ? ["raw-sha256"] : []),
  ];
  if (identityMismatches.length > 0 || !language) {
    throw new Error(`TICKET29_EMPTY_VERSION_CUTOFF_IDENTITY_MISMATCH:${identityMismatches.join(",")}`);
  }
  const rawHtml = new TextDecoder("utf-8", { fatal: true }).decode(raw.bytes);
  const documentId = lexLanguageFamilyId(discoverLexLanguageVariants(rawHtml, current));
  return [row.versionId, documentId, language, row.versionNumber, row.versionDate,
    row.versionContentSha256, row.previousVersionId, row.changeType, row.versionSourceUrl,
    row.rawObjectKey, raw.sha256, raw.byteCount, row.normalizedObjectKey, normalized.sha256,
    normalized.byteCount, null, "not-evaluated-at-cutoff"] as const;
}));
if (emptyVersionManifest.length !== 12) {
  throw new Error(`TICKET29_EMPTY_VERSION_MANIFEST_INCOMPLETE:${emptyVersionManifest.length}`);
}
const emptyVersionJson = JSON.stringify(emptyVersionManifest);
const emptyVersionRootSha256 = createHash("sha256").update(emptyVersionJson).digest("hex");
const source = `// Generated from Ticket 28's independently reproduced, content-free R2 inventory.\n`
  + `// Entries: ${rows.length}; compact-manifest SHA-256: ${rootSha256}.\n`
  + `export const TICKET29_SOURCE_OBJECT_MANIFEST_SHA256 = "${rootSha256}";\n`
  + `export const TICKET29_SOURCE_OBJECT_MANIFEST = ${json} as ReadonlyArray<readonly [string, "raw" | "normalized", number, string, string]>;\n`
  + `export const TICKET29_SOURCE_REVISION_ALIAS_SHA256 = "${aliasRootSha256}";\n`
  + `export const TICKET29_SOURCE_REVISION_ALIASES = ${aliasJson} as ReadonlyArray<readonly [string, string, string, string]>;\n`
  + `export const TICKET29_EMPTY_VERSION_MANIFEST_SHA256 = "${emptyVersionRootSha256}";\n`
  + `export const TICKET29_EMPTY_VERSION_MANIFEST = ${emptyVersionJson} as ReadonlyArray<readonly [string, string, "uz-Latn" | "uz-Cyrl" | "ru" | "en", number, string | null, string, string | null, string, string | null, string, string, number, string, string, number, string | null, string]>;\n`;
writeFileSync(output, source, "utf8");
const outputSha256 = createHash("sha256").update(readFileSync(output)).digest("hex");
process.stdout.write(`${JSON.stringify({ entries: rows.length, aliases: aliases.length,
  emptyVersions: emptyVersionManifest.length, rootSha256, aliasRootSha256,
  emptyVersionRootSha256, outputSha256 })}\n`);
