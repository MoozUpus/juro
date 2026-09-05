import { z } from "zod";

import {
  analyzeCustomWordTerms,
  customBm25TermHash,
  scoreCustomBm25Term,
  type CustomBm25Manifest,
} from "./custom-bm25";
import {
  putImmutableCustomArtifact,
  readVerifiedCustomArtifactRange,
  type ImmutableCustomArtifactWrite,
} from "./custom-hybrid-index";
import { customCurrentSha256, serializeCustomCurrentArtifact } from "./custom-current-build";

const MAGIC = new TextEncoder().encode("JBM25RT1");
const HEADER_SIZE = 16;
const RECORD_SIZE = 32;
const MAX_POSTING_BLOCK_BYTES = 16 * 1024 * 1024;
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const artifactReferenceSchema = z.object({
  key: z.string().min(1).max(1_024),
  sizeBytes: z.number().int().positive(),
  sha256: digest,
}).strict();
const postingLocatorSchema = artifactReferenceSchema.extend({
  offset: z.number().int().nonnegative(),
  length: z.number().int().positive(),
  documentFrequency: z.number().int().positive(),
  blockMaximum: z.number().finite().nonnegative(),
}).strict();
const descriptorSchema = z.object({
  schemaVersion: z.literal("custom-bm25-runtime-v1"),
  releaseId: z.string().min(1).max(300),
  sparseManifestSha256: digest,
  analyzer: z.literal("word-v1"),
  statistics: z.object({
    documentCount: z.number().int().positive(),
    averageFieldLengths: z.object({
      title: z.number().finite().nonnegative(),
      hierarchy: z.number().finite().nonnegative(),
      article: z.number().finite().nonnegative(),
      text: z.number().finite().nonnegative(),
    }).strict(),
  }).strict(),
  documents: artifactReferenceSchema,
  segments: z.array(z.object({
    id: z.string().min(1).max(300),
    lexicons: z.record(z.string().length(1), artifactReferenceSchema),
  }).strict()).min(1),
}).strict();

export type CustomBm25RuntimeDescriptor = z.infer<typeof descriptorSchema>;

export function parseCustomBm25RuntimeDescriptor(value: unknown): CustomBm25RuntimeDescriptor {
  return descriptorSchema.parse(value);
}

function encodeRuntimeDocuments(manifest: CustomBm25Manifest): Uint8Array {
  const documents = [...manifest.documents].sort((left, right) => left.ordinal - right.ordinal);
  if (documents.length !== manifest.statistics.documentCount
    || documents.some((document, index) => !Number.isSafeInteger(document.ordinal)
      || document.ordinal < 0 || document.ordinal > 0xffff_ffff
      || (index > 0 && document.ordinal <= documents[index - 1]!.ordinal))) {
    throw new TypeError("CUSTOM_BM25_RUNTIME_DOCUMENTS_INVALID");
  }
  const bytes = new Uint8Array(HEADER_SIZE + documents.length * RECORD_SIZE);
  bytes.set(MAGIC, 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 1, true);
  view.setUint32(12, documents.length, true);
  documents.forEach((document, index) => {
    const offset = HEADER_SIZE + index * RECORD_SIZE;
    const lengths = [document.fieldLengths.title, document.fieldLengths.hierarchy,
      document.fieldLengths.article, document.fieldLengths.text];
    if (![document.validFromEpoch, document.validToEpoch ?? -1].every(Number.isSafeInteger)
      || lengths.some((length) => !Number.isSafeInteger(length) || length < 0 || length > 0xffff)) {
      throw new TypeError("CUSTOM_BM25_RUNTIME_DOCUMENTS_INVALID");
    }
    view.setUint32(offset, document.ordinal, true);
    view.setFloat64(offset + 4, document.validFromEpoch, true);
    view.setFloat64(offset + 12, document.validToEpoch ?? -1, true);
    lengths.forEach((length, field) => view.setUint16(offset + 20 + field * 2, length, true));
  });
  return bytes;
}

