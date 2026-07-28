import { z } from "zod";
import {
  requirePlatformStaffAccess,
  type PlatformStaffAccess,
} from "../auth/staff-access";
import type { LocalSession } from "../auth/session-management";
import {
  LegalSourceReviewError,
  loadApprovedLegalSourceReview,
  type ApprovedLegalSourceReview,
  type LegalSourceReviewEnv,
} from "./source-review";

export const LEGAL_SOURCE_PUBLICATION_ERROR_CODES = [
  "LEGAL_SOURCE_PUBLICATION_NOT_FOUND",
  "LEGAL_SOURCE_PUBLICATION_STATE_CONFLICT",
  "LEGAL_SOURCE_PUBLICATION_EVIDENCE_CONFLICT",
  "LEGAL_SOURCE_PUBLICATION_SOURCE_UNAVAILABLE",
  "LEGAL_SOURCE_PUBLICATION_CONTENT_TOO_LARGE",
  "LEGAL_SOURCE_PUBLICATION_PERSISTENCE_FAILED",
] as const;

export type LegalSourcePublicationErrorCode =
  (typeof LEGAL_SOURCE_PUBLICATION_ERROR_CODES)[number];

export class LegalSourcePublicationError extends Error {
  constructor(readonly code: LegalSourcePublicationErrorCode) {
    super(code);
    this.name = "LegalSourcePublicationError";
  }
}

type PublicationSession = Pick<
  LocalSession,
  "sessionId" | "userId" | "assuranceLevel" | "mfaVerifiedAt"
>;

type PublicationRow = {
  id: string;
  review_id: string;
  source_id: string;
  version_id: string;
  review_evidence_sha256: string;
  raw_content_sha256: string;
  parsed_content_sha256: string;
  published_by_user_id: string;
  publication_evidence_json: string;
  publication_evidence_sha256: string;
  published_at: string;
};

type PublicationStateRow = {
  source_status: string;
  source_verification_state: string;
  source_content_sha256: string | null;
  source_verified_at: string | null;
  source_verified_by_user_id: string | null;
  source_verification_notes: string | null;
  version_status: string;
  version_content_sha256: string;
  version_verified_at: string | null;
  version_verified_by_user_id: string | null;
};

type PublishedReadingRow = {
  section_id: string;
  canonical_ref: string | null;
  heading: string | null;
  body_text: string;
  sequence: number;
  section_sha256: string;
  chunk_id: string;
  chunk_index: number;
  language: string;
  content_text: string;
  chunk_sha256: string;
  metadata_json: string;
  vector_id: string | null;
  indexed_at: string | null;
};

type ReadingRow = {
  sectionId: string;
  chunkId: string;
  canonicalRef: string;
  heading: string | null;
  bodyText: string;
  sequence: number;
  contentSha256: string;
  metadataJson: string;
};

const identifierSchema = z.string().min(1).max(180)
  .regex(/^[A-Za-z0-9:_-]+$/);
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const publicationInputSchema = z.object({
  reviewId: identifierSchema,
  expectedDecisionEvidenceSha256: sha256Schema,
}).strict();
const publicationEvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  publicationId: identifierSchema,
  reviewId: identifierSchema,
  sourceId: identifierSchema,
  versionId: identifierSchema,
  sourceKind: z.enum(["lex", "advice"]),
  locale: z.enum(["ru", "uz"]),
  canonicalId: z.string().min(1).max(256),
  canonicalUrl: z.string().url().max(2_048),
  reviewEvidenceSha256: sha256Schema,
  rawContentSha256: sha256Schema,
  parsedContentSha256: sha256Schema,
  parserProfile: z.string().min(1).max(128),
  publishedByUserId: identifierSchema,
  publisherSessionId: identifierSchema,
  publisherAssignmentIds: z.array(identifierSchema).min(1).max(16),
  mfaVerifiedAt: z.string().datetime(),
  sectionCount: z.number().int().positive().max(300),
  chunkCount: z.number().int().positive().max(300),
  publishedAt: z.string().datetime(),
}).strict();

