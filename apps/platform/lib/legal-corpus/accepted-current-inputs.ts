import { z } from "zod";
import { acceptedCurrentSourceSchema, customCurrentSha256, type AcceptedCurrentSource } from "./custom-current-build";

const digest = z.string().regex(/^[a-f0-9]{64}$/u);
export const acceptedCurrentManifestSchema = z.object({
  schemaVersion: z.literal(1), sourceRootSha256: digest, auditReportSha256: digest,
  inputInventorySha256: digest, mappingSha256: digest, reconstructionSha256: digest,
  sourceCount: z.number().int().positive(), missingTokens: z.number().int().positive(),
  pages: z.array(z.object({ key: z.string().min(1), sha256: digest,
    start: z.number().int().nonnegative(), count: z.number().int().min(1).max(500) }).strict()),
  reuse: z.array(z.object({ inputSha256: digest, artifactKey: z.string().min(1),
    vectorSha256: digest, sizeBytes: z.literal(6144) }).strict()),
}).strict();
export const acceptedCurrentPageSchema = z.object({ schemaVersion: z.literal(1),
  start: z.number().int().nonnegative(), items: z.array(acceptedCurrentSourceSchema).min(1).max(500) }).strict();

export const acceptedHistoricalSourceSchema = acceptedCurrentSourceSchema.extend({
  snapshotProvisionId: z.string().regex(/^audit:[a-f0-9]{64}$/u),
  language: z.enum(["uz-Latn", "uz-Cyrl", "ru", "en"]),
  validFrom: z.string().datetime({ offset: true }),
  validTo: z.string().datetime({ offset: true }).nullable(),
}).strict();

export const acceptedHistoricalManifestSchema = z.object({
  schemaVersion: z.literal(1), capability: z.literal("history"),
  completeCorpusRunId: z.literal("ticket29:cutoff-20260831:complete-corpus-v2"),
  sourceRootSha256: digest, canonicalSha256: digest, auditReportSha256: digest,
  inputInventorySha256: digest, mappingSha256: digest, reconstructionSha256: digest,
  historyManifestSha256: digest, sourceCount: z.literal(1_295_149),
  chunkCount: z.literal(1_725_068), distinctInputCount: z.literal(235_886),
  reusedCurrentInputCount: z.literal(206_466), missingInputCount: z.literal(29_420),
  missingTokens: z.literal(15_042_720), temporalGapCount: z.literal(4_679),
  quarantineCount: z.literal(12),
  documentTitles: z.object({ key: z.string().min(1), sha256: digest,
    sizeBytes: z.number().int().positive(), count: z.literal(9_661) }).strict(),
  pages: z.array(z.object({ key: z.string().min(1), sha256: digest,
    start: z.number().int().nonnegative(), count: z.number().int().min(1).max(500) }).strict())
    .length(2_591),
  reuse: acceptedCurrentManifestSchema.shape.reuse,
}).strict();

export const acceptedHistoricalPageSchema = z.object({ schemaVersion: z.literal(1),
  start: z.number().int().nonnegative(),
  items: z.array(acceptedHistoricalSourceSchema).min(1).max(500),
}).strict();

export function acceptedHistoricalPlanItems(rawPage: unknown) {
  const page = acceptedHistoricalPageSchema.parse(rawPage);
  return page.items.map((source, index) => {
    const { snapshotProvisionId, language, validFrom, validTo, ...accepted } = source;
    return {
      sourceOrdinal: page.start + index,
      snapshotProvisionId,
      provisionRenditionId: source.legacyRenditionId,
      evidenceR2Key: source.provision.key,
      evidenceByteCount: source.provision.sizeBytes,
      evidenceSha256: source.provision.sha256,
      language,
      documentType: "unknown" as const,
      validFrom,
      validTo,
      accepted,
    };
  });
}

const acceptedDocumentTitleMapSchema = z.object({
  schemaVersion: z.literal(1),
  sourceRootSha256: digest,
  titles: z.array(z.object({ normalizedSha256: digest,
    documentTitle: z.string().trim().min(1).max(2_000) }).strict()).length(9_661),
}).strict();

