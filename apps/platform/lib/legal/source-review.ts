import { z } from "zod";
import {
  requirePlatformStaffAccess,
  type PlatformStaffAccess,
} from "../auth/staff-access";
import type { LocalSession } from "../auth/session-management";
import {
  LegalSourceNormalizationError,
  loadStoredNormalizedLegalSource,
  type LegalSourceNormalizationEnv,
  type StoredNormalizedLegalSource,
} from "./source-normalization";

export const LEGAL_SOURCE_REVIEW_ERROR_CODES = [
  "LEGAL_SOURCE_REVIEW_NOT_FOUND",
  "LEGAL_SOURCE_REVIEW_STATE_CONFLICT",
  "LEGAL_SOURCE_REVIEW_SOURCE_UNAVAILABLE",
  "LEGAL_SOURCE_REVIEW_EVIDENCE_CONFLICT",
  "LEGAL_SOURCE_REVIEW_PERSISTENCE_FAILED",
] as const;

export type LegalSourceReviewErrorCode =
  (typeof LEGAL_SOURCE_REVIEW_ERROR_CODES)[number];

export class LegalSourceReviewError extends Error {
  constructor(readonly code: LegalSourceReviewErrorCode) {
    super(code);
    this.name = "LegalSourceReviewError";
  }
}

export type LegalSourceReviewEnv = LegalSourceNormalizationEnv;

type ReviewSession = Pick<
  LocalSession,
  "sessionId" | "userId" | "assuranceLevel" | "mfaVerifiedAt"
>;

type ReviewRow = {
  id: string;
  source_id: string;
  version_id: string | null;
  status: string;
  assigned_to_user_id: string | null;
  decision: string | null;
  decision_notes: string | null;
  reviewed_parsed_sha256: string | null;
  decided_by_user_id: string | null;
  decision_evidence_json: string | null;
  decision_evidence_sha256: string | null;
  decided_at: string | null;
  version_status: string | null;
  version_content_sha256: string | null;
};

const identifierSchema = z.string().min(1).max(180)
  .regex(/^[A-Za-z0-9:_-]+$/);
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const decisionInputSchema = z.object({
  reviewId: identifierSchema,
  decision: z.enum(["approve", "reject"]),
  notes: z.string().trim().min(10).max(2_000),
  expectedRawContentSha256: sha256Schema,
  expectedParsedContentSha256: sha256Schema,
}).strict();
const decisionEvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  reviewId: identifierSchema,
  sourceId: identifierSchema,
  versionId: identifierSchema,
  sourceKind: z.enum(["lex", "advice"]),
  locale: z.enum(["ru", "uz"]),
  canonicalId: z.string().min(1).max(256),
  canonicalUrl: z.string().url().max(2_048),
  rawContentSha256: sha256Schema,
  parsedContentSha256: sha256Schema,
  parserProfile: z.string().min(1).max(128),
  decision: z.enum(["approve", "reject"]),
  notes: z.string().min(10).max(2_000),
  reviewerUserId: identifierSchema,
  reviewerSessionId: identifierSchema,
  reviewerAssignmentIds: z.array(identifierSchema).min(1).max(16),
  mfaVerifiedAt: z.string().datetime(),
  decidedAt: z.string().datetime(),
}).strict();

const FRESH_MFA_WINDOW_MS = 15 * 60 * 1_000;

