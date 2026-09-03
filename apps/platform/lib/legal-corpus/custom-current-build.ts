import { z } from "zod";

import {
  buildCustomBm25IntermediateRecords,
  type CustomBm25IntermediateRecord,
} from "./custom-bm25";
import {
  buildRetrievalChunks,
  customVectorId,
  serializeCustomEmbeddingInput,
  type CustomRetrievalChunk,
} from "./custom-hybrid-index";
import { customItemOrdinal } from "./custom-release-manifest";
import { provisionObjectSchema } from "./source-snapshot-build-service";
import { stableSourceSnapshotJson } from "./source-snapshot";
import { legalLanguageSchema } from "./target-domain-schemas";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const instantSchema = z.string().datetime({ offset: true });
const sourcePlanItemSchema = z.object({
  sourceOrdinal: z.number().int().nonnegative(),
  snapshotProvisionId: z.string().min(1).max(300),
  provisionRenditionId: z.string().min(1).max(300),
  evidenceR2Key: z.string().min(1).max(1_024),
  evidenceByteCount: z.number().int().positive(),
  evidenceSha256: sha256Schema,
  language: legalLanguageSchema,
  documentType: z.string().min(1).max(300),
  validFrom: instantSchema,
  validTo: instantSchema.nullable(),
}).strict();

export type CustomCurrentSourcePlanItem = z.infer<typeof sourcePlanItemSchema>;

export type CustomCurrentDenseItem = {
  chunk: CustomRetrievalChunk;
  vectorId: string;
  metadata: {
    item_key: string;
    release_id: string;
    snapshot_provision_id: string;
    language: z.infer<typeof legalLanguageSchema>;
    document_type: string;
    valid_from_epoch: number;
    valid_to_epoch: number;
  };
  metadataSha256: string;
  structuredInputSha256: string;
  inputTokens: number;
};

export type CustomCurrentMaterializedItem = {
  source: CustomCurrentSourcePlanItem;
  chunks: CustomRetrievalChunk[];
  denseItems: CustomCurrentDenseItem[];
  sparseRecords: CustomBm25IntermediateRecord[];
  documentFieldLengths: Array<{
    itemOrdinal: number;
    itemKey: string;
    title: number;
    hierarchy: number;
    article: number;
    text: number;
  }>;
};

const sparsePartitions = "0123456789abcdef".split("");

export function partitionCustomBm25IntermediateRecords(
  records: readonly CustomBm25IntermediateRecord[],
): Record<string, CustomBm25IntermediateRecord[]> {
  const partitions = Object.fromEntries(sparsePartitions.map((partition) => [partition, []])) as
    Record<string, CustomBm25IntermediateRecord[]>;
  for (const record of records) {
    if (!/^[a-f0-9]{64}$/u.test(record.termHash)) {
      throw new TypeError("CUSTOM_CURRENT_SPARSE_TERM_HASH_INVALID");
    }
    partitions[record.termHash[0]!]!.push(record);
  }
  for (const recordsInPartition of Object.values(partitions)) {
    recordsInPartition.sort((left, right) => left.termHash.localeCompare(right.termHash)
      || left.itemOrdinal - right.itemOrdinal || left.field.localeCompare(right.field));
  }
  return partitions;
}

const encoder = new TextEncoder();