const FRESH_MFA_WINDOW_MS = 15 * 60 * 1_000;
const MAX_SECTION_TEXT = 8_000;
const MAX_READING_ROWS = 300;

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function publisherAccess(
  db: D1Database,
  session: PublicationSession,
  now: Date,
): Promise<PlatformStaffAccess> {
  return requirePlatformStaffAccess(
    db,
    session,
    "legal.sources.publish",
    { now, freshMfaWithinMs: FRESH_MFA_WINDOW_MS },
  );
}

function mapReviewError(error: unknown): never {
  if (error instanceof LegalSourceReviewError) {
    if (error.code === "LEGAL_SOURCE_REVIEW_NOT_FOUND") {
      throw new LegalSourcePublicationError(
        "LEGAL_SOURCE_PUBLICATION_NOT_FOUND",
      );
    }
    if (error.code === "LEGAL_SOURCE_REVIEW_SOURCE_UNAVAILABLE") {
      throw new LegalSourcePublicationError(
        "LEGAL_SOURCE_PUBLICATION_SOURCE_UNAVAILABLE",
      );
    }
    if (error.code === "LEGAL_SOURCE_REVIEW_EVIDENCE_CONFLICT") {
      throw new LegalSourcePublicationError(
        "LEGAL_SOURCE_PUBLICATION_EVIDENCE_CONFLICT",
      );
    }
    throw new LegalSourcePublicationError(
      "LEGAL_SOURCE_PUBLICATION_STATE_CONFLICT",
    );
  }
  throw error;
}

async function loadApproved(
  env: LegalSourceReviewEnv,
  reviewId: string,
): Promise<ApprovedLegalSourceReview> {
  try {
    return await loadApprovedLegalSourceReview(env, reviewId);
  } catch (error) {
    return mapReviewError(error);
  }
}

function segmentBlocks(
  review: ApprovedLegalSourceReview,
): Array<{
  blockStart: number;
  blockEnd: number;
  heading: string | null;
  text: string;
  canonicalRef?: string;
}> {
  const segments: Array<{
    blockStart: number;
    blockEnd: number;
    heading: string | null;
    text: string;
    canonicalRef?: string;
  }> = [];
  let current: {
    blockStart: number;
    blockEnd: number;
    heading: string | null;
    parts: string[];
    textLength: number;
  } | null = null;
  const flush = () => {
    if (!current) return;
    segments.push({
      blockStart: current.blockStart,
      blockEnd: current.blockEnd,
      heading: current.heading,
      text: current.parts.join("\n\n"),
    });
    current = null;
  };
  for (const block of review.source.snapshot.blocks) {
    if (block.text.length > MAX_SECTION_TEXT) {
      flush();
      for (let start = 0; start < block.text.length; start += MAX_SECTION_TEXT) {
        const end = Math.min(start + MAX_SECTION_TEXT, block.text.length);
        segments.push({
          blockStart: block.index,
          blockEnd: block.index,
          heading: block.kind === "heading" && start === 0
            ? block.text.slice(0, 2_000)
            : null,
          text: block.text.slice(start, end),
          canonicalRef: `blocks:${block.index}-${block.index}:chars:${start}-${end}`,
        });
      }
      continue;
    }
    if (block.kind === "heading" && current) flush();
    if (!current) {
      current = {
        blockStart: block.index,
        blockEnd: block.index,
        heading: block.kind === "heading" ? block.text.slice(0, 2_000) : null,
        parts: [block.text],
        textLength: block.text.length,
      };
      continue;
    }
    const nextLength = current.textLength + 2 + block.text.length;
    if (nextLength > MAX_SECTION_TEXT) {
      flush();
      current = {
        blockStart: block.index,
        blockEnd: block.index,
        heading: block.kind === "heading" ? block.text.slice(0, 2_000) : null,
        parts: [block.text],
        textLength: block.text.length,
      };
    } else {
      current.parts.push(block.text);
      current.blockEnd = block.index;
      current.textLength = nextLength;
    }
  }
  flush();
  if (segments.length === 0 || segments.length > MAX_READING_ROWS) {
    throw new LegalSourcePublicationError(
      "LEGAL_SOURCE_PUBLICATION_CONTENT_TOO_LARGE",
    );
  }
  return segments;
}

