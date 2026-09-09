import { z } from "zod";

import { readVerifiedCustomArtifactRange } from "./custom-hybrid-index";
import { stableSourceSnapshotJson } from "./source-snapshot";
import { legalLanguageSchema } from "./target-domain-schemas";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });
export const CUSTOM_BM25_FIELDS = ["title", "hierarchy", "article", "text"] as const;
const fieldNames = CUSTOM_BM25_FIELDS;
type FieldName = typeof fieldNames[number];
type Analyzer = "word-v1" | "character-trigram-v1";

const documentSchema = z.object({
  segmentId: z.string().min(1).max(200).regex(/^[A-Za-z0-9._:-]+$/u),
  itemKey: z.string().min(1).max(700),
  language: legalLanguageSchema,
  documentType: z.string().min(1).max(300),
  validFromEpoch: z.number().int(),
  validToEpoch: z.number().int().nullable(),
  fields: z.object({
    title: z.string(),
    hierarchy: z.string(),
    article: z.string(),
    text: z.string(),
  }).strict(),
}).strict().superRefine((value, context) => {
  if (value.validToEpoch !== null && value.validToEpoch <= value.validFromEpoch) {
    context.addIssue({ code: "custom", message: "Applicability interval must be half-open" });
  }
});

export type CustomBm25Document = z.input<typeof documentSchema>;
type ArtifactReference = { key: string; sizeBytes: number; sha256: string };
type PostingLocator = ArtifactReference & {
  offset: number;
  length: number;
  documentFrequency: number;
  blockMaximum: number;
};
type ManifestDocument = {
  ordinal: number;
  itemKey: string;
  segmentId: string;
  language: z.infer<typeof legalLanguageSchema>;
  documentType: string;
  validFromEpoch: number;
  validToEpoch: number | null;
  fieldLengths: Record<FieldName, number>;
};
export type CustomBm25Manifest = {
  schemaVersion: "custom-bm25-manifest-v1";
  analyzer: Analyzer;
  statistics: {
    documentCount: number;
    averageFieldLengths: Record<FieldName, number>;
  };
  documents: ManifestDocument[];
  segments: Array<{
    id: string;
    postings: Record<string, ArtifactReference>;
    lexicons: Record<string, ArtifactReference>;
  }>;
};
export type CustomBm25Artifact = ArtifactReference & { bytes: Uint8Array };

type Posting = {
  ordinal: number;
  termFrequencies: Record<FieldName, number>;
};
type PostingBlock = {
  termHash: string;
  documentFrequency: number;
  blockMaximum: number;
  skip: Array<{ postingIndex: number; ordinal: number }>;
  postings: Posting[];
};