export async function readAcceptedHistoricalDocumentTitles(bucket: R2Bucket,
  reference: { key: string; sha256: string; sizeBytes: number }, expectedSourceRootSha256: string) {
  const bytes = await readAcceptedObject(bucket, reference, 4 * 1024 * 1024);
  const result = acceptedDocumentTitleMapSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  if (result.sourceRootSha256 !== expectedSourceRootSha256) {
    throw new TypeError("CUSTOM_HISTORY_TITLE_MAP_ROOT_MISMATCH");
  }
  const titles = new Map(result.titles.map(item => [item.normalizedSha256, item.documentTitle]));
  if (titles.size !== result.titles.length) throw new TypeError("CUSTOM_HISTORY_TITLE_MAP_DUPLICATE");
  return titles;
}

export async function readAcceptedHistoricalMetadata(
  sources: Array<Pick<AcceptedCurrentSource, "sourceId" | "normalized">>,
  titles: ReadonlyMap<string, string>, database: D1Database) {
  if (sources.length < 1 || sources.length > 100
    || new Set(sources.map(source => source.sourceId)).size !== sources.length) {
    throw new TypeError("CUSTOM_HISTORY_METADATA_INPUT_INVALID");
  }
  const placeholders = sources.map(() => "?").join(",");
  const packet = await database.prepare(`SELECT id,article_number AS articleNumber,
      article_number_normalized AS articleNumberNormalized,article_title AS articleTitle,
      part,chapter,section,sequence FROM legal_corpus_provisions WHERE id IN (${placeholders})`)
    .bind(...sources.map(source => source.sourceId)).all<{ id: string; articleNumber: string | null;
      articleNumberNormalized: string | null; articleTitle: string | null; part: string | null;
      chapter: string | null; section: string | null; sequence: number }>();
  const rows = new Map(packet.results.map(row => [row.id, row]));
  if (rows.size !== sources.length) throw new TypeError("CUSTOM_HISTORY_METADATA_SOURCE_MISSING");
  return new Map(sources.map(source => {
    const row = rows.get(source.sourceId)!;
    const documentTitle = titles.get(source.normalized.sha256);
    if (!documentTitle || !Number.isSafeInteger(row.sequence) || row.sequence < 0) {
      throw new TypeError("CUSTOM_HISTORY_METADATA_SOURCE_INVALID");
    }
    return [source.sourceId, { documentTitle,
      articleNumber: row.articleNumber?.trim() || row.articleNumberNormalized?.trim() || `unnumbered-${row.sequence}`,
      articleTitle: row.articleTitle, hierarchy: [row.part, row.chapter, row.section]
        .map(value => value?.trim() ?? "").filter(Boolean) }];
  }));
}

export async function readAcceptedObject(bucket: R2Bucket,
  reference: { key: string; sha256: string; sizeBytes?: number }, maximumBytes: number): Promise<Uint8Array> {
  const object = await bucket.get(reference.key);
  if (!object || object.size > maximumBytes || (reference.sizeBytes !== undefined && object.size !== reference.sizeBytes)) {
    throw new TypeError("CUSTOM_CURRENT_ACCEPTED_OBJECT_INVALID");
  }
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (await customCurrentSha256(bytes) !== reference.sha256) throw new TypeError("CUSTOM_CURRENT_ACCEPTED_OBJECT_CORRUPT");
  return bytes;
}

/** Metadata-only source lookup; accepted chunk hashes fence source drift before dispatch. */
export async function readAcceptedCurrentMetadata(source: AcceptedCurrentSource, evidence: R2Bucket, database: D1Database) {
  const bytes = await readAcceptedObject(evidence, source.normalized, 32 * 1024 * 1024);
  const normalized = z.object({ documentTitle: z.string().trim().min(1) })
    .parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  const row = await database.prepare(`SELECT article_number AS articleNumber,
    article_number_normalized AS articleNumberNormalized,article_title AS articleTitle,
    part,chapter,section,sequence FROM legal_corpus_provisions WHERE id=?`).bind(source.sourceId)
    .first<{ articleNumber: string | null; articleNumberNormalized: string | null;
      articleTitle: string | null; part: string | null; chapter: string | null;
      section: string | null; sequence: number }>();
  if (!row) throw new TypeError("CUSTOM_CURRENT_ACCEPTED_SOURCE_MISSING");
  return { documentTitle: normalized.documentTitle,
    articleNumber: row.articleNumber?.trim() || row.articleNumberNormalized?.trim() || `unnumbered-${row.sequence}`,
    articleTitle: row.articleTitle, hierarchy: [row.part, row.chapter, row.section].map(value => value?.trim() ?? "").filter(Boolean) };
}