export async function customCurrentSha256(value: Uint8Array | string): Promise<string> {
  const source = typeof value === "string" ? encoder.encode(value) : value;
  const bytes = new Uint8Array(source.byteLength);
  bytes.set(source);
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function epoch(value: string): number {
  const milliseconds = Date.parse(value);
  if (!Number.isSafeInteger(milliseconds)) throw new TypeError("CUSTOM_CURRENT_APPLICABILITY_INVALID");
  return Math.floor(milliseconds / 1_000);
}

export async function materializeCustomCurrentItem(input: {
  releaseId: string;
  planItem: CustomCurrentSourcePlanItem;
  evidenceBytes: Uint8Array;
}): Promise<CustomCurrentMaterializedItem> {
  const source = sourcePlanItemSchema.parse(input.planItem);
  if (input.evidenceBytes.byteLength !== source.evidenceByteCount
    || await customCurrentSha256(input.evidenceBytes) !== source.evidenceSha256) {
    throw new TypeError("CUSTOM_CURRENT_EVIDENCE_INTEGRITY_FAILED");
  }
  let object: z.infer<typeof provisionObjectSchema>;
  try {
    object = provisionObjectSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true })
      .decode(input.evidenceBytes)) as unknown);
  } catch {
    throw new TypeError("CUSTOM_CURRENT_EVIDENCE_SCHEMA_FAILED");
  }
  if (object.provisionRenditionId !== source.provisionRenditionId
    || object.languageTag !== source.language
    || object.documentType !== source.documentType) {
    throw new TypeError("CUSTOM_CURRENT_EVIDENCE_IDENTITY_FAILED");
  }
  const validFromEpoch = epoch(source.validFrom);
  const validToEpoch = source.validTo === null ? null : epoch(source.validTo);
  const chunks = await buildRetrievalChunks({
    snapshotProvisionId: source.snapshotProvisionId,
    sourceDocumentTitle: object.actTitle,
    documentType: object.documentType,
    articleNumber: object.articleNumber,
    articleTitle: object.articleTitle,
    hierarchy: [],
    language: object.languageTag,
    script: object.languageTag === "uz-Latn" || object.languageTag === "en" ? "Latn" : "Cyrl",
    officialText: object.provisionText,
    validFromEpoch,
    validToEpoch,
  }, { targetTokens: 512 });
  if (chunks.length >= 1_000) throw new TypeError("CUSTOM_CURRENT_PROVISION_CHUNK_LIMIT");

  const denseItems: CustomCurrentDenseItem[] = [];
  const sparseRecords: CustomBm25IntermediateRecord[] = [];
  const documentFieldLengths: CustomCurrentMaterializedItem["documentFieldLengths"] = [];
  for (const chunk of chunks) {
    const itemOrdinal = customItemOrdinal(source.sourceOrdinal, chunk.ordinal);
    const metadata = {
      item_key: chunk.id,
      release_id: input.releaseId,
      snapshot_provision_id: source.snapshotProvisionId,
      language: chunk.language,
      document_type: chunk.documentType,
      valid_from_epoch: chunk.validFromEpoch,
      valid_to_epoch: chunk.validToEpoch ?? 253_402_300_799,
    };
    const serializedInput = serializeCustomEmbeddingInput(chunk);
    denseItems.push({
      chunk,
      vectorId: await customVectorId(chunk.id),
      metadata,
      metadataSha256: await customCurrentSha256(stableSourceSnapshotJson(metadata)),
      structuredInputSha256: await customCurrentSha256(serializedInput),
      inputTokens: chunk.embeddingTokenCount,
    });
    const sparse = await buildCustomBm25IntermediateRecords({
      segmentId: "current-base-v1",
      itemKey: chunk.id,
      language: chunk.language,
      documentType: chunk.documentType,
      validFromEpoch: chunk.validFromEpoch,
      validToEpoch: chunk.validToEpoch,
      fields: {
        title: chunk.sourceDocumentTitle,
        hierarchy: chunk.hierarchy.join("\n"),
        article: [chunk.articleNumber, chunk.articleTitle].filter(Boolean).join(" "),
        text: chunk.officialText,
      },
    }, itemOrdinal);
    sparseRecords.push(...sparse.records);
    documentFieldLengths.push({ itemOrdinal, itemKey: chunk.id, ...sparse.fieldLengths });
  }
  return { source, chunks, denseItems, sparseRecords, documentFieldLengths };
}

export function serializeCustomCurrentArtifact(value: unknown): Uint8Array {
  return encoder.encode(`${stableSourceSnapshotJson(value)}\n`);
}
