import { z } from "zod";
import { customCurrentSha256, serializeCustomCurrentArtifact } from "./custom-current-build";
import { customRuntimeLegalIdentitySchema } from "./custom-bm25-runtime";
import { productionCurrentMetadataPageSchema } from "./accepted-current-inputs";

const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const referenceSchema = z.object({key: z.string().min(1).max(1_024), sha256: digest,
  sizeBytes: z.number().int().positive()}).strict();
const memberSchema = z.object({itemKey: z.string().regex(/^retrieval-chunk-v1:[a-f0-9]{64}$/u),
  ordinal: z.number().int().nonnegative(), legalIdentitySha256: digest.optional(),
  legalIdentity: customRuntimeLegalIdentitySchema}).strict();
const lookupQuerySchema = z.object({textRevisionId: z.string().min(1).max(200),
  languageTag: z.enum(["uz-Latn", "uz-Cyrl", "ru", "en"]),
  article: z.string().regex(/^\d+(?:[.-]\d+)?$/u).max(40)}).strict();
const entrySchema = lookupQuerySchema.extend({itemKeys: z.array(memberSchema.shape.itemKey).min(1).max(4_096)});
const pageReferenceSchema = referenceSchema.extend({partition: z.string().regex(/^[a-f0-9]{2}$/u),
  count: z.number().int().positive()});
const rootSchema = z.object({schemaVersion: z.literal(1), releaseId: z.string().min(1).max(200),
  sourceInventorySha256: digest, memberCount: z.number().int().positive(),
  articleMetadataSha256: digest.optional(),
  indexedMemberCount: z.number().int().nonnegative(),
  partitions: z.array(pageReferenceSchema).max(256)}).strict();
const ROOT_LIMIT = 256 * 1_024;
const PAGE_LIMIT = 1_024 * 1_024;
type Reference = z.infer<typeof referenceSchema>;
type Bucket = Pick<R2Bucket, "get">;
export type LegalReferenceQuery = z.infer<typeof lookupQuerySchema>;

export function legalReferenceKey(query: LegalReferenceQuery): string {
  const parsed = lookupQuerySchema.parse({textRevisionId: query.textRevisionId,
    languageTag: query.languageTag, article: query.article});
  return JSON.stringify([parsed.textRevisionId, parsed.languageTag, parsed.article]);
}

async function readVerified(bucket: Bucket, reference: Reference, limit: number): Promise<unknown> {
  referenceSchema.parse({key: reference.key, sha256: reference.sha256, sizeBytes: reference.sizeBytes});
  if (reference.sizeBytes > limit) throw new TypeError("CUSTOM_REFERENCE_LOOKUP_SIZE_INVALID");
  const object = await bucket.get(reference.key);
  if (!object || object.size !== reference.sizeBytes) throw new TypeError("CUSTOM_REFERENCE_LOOKUP_MISSING");
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (bytes.byteLength !== reference.sizeBytes || await customCurrentSha256(bytes) !== reference.sha256) {
    throw new TypeError("CUSTOM_REFERENCE_LOOKUP_CORRUPT");
  }
  return JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(bytes)) as unknown;
}

async function readArticleMetadata(input: {bucket: Bucket; reference: Reference}) {
  const manifest = z.object({schemaVersion: z.literal(1), kind: z.literal("production-current-body-free-metadata-manifest"),
    sourceRootSha256: digest, acceptedInputManifestSha256: digest,
    sourcePlan: z.object({manifestSha256: digest}).passthrough(), itemCount: z.number().int().positive(),
    pageCount: z.number().int().positive(), pages: z.array(referenceSchema.extend({
      start: z.number().int().nonnegative(), count: z.number().int().positive()}).passthrough()).max(4_096),
  }).passthrough().parse(await readVerified(input.bucket, input.reference, ROOT_LIMIT));
  const result = new Map<string, {language: string; article: string}>();
  let nextOrdinal = 0;
  if (manifest.pageCount !== manifest.pages.length) throw new TypeError("CUSTOM_REFERENCE_METADATA_COUNT_INVALID");
  for (const reference of manifest.pages) {
    const page = productionCurrentMetadataPageSchema.parse(await readVerified(input.bucket, reference, 2 * PAGE_LIMIT));
    if (reference.start !== nextOrdinal || page.start !== reference.start || page.items.length !== reference.count
      || page.sourceRootSha256 !== manifest.sourceRootSha256
      || page.acceptedInputManifestSha256 !== manifest.acceptedInputManifestSha256
      || page.sourcePlanManifestSha256 !== manifest.sourcePlan.manifestSha256) {
      throw new TypeError("CUSTOM_REFERENCE_METADATA_IDENTITY_INVALID");
    }
    for (const item of page.items) {
      if (item.sourceOrdinal !== nextOrdinal++ || result.has(item.provisionRenditionId)) {
        throw new TypeError("CUSTOM_REFERENCE_METADATA_IDENTITY_INVALID");
      }
      result.set(item.provisionRenditionId, {language: item.language, article: item.articleNumber});
    }
  }
  if (nextOrdinal !== manifest.itemCount) throw new TypeError("CUSTOM_REFERENCE_METADATA_COUNT_INVALID");
  return result;
}

