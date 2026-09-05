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
