import { z } from "zod";

import type {
  LegalCandidateIndex,
  PinnedCandidateRelease,
  QuestionInterpretation,
} from "./legal-candidate-index";
import type { JuroActRecord, JuroLegalCorpusReadTools } from "./legal-research-loop";
import type { LegalCorpusRetrievalItem } from "./retrieval";

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
  language: "uz-Latn" | "uz-Cyrl" | "ru" | "en";
  documentType: string;
  validFrom: string;
  validTo: string | null;
};

export type SourceSnapshotRetrievalCatalog = {
  resolveCandidate(releaseId: string, canonicalChunkId: string):
    Promise<SourceSnapshotCandidateRecord | null>;
  resolveItemKey?(releaseId: string, itemKey: string):
    Promise<SourceSnapshotCandidateRecord | null>;
};

export type SourceSnapshotRetrievalBucket = {
  get(key: string): Promise<{ size: number; arrayBuffer(): Promise<ArrayBuffer> } | null>;
};

export function createD1SourceSnapshotRetrievalCatalog(db: D1Database): SourceSnapshotRetrievalCatalog {
  const select = `SELECT member.search_release_id AS releaseId,
      chunk.id AS canonicalChunkId,member.snapshot_provision_id AS snapshotProvisionId,
      eligibility.status AS eligibilityStatus,chunk.r2_key AS r2Key,
      chunk.byte_count AS byteCount,chunk.sha256,item.language,
      item.document_type AS documentType,item.valid_from AS validFrom,item.valid_to AS validTo
    FROM legal_source_snapshot_release_members member
    JOIN legal_canonical_chunks chunk ON chunk.id=member.canonical_chunk_id
    JOIN legal_search_release_items item ON item.search_release_id=member.search_release_id
      AND item.canonical_chunk_id=member.canonical_chunk_id
    JOIN legal_retrieval_eligibility eligibility
      ON eligibility.snapshot_provision_id=member.snapshot_provision_id
      AND eligibility.capability='current'
    JOIN legal_source_snapshot_builds build ON build.id=eligibility.build_id
      AND build.release_id=member.search_release_id
      AND build.status='sealed' AND build.phase='complete'
    JOIN legal_source_snapshot_qualifications qualification
      ON qualification.build_id=build.id
      AND qualification.release_id=member.search_release_id`;
  return {
    async resolveCandidate(releaseId, canonicalChunkId) {
      return db.prepare(`${select}
        WHERE member.search_release_id=? AND member.canonical_chunk_id=?`)
        .bind(releaseId, canonicalChunkId).first<SourceSnapshotCandidateRecord>();
    },
    async resolveItemKey(releaseId, itemKey) {
      return db.prepare(`${select}
        WHERE member.search_release_id=? AND chunk.r2_key=?`)
        .bind(releaseId, itemKey).first<SourceSnapshotCandidateRecord>();
    },
  };
}

