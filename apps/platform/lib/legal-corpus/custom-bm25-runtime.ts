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
const ORDINAL_MAPPING_PAGE_SIZE = 32_768;
const MEMBERSHIP_PARTITIONS = 64;
const digest = z.string().regex(/^[a-f0-9]{64}$/u);

async function membershipPartition(itemKey: string): Promise<string> {
  const match = /^retrieval-chunk-v1:([a-f0-9]{64})$/u.exec(itemKey);
  const identity = match?.[1] ?? await customCurrentSha256(itemKey);
  return Math.floor(Number.parseInt(identity.slice(0, 2), 16) / 4)
    .toString(16).padStart(2, "0");
}
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
  denseMetadataReleaseId: z.string().min(1).max(300).optional(),
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
  ordinalMappings: z.object({
    pageSize: z.literal(ORDINAL_MAPPING_PAGE_SIZE),
    pages: z.array(artifactReferenceSchema.extend({
      firstOrdinal: z.number().int().nonnegative(),
      lastOrdinal: z.number().int().nonnegative(),
      count: z.number().int().positive(),
    }).strict()),
  }).strict().optional(),
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
  denseMetadataReleaseId?: string;
  sparseManifestSha256: string;
  manifest: CustomBm25Manifest;
  resolveLegalIdentitySha256?: (
    itemKeys: readonly string[],
  ) => Promise<ReadonlyMap<string, string>>;
}): Promise<{
  descriptor: CustomBm25RuntimeDescriptor;
  descriptorBytes: Uint8Array;
  documentsBytes: Uint8Array;
  descriptorReference: { key: string; sizeBytes: number; sha256: string };
  documentsReference: { key: string; sizeBytes: number; sha256: string };
  ordinalMappingPages: Array<{
    reference: { key: string; sizeBytes: number; sha256: string;
      firstOrdinal: number; lastOrdinal: number; count: number };
    bytes: Uint8Array;
  }>;
  membership: {
    reference: { key: string; sizeBytes: number; sha256: string };
    bytes: Uint8Array;
    pages: Array<{ reference: { key: string; sizeBytes: number; sha256: string;
      partition: string; count: number }; bytes: Uint8Array }>;
  };
}> {
  const sparseManifestSha256 = digest.parse(input.sparseManifestSha256);
  const documentsBytes = encodeRuntimeDocuments(input.manifest);
  const documentsSha256 = await customCurrentSha256(documentsBytes);
  const documentsReference = {
    key: `search-releases/${input.releaseId}/runtime/documents-${documentsSha256}.bin`,
    sizeBytes: documentsBytes.byteLength,
    sha256: documentsSha256,
  };
  const sortedDocuments = [...input.manifest.documents]
    .sort((left, right) => left.ordinal - right.ordinal);
  const ordinalMappingPages = [] as Array<{
    reference: { key: string; sizeBytes: number; sha256: string;
      firstOrdinal: number; lastOrdinal: number; count: number };
    bytes: Uint8Array;
  }>;
  for (let offset = 0; offset < sortedDocuments.length; offset += ORDINAL_MAPPING_PAGE_SIZE) {
    const documents = sortedDocuments.slice(offset, offset + ORDINAL_MAPPING_PAGE_SIZE);
    const bytes = serializeCustomCurrentArtifact({ schemaVersion: 1,
      releaseId: input.releaseId,
      items: documents.map(({ ordinal, itemKey }) => ({ ordinal, itemKey })) });
    const sha256 = await customCurrentSha256(bytes);
    ordinalMappingPages.push({ bytes, reference: {
      key: `search-releases/${input.releaseId}/runtime/ordinal-mappings/${String(offset)
        .padStart(10, "0")}-${sha256}.json`,
      sizeBytes: bytes.byteLength, sha256, firstOrdinal: documents[0]!.ordinal,
      lastOrdinal: documents.at(-1)!.ordinal, count: documents.length,
    } });
  }
  const membership = new Map<string, Array<{ itemKey: string; ordinal: number }>>();
  for (const document of sortedDocuments) {
    const partition = await membershipPartition(document.itemKey);
    const entries = membership.get(partition) ?? [];
    entries.push({ itemKey: document.itemKey, ordinal: document.ordinal });
    membership.set(partition, entries);
  }
  const membershipPages = [] as Array<{ reference: { key: string; sizeBytes: number;
    sha256: string; partition: string; count: number }; bytes: Uint8Array }>;
  for (const partition of [...membership.keys()].sort()) {
    const items = membership.get(partition)!.sort((left, right) =>
      left.itemKey.localeCompare(right.itemKey));
    const legalIdentities = input.resolveLegalIdentitySha256
      ? await input.resolveLegalIdentitySha256(items.map(({ itemKey }) => itemKey)) : null;
    if (legalIdentities && (legalIdentities.size !== items.length
      || items.some(({ itemKey }) => !digest.safeParse(legalIdentities.get(itemKey)).success))) {
      throw new TypeError("CUSTOM_BM25_RUNTIME_MEMBERSHIP_INVALID");
    }
    const bytes = serializeCustomCurrentArtifact({ schemaVersion: 1,
      releaseId: input.releaseId, partition,
      items: items.map((item) => ({ ...item,
        ...(legalIdentities
          ? { legalIdentitySha256: legalIdentities.get(item.itemKey)! } : {}) })) });
    const sha256 = await customCurrentSha256(bytes);
    membershipPages.push({ bytes, reference: {
      key: `search-releases/${input.releaseId}/runtime/membership/${partition}-${sha256}.json`,
      sizeBytes: bytes.byteLength, sha256, partition, count: items.length,
    } });
  }
  if (membershipPages.length > MEMBERSHIP_PARTITIONS) {
    throw new TypeError("CUSTOM_BM25_RUNTIME_MEMBERSHIP_INVALID");
  }
  const membershipBytes = serializeCustomCurrentArtifact({ schemaVersion: 1,
    releaseId: input.releaseId,
    partitions: membershipPages.map(({ reference }) => reference) });
  const membershipSha256 = await customCurrentSha256(membershipBytes);
  const membershipReference = {
    key: `search-releases/${input.releaseId}/runtime/mappings-${membershipSha256}.json`,
    sizeBytes: membershipBytes.byteLength, sha256: membershipSha256,
  };
  const descriptor = descriptorSchema.parse({
    schemaVersion: "custom-bm25-runtime-v1",
    releaseId: input.releaseId,
    ...(input.denseMetadataReleaseId
      ? { denseMetadataReleaseId: input.denseMetadataReleaseId } : {}),
    sparseManifestSha256,
    analyzer: input.manifest.analyzer,
    statistics: input.manifest.statistics,
    documents: documentsReference,
    ordinalMappings: { pageSize: ORDINAL_MAPPING_PAGE_SIZE,
      pages: ordinalMappingPages.map(({ reference }) => reference) },
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
    ordinalMappingPages,
    membership: { reference: membershipReference, bytes: membershipBytes,
      pages: membershipPages },
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
): Promise<{ descriptor: ImmutableCustomArtifactWrite; documents: ImmutableCustomArtifactWrite;
  ordinalMappings: ImmutableCustomArtifactWrite[]; membership: ImmutableCustomArtifactWrite;
  membershipPages: ImmutableCustomArtifactWrite[] }> {
  const documents = await putImmutableCustomArtifact(bucket, artifacts.documentsReference.key,
    artifacts.documentsBytes, { contentType: "application/octet-stream",
      customMetadata: { kind: "custom-bm25-runtime-documents" } });
  const ordinalMappings: ImmutableCustomArtifactWrite[] = [];
  for (const page of artifacts.ordinalMappingPages) {
    ordinalMappings.push(await putImmutableCustomArtifact(bucket, page.reference.key,
      page.bytes, { contentType: "application/json",
        customMetadata: { kind: "custom-bm25-runtime-ordinal-mapping" } }));
  }
  const membershipPages: ImmutableCustomArtifactWrite[] = [];
  for (const page of artifacts.membership.pages) {
    membershipPages.push(await putImmutableCustomArtifact(bucket, page.reference.key,
      page.bytes, { contentType: "application/json",
        customMetadata: { kind: "custom-bm25-runtime-membership-page" } }));
  }
  const membership = await putImmutableCustomArtifact(bucket, artifacts.membership.reference.key,
    artifacts.membership.bytes, { contentType: "application/json",
      customMetadata: { kind: "custom-bm25-runtime-membership" } });
  const descriptor = await putImmutableCustomArtifact(bucket, artifacts.descriptorReference.key,
    artifacts.descriptorBytes, { contentType: "application/json",
      customMetadata: { kind: "custom-bm25-runtime-descriptor" } });
  return { descriptor, documents, ordinalMappings, membership, membershipPages };
}

export async function resolveCustomBm25RuntimeMembership(
  bucket: R2Bucket,
  releaseId: string,
  mappingInventorySha256: string,
  itemKeys: readonly string[],
): Promise<boolean | null> {
  const entries = await resolveCustomBm25RuntimeMembershipEntries(
    bucket,
    releaseId,
    mappingInventorySha256,
    itemKeys,
  );
  return entries === null ? null : [...new Set(itemKeys)].every((itemKey) => entries.has(itemKey));
}

export async function resolveCustomBm25RuntimeMembershipEntries(
  bucket: R2Bucket,
  releaseId: string,
  mappingInventorySha256: string,
  itemKeys: readonly string[],
): Promise<Map<string, { ordinal: number; legalIdentitySha256: string | null }> | null> {
  const sha256 = digest.parse(mappingInventorySha256);
  const key = `search-releases/${releaseId}/runtime/mappings-${sha256}.json`;
  const object = await bucket.get(key);
  if (!object) return null;
  if (object.size > 256 * 1024) throw new TypeError("CUSTOM_BM25_RUNTIME_MEMBERSHIP_CORRUPT");
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (bytes.byteLength !== object.size || await customCurrentSha256(bytes) !== sha256) {
    throw new TypeError("CUSTOM_BM25_RUNTIME_MEMBERSHIP_CORRUPT");
  }
  const manifest = z.object({ schemaVersion: z.literal(1), releaseId: z.literal(releaseId),
    partitions: z.array(artifactReferenceSchema.extend({ partition: z.string().regex(/^[a-f0-9]{2}$/u),
      count: z.number().int().positive() }).strict()).max(MEMBERSHIP_PARTITIONS) }).strict()
    .parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown);
  const partitions = new Map(manifest.partitions.map((page) => [page.partition, page]));
  if (partitions.size !== manifest.partitions.length) {
    throw new TypeError("CUSTOM_BM25_RUNTIME_MEMBERSHIP_CORRUPT");
  }
  const requested = new Map<string, string[]>();
  for (const itemKey of [...new Set(itemKeys)]) {
    const partition = await membershipPartition(itemKey);
    const group = requested.get(partition) ?? [];
    group.push(itemKey);
    requested.set(partition, group);
  }
  const resolved = new Map<string, { ordinal: number; legalIdentitySha256: string | null }>();
  const groups = [...requested.entries()];
  for (let offset = 0; offset < groups.length; offset += 6) {
    await Promise.all(groups.slice(offset, offset + 6).map(async ([partition, keys]) => {
      const reference = partitions.get(partition);
      if (!reference) return false;
      const page = z.object({ schemaVersion: z.literal(1), releaseId: z.literal(releaseId),
        partition: z.literal(partition), items: z.array(z.object({ itemKey: z.string().min(1).max(700),
          ordinal: z.number().int().nonnegative(), legalIdentitySha256: digest.optional() }).strict())
          .length(reference.count) }).strict()
        .parse(await readJson<unknown>(bucket, reference));
      const members = new Map(page.items.map((item) => [item.itemKey, item]));
      if (members.size !== page.items.length) {
        throw new TypeError("CUSTOM_BM25_RUNTIME_MEMBERSHIP_CORRUPT");
      }
      for (const itemKey of keys) {
        const item = members.get(itemKey);
        if (item) resolved.set(itemKey, { ordinal: item.ordinal,
          legalIdentitySha256: item.legalIdentitySha256 ?? null });
      }
    }));
  }
  return resolved;
}

export async function resolveCustomBm25RuntimeItemKeys(
  bucket: R2Bucket,
  rawDescriptor: CustomBm25RuntimeDescriptor,
  ordinals: readonly number[],
): Promise<string[] | null> {
  const descriptor = descriptorSchema.parse(rawDescriptor);
  if (!descriptor.ordinalMappings) return null;
  const requested = [...new Set(ordinals)];
  if (requested.some((ordinal) => !Number.isSafeInteger(ordinal) || ordinal < 0)) {
    throw new TypeError("CUSTOM_BM25_RUNTIME_ORDINAL_INVALID");
  }
  const selected = new Map<number, string>();
  const neededPages = new Map<string, typeof descriptor.ordinalMappings.pages[number]>();
  for (const ordinal of requested) {
    const page = descriptor.ordinalMappings.pages.find((candidate) =>
      candidate.firstOrdinal <= ordinal && ordinal <= candidate.lastOrdinal);
    if (!page) throw new TypeError("CUSTOM_BM25_RUNTIME_ORDINAL_MISSING");
    neededPages.set(page.key, page);
  }
  const pages = [...neededPages.values()];
  for (let offset = 0; offset < pages.length; offset += 6) {
    const values = await Promise.all(pages.slice(offset, offset + 6).map(async (page) =>
      z.object({ schemaVersion: z.literal(1), releaseId: z.literal(descriptor.releaseId),
        items: z.array(z.object({ ordinal: z.number().int().nonnegative(),
          itemKey: z.string().min(1).max(700) }).strict()).length(page.count) }).strict()
        .parse(await readJson<unknown>(bucket, page))));
    for (const value of values) for (const item of value.items) {
        if (selected.has(item.ordinal)) throw new TypeError("CUSTOM_BM25_RUNTIME_ORDINAL_DUPLICATE");
        selected.set(item.ordinal, item.itemKey);
      }
  }
  if (requested.some((ordinal) => !selected.has(ordinal))) {
    throw new TypeError("CUSTOM_BM25_RUNTIME_ORDINAL_MISSING");
  }
  return ordinals.map((ordinal) => selected.get(ordinal)!);
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