/** Index accepted citation identities, not question/answer examples. The
 * projection supplies discovery keys only; membership and evidence validation
 * remain independent. Non-article records remain in the original inventory. */
export async function buildCustomReferenceLookup(input: {
  bucket: Bucket; releaseId: string; sourceInventorySha256: string;
  articleMetadata?: {bucket: Bucket; reference: Reference};
  write: (reference: Reference, bytes: Uint8Array) => Promise<void>;
  onProgress?: (progress: {partitions: number; members: number; indexedMembers: number}) => void;
}): Promise<{reference: Reference; memberCount: number; indexedMemberCount: number}> {
  const sourceSha = digest.parse(input.sourceInventorySha256);
  const key = `search-releases/${input.releaseId}/runtime/mappings-${sourceSha}.json`;
  const object = await input.bucket.get(key);
  if (!object || object.size > ROOT_LIMIT) throw new TypeError("CUSTOM_REFERENCE_LOOKUP_SOURCE_MISSING");
  const source = z.object({schemaVersion: z.literal(1), releaseId: z.literal(input.releaseId),
    partitions: z.array(pageReferenceSchema).max(64)}).strict().parse(await readVerified(input.bucket,
    {key, sha256: sourceSha, sizeBytes: object.size}, ROOT_LIMIT));
  const sourcePartitions = new Set(source.partitions.map(page => page.partition));
  if (sourcePartitions.size !== source.partitions.length
    || [...sourcePartitions].some(partition => !/^[0-3][a-f0-9]$/u.test(partition))) {
    throw new TypeError("CUSTOM_REFERENCE_LOOKUP_SOURCE_PARTITIONS_INVALID");
  }
  const entries = new Map<string, z.infer<typeof entrySchema>>();
  const metadata = input.articleMetadata ? await readArticleMetadata(input.articleMetadata) : null;
  const keys = new Set<string>();
  const ordinals = new Set<number>();
  let indexedMemberCount = 0;
  let completed = 0;
  for (const page of source.partitions) {
    const members = z.object({schemaVersion: z.literal(1), releaseId: z.literal(input.releaseId),
      partition: z.literal(page.partition), items: z.array(memberSchema).length(page.count)}).strict()
      .parse(await readVerified(input.bucket, page, 16 * 1_024 * 1_024));
    for (const member of members.items) {
      const partition = Math.floor(Number.parseInt(member.itemKey.slice("retrieval-chunk-v1:".length,
        "retrieval-chunk-v1:".length + 2), 16) / 4).toString(16).padStart(2, "0");
      if (partition !== page.partition || keys.has(member.itemKey) || ordinals.has(member.ordinal)
        || (member.legalIdentitySha256 && member.legalIdentitySha256 !== member.legalIdentity.legalIdentitySha256)) {
        throw new TypeError("CUSTOM_REFERENCE_LOOKUP_SOURCE_IDENTITY_INVALID");
      }
      keys.add(member.itemKey);
      ordinals.add(member.ordinal);
      // Some inventories deliberately use a generic citation label. Their
      // article identifiers come from accepted body-free build metadata,
      // joined by the exact evidence rendition and checked language.
      const record = metadata?.get(member.legalIdentity.evidenceProvisionRenditionId);
      if (metadata && (!record || record.language !== member.legalIdentity.languageTag)) {
        throw new TypeError("CUSTOM_REFERENCE_METADATA_MEMBER_MISMATCH");
      }
      const article = record?.article ?? /(?:Article|Статья|Ст\.)\s+(\d+(?:[.-]\d+)?)\s*$/iu.exec(member.legalIdentity.citation.label)?.[1];
      if (!article || !lookupQuerySchema.shape.article.safeParse(article).success) continue;
      const query = lookupQuerySchema.parse({textRevisionId: member.legalIdentity.textRevisionId,
        languageTag: member.legalIdentity.languageTag, article});
      const identity = legalReferenceKey(query);
      const entry = entries.get(identity) ?? {...query, itemKeys: []};
      entry.itemKeys.push(member.itemKey);
      entries.set(identity, entry);
      indexedMemberCount++;
    }
    input.onProgress?.({partitions: ++completed, members: keys.size, indexedMembers: indexedMemberCount});
  }
  const partitions = new Map<string, Array<z.infer<typeof entrySchema>>>();
  for (const [key, entry] of entries) {
    entry.itemKeys.sort();
    entrySchema.parse(entry);
    const partition = (await customCurrentSha256(key)).slice(0, 2);
    const group = partitions.get(partition) ?? [];
    group.push(entry);
    partitions.set(partition, group);
  }
  const write = async (kind: string, value: unknown, limit: number): Promise<Reference> => {
    const bytes = serializeCustomCurrentArtifact(value);
    if (bytes.byteLength > limit) throw new TypeError("CUSTOM_REFERENCE_LOOKUP_SIZE_INVALID");
    const sha256 = await customCurrentSha256(bytes);
    const reference = {key: `search-releases/${input.releaseId}/runtime/reference-lookup/${kind}-${sha256}.json`,
      sha256, sizeBytes: bytes.byteLength};
    await input.write(reference, bytes);
    return reference;
  };
  const pages = [];
  for (const [partition, group] of [...partitions].sort(([left], [right]) => left.localeCompare(right))) {
    group.sort((left, right) => legalReferenceKey(left).localeCompare(legalReferenceKey(right)));
    pages.push({...await write(`page-${partition}`, {schemaVersion: 1, releaseId: input.releaseId,
      partition, entries: group}, PAGE_LIMIT), partition, count: group.length});
  }
  const root = rootSchema.parse({schemaVersion: 1, releaseId: input.releaseId, sourceInventorySha256: sourceSha,
    ...(input.articleMetadata ? {articleMetadataSha256: input.articleMetadata.reference.sha256} : {}),
    memberCount: keys.size, indexedMemberCount, partitions: pages});
  if (!indexedMemberCount) throw new TypeError("CUSTOM_REFERENCE_ARTICLE_METADATA_REQUIRED");
  return {reference: await write("manifest", root, ROOT_LIMIT), memberCount: keys.size, indexedMemberCount};
}

