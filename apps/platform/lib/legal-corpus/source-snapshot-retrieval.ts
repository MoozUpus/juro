import { z } from "zod";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const neutralChunkSchema = z.object({
  schemaVersion: z.literal(1),
  sourceDocumentId: z.string(),
  sourceSnapshotId: z.string(),
  snapshotProvisionId: z.string(),
  canonicalChunkId: z.string(),
  publisher: z.literal("lex.uz"),
  publisherDocumentToken: z.string(),
  publisherRevisionToken: z.string(),
  languageTag: z.enum(["uz-Latn", "uz-Cyrl", "ru", "en"]),
  sourceUrl: z.string().url(),
  capturedAt: z.string(),
  documentType: z.string(),
  articleNumber: z.string(),
  articleTitle: z.string().nullable(),
  sequence: z.number().int().nonnegative(),
  provisionText: z.string().min(1),
  sourceProvisionSha256: sha256Schema,
  sourceNormalizedSha256: sha256Schema,
}).strict();

export type SourceSnapshotCandidateRecord = {
  releaseId: string;
  canonicalChunkId: string;
  snapshotProvisionId: string;
  eligibilityStatus: "eligible" | "ineligible" | "gap";
  r2Key: string;
  byteCount: number;
  sha256: string;
};

export type SourceSnapshotRetrievalCatalog = {
  resolveCandidate(releaseId: string, canonicalChunkId: string):
    Promise<SourceSnapshotCandidateRecord | null>;
};

export type SourceSnapshotRetrievalBucket = {
  get(key: string): Promise<{ size: number; arrayBuffer(): Promise<ArrayBuffer> } | null>;
};

export function createD1SourceSnapshotRetrievalCatalog(db: D1Database): SourceSnapshotRetrievalCatalog {
  return {
    async resolveCandidate(releaseId, canonicalChunkId) {
      return db.prepare(`SELECT member.search_release_id AS releaseId,
          chunk.id AS canonicalChunkId,member.snapshot_provision_id AS snapshotProvisionId,
          eligibility.status AS eligibilityStatus,chunk.r2_key AS r2Key,
          chunk.byte_count AS byteCount,chunk.sha256
        FROM legal_source_snapshot_release_members member
        JOIN legal_canonical_chunks chunk ON chunk.id=member.canonical_chunk_id
        JOIN legal_retrieval_eligibility eligibility
          ON eligibility.snapshot_provision_id=member.snapshot_provision_id
          AND eligibility.capability='current'
        JOIN legal_source_snapshot_builds build ON build.id=eligibility.build_id
          AND build.release_id=member.search_release_id
        WHERE member.search_release_id=? AND member.canonical_chunk_id=?`)
        .bind(releaseId, canonicalChunkId).first<SourceSnapshotCandidateRecord>();
    },
  };
}

export type NeutralSourceSnapshotPassage = {
  canonicalChunkId: string;
  snapshotProvisionId: string;
  documentType: string;
  articleNumber: string;
  articleTitle: string | null;
  provisionText: string;
  citation: {
    publisher: "lex.uz";
    sourceUrl: string;
    languageTag: "uz-Latn" | "uz-Cyrl" | "ru" | "en";
    publisherDocumentToken: string;
    publisherRevisionToken: string;
    capturedAt: string;
  };
};

async function sha256(bytes: Uint8Array): Promise<string> {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", owned.buffer);
  return [...new Uint8Array(digest)]
    .map((part) => part.toString(16).padStart(2, "0")).join("");
}

/**
 * Future target-runtime hydration seam. Activation remains outside this
 * module, so Ticket 12 can validate neutral source-snapshot retrieval while
 * the visible staging runtime stays on the legacy Adapter until Ticket 13.
 */
export function createSourceSnapshotPassageResolver(dependencies: {
  catalog: SourceSnapshotRetrievalCatalog;
  bucket: SourceSnapshotRetrievalBucket;
}) {
  return async (releaseId: string, canonicalChunkId: string): Promise<NeutralSourceSnapshotPassage | null> => {
    const record = await dependencies.catalog.resolveCandidate(releaseId, canonicalChunkId);
    if (!record) return null;
    if (record.releaseId !== releaseId || record.canonicalChunkId !== canonicalChunkId
      || record.eligibilityStatus !== "eligible" || record.byteCount < 1
      || !sha256Schema.safeParse(record.sha256).success) {
      throw new Error("SOURCE_SNAPSHOT_CANDIDATE_INELIGIBLE");
    }
    const object = await dependencies.bucket.get(record.r2Key);
    if (!object || object.size !== record.byteCount) throw new Error("SOURCE_SNAPSHOT_OBJECT_UNAVAILABLE");
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (await sha256(bytes) !== record.sha256) throw new Error("SOURCE_SNAPSHOT_OBJECT_INTEGRITY_FAILED");
    const chunk = neutralChunkSchema.parse(JSON.parse(new TextDecoder().decode(bytes)) as unknown);
    if (chunk.canonicalChunkId !== canonicalChunkId
      || chunk.snapshotProvisionId !== record.snapshotProvisionId) {
      throw new Error("SOURCE_SNAPSHOT_OBJECT_IDENTITY_MISMATCH");
    }
    return {
      canonicalChunkId,
      snapshotProvisionId: chunk.snapshotProvisionId,
      documentType: chunk.documentType,
      articleNumber: chunk.articleNumber,
      articleTitle: chunk.articleTitle,
      provisionText: chunk.provisionText,
      citation: {
        publisher: chunk.publisher,
        sourceUrl: chunk.sourceUrl,
        languageTag: chunk.languageTag,
        publisherDocumentToken: chunk.publisherDocumentToken,
        publisherRevisionToken: chunk.publisherRevisionToken,
        capturedAt: chunk.capturedAt,
      },
    };
  };
}