async function sha256Text(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function reviewerAccess(
  db: D1Database,
  session: ReviewSession,
  now: Date,
): Promise<PlatformStaffAccess> {
  return requirePlatformStaffAccess(
    db,
    session,
    "legal.sources.review",
    { now, freshMfaWithinMs: FRESH_MFA_WINDOW_MS },
  );
}

async function loadReview(
  db: D1Database,
  reviewId: string,
): Promise<ReviewRow | null> {
  return db.prepare(`
    SELECT
      review.id, review.source_id, review.version_id, review.status,
      review.assigned_to_user_id, review.decision, review.decision_notes,
      review.reviewed_parsed_sha256, review.decided_by_user_id,
      review.decision_evidence_json, review.decision_evidence_sha256,
      review.decided_at,
      version.status AS version_status,
      version.content_sha256 AS version_content_sha256
    FROM legal_review_queue AS review
    LEFT JOIN legal_source_versions AS version ON version.id = review.version_id
    WHERE review.id = ?
    LIMIT 1
  `).bind(reviewId).first<ReviewRow>();
}

async function normalizedSourceForReview(
  env: LegalSourceReviewEnv,
  row: ReviewRow,
): Promise<StoredNormalizedLegalSource> {
  if (!row.version_id || row.version_status !== "pending_review") {
    throw new LegalSourceReviewError(
      "LEGAL_SOURCE_REVIEW_SOURCE_UNAVAILABLE",
    );
  }
  try {
    const source = await loadStoredNormalizedLegalSource(env, row.version_id);
    if (source.sourceId !== row.source_id) {
      throw new LegalSourceReviewError(
        "LEGAL_SOURCE_REVIEW_EVIDENCE_CONFLICT",
      );
    }
    return source;
  } catch (error) {
    if (error instanceof LegalSourceReviewError) throw error;
    if (error instanceof LegalSourceNormalizationError) {
      throw new LegalSourceReviewError(
        "LEGAL_SOURCE_REVIEW_SOURCE_UNAVAILABLE",
      );
    }
    throw error;
  }
}

export type LegalSourceReviewDocument = {
  reviewId: string;
  reviewerUserId: string;
  status: "in_review";
  source: StoredNormalizedLegalSource;
};

export async function claimLegalSourceReview(
  env: LegalSourceReviewEnv,
  session: ReviewSession,
  reviewIdInput: string,
  options: { now?: Date } = {},
): Promise<LegalSourceReviewDocument & { changed: boolean }> {
  const now = options.now ?? new Date();
  const access = await reviewerAccess(env.DB, session, now);
  const reviewId = identifierSchema.parse(reviewIdInput);
  let row = await loadReview(env.DB, reviewId);
  if (!row) {
    throw new LegalSourceReviewError("LEGAL_SOURCE_REVIEW_NOT_FOUND");
  }
  if (
    row.status === "in_review"
    && row.assigned_to_user_id === access.userId
  ) {
    const source = await normalizedSourceForReview(env, row);
    return {
      reviewId,
      reviewerUserId: access.userId,
      status: "in_review",
      source,
      changed: false,
    };
  }
  if (row.status !== "pending" || row.assigned_to_user_id !== null) {
    throw new LegalSourceReviewError(
      "LEGAL_SOURCE_REVIEW_STATE_CONFLICT",
    );
  }
  const source = await normalizedSourceForReview(env, row);
  const nowIso = now.toISOString();
  const result = await env.DB.prepare(`
    UPDATE legal_review_queue
    SET status = 'in_review', assigned_to_user_id = ?, updated_at = ?
    WHERE id = ? AND status = 'pending' AND assigned_to_user_id IS NULL
      AND decision IS NULL AND decided_at IS NULL
  `).bind(access.userId, nowIso, reviewId).run();
  if (Number(result.meta.changes ?? 0) !== 1) {
    row = await loadReview(env.DB, reviewId);
    if (
      !row
      || row.status !== "in_review"
      || row.assigned_to_user_id !== access.userId
    ) {
      throw new LegalSourceReviewError(
        "LEGAL_SOURCE_REVIEW_STATE_CONFLICT",
      );
    }
    return {
      reviewId,
      reviewerUserId: access.userId,
      status: "in_review",
      source,
      changed: false,
    };
  }
  return {
    reviewId,
    reviewerUserId: access.userId,
    status: "in_review",
    source,
    changed: true,
  };
}

export type LegalSourceReviewDecisionResult = {
  reviewId: string;
  versionId: string;
  status: "approved" | "rejected";
  decision: "approve" | "reject";
  decisionEvidenceSha256: string;
  decidedAt: string;
  publicationRequired: boolean;
  changed: boolean;
};

async function terminalReplay(
  row: ReviewRow,
  input: z.infer<typeof decisionInputSchema>,
  reviewerUserId: string,
): Promise<LegalSourceReviewDecisionResult | null> {
  const expectedStatus = input.decision === "approve" ? "approved" : "rejected";
  if (
    row.status !== expectedStatus
    || row.decision !== input.decision
    || row.decision_notes !== input.notes
    || row.version_content_sha256 !== input.expectedRawContentSha256
    || row.reviewed_parsed_sha256 !== input.expectedParsedContentSha256
    || row.decided_by_user_id !== reviewerUserId
    || !row.decision_evidence_json
    || !row.decision_evidence_sha256
    || !sha256Schema.safeParse(row.decision_evidence_sha256).success
    || !row.decided_at
    || !row.version_id
  ) {
    return null;
  }
  let evidence: z.infer<typeof decisionEvidenceSchema>;
  try {
    evidence = decisionEvidenceSchema.parse(
      JSON.parse(row.decision_evidence_json),
    );
  } catch {
    return null;
  }
  if (
    await sha256Text(row.decision_evidence_json)
      !== row.decision_evidence_sha256
    || evidence.reviewId !== row.id
    || evidence.sourceId !== row.source_id
    || evidence.versionId !== row.version_id
    || evidence.rawContentSha256 !== input.expectedRawContentSha256
    || evidence.parsedContentSha256 !== input.expectedParsedContentSha256
    || evidence.decision !== input.decision
    || evidence.notes !== input.notes
    || evidence.reviewerUserId !== reviewerUserId
    || evidence.decidedAt !== row.decided_at
  ) {
    return null;
  }
  return {
    reviewId: row.id,
    versionId: row.version_id,
    status: expectedStatus,
    decision: input.decision,
    decisionEvidenceSha256: row.decision_evidence_sha256,
    decidedAt: row.decided_at,
    publicationRequired: input.decision === "approve",
    changed: false,
  };
}

export async function decideLegalSourceReview(
  env: LegalSourceReviewEnv,
  session: ReviewSession,
  inputValue: unknown,
  options: { now?: Date } = {},
): Promise<LegalSourceReviewDecisionResult> {
  const now = options.now ?? new Date();
  const access = await reviewerAccess(env.DB, session, now);
  const input = decisionInputSchema.parse(inputValue);
  const row = await loadReview(env.DB, input.reviewId);
  if (!row) {
    throw new LegalSourceReviewError("LEGAL_SOURCE_REVIEW_NOT_FOUND");
  }
  const replay = await terminalReplay(row, input, access.userId);
  if (replay) return replay;
  if (row.status === "approved" || row.status === "rejected") {
    throw new LegalSourceReviewError(
      "LEGAL_SOURCE_REVIEW_EVIDENCE_CONFLICT",
    );
  }
  if (
    row.status !== "in_review"
    || row.assigned_to_user_id !== access.userId
    || row.decision !== null
    || row.decided_at !== null
  ) {
    throw new LegalSourceReviewError(
      "LEGAL_SOURCE_REVIEW_STATE_CONFLICT",
    );
  }
  const source = await normalizedSourceForReview(env, row);
  const versionId = row.version_id;
  if (!versionId) {
    throw new LegalSourceReviewError(
      "LEGAL_SOURCE_REVIEW_SOURCE_UNAVAILABLE",
    );
  }
  if (
    source.rawContentSha256 !== input.expectedRawContentSha256
    || source.parsedContentSha256 !== input.expectedParsedContentSha256
    || row.version_content_sha256 !== input.expectedRawContentSha256
  ) {
    throw new LegalSourceReviewError(
      "LEGAL_SOURCE_REVIEW_EVIDENCE_CONFLICT",
    );
  }

  const decidedAt = now.toISOString();
  const evidence = JSON.stringify(decisionEvidenceSchema.parse({
    schemaVersion: 1,
    reviewId: row.id,
    sourceId: row.source_id,
    versionId,
    sourceKind: source.sourceKind,
    locale: source.locale,
    canonicalId: source.canonicalId,
    canonicalUrl: source.canonicalUrl,
    rawContentSha256: source.rawContentSha256,
    parsedContentSha256: source.parsedContentSha256,
    parserProfile: source.snapshot.parser.profile,
    decision: input.decision,
    notes: input.notes,
    reviewerUserId: access.userId,
    reviewerSessionId: access.sessionId,
    reviewerAssignmentIds: [...access.assignmentIds].sort(),
    mfaVerifiedAt: access.mfaVerifiedAt,
    decidedAt,
  }));
  const decisionEvidenceSha256 = await sha256Text(evidence);
  const status = input.decision === "approve" ? "approved" : "rejected";
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`
      UPDATE legal_review_queue
      SET status = ?, decision = ?, decision_notes = ?,
          reviewed_parsed_sha256 = ?, decided_by_user_id = ?,
          decision_evidence_json = ?, decision_evidence_sha256 = ?,
          decided_at = ?, updated_at = ?
      WHERE id = ? AND source_id = ? AND version_id = ?
        AND status = 'in_review' AND assigned_to_user_id = ?
        AND decision IS NULL AND decided_at IS NULL
    `).bind(
      status,
      input.decision,
      input.notes,
      source.parsedContentSha256,
      access.userId,
      evidence,
      decisionEvidenceSha256,
      decidedAt,
      decidedAt,
      row.id,
      row.source_id,
      versionId,
      access.userId,
    ),
  ];
  if (input.decision === "reject") {
    statements.push(
      env.DB.prepare(`
        UPDATE legal_source_versions
        SET status = 'rejected', updated_at = ?
        WHERE id = ? AND source_id = ? AND status = 'pending_review'
          AND content_sha256 = ? AND parsed_object_key IS NOT NULL
      `).bind(
        decidedAt,
        versionId,
        row.source_id,
        source.rawContentSha256,
      ),
      env.DB.prepare(`
        UPDATE legal_sources
        SET status = 'rejected', verification_state = 'rejected',
            verification_notes = 'legal_review_rejected', updated_at = ?
        WHERE id = ? AND verification_state <> 'verified'
          AND content_sha256 = ?
          AND NOT EXISTS (
            SELECT 1 FROM legal_source_versions
            WHERE source_id = ? AND status = 'verified'
          )
      `).bind(
        decidedAt,
        row.source_id,
        source.rawContentSha256,
        row.source_id,
      ),
    );
  }

  const results = await env.DB.batch(statements);
  if (
    Number(results[0]?.meta.changes ?? 0) !== 1
    || (
      input.decision === "reject"
      && Number(results[1]?.meta.changes ?? 0) !== 1
    )
  ) {
    const after = await loadReview(env.DB, input.reviewId);
    const concurrentReplay = after
      ? await terminalReplay(after, input, access.userId)
      : null;
    if (concurrentReplay) return concurrentReplay;
    throw new LegalSourceReviewError(
      "LEGAL_SOURCE_REVIEW_PERSISTENCE_FAILED",
    );
  }
  return {
    reviewId: row.id,
    versionId,
    status,
    decision: input.decision,
    decisionEvidenceSha256,
    decidedAt,
    publicationRequired: input.decision === "approve",
    changed: true,
  };
}