async function sha256Hex(bytes: Uint8Array | string): Promise<string> {
  const source = typeof bytes === "string" ? textEncoder.encode(bytes) : bytes;
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function encodeStable(value: unknown): Uint8Array {
  return textEncoder.encode(`${stableSourceSnapshotJson(value)}\n`);
}

export function analyzeCustomWordTerms(value: string): string[] {
  return value.normalize("NFKC").toLocaleLowerCase("und").match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function analyzeCustomCharacterNgrams(value: string, width = 3): string[] {
  if (!Number.isSafeInteger(width) || width < 2 || width > 5) {
    throw new TypeError("CUSTOM_CHARACTER_NGRAM_WIDTH_INVALID");
  }
  return analyzeCustomWordTerms(value).flatMap((word) => {
    const points = [...`^${word}$`];
    if (points.length <= width) return [points.join("")];
    return Array.from({ length: points.length - width + 1 }, (_, index) =>
      points.slice(index, index + width).join(""));
  });
}

function analyze(value: string, analyzer: Analyzer): string[] {
  return analyzer === "word-v1" ? analyzeCustomWordTerms(value) : analyzeCustomCharacterNgrams(value);
}

export async function customBm25TermHash(term: string): Promise<string> {
  if (term.length === 0) throw new TypeError("CUSTOM_BM25_TERM_REQUIRED");
  return analyzerTermHash("word-v1", term);
}

async function analyzerTermHash(analyzer: Analyzer, term: string): Promise<string> {
  return sha256Hex(`${analyzer}\u0000${term}`);
}

export type CustomBm25IntermediateRecord = {
  termHash: string;
  itemOrdinal: number;
  itemKey: string;
  field: FieldName;
  termFrequency: number;
};

export async function buildCustomBm25IntermediateRecords(
  rawDocument: CustomBm25Document,
  itemOrdinal: number,
): Promise<{
  fieldLengths: Record<FieldName, number>;
  records: CustomBm25IntermediateRecord[];
}> {
  const document = documentSchema.parse(rawDocument);
  if (!Number.isSafeInteger(itemOrdinal) || itemOrdinal < 0) {
    throw new TypeError("CUSTOM_BM25_ITEM_ORDINAL_INVALID");
  }
  const analyzed = Object.fromEntries(fieldNames.map((field) => [
    field,
    analyzeCustomWordTerms(document.fields[field]),
  ])) as Record<FieldName, string[]>;
  const fieldLengths = Object.fromEntries(fieldNames.map((field) => [
    field,
    analyzed[field].length,
  ])) as Record<FieldName, number>;
  const hashes = new Map<string, string>();
  await Promise.all([...new Set(fieldNames.flatMap((field) => analyzed[field]))]
    .map(async (term) => hashes.set(term, await customBm25TermHash(term))));
  const records = fieldNames.flatMap((field) => {
    const counts = frequencies(analyzed[field]);
    return [...counts].map(([term, termFrequency]) => ({
      termHash: hashes.get(term)!,
      itemOrdinal,
      itemKey: document.itemKey,
      field,
      termFrequency,
    }));
  }).sort((left, right) => left.termHash.localeCompare(right.termHash)
    || left.itemOrdinal - right.itemOrdinal
    || left.field.localeCompare(right.field));
  return { fieldLengths, records };
}

function frequencies(terms: readonly string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const term of terms) result.set(term, (result.get(term) ?? 0) + 1);
  return result;
}

const fieldWeights: Record<FieldName, number> = {
  title: 2,
  hierarchy: 1.5,
  article: 1.5,
  text: 1,
};

export function scoreCustomBm25Term(input: {
  termFrequency: number;
  documentFrequency: number;
  documentCount: number;
  fieldLength: number;
  averageFieldLength: number;
  field: FieldName;
}): number {
  if (input.termFrequency <= 0) return 0;
  const k1 = 1.2;
  const b = 0.75;
  const average = Math.max(1, input.averageFieldLength);
  const idf = Math.log(1 + (
    input.documentCount - input.documentFrequency + 0.5
  ) / (input.documentFrequency + 0.5));
  const denominator = input.termFrequency + k1 * (
    1 - b + b * input.fieldLength / average
  );
  return fieldWeights[input.field] * idf
    * (input.termFrequency * (k1 + 1)) / denominator;
}

async function artifact(prefix: string, bytes: Uint8Array): Promise<CustomBm25Artifact> {
  const sha256 = await sha256Hex(bytes);
  return {
    key: `custom-indexes/${prefix}/${sha256}.bin`,
    sizeBytes: bytes.byteLength,
    sha256,
    bytes,
  };
}

function reference(value: CustomBm25Artifact): ArtifactReference {
  return { key: value.key, sizeBytes: value.sizeBytes, sha256: value.sha256 };
}

export async function buildCustomBm25Artifacts(
  rawDocuments: readonly CustomBm25Document[],
  options: { analyzer: Analyzer },
): Promise<{
  manifest: CustomBm25Manifest;
  manifestArtifact: CustomBm25Artifact;
  artifacts: CustomBm25Artifact[];
}> {
  const analyzer = z.enum(["word-v1", "character-trigram-v1"]).parse(options.analyzer);
  const documents = rawDocuments.map((document) => documentSchema.parse(document))
    .sort((left, right) => left.itemKey.localeCompare(right.itemKey));
  if (documents.length === 0) throw new TypeError("CUSTOM_BM25_DOCUMENTS_REQUIRED");
  if (new Set(documents.map((document) => document.itemKey)).size !== documents.length) {
    throw new TypeError("CUSTOM_BM25_DUPLICATE_ITEM_KEY");
  }
  const analyzed = documents.map((document, ordinal) => {
    const terms = Object.fromEntries(fieldNames.map((field) => [
      field,
      analyze(document.fields[field], analyzer),
    ])) as Record<FieldName, string[]>;
    const termFrequencies = Object.fromEntries(fieldNames.map((field) => [
      field,
      frequencies(terms[field]),
    ])) as Record<FieldName, Map<string, number>>;
    return { document, ordinal, terms, termFrequencies };
  });
  const averages = Object.fromEntries(fieldNames.map((field) => [
    field,
    analyzed.reduce((sum, entry) => sum + entry.terms[field].length, 0) / documents.length,
  ])) as Record<FieldName, number>;
  const globalDocumentFrequency = new Map<string, number>();
  for (const entry of analyzed) {
    const unique = new Set(fieldNames.flatMap((field) => entry.terms[field]));
    for (const term of unique) {
      globalDocumentFrequency.set(term, (globalDocumentFrequency.get(term) ?? 0) + 1);
    }
  }
  const manifestDocuments: ManifestDocument[] = analyzed.map(({ document, ordinal, terms }) => ({
    ordinal,
    itemKey: document.itemKey,
    segmentId: document.segmentId,
    language: document.language,
    documentType: document.documentType,
    validFromEpoch: document.validFromEpoch,
    validToEpoch: document.validToEpoch,
    fieldLengths: Object.fromEntries(fieldNames.map((field) => [
      field,
      terms[field].length,
    ])) as Record<FieldName, number>,
  }));
  const artifacts: CustomBm25Artifact[] = [];
  const segments: CustomBm25Manifest["segments"] = [];
  const segmentIds = [...new Set(documents.map((document) => document.segmentId))].sort();
  for (const segmentId of segmentIds) {
    const entries = analyzed.filter((entry) => entry.document.segmentId === segmentId);
    const terms = [...new Set(entries.flatMap((entry) =>
      fieldNames.flatMap((field) => entry.terms[field])))].sort();
    const blocks: Array<{ termHash: string; bytes: Uint8Array; block: PostingBlock }> = [];
    for (const term of terms) {
      const termHash = await analyzerTermHash(analyzer, term);
      const documentFrequency = globalDocumentFrequency.get(term) ?? 0;
      const postings = entries.flatMap((entry): Posting[] => {
        const termFrequencies = Object.fromEntries(fieldNames.map((field) => [
          field,
          entry.termFrequencies[field].get(term) ?? 0,
        ])) as Record<FieldName, number>;
        return fieldNames.some((field) => termFrequencies[field] > 0)
          ? [{ ordinal: entry.ordinal, termFrequencies }]
          : [];
      });
      const blockMaximum = Math.max(...postings.map((posting) => {
        const document = manifestDocuments[posting.ordinal]!;
        return fieldNames.reduce((sum, field) => sum + scoreCustomBm25Term({
          termFrequency: posting.termFrequencies[field],
          documentFrequency,
          documentCount: documents.length,
          fieldLength: document.fieldLengths[field],
          averageFieldLength: averages[field],
          field,
        }), 0);
      }));
      const stride = Math.max(1, Math.floor(Math.sqrt(postings.length)));
      const block: PostingBlock = {
        termHash,
        documentFrequency,
        blockMaximum,
        skip: postings.flatMap((posting, postingIndex) =>
          postingIndex % stride === 0 ? [{ postingIndex, ordinal: posting.ordinal }] : []),
        postings,
      };
      blocks.push({ termHash, block, bytes: encodeStable(block) });
    }
    const postingsBytes = new Uint8Array(blocks.reduce((sum, block) => sum + block.bytes.length, 0));
    let writeOffset = 0;
    const blockOffsets = new Map<string, { offset: number; length: number; sha256: string }>();
    for (const block of blocks) {
      postingsBytes.set(block.bytes, writeOffset);
      blockOffsets.set(block.termHash, {
        offset: writeOffset,
        length: block.bytes.byteLength,
        sha256: await sha256Hex(block.bytes),
      });
      writeOffset += block.bytes.byteLength;
    }
    const postingsArtifact = await artifact(`${analyzer}/postings`, postingsBytes);
    artifacts.push(postingsArtifact);
    const partitionEntries = new Map<string, Record<string, PostingLocator>>();
    for (const { termHash, block } of blocks) {
      const partition = termHash.slice(0, 1);
      const values = partitionEntries.get(partition) ?? {};
      const location = blockOffsets.get(termHash)!;
      values[termHash] = {
        key: postingsArtifact.key,
        sizeBytes: postingsArtifact.sizeBytes,
        offset: location.offset,
        length: location.length,
        sha256: location.sha256,
        documentFrequency: block.documentFrequency,
        blockMaximum: block.blockMaximum,
      };
      partitionEntries.set(partition, values);
    }
    const lexicons: Record<string, ArtifactReference> = {};
    for (const [partition, entries] of [...partitionEntries].sort(([left], [right]) =>
      left.localeCompare(right))) {
      const lexiconArtifact = await artifact(
        `${analyzer}/lexicon/${partition}`,
        encodeStable(entries),
      );
      artifacts.push(lexiconArtifact);
      lexicons[partition] = reference(lexiconArtifact);
    }
    segments.push({
      id: segmentId,
      postings: Object.fromEntries([...partitionEntries.keys()].sort()
        .map((partition) => [partition, reference(postingsArtifact)])),
      lexicons,
    });
  }
  const manifest: CustomBm25Manifest = {
    schemaVersion: "custom-bm25-manifest-v1",
    analyzer,
    statistics: { documentCount: documents.length, averageFieldLengths: averages },
    documents: manifestDocuments,
    segments,
  };
  const manifestArtifact = await artifact(`${analyzer}/manifest`, encodeStable(manifest));
  artifacts.push(manifestArtifact);
  return { manifest, manifestArtifact, artifacts };
}

async function readJsonRange<T>(
  bucket: R2Bucket,
  locator: { key: string; offset: number; length: number; sha256: string },
): Promise<T> {
  const bytes = await readVerifiedCustomArtifactRange(bucket, locator);
  return JSON.parse(textDecoder.decode(bytes)) as T;
}

export async function queryCustomBm25(
  bucket: R2Bucket,
  manifest: CustomBm25Manifest,
  input: {
    text: string;
    language?: z.infer<typeof legalLanguageSchema>;
    documentTypes?: readonly string[];
    atEpoch: number;
    topK: number;
  },
): Promise<Array<{ itemKey: string; score: number }>> {
  if (!Number.isSafeInteger(input.topK) || input.topK < 1 || input.topK > 50) {
    throw new TypeError("CUSTOM_BM25_TOP_K_INVALID");
  }
  const queryTerms = [...new Set(analyze(input.text, manifest.analyzer))].sort();
  const documentAtOrdinal = (ordinal: number) => {
    let low = 0;
    let high = manifest.documents.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const document = manifest.documents[middle]!;
      if (document.ordinal === ordinal) return document;
      if (document.ordinal < ordinal) low = middle + 1;
      else high = middle - 1;
    }
    return undefined;
  };
  if (manifest.documents.some((document, index) => !Number.isSafeInteger(document.ordinal)
    || document.ordinal < 0 || (index > 0 && document.ordinal <= manifest.documents[index - 1]!.ordinal))) {
    throw new TypeError("CUSTOM_BM25_DOCUMENT_ORDINALS_INVALID");
  }
  const scores = new Map<number, number>();
  const allowedTypes = input.documentTypes ? new Set(input.documentTypes) : null;
  const eligible = new Set(manifest.documents.filter((document) =>
    (!input.language || document.language === input.language)
    && (!allowedTypes || allowedTypes.has(document.documentType))
    && document.validFromEpoch <= input.atEpoch
    && (document.validToEpoch === null || input.atEpoch < document.validToEpoch))
    .map((document) => document.ordinal));
  const termHashes = new Map(await Promise.all(queryTerms.map(async (term) => {
    const termHash = await analyzerTermHash(manifest.analyzer, term);
    return [term, termHash] as const;
  })));
  const termPartitions = new Map([...termHashes].map(([term, termHash]) => [term, termHash.slice(0, 1)]));
  const lexiconReads = new Map<string, Promise<Record<string, PostingLocator>>>();
  for (const segment of manifest.segments) {
    for (const partition of new Set(termPartitions.values())) {
      const lexiconRef = segment.lexicons[partition];
      if (!lexiconRef) continue;
      lexiconReads.set(`${segment.id}:${partition}`, readJsonRange(bucket, {
        key: lexiconRef.key,
        offset: 0,
        length: lexiconRef.sizeBytes,
        sha256: lexiconRef.sha256,
      }));
    }
  }
  const located = (await Promise.all(manifest.segments.flatMap((segment) =>
    queryTerms.map(async (term) => {
      const lexicon = await lexiconReads.get(`${segment.id}:${termPartitions.get(term)}`);
      const termHash = termHashes.get(term)!;
      const locator = lexicon?.[termHash];
      return locator ? { segmentId: segment.id, termHash, locator } : null;
    })))).filter((value): value is {
      segmentId: string;
      termHash: string;
      locator: PostingLocator;
    } => value !== null);
  const blocks = await Promise.all(located.map(async (entry) => ({
    ...entry,
    block: await readJsonRange<PostingBlock>(bucket, entry.locator),
  })));
  for (const { segmentId, termHash, locator, block } of blocks) {
    if (
      block.termHash !== termHash
      || block.documentFrequency !== locator.documentFrequency
      || block.blockMaximum !== locator.blockMaximum
    ) throw new TypeError("CUSTOM_BM25_POSTING_LOCATOR_MISMATCH");
    for (const posting of block.postings) {
      if (!eligible.has(posting.ordinal)) continue;
      const document = documentAtOrdinal(posting.ordinal);
      if (!document || document.segmentId !== segmentId) {
        throw new TypeError("CUSTOM_BM25_ORDINAL_SEGMENT_MISMATCH");
      }
      const score = fieldNames.reduce((sum, field) => sum + scoreCustomBm25Term({
        termFrequency: posting.termFrequencies[field],
        documentFrequency: block.documentFrequency,
        documentCount: manifest.statistics.documentCount,
        fieldLength: document.fieldLengths[field],
        averageFieldLength: manifest.statistics.averageFieldLengths[field],
        field,
      }), 0);
      scores.set(posting.ordinal, (scores.get(posting.ordinal) ?? 0) + score);
    }
  }
  return [...scores.entries()].map(([ordinal, score]) => ({
    itemKey: documentAtOrdinal(ordinal)!.itemKey,
    score,
  })).sort((left, right) => right.score - left.score
    || left.itemKey.localeCompare(right.itemKey)).slice(0, input.topK);
}

export function fuseCustomRankedLanes(
  lanes: readonly (readonly string[])[],
  options: { k: 60; topK: number },
): Array<{ itemKey: string; score: number }> {
  if (!Number.isSafeInteger(options.topK) || options.topK < 1) {
    throw new TypeError("CUSTOM_RRF_TOP_K_INVALID");
  }
  const scores = new Map<string, number>();
  for (const lane of lanes) {
    const seen = new Set<string>();
    lane.forEach((itemKey, index) => {
      if (seen.has(itemKey)) return;
      seen.add(itemKey);
      scores.set(itemKey, (scores.get(itemKey) ?? 0) + 1 / (options.k + index + 1));
    });
  }
  return [...scores].map(([itemKey, score]) => ({ itemKey, score }))
    .sort((left, right) => right.score - left.score || left.itemKey.localeCompare(right.itemKey))
    .slice(0, options.topK);
}