async function buildReadingRows(
  review: ApprovedLegalSourceReview,
): Promise<ReadingRow[]> {
  return Promise.all(segmentBlocks(review).map(async (segment, sequence) => {
    const contentSha256 = await sha256Text(segment.text);
    const canonicalRef = segment.canonicalRef
      ?? `blocks:${segment.blockStart}-${segment.blockEnd}`;
    const identity = [
      review.versionId,
      canonicalRef,
      contentSha256,
    ].join("\n");
    const stableHash = await sha256Text(identity);
    const metadataJson = JSON.stringify({
      schemaVersion: 1,
      sourceKind: review.source.sourceKind,
      locale: review.source.locale,
      canonicalId: review.source.canonicalId,
      canonicalUrl: review.source.canonicalUrl,
      parserProfile: review.source.snapshot.parser.profile,
      primarySelector: review.source.snapshot.primarySelector,
      blockStart: segment.blockStart,
      blockEnd: segment.blockEnd,
    });
    return {
      sectionId: `lssection_${stableHash.slice(0, 32)}`,
      chunkId: `lschunk_${stableHash.slice(0, 32)}`,
      canonicalRef,
      heading: segment.heading,
      bodyText: segment.text,
      sequence,
      contentSha256,
      metadataJson,
    };
  }));
}

async function loadPublication(
  db: D1Database,
  reviewId: string,
): Promise<PublicationRow | null> {
  return db.prepare(`
    SELECT id,review_id,source_id,version_id,review_evidence_sha256,
      raw_content_sha256,parsed_content_sha256,published_by_user_id,
      publication_evidence_json,publication_evidence_sha256,published_at
    FROM legal_source_publications
    WHERE review_id = ?
    LIMIT 1
  `).bind(reviewId).first<PublicationRow>();
}

async function loadPublicationState(
  db: D1Database,
  review: ApprovedLegalSourceReview,
): Promise<PublicationStateRow | null> {
  return db.prepare(`
    SELECT source.status AS source_status,
      source.verification_state AS source_verification_state,
      source.content_sha256 AS source_content_sha256,
      source.verified_at AS source_verified_at,
      source.verified_by_user_id AS source_verified_by_user_id,
      source.verification_notes AS source_verification_notes,
      version.status AS version_status,
      version.content_sha256 AS version_content_sha256,
      version.verified_at AS version_verified_at,
      version.verified_by_user_id AS version_verified_by_user_id
    FROM legal_sources source
    INNER JOIN legal_source_versions version ON version.source_id = source.id
    WHERE source.id = ? AND version.id = ?
    LIMIT 1
  `).bind(review.sourceId, review.versionId).first<PublicationStateRow>();
}

async function loadReadingRows(
  db: D1Database,
  versionId: string,
): Promise<PublishedReadingRow[]> {
  const result = await db.prepare(`
    SELECT section.id AS section_id,section.canonical_ref,section.heading,
      section.body_text,section.sequence,
      section.content_sha256 AS section_sha256,
      chunk.id AS chunk_id,chunk.chunk_index,chunk.language,
      chunk.content_text,chunk.content_sha256 AS chunk_sha256,
      chunk.metadata_json,chunk.vector_id,chunk.indexed_at
    FROM legal_source_sections section
    INNER JOIN legal_source_chunks chunk
      ON chunk.section_id = section.id AND chunk.version_id = section.version_id
    WHERE section.version_id = ?
    ORDER BY section.sequence,chunk.chunk_index
  `).bind(versionId).all<PublishedReadingRow>();
  return result.results;
}