export async function resolveCustomReferenceKeys(input: {
  bucket: Bucket; releaseId: string; sourceInventorySha256: string; memberCount: number;
  reference: Reference; queries: readonly LegalReferenceQuery[];
}): Promise<Map<string, string[]>> {
  const queries = z.array(lookupQuerySchema).max(3).parse(input.queries);
  if (!queries.length) return new Map();
  const root = rootSchema.parse(await readVerified(input.bucket, input.reference, ROOT_LIMIT));
  if (root.releaseId !== input.releaseId || root.sourceInventorySha256 !== input.sourceInventorySha256
    || root.memberCount !== input.memberCount || root.indexedMemberCount > root.memberCount
    || new Set(root.partitions.map(page => page.partition)).size !== root.partitions.length) {
    throw new TypeError("CUSTOM_REFERENCE_LOOKUP_BINDING_INVALID");
  }
  const queryPartitions = await Promise.all(queries.map(async query => ({query,
    key: legalReferenceKey(query), partition: (await customCurrentSha256(legalReferenceKey(query))).slice(0, 2)})));
  const result = new Map<string, string[]>();
  // At most three bounded pages, independent of corpus or article size.
  await Promise.all([...new Set(queryPartitions.map(query => query.partition))].map(async partition => {
    const reference = root.partitions.find(page => page.partition === partition);
    if (!reference) return;
    const page = z.object({schemaVersion: z.literal(1), releaseId: z.literal(input.releaseId),
      partition: z.literal(partition), entries: z.array(entrySchema).length(reference.count)}).strict()
      .parse(await readVerified(input.bucket, reference, PAGE_LIMIT));
    const entries = new Map(page.entries.map(entry => [legalReferenceKey(entry), entry.itemKeys]));
    if (entries.size !== page.entries.length) throw new TypeError("CUSTOM_REFERENCE_LOOKUP_DUPLICATE_ENTRY");
    for (const query of queryPartitions.filter(query => query.partition === partition)) {
      const keys = entries.get(query.key);
      if (keys && new Set(keys).size !== keys.length) throw new TypeError("CUSTOM_REFERENCE_LOOKUP_DUPLICATE_MEMBER");
      if (keys) result.set(query.key, keys);
    }
  }));
  return result;
}