export async function buildCustomBm25RuntimeArtifacts(input: {
  releaseId: string;
  sparseManifestSha256: string;
  manifest: CustomBm25Manifest;
}): Promise<{
  descriptor: CustomBm25RuntimeDescriptor;
  descriptorBytes: Uint8Array;
  documentsBytes: Uint8Array;
  descriptorReference: { key: string; sizeBytes: number; sha256: string };
  documentsReference: { key: string; sizeBytes: number; sha256: string };
}> {
  const sparseManifestSha256 = digest.parse(input.sparseManifestSha256);
  const documentsBytes = encodeRuntimeDocuments(input.manifest);
  const documentsSha256 = await customCurrentSha256(documentsBytes);
  const documentsReference = {
    key: `search-releases/${input.releaseId}/runtime/documents-${documentsSha256}.bin`,
    sizeBytes: documentsBytes.byteLength,
    sha256: documentsSha256,
  };
  const descriptor = descriptorSchema.parse({
    schemaVersion: "custom-bm25-runtime-v1",
    releaseId: input.releaseId,
    sparseManifestSha256,
    analyzer: input.manifest.analyzer,
    statistics: input.manifest.statistics,
    documents: documentsReference,
    segments: input.manifest.segments.map((segment) => ({
      id: segment.id,
      lexicons: segment.lexicons,
    })),
  });
  const descriptorBytes = serializeCustomCurrentArtifact(descriptor);
  const descriptorSha256 = await customCurrentSha256(descriptorBytes);
  return {
    descriptor,
    descriptorBytes,
    documentsBytes,
    descriptorReference: {
      key: `search-releases/${input.releaseId}/runtime/descriptor-${descriptorSha256}.json`,
      sizeBytes: descriptorBytes.byteLength,
      sha256: descriptorSha256,
    },
    documentsReference,
  };
}

export async function putCustomBm25RuntimeArtifacts(
  bucket: R2Bucket,
  artifacts: Awaited<ReturnType<typeof buildCustomBm25RuntimeArtifacts>>,
): Promise<{ descriptor: ImmutableCustomArtifactWrite; documents: ImmutableCustomArtifactWrite }> {
  const documents = await putImmutableCustomArtifact(bucket, artifacts.documentsReference.key,
    artifacts.documentsBytes, { contentType: "application/octet-stream",
      customMetadata: { kind: "custom-bm25-runtime-documents" } });
  const descriptor = await putImmutableCustomArtifact(bucket, artifacts.descriptorReference.key,
    artifacts.descriptorBytes, { contentType: "application/json",
      customMetadata: { kind: "custom-bm25-runtime-descriptor" } });
  return { descriptor, documents };
}

type RuntimeDocument = {
  validFromEpoch: number;
  validToEpoch: number | null;
  fieldLengths: { title: number; hierarchy: number; article: number; text: number };
};

function runtimeDocument(bytes: Uint8Array, ordinal: number): RuntimeDocument | null {
  if (bytes.byteLength < HEADER_SIZE || !MAGIC.every((value, index) => bytes[index] === value)) {
    throw new TypeError("CUSTOM_BM25_RUNTIME_DOCUMENTS_CORRUPT");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(12, true);
  if (view.getUint32(8, true) !== 1 || bytes.byteLength !== HEADER_SIZE + count * RECORD_SIZE) {
    throw new TypeError("CUSTOM_BM25_RUNTIME_DOCUMENTS_CORRUPT");
  }
  let low = 0;
  let high = count - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const offset = HEADER_SIZE + middle * RECORD_SIZE;
    const candidate = view.getUint32(offset, true);
    if (candidate < ordinal) low = middle + 1;
    else if (candidate > ordinal) high = middle - 1;
    else {
      const validTo = view.getFloat64(offset + 12, true);
      return {
        validFromEpoch: view.getFloat64(offset + 4, true),
        validToEpoch: validTo === -1 ? null : validTo,
        fieldLengths: {
          title: view.getUint16(offset + 20, true),
          hierarchy: view.getUint16(offset + 22, true),
          article: view.getUint16(offset + 24, true),
          text: view.getUint16(offset + 26, true),
        },
      };
    }
  }
  return null;
}