export type LegalSourcePublicationResult = {
  publicationId: string;
  reviewId: string;
  sourceId: string;
  versionId: string;
  publishedByUserId: string;
  publicationEvidenceSha256: string;
  publishedAt: string;
  sectionCount: number;
  chunkCount: number;
  changed: boolean;
};

async function validatePublicationReplay(
  env: LegalSourceReviewEnv,
  review: ApprovedLegalSourceReview,
  expectedRows: ReadingRow[],
  publication: PublicationRow,
): Promise<LegalSourcePublicationResult> {
  let evidence: z.infer<typeof publicationEvidenceSchema>;
  try {
    evidence = publicationEvidenceSchema.parse(
      JSON.parse(publication.publication_evidence_json),
    );
  } catch {
    throw new LegalSourcePublicationError(
      "LEGAL_SOURCE_PUBLICATION_EVIDENCE_CONFLICT",
    );
  }
  if (
    await sha256Text(publication.publication_evidence_json)
      !== publication.publication_evidence_sha256
    || publication.review_id !== review.reviewId
    || publication.source_id !== review.sourceId
    || publication.version_id !== review.versionId
    || publication.review_evidence_sha256
      !== review.decisionEvidenceSha256
    || publication.raw_content_sha256 !== review.source.rawContentSha256
    || publication.parsed_content_sha256
      !== review.source.parsedContentSha256
    || evidence.publicationId !== publication.id
    || evidence.reviewId !== review.reviewId
    || evidence.sourceId !== review.sourceId
    || evidence.versionId !== review.versionId
    || evidence.reviewEvidenceSha256 !== review.decisionEvidenceSha256
    || evidence.rawContentSha256 !== review.source.rawContentSha256
    || evidence.parsedContentSha256 !== review.source.parsedContentSha256
    || evidence.publishedByUserId !== publication.published_by_user_id
    || evidence.publishedAt !== publication.published_at
    || evidence.sectionCount !== expectedRows.length
    || evidence.chunkCount !== expectedRows.length
  ) {
    throw new LegalSourcePublicationError(
      "LEGAL_SOURCE_PUBLICATION_EVIDENCE_CONFLICT",
    );
  }
  const state = await loadPublicationState(env.DB, review);
  if (
    !state
    || state.source_status !== "verified"
    || state.source_verification_state !== "verified"
    || state.source_content_sha256 !== review.source.rawContentSha256
    || state.source_verified_at !== publication.published_at
    || state.source_verified_by_user_id !== publication.published_by_user_id
    || state.source_verification_notes !== `publication:${publication.id}`
    || state.version_status !== "verified"
    || state.version_content_sha256 !== review.source.rawContentSha256
    || state.version_verified_at !== publication.published_at
    || state.version_verified_by_user_id !== publication.published_by_user_id
  ) {
    throw new LegalSourcePublicationError(
      "LEGAL_SOURCE_PUBLICATION_EVIDENCE_CONFLICT",
    );
  }
  const storedRows = await loadReadingRows(env.DB, review.versionId);
  if (storedRows.length !== expectedRows.length) {
    throw new LegalSourcePublicationError(
      "LEGAL_SOURCE_PUBLICATION_EVIDENCE_CONFLICT",
    );
  }
  for (let index = 0; index < expectedRows.length; index += 1) {
    const expected = expectedRows[index];
    const stored = storedRows[index];
    if (
      !expected
      || !stored
      || stored.section_id !== expected.sectionId
      || stored.chunk_id !== expected.chunkId
      || stored.canonical_ref !== expected.canonicalRef
      || stored.heading !== expected.heading
      || stored.body_text !== expected.bodyText
      || stored.content_text !== expected.bodyText
      || stored.sequence !== expected.sequence
      || stored.chunk_index !== expected.sequence
      || stored.language !== review.source.locale
      || stored.section_sha256 !== expected.contentSha256
      || stored.chunk_sha256 !== expected.contentSha256
      || stored.metadata_json !== expected.metadataJson
      || stored.vector_id !== null
      || stored.indexed_at !== null
    ) {
      throw new LegalSourcePublicationError(
        "LEGAL_SOURCE_PUBLICATION_EVIDENCE_CONFLICT",
      );
    }
  }
  return {
    publicationId: publication.id,
    reviewId: review.reviewId,
    sourceId: review.sourceId,
    versionId: review.versionId,
    publishedByUserId: publication.published_by_user_id,
    publicationEvidenceSha256: publication.publication_evidence_sha256,
    publishedAt: publication.published_at,
    sectionCount: expectedRows.length,
    chunkCount: expectedRows.length,
    changed: false,
  };
}