export type NeutralSourceSnapshotPassage = {
  sourceDocumentId: string;
  canonicalChunkId: string;
  snapshotProvisionId: string;
  documentType: string;
  articleNumber: string;
  articleTitle: string | null;
  sequence: number;
  provisionText: string;
  contentSha256: string;
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
 * module, so neutral source-snapshot retrieval can be validated while the
 * visible staging runtime stays on the legacy Adapter pending qualification.
 */
export function createSourceSnapshotPassageResolver(dependencies: {
  catalog: SourceSnapshotRetrievalCatalog;
  bucket: SourceSnapshotRetrievalBucket;
}) {
  const hydrate = async (
    record: SourceSnapshotCandidateRecord | null,
    releaseId: string,
    canonicalChunkId: string,
  ): Promise<NeutralSourceSnapshotPassage | null> => {
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
    if (await sha256(new TextEncoder().encode(chunk.provisionText)) !== chunk.sourceProvisionSha256) {
      throw new Error("SOURCE_SNAPSHOT_TEXT_INTEGRITY_FAILED");
    }
    return {
      sourceDocumentId: chunk.sourceDocumentId,
      canonicalChunkId,
      snapshotProvisionId: chunk.snapshotProvisionId,
      documentType: chunk.documentType,
      articleNumber: chunk.articleNumber,
      articleTitle: chunk.articleTitle,
      sequence: chunk.sequence,
      provisionText: chunk.provisionText,
      contentSha256: chunk.sourceProvisionSha256,
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
  return Object.assign(
    async (releaseId: string, canonicalChunkId: string): Promise<NeutralSourceSnapshotPassage | null> =>
      hydrate(await dependencies.catalog.resolveCandidate(releaseId, canonicalChunkId), releaseId, canonicalChunkId),
    {
      async itemKey(releaseId: string, itemKey: string, providerMetadata: {
        language: "uz-Latn" | "uz-Cyrl" | "ru" | "en";
        document_type: string;
        valid_from: string;
        valid_to: string | null;
      }): Promise<NeutralSourceSnapshotPassage | null> {
        const record = await dependencies.catalog.resolveItemKey?.(releaseId, itemKey) ?? null;
        if (record && (providerMetadata.language !== record.language
          || providerMetadata.document_type !== record.documentType
          || providerMetadata.valid_from !== record.validFrom
          || providerMetadata.valid_to !== record.validTo)) {
          throw new Error("SOURCE_SNAPSHOT_PROVIDER_METADATA_MISMATCH");
        }
        return hydrate(record, releaseId, record?.canonicalChunkId ?? "");
      },
    },
  );
}

function sourceSnapshotDocumentTitle(passage: NeutralSourceSnapshotPassage): string {
  return `${passage.documentType} · ${passage.citation.publisherDocumentToken}`;
}

function toRetrievalItem(
  passage: NeutralSourceSnapshotPassage,
  candidate: Awaited<ReturnType<LegalCandidateIndex["retrieve"]>>["candidates"][number],
): LegalCorpusRetrievalItem {
  return {
    chunkId: passage.canonicalChunkId,
    provisionId: passage.snapshotProvisionId,
    documentId: passage.sourceDocumentId,
    documentTitle: sourceSnapshotDocumentTitle(passage),
    documentType: passage.documentType,
    documentNumber: passage.citation.publisherDocumentToken,
    adoptingAuthority: null,
    sourceClass: "OFFICIAL_LEGISLATION",
    articleNumber: passage.articleNumber,
    articleTitle: passage.articleTitle,
    exactQuote: passage.provisionText,
    sourceUrl: passage.citation.sourceUrl,
    language: passage.citation.languageTag,
    status: "active",
    validFrom: null,
    validTo: null,
    versionDate: passage.citation.publisherRevisionToken,
    fetchedAt: passage.citation.capturedAt,
    contentHash: passage.contentSha256,
    provider: "lex_uz",
    sparseRank: candidate.keywordRank,
    denseRank: candidate.vectorRank,
    semanticScore: candidate.vectorScore,
    fusionScore: candidate.fusionScore,
    windowHydrated: false,
    candidateExcerptOnly: false,
  };
}

/** Current-only bridge from ranked provider candidates to exact Source Snapshot evidence. */
export function createSourceSnapshotLegalReadTools(dependencies: {
  release: PinnedCandidateRelease;
  candidateIndex: LegalCandidateIndex;
  interpretQuery(input: { query: string }): Promise<QuestionInterpretation>;
  catalog: SourceSnapshotRetrievalCatalog;
  bucket: SourceSnapshotRetrievalBucket;
}): JuroLegalCorpusReadTools {
  if (dependencies.release.capability !== "current") {
    throw new TypeError("SOURCE_SNAPSHOT_CURRENT_RELEASE_REQUIRED");
  }
  const resolve = createSourceSnapshotPassageResolver({
    catalog: dependencies.catalog,
    bucket: dependencies.bucket,
  });
  const passageByChunkId = new Map<string, Promise<NeutralSourceSnapshotPassage | null>>();
  const hydrateChunk = (chunkId: string) => {
    const existing = passageByChunkId.get(chunkId);
    if (existing) return existing;
    const pending = resolve(dependencies.release.id, chunkId);
    passageByChunkId.set(chunkId, pending);
    return pending;
  };
  const findLegalSources: JuroLegalCorpusReadTools["findLegalSources"] = async (input) => {
    if (input.scope?.includeHistorical || input.scope?.asOfDate) return [];
    if (!input.query.normalize("NFKC").replace(/\s+/gu, " ").trim()) return [];
    const interpretation = await dependencies.interpretQuery({ query: input.query });
    const packet = await dependencies.candidateIndex.retrieve(
      interpretation,
      { kind: "current" },
      dependencies.release,
    );
    if (packet.availability !== "available" || packet.releaseId !== dependencies.release.id) {
      throw new TypeError("SOURCE_SNAPSHOT_CANDIDATE_PROVIDER_UNAVAILABLE");
    }
    const candidates = packet.candidates.slice(0, Math.max(1, Math.min(input.limit ?? 8, 20)));
    const hydrated = await Promise.all(candidates.map(async (candidate) => {
      if (!candidate.providerMetadata) {
        throw new TypeError("SOURCE_SNAPSHOT_PROVIDER_METADATA_REQUIRED");
      }
      const passage = await resolve.itemKey(
        dependencies.release.id,
        candidate.itemKey,
        candidate.providerMetadata,
      );
      if (!passage) throw new TypeError("SOURCE_SNAPSHOT_CANDIDATE_NOT_IN_RELEASE");
      passageByChunkId.set(passage.canonicalChunkId, Promise.resolve(passage));
      return toRetrievalItem(passage, candidate);
    }));
    return hydrated;
  };
  const inspect = async (anchorChunkId: string): Promise<JuroActRecord | null> => {
    const passage = await hydrateChunk(anchorChunkId);
    if (!passage) return null;
    return {
      documentId: passage.sourceDocumentId,
      title: sourceSnapshotDocumentTitle(passage),
      documentType: passage.documentType,
      documentNumber: passage.citation.publisherDocumentToken,
      adoptingAuthority: null,
      adoptionDate: null,
      publicationDate: null,
      language: passage.citation.languageTag,
      status: "active",
      validFrom: null,
      validTo: null,
      versionDate: passage.citation.publisherRevisionToken,
      sourceUrl: passage.citation.sourceUrl,
      fetchedAt: passage.citation.capturedAt,
    };
  };
  const spans = async (anchorChunkId: string) => {
    const passage = await hydrateChunk(anchorChunkId);
    if (!passage) return [];
    return [{
      id: passage.canonicalChunkId,
      article: [passage.articleNumber, passage.articleTitle].filter(Boolean).join(". "),
      paragraph: null,
      text: passage.provisionText,
      textSha256: passage.contentSha256,
      quality: "high" as const,
      provisionSequence: passage.sequence,
    }];
  };
  return {
    supportsHybrid: true,
    findLegalSources,
    findLegalSourcesBatch: async ({ queries, ...input }) => Promise.all(
      queries.map((query) => findLegalSources({ ...input, query })),
    ),
    inspectLegalAct: ({ anchorChunkId }) => inspect(anchorChunkId),
    readLegalProvisions: async ({ anchorChunkId, before, after }) => {
      if ((before ?? 0) !== 0 || (after ?? 0) !== 0) {
        throw new TypeError("SOURCE_SNAPSHOT_PROVISION_WINDOW_UNSUPPORTED");
      }
      return spans(anchorChunkId);
    },
    hydrateLegalSources: async ({ anchorChunkIds, before, after, includeReferences }) => {
      if ((before ?? 0) !== 0 || (after ?? 0) !== 0 || includeReferences === true) {
        throw new TypeError("SOURCE_SNAPSHOT_PROVISION_WINDOW_UNSUPPORTED");
      }
      return Promise.all(
      [...new Set(anchorChunkIds)].map(async (anchorChunkId) => ({
        anchorChunkId,
        act: await inspect(anchorChunkId),
        spans: await spans(anchorChunkId),
      })),
      );
    },
  };
}
