import { z } from "zod";

import { stableSourceSnapshotJson } from "./source-snapshot";

const SHA256 = /^[a-f0-9]{64}$/u;
const safeIdentity = z.string().min(1).max(300).regex(/^[A-Za-z0-9._:-]+$/u);
const sha256Schema = z.string().regex(SHA256);
const r2KeySchema = z.string().min(1).max(1_024)
  .regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9][A-Za-z0-9._:/-]*$/u);

export const CUSTOM_SOURCE_ORDINAL_STRIDE = 1_000 as const;
export const CUSTOM_VECTORIZE_METADATA_INDEXES = [
  "document_type",
  "language",
  "valid_from_epoch",
  "valid_to_epoch",
] as const;

const pageReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  releaseId: safeIdentity,
  batchId: safeIdentity,
  sourceOrdinalStart: z.number().int().nonnegative(),
  sourceCount: z.number().int().positive().max(100),
  sourceInventorySha256: sha256Schema,
  chunkCount: z.number().int().positive(),
  chunkInventoryKey: r2KeySchema,
  chunkInventorySha256: sha256Schema,
  sparseInputKey: r2KeySchema,
  sparseInputSha256: sha256Schema,
  sparseRecordCount: z.number().int().positive(),
  denseInventoryKey: r2KeySchema,
  denseInventorySha256: sha256Schema,
  vectorCount: z.number().int().positive(),
  vectorizeMutationId: z.string().min(1).max(300),
  providerInputTokens: z.number().int().nonnegative(),
  reusedEmbeddingCount: z.number().int().nonnegative(),
}).strict().superRefine((value, context) => {
  if (value.vectorCount !== value.chunkCount
    || value.reusedEmbeddingCount > value.chunkCount) {
    context.addIssue({ code: "custom", message: "Custom page receipt counts are inconsistent" });
  }
});

export type CustomReleasePageReceipt = z.infer<typeof pageReceiptSchema>;

const encoder = new TextEncoder();

async function sha256(value: string): Promise<string> {
  const input = encoder.encode(value);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function receiptIdentity(receipt: CustomReleasePageReceipt) {
  return {
    batchId: receipt.batchId,
    sourceOrdinalStart: receipt.sourceOrdinalStart,
    sourceCount: receipt.sourceCount,
    sourceInventorySha256: receipt.sourceInventorySha256,
    chunkCount: receipt.chunkCount,
    chunkInventoryKey: receipt.chunkInventoryKey,
    chunkInventorySha256: receipt.chunkInventorySha256,
    sparseInputKey: receipt.sparseInputKey,
    sparseInputSha256: receipt.sparseInputSha256,
    sparseRecordCount: receipt.sparseRecordCount,
    denseInventoryKey: receipt.denseInventoryKey,
    denseInventorySha256: receipt.denseInventorySha256,
    vectorCount: receipt.vectorCount,
    vectorizeMutationId: receipt.vectorizeMutationId,
    providerInputTokens: receipt.providerInputTokens,
    reusedEmbeddingCount: receipt.reusedEmbeddingCount,
  };
}

export async function reconcileCustomReleasePages(input: {
  releaseId: string;
  expectedSourceCount: number;
  receipts: readonly CustomReleasePageReceipt[];
}): Promise<{
  releaseId: string;
  sourceCount: number;
  pageCount: number;
  chunkCount: number;
  vectorCount: number;
  sparseRecordCount: number;
  providerInputTokens: number;
  reusedEmbeddingCount: number;
  pageInventorySha256: string;
  chunkInventorySha256: string;
  sparseInputInventorySha256: string;
  denseInventorySha256: string;
  vectorizeMutationInventorySha256: string;
}> {
  const releaseId = safeIdentity.parse(input.releaseId);
  if (!Number.isSafeInteger(input.expectedSourceCount) || input.expectedSourceCount < 1) {
    throw new TypeError("CUSTOM_RELEASE_SOURCE_COUNT_INVALID");
  }
  const receipts = input.receipts.map((receipt) => pageReceiptSchema.parse(receipt))
    .sort((left, right) => left.sourceOrdinalStart - right.sourceOrdinalStart
      || left.batchId.localeCompare(right.batchId));
  if (receipts.length === 0
    || new Set(receipts.map(({ batchId }) => batchId)).size !== receipts.length
    || receipts.some((receipt) => receipt.releaseId !== releaseId)) {
    throw new TypeError("CUSTOM_RELEASE_PAGE_SET_INVALID");
  }
  let nextOrdinal = 0;
  for (const receipt of receipts) {
    if (receipt.sourceOrdinalStart !== nextOrdinal) {
      throw new TypeError("CUSTOM_RELEASE_SOURCE_UNION_NOT_COMPLETE_DISJOINT");
    }
    nextOrdinal += receipt.sourceCount;
  }
  if (nextOrdinal !== input.expectedSourceCount) {
    throw new TypeError("CUSTOM_RELEASE_SOURCE_UNION_NOT_COMPLETE_DISJOINT");
  }
  const root = async (values: unknown[]) => sha256(`${values
    .map((value) => stableSourceSnapshotJson(value)).join("\n")}\n`);
  return {
    releaseId,
    sourceCount: nextOrdinal,
    pageCount: receipts.length,
    chunkCount: receipts.reduce((sum, receipt) => sum + receipt.chunkCount, 0),
    vectorCount: receipts.reduce((sum, receipt) => sum + receipt.vectorCount, 0),
    sparseRecordCount: receipts.reduce((sum, receipt) => sum + receipt.sparseRecordCount, 0),
    providerInputTokens: receipts.reduce((sum, receipt) => sum + receipt.providerInputTokens, 0),
    reusedEmbeddingCount: receipts.reduce((sum, receipt) => sum + receipt.reusedEmbeddingCount, 0),
    pageInventorySha256: await root(receipts.map(receiptIdentity)),
    chunkInventorySha256: await root(receipts.map(({ batchId, chunkInventorySha256 }) =>
      ({ batchId, chunkInventorySha256 }))),
    sparseInputInventorySha256: await root(receipts.map(({ batchId, sparseInputSha256 }) =>
      ({ batchId, sparseInputSha256 }))),
    denseInventorySha256: await root(receipts.map(({ batchId, denseInventorySha256 }) =>
      ({ batchId, denseInventorySha256 }))),
    vectorizeMutationInventorySha256: await root(receipts.map(({ batchId, vectorizeMutationId }) =>
      ({ batchId, vectorizeMutationId }))),
  };
}

export function customItemOrdinal(sourceOrdinal: number, chunkOrdinal: number): number {
  if (!Number.isSafeInteger(sourceOrdinal) || sourceOrdinal < 0
    || !Number.isSafeInteger(chunkOrdinal) || chunkOrdinal < 0
    || chunkOrdinal >= CUSTOM_SOURCE_ORDINAL_STRIDE) {
    throw new TypeError("CUSTOM_RELEASE_ITEM_ORDINAL_INVALID");
  }
  const ordinal = sourceOrdinal * CUSTOM_SOURCE_ORDINAL_STRIDE + chunkOrdinal;
  if (!Number.isSafeInteger(ordinal)) throw new TypeError("CUSTOM_RELEASE_ITEM_ORDINAL_INVALID");
  return ordinal;
}