export async function publishApprovedLegalSource(
  env: LegalSourceReviewEnv,
  session: PublicationSession,
  inputValue: unknown,
  options: { now?: Date } = {},
): Promise<LegalSourcePublicationResult> {
  const now = options.now ?? new Date();
  const access = await publisherAccess(env.DB, session, now);
  const input = publicationInputSchema.parse(inputValue);
  const review = await loadApproved(env, input.reviewId);
  if (
    review.decisionEvidenceSha256
      !== input.expectedDecisionEvidenceSha256
  ) {
    throw new LegalSourcePublicationError(
      "LEGAL_SOURCE_PUBLICATION_EVIDENCE_CONFLICT",
    );
  }
  const readingRows = await buildReadingRows(review);
  const existingPublication = await loadPublication(env.DB, review.reviewId);
  if (existingPublication) {
    return validatePublicationReplay(
      env,
      review,
      readingRows,
      existingPublication,
    );
  }
  const state = await loadPublicationState(env.DB, review);
  if (
    !state
    || state.version_status !== "pending_review"
    || state.version_content_sha256 !== review.source.rawContentSha256
    || state.source_status === "verified"
    || state.source_verification_state === "verified"
    || state.source_content_sha256 !== review.source.rawContentSha256
  ) {
    throw new LegalSourcePublicationError(
      "LEGAL_SOURCE_PUBLICATION_STATE_CONFLICT",
    );
  }
  const existingCounts = await env.DB.prepare(`
    SELECT
      (SELECT count(*) FROM legal_source_sections WHERE version_id = ?) AS sections,
      (SELECT count(*) FROM legal_source_chunks WHERE version_id = ?) AS chunks
  `).bind(review.versionId, review.versionId).first<{
    sections: number;
    chunks: number;
  }>();
  if (!existingCounts || existingCounts.sections !== 0 || existingCounts.chunks !== 0) {
    throw new LegalSourcePublicationError(
      "LEGAL_SOURCE_PUBLICATION_STATE_CONFLICT",
    );
  }

  const publicationStableHash = await sha256Text(
    `${review.reviewId}\n${review.decisionEvidenceSha256}`,
  );
  const publicationId = `lspublish_${publicationStableHash.slice(0, 32)}`;
  const publishedAt = now.toISOString();
  const evidence = JSON.stringify(publicationEvidenceSchema.parse({
    schemaVersion: 1,
    publicationId,
    reviewId: review.reviewId,
    sourceId: review.sourceId,
    versionId: review.versionId,
    sourceKind: review.source.sourceKind,
    locale: review.source.locale,
    canonicalId: review.source.canonicalId,
    canonicalUrl: review.source.canonicalUrl,
    reviewEvidenceSha256: review.decisionEvidenceSha256,
    rawContentSha256: review.source.rawContentSha256,
    parsedContentSha256: review.source.parsedContentSha256,
    parserProfile: review.source.snapshot.parser.profile,
    publishedByUserId: access.userId,
    publisherSessionId: access.sessionId,
    publisherAssignmentIds: [...access.assignmentIds].sort(),
    mfaVerifiedAt: access.mfaVerifiedAt,
    sectionCount: readingRows.length,
    chunkCount: readingRows.length,
    publishedAt,
  }));
  const publicationEvidenceSha256 = await sha256Text(evidence);
  const statements: D1PreparedStatement[] = [];
  for (const row of readingRows) {
    statements.push(
      env.DB.prepare(`
        INSERT INTO legal_source_sections (
          id,version_id,canonical_ref,article,part,clause,heading,
          body_text,sequence,content_sha256,created_at
        ) VALUES (?,?,?,NULL,NULL,NULL,?,?,?,?,?)
      `).bind(
        row.sectionId,
        review.versionId,
        row.canonicalRef,
        row.heading,
        row.bodyText,
        row.sequence,
        row.contentSha256,
        publishedAt,
      ),
      env.DB.prepare(`
        INSERT INTO legal_source_chunks (
          id,version_id,section_id,chunk_index,language,content_text,
          content_sha256,vector_id,metadata_json,indexed_at,created_at
        ) VALUES (?,?,?,?,?,?,?,NULL,?,NULL,?)
      `).bind(
        row.chunkId,
        review.versionId,
        row.sectionId,
        row.sequence,
        review.source.locale,
        row.bodyText,
        row.contentSha256,
        row.metadataJson,
        publishedAt,
      ),
    );
  }
  const publicationIndex = statements.length;
  statements.push(
    env.DB.prepare(`
      INSERT INTO legal_source_publications (
        id,review_id,source_id,version_id,review_evidence_sha256,
        raw_content_sha256,parsed_content_sha256,published_by_user_id,
        publication_evidence_json,publication_evidence_sha256,
        published_at,created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      publicationId,
      review.reviewId,
      review.sourceId,
      review.versionId,
      review.decisionEvidenceSha256,
      review.source.rawContentSha256,
      review.source.parsedContentSha256,
      access.userId,
      evidence,
      publicationEvidenceSha256,
      publishedAt,
      publishedAt,
    ),
    env.DB.prepare(`
      UPDATE legal_source_versions
      SET status='verified',verified_at=?,verified_by_user_id=?,updated_at=?
      WHERE id=? AND source_id=? AND status='pending_review'
        AND content_sha256=? AND parsed_object_key IS NOT NULL
    `).bind(
      publishedAt,
      access.userId,
      publishedAt,
      review.versionId,
      review.sourceId,
      review.source.rawContentSha256,
    ),
    env.DB.prepare(`
      UPDATE legal_sources
      SET status='verified',verification_state='verified',verified_at=?,
        verified_by_user_id=?,verification_notes=?,updated_at=?
      WHERE id=? AND status<>'verified' AND verification_state<>'verified'
        AND content_sha256=?
    `).bind(
      publishedAt,
      access.userId,
      `publication:${publicationId}`,
      publishedAt,
      review.sourceId,
      review.source.rawContentSha256,
    ),
  );

  try {
    const results = await env.DB.batch(statements);
    if (
      results.slice(0, publicationIndex).some(
        (result) => Number(result.meta.changes ?? 0) !== 1,
      )
      || Number(results[publicationIndex]?.meta.changes ?? 0) !== 1
      || Number(results[publicationIndex + 1]?.meta.changes ?? 0) !== 1
      || Number(results[publicationIndex + 2]?.meta.changes ?? 0) !== 1
    ) {
      throw new LegalSourcePublicationError(
        "LEGAL_SOURCE_PUBLICATION_PERSISTENCE_FAILED",
      );
    }
  } catch (error) {
    const concurrent = await loadPublication(env.DB, review.reviewId);
    if (concurrent) {
      return validatePublicationReplay(env, review, readingRows, concurrent);
    }
    if (error instanceof LegalSourcePublicationError) throw error;
    throw new LegalSourcePublicationError(
      "LEGAL_SOURCE_PUBLICATION_PERSISTENCE_FAILED",
    );
  }
  return {
    publicationId,
    reviewId: review.reviewId,
    sourceId: review.sourceId,
    versionId: review.versionId,
    publishedByUserId: access.userId,
    publicationEvidenceSha256,
    publishedAt,
    sectionCount: readingRows.length,
    chunkCount: readingRows.length,
    changed: true,
  };
}