const postingBlockSchema = z.object({
  termHash: digest,
  documentFrequency: z.number().int().positive(),
  blockMaximum: z.number().finite().nonnegative(),
  skip: z.array(z.object({ postingIndex: z.number().int().nonnegative(),
    ordinal: z.number().int().nonnegative() }).strict()),
  postings: z.array(z.object({
    ordinal: z.number().int().nonnegative(),
    termFrequencies: z.object({ title: z.number().int().nonnegative(),
      hierarchy: z.number().int().nonnegative(), article: z.number().int().nonnegative(),
      text: z.number().int().nonnegative() }).strict(),
  }).strict()),
}).strict();

async function readJson<T>(bucket: R2Bucket, reference: {
  key: string; sizeBytes: number; sha256: string;
}): Promise<T> {
  const bytes = await readVerifiedCustomArtifactRange(bucket, {
    key: reference.key, offset: 0, length: reference.sizeBytes, sha256: reference.sha256,
  });
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as T;
}

export async function queryCustomBm25Runtime(
  bucket: R2Bucket,
  rawDescriptor: CustomBm25RuntimeDescriptor,
  input: { text: string; atEpoch: number; topK: number },
): Promise<Array<{ ordinal: number; score: number }>> {
  const descriptor = descriptorSchema.parse(rawDescriptor);
  if (!Number.isSafeInteger(input.atEpoch) || !Number.isSafeInteger(input.topK)
    || input.topK < 1 || input.topK > 50) throw new TypeError("CUSTOM_BM25_RUNTIME_QUERY_INVALID");
  const documents = await readVerifiedCustomArtifactRange(bucket, {
    key: descriptor.documents.key, offset: 0, length: descriptor.documents.sizeBytes,
    sha256: descriptor.documents.sha256,
  });
  const scores = new Map<number, number>();
  for (const term of [...new Set(analyzeCustomWordTerms(input.text))].sort()) {
    const termHash = await customBm25TermHash(term);
    for (const segment of descriptor.segments) {
      const lexiconReference = segment.lexicons[termHash[0]!];
      if (!lexiconReference) continue;
      const lexicon = z.record(digest, postingLocatorSchema)
        .parse(await readJson<unknown>(bucket, lexiconReference));
      const locator = lexicon[termHash];
      if (!locator) continue;
      if (locator.length > MAX_POSTING_BLOCK_BYTES) {
        throw new TypeError("CUSTOM_BM25_RUNTIME_POSTING_TOO_LARGE");
      }
      const blockBytes = await readVerifiedCustomArtifactRange(bucket, locator);
      const block = postingBlockSchema.parse(JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(blockBytes),
      ) as unknown);
      if (block.termHash !== termHash || block.documentFrequency !== locator.documentFrequency
        || block.blockMaximum !== locator.blockMaximum) {
        throw new TypeError("CUSTOM_BM25_RUNTIME_POSTING_LOCATOR_MISMATCH");
      }
      for (const posting of block.postings) {
        const document = runtimeDocument(documents, posting.ordinal);
        if (!document) throw new TypeError("CUSTOM_BM25_RUNTIME_ORDINAL_MISSING");
        if (document.validFromEpoch > input.atEpoch
          || (document.validToEpoch !== null && input.atEpoch >= document.validToEpoch)) continue;
        const fields = ["title", "hierarchy", "article", "text"] as const;
        const score = fields.reduce((sum, field) => sum + scoreCustomBm25Term({
          termFrequency: posting.termFrequencies[field],
          documentFrequency: block.documentFrequency,
          documentCount: descriptor.statistics.documentCount,
          fieldLength: document.fieldLengths[field],
          averageFieldLength: descriptor.statistics.averageFieldLengths[field],
          field,
        }), 0);
        scores.set(posting.ordinal, (scores.get(posting.ordinal) ?? 0) + score);
      }
    }
  }
  return [...scores].map(([ordinal, score]) => ({ ordinal, score }))
    .sort((left, right) => right.score - left.score || left.ordinal - right.ordinal)
    .slice(0, input.topK);
}
