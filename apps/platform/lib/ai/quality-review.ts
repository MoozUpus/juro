import { z } from "zod";
import type { PlatformStaffAccess } from "../auth/staff-access";
import { aiFeedbackTypeSchema } from "./feedback";

const GENESIS_HASH = "0".repeat(64);
const MAX_CHAIN_RETRIES = 3;
const EVENT_DOMAIN = "juro-ai-quality-review-v1";
const EMPTY_HASH_INPUT = "";

export const aiQualityClassifications = [
  "correct",
  "partially_incorrect",
  "incorrect",
  "unsafe",
  "outdated_source",
  "broken_citation",
  "insufficient_context",
  "language_issue",
] as const;

const classificationSchema = z.enum(aiQualityClassifications);
const feedbackIdSchema = z.string().uuid();
const nullableText = (maximum: number) => z.string().trim().max(maximum)
  .optional().transform((value) => value || null);

const filtersSchema = z.object({
  feedbackType: aiFeedbackTypeSchema.optional(),
  reviewStatus: z.enum(["pending", "reviewed", "all"]).default("pending"),
  classification: classificationSchema.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.number().int().min(1).max(200).default(100),
}).strict().superRefine((value, context) => {
  if (value.from && value.to && Date.parse(value.from) > Date.parse(value.to)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "INVALID_DATE_RANGE" });
  }
});

export const aiQualityReviewRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("query"), filters: filtersSchema.default({ reviewStatus: "pending", limit: 100 }) }).strict(),
  z.object({ action: z.literal("view"), feedbackId: feedbackIdSchema }).strict(),
  z.object({
    action: z.literal("resolve"),
    feedbackId: feedbackIdSchema,
    classification: classificationSchema,
    notes: z.string().trim().min(1).max(4_000),
    correctedAnswer: nullableText(50_000),
    goldenAnswer: nullableText(50_000),
  }).strict(),
]);

export type AiQualityReviewRequest = z.output<typeof aiQualityReviewRequestSchema>;
export type AiQualityClassification = (typeof aiQualityClassifications)[number];

export type AiQualityQueueRow = {
  feedbackId: string;
  feedbackType: z.infer<typeof aiFeedbackTypeSchema>;
  commentPresent: boolean;
  workspaceId: string;
  aiRunId: string;
  assistantMessageId: string;
  provider: string;
  model: string;
  answerMode: string;
  reasoningMode: string;
  legalDatabaseAsOf: string;
  instructionHash: string;
  sourceVersionHash: string;
  feedbackUpdatedAt: string;
  latestReviewVersion: number | null;
  classification: AiQualityClassification | null;
  reviewedAt: string | null;
  stale: boolean;
};

export type AiQualityReviewDetail = {
  feedbackId: string;
  feedbackType: z.infer<typeof aiFeedbackTypeSchema>;
  feedbackComment: string | null;
  feedbackUpdatedAt: string;
  workspaceId: string;
  aiRunId: string;
  question: string;
  answer: string;
  structuredOutput: unknown;
  provider: string;
  model: string;
  answerMode: string;
  reasoningMode: string;
  legalDatabaseAsOf: string;
  instructionHash: string;
  sourceVersionHash: string;
  latestReviewVersion: number;
};

type AccessAction = "query" | "view" | "resolve";
type StoredAccessEvent = {
  id: string;
  actorUserId: string;
  actorSessionId: string;
  actorAssignmentId: string;
  capability: "ai.quality.review";
  requestAction: AccessAction;
  feedbackId: string | null;
  reviewVersion: number;
  classification: AiQualityClassification | null;
  filtersHash: string;
  resultCount: number;
  resultDigest: string;
  feedbackUpdatedAt: string | null;
  questionHash: string;
  answerHash: string;
  commentHash: string;
  notesHash: string;
  correctedAnswerHash: string;
  goldenAnswerHash: string;
  actorMfaVerifiedAt: string;
  previousHash: string;
  eventHash: string;
  createdAt: string;
};

type ResolutionContent = {
  eventId: string;
  feedbackId: string;
  reviewerUserId: string;
  capturedFeedbackUpdatedAt: string;
  reviewerNotes: string;
  correctedAnswer: string | null;
  goldenAnswer: string | null;
  feedbackExists: number;
};

export class AiQualityReviewError extends Error {
  constructor(readonly code:
    | "AI_QUALITY_REVIEW_INVALID"
    | "AI_QUALITY_REVIEW_NOT_FOUND"
    | "AI_QUALITY_REVIEW_STALE"
    | "AI_QUALITY_REVIEW_ACCESS_INTEGRITY_FAILED"
    | "AI_QUALITY_REVIEW_ACCESS_WRITE_FAILED") {
    super(code);
    this.name = "AiQualityReviewError";
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function canonicalEvent(event: Omit<StoredAccessEvent, "eventHash"> | StoredAccessEvent): string {
  return JSON.stringify([EVENT_DOMAIN, {
    id: event.id,
    actorUserId: event.actorUserId,
    actorSessionId: event.actorSessionId,
    actorAssignmentId: event.actorAssignmentId,
    capability: event.capability,
    requestAction: event.requestAction,
    feedbackId: event.feedbackId,
    reviewVersion: event.reviewVersion,
    classification: event.classification,
    filtersHash: event.filtersHash,
    resultDigest: event.resultDigest,
    questionHash: event.questionHash,
    answerHash: event.answerHash,
    commentHash: event.commentHash,
    notesHash: event.notesHash,
    correctedAnswerHash: event.correctedAnswerHash,
    goldenAnswerHash: event.goldenAnswerHash,
    resultCount: event.resultCount,
    feedbackUpdatedAt: event.feedbackUpdatedAt,
    actorMfaVerifiedAt: event.actorMfaVerifiedAt,
    previousHash: event.previousHash,
    createdAt: event.createdAt,
  }]);
}

async function storedEvents(db: D1Database, actorUserId?: string): Promise<StoredAccessEvent[]> {
  const where = actorUserId ? "WHERE actor_user_id=?" : "";
  const result = await db.prepare(
    `SELECT id,actor_user_id AS actorUserId,actor_session_id AS actorSessionId,
      actor_assignment_id AS actorAssignmentId,capability,request_action AS requestAction,
      feedback_id AS feedbackId,review_version AS reviewVersion,classification,
      filters_hash AS filtersHash,result_count AS resultCount,result_digest AS resultDigest,
      feedback_updated_at AS feedbackUpdatedAt,question_hash AS questionHash,
      answer_hash AS answerHash,comment_hash AS commentHash,notes_hash AS notesHash,
      corrected_answer_hash AS correctedAnswerHash,golden_answer_hash AS goldenAnswerHash,
      actor_mfa_verified_at AS actorMfaVerifiedAt,previous_hash AS previousHash,
      event_hash AS eventHash,created_at AS createdAt
     FROM ai_quality_review_events ${where}
     ORDER BY actor_user_id,created_at,id LIMIT 10001`,
  ).bind(...(actorUserId ? [actorUserId] : [])).all<StoredAccessEvent>();
  return result.results;
}

async function resolutionContents(db: D1Database): Promise<Map<string, ResolutionContent>> {
  const result = await db.prepare(
    `SELECT event.id AS eventId,content.feedback_id AS feedbackId,
      content.reviewer_user_id AS reviewerUserId,
      content.captured_feedback_updated_at AS capturedFeedbackUpdatedAt,
      content.reviewer_notes AS reviewerNotes,content.corrected_answer AS correctedAnswer,
      content.golden_answer AS goldenAnswer,
      CASE WHEN feedback.id IS NULL THEN 0 ELSE 1 END AS feedbackExists
     FROM ai_quality_review_events event
     LEFT JOIN ai_quality_review_contents content ON content.event_id=event.id
     LEFT JOIN ai_feedback feedback ON feedback.id=event.feedback_id
     WHERE event.request_action='resolve'`,
  ).all<ResolutionContent>();
  return new Map(result.results.filter((row) => row.feedbackId).map((row) => [row.eventId, row]));
}

export async function verifyAiQualityReviewHistory(
  db: D1Database,
  actorUserId?: string,
): Promise<{ valid: boolean; checked: number }> {
  const events = await storedEvents(db, actorUserId);
  if (events.length > 10_000) return { valid: false, checked: events.length };
  const contents = await resolutionContents(db);
  const byActor = new Map<string, StoredAccessEvent[]>();
  for (const event of events) byActor.set(event.actorUserId, [...(byActor.get(event.actorUserId) ?? []), event]);
  for (const actorEvents of byActor.values()) {
    const byPreviousHash = new Map(actorEvents.map((event) => [event.previousHash, event]));
    let previousHash = GENESIS_HASH;
    for (let index = 0; index < actorEvents.length; index += 1) {
      const event = byPreviousHash.get(previousHash);
      if (!event || event.capability !== "ai.quality.review" || !event.actorMfaVerifiedAt || !event.createdAt) {
        return { valid: false, checked: events.length };
      }
      if (await sha256Hex(canonicalEvent(event)) !== event.eventHash) {
        return { valid: false, checked: events.length };
      }
      if (event.requestAction === "resolve") {
        const content = contents.get(event.id);
        if (!content) {
          const feedback = await db.prepare("SELECT 1 AS found FROM ai_feedback WHERE id=?")
            .bind(event.feedbackId).first<{ found: number }>();
          if (feedback) return { valid: false, checked: events.length };
        } else if (
          content.feedbackId !== event.feedbackId
          || content.reviewerUserId !== event.actorUserId
          || content.capturedFeedbackUpdatedAt !== event.feedbackUpdatedAt
          || await sha256Hex(content.reviewerNotes) !== event.notesHash
          || await sha256Hex(content.correctedAnswer ?? EMPTY_HASH_INPUT) !== event.correctedAnswerHash
          || await sha256Hex(content.goldenAnswer ?? EMPTY_HASH_INPUT) !== event.goldenAnswerHash
        ) return { valid: false, checked: events.length };
      }
      previousHash = event.eventHash;
    }
    if (byPreviousHash.size !== actorEvents.length) return { valid: false, checked: events.length };
  }
  return { valid: true, checked: events.length };
}

function parseStructuredOutput(value: string | null): unknown {
  if (!value) return null;
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

async function detail(db: D1Database, feedbackId: string): Promise<AiQualityReviewDetail> {
  const row = await db.prepare(
    `SELECT feedback.id AS feedbackId,feedback.feedback_type AS feedbackType,
      feedback.comment AS feedbackComment,feedback.updated_at AS feedbackUpdatedAt,
      feedback.workspace_id AS workspaceId,run.id AS aiRunId,
      request.content AS question,response.content AS answer,response.structured_json AS structuredJson,
      run.provider,run.model,run.answer_mode AS answerMode,run.reasoning_mode AS reasoningMode,
      run.legal_database_as_of AS legalDatabaseAsOf,run.instruction_hash AS instructionHash,
      run.source_version_hash AS sourceVersionHash,
      coalesce((SELECT max(review_version) FROM ai_quality_review_events
        WHERE feedback_id=feedback.id AND request_action='resolve'),0) AS latestReviewVersion
     FROM ai_feedback feedback
     JOIN ai_runs run ON run.id=feedback.ai_run_id AND run.status='completed'
     JOIN conversation_messages request ON request.id=run.request_message_id
       AND request.conversation_id=feedback.conversation_id AND request.author_type='user'
     JOIN conversation_messages response ON response.id=feedback.assistant_message_id
       AND response.id=run.response_message_id AND response.conversation_id=feedback.conversation_id
       AND response.author_type='assistant'
     WHERE feedback.id=? LIMIT 1`,
  ).bind(feedbackId).first<AiQualityReviewDetail & { structuredJson: string | null }>();
  if (!row) throw new AiQualityReviewError("AI_QUALITY_REVIEW_NOT_FOUND");
  const { structuredJson, ...safe } = row;
  return { ...safe, structuredOutput: parseStructuredOutput(structuredJson) };
}

async function queueRows(
  db: D1Database,
  filters: z.output<typeof filtersSchema>,
): Promise<AiQualityQueueRow[]> {
  const where: string[] = [];
  const bindings: Array<string | number> = [];
  if (filters.feedbackType) { where.push("feedback.feedback_type=?"); bindings.push(filters.feedbackType); }
  if (filters.reviewStatus === "pending") where.push("(latest.id IS NULL OR latest.feedback_updated_at<>feedback.updated_at)");
  if (filters.reviewStatus === "reviewed") where.push("latest.id IS NOT NULL AND latest.feedback_updated_at=feedback.updated_at");
  if (filters.classification) { where.push("latest.classification=?"); bindings.push(filters.classification); }
  if (filters.from) { where.push("feedback.updated_at>=?"); bindings.push(filters.from); }
  if (filters.to) { where.push("feedback.updated_at<=?"); bindings.push(filters.to); }
  bindings.push(filters.limit);
  type Row = Omit<AiQualityQueueRow, "commentPresent" | "stale"> & { commentPresent: number; stale: number };
  const result = await db.prepare(
    `SELECT feedback.id AS feedbackId,feedback.feedback_type AS feedbackType,
      CASE WHEN feedback.comment IS NULL OR feedback.comment='' THEN 0 ELSE 1 END AS commentPresent,
      feedback.workspace_id AS workspaceId,feedback.ai_run_id AS aiRunId,
      feedback.assistant_message_id AS assistantMessageId,run.provider,run.model,
      run.answer_mode AS answerMode,run.reasoning_mode AS reasoningMode,
      run.legal_database_as_of AS legalDatabaseAsOf,run.instruction_hash AS instructionHash,
      run.source_version_hash AS sourceVersionHash,feedback.updated_at AS feedbackUpdatedAt,
      latest.review_version AS latestReviewVersion,latest.classification,
      latest.created_at AS reviewedAt,
      CASE WHEN latest.id IS NOT NULL AND latest.feedback_updated_at<>feedback.updated_at THEN 1 ELSE 0 END AS stale
     FROM ai_feedback feedback
     JOIN ai_runs run ON run.id=feedback.ai_run_id AND run.status='completed'
     LEFT JOIN ai_quality_review_events latest ON latest.id=(
       SELECT candidate.id FROM ai_quality_review_events candidate
       WHERE candidate.feedback_id=feedback.id AND candidate.request_action='resolve'
       ORDER BY candidate.review_version DESC LIMIT 1
     )
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY CASE WHEN latest.id IS NULL THEN 0 ELSE 1 END,feedback.updated_at DESC,feedback.id DESC
     LIMIT ?`,
  ).bind(...bindings).all<Row>();
  return result.results.map((row) => ({ ...row, commentPresent: row.commentPresent === 1, stale: row.stale === 1 }));
}

async function appendEvent(input: {
  db: D1Database;
  staff: PlatformStaffAccess;
  action: AccessAction;
  feedbackId: string | null;
  reviewVersion: number;
  classification: AiQualityClassification | null;
  filters: unknown;
  result: unknown;
  resultCount: number;
  feedbackUpdatedAt: string | null;
  question: string;
  answer: string;
  comment: string;
  notes: string;
  correctedAnswer: string | null;
  goldenAnswer: string | null;
  now: Date;
}): Promise<StoredAccessEvent> {
  const assignmentId = input.staff.assignmentIds[0];
  if (input.staff.capability !== "ai.quality.review" || !assignmentId || !input.staff.mfaVerifiedAt) {
    throw new AiQualityReviewError("AI_QUALITY_REVIEW_ACCESS_WRITE_FAILED");
  }
  const integrity = await verifyAiQualityReviewHistory(input.db, input.staff.userId);
  if (!integrity.valid) throw new AiQualityReviewError("AI_QUALITY_REVIEW_ACCESS_INTEGRITY_FAILED");
  const fixed = {
    filtersHash: await sha256Hex(JSON.stringify(input.filters)),
    resultDigest: await sha256Hex(JSON.stringify(input.result)),
    questionHash: await sha256Hex(input.question),
    answerHash: await sha256Hex(input.answer),
    commentHash: await sha256Hex(input.comment),
    notesHash: await sha256Hex(input.notes),
    correctedAnswerHash: await sha256Hex(input.correctedAnswer ?? EMPTY_HASH_INPUT),
    goldenAnswerHash: await sha256Hex(input.goldenAnswer ?? EMPTY_HASH_INPUT),
  };
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_CHAIN_RETRIES; attempt += 1) {
    const events = await storedEvents(input.db, input.staff.userId);
    const referenced = new Set(events.map((event) => event.previousHash));
    const heads = events.filter((event) => !referenced.has(event.eventHash));
    if (events.length && heads.length !== 1) throw new AiQualityReviewError("AI_QUALITY_REVIEW_ACCESS_INTEGRITY_FAILED");
    const withoutHash: Omit<StoredAccessEvent, "eventHash"> = {
      id: crypto.randomUUID(), actorUserId: input.staff.userId,
      actorSessionId: input.staff.sessionId, actorAssignmentId: assignmentId,
      capability: "ai.quality.review", requestAction: input.action,
      feedbackId: input.feedbackId, reviewVersion: input.reviewVersion,
      classification: input.classification, ...fixed,
      resultCount: input.resultCount, feedbackUpdatedAt: input.feedbackUpdatedAt,
      actorMfaVerifiedAt: input.staff.mfaVerifiedAt,
      previousHash: heads[0]?.eventHash ?? GENESIS_HASH,
      createdAt: input.now.toISOString(),
    };
    const event: StoredAccessEvent = {
      ...withoutHash,
      eventHash: await sha256Hex(canonicalEvent(withoutHash)),
    };
    const eventStatement = input.db.prepare(
      `INSERT INTO ai_quality_review_events
       (id,actor_user_id,actor_session_id,actor_assignment_id,capability,request_action,
        feedback_id,review_version,classification,filters_hash,result_count,result_digest,
        feedback_updated_at,question_hash,answer_hash,comment_hash,notes_hash,
        corrected_answer_hash,golden_answer_hash,actor_mfa_verified_at,previous_hash,event_hash,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      event.id,event.actorUserId,event.actorSessionId,event.actorAssignmentId,event.capability,
      event.requestAction,event.feedbackId,event.reviewVersion,event.classification,event.filtersHash,
      event.resultCount,event.resultDigest,event.feedbackUpdatedAt,event.questionHash,event.answerHash,
      event.commentHash,event.notesHash,event.correctedAnswerHash,event.goldenAnswerHash,
      event.actorMfaVerifiedAt,event.previousHash,event.eventHash,event.createdAt,
    );
    try {
      if (input.action === "resolve") {
        const contentStatement = input.db.prepare(
          `INSERT INTO ai_quality_review_contents
           (event_id,feedback_id,reviewer_user_id,captured_feedback_updated_at,
            reviewer_notes,corrected_answer,golden_answer,created_at)
           VALUES (?,?,?,?,?,?,?,?)`,
        ).bind(
          event.id,event.feedbackId,event.actorUserId,event.feedbackUpdatedAt,input.notes,
          input.correctedAnswer,input.goldenAnswer,event.createdAt,
        );
        await input.db.batch([contentStatement, eventStatement]);
      } else await eventStatement.run();
      return event;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("AI_QUALITY_REVIEW_STALE") || message.includes("version_uidx")) {
        throw new AiQualityReviewError("AI_QUALITY_REVIEW_STALE");
      }
      if (!message.includes("CHAIN_CONFLICT") && !message.includes("chain_uidx")) break;
    }
  }
  if (lastError instanceof AiQualityReviewError) throw lastError;
  throw new AiQualityReviewError("AI_QUALITY_REVIEW_ACCESS_WRITE_FAILED");
}

export async function executeAiQualityReview(input: {
  db: D1Database;
  staff: PlatformStaffAccess;
  request: AiQualityReviewRequest;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new AiQualityReviewError("AI_QUALITY_REVIEW_INVALID");
  if (input.request.action === "query") {
    const rows = await queueRows(input.db, input.request.filters);
    const event = await appendEvent({
      db: input.db, staff: input.staff, action: "query", feedbackId: null,
      reviewVersion: 0, classification: null, filters: input.request.filters,
      result: rows, resultCount: rows.length, feedbackUpdatedAt: null,
      question: "", answer: "", comment: "", notes: "", correctedAnswer: null,
      goldenAnswer: null, now,
    });
    const accessIntegrity = await verifyAiQualityReviewHistory(input.db, input.staff.userId);
    return { action: "query" as const, rows, accessEventId: event.id, accessIntegrity };
  }
  const current = await detail(input.db, input.request.feedbackId);
  if (input.request.action === "view") {
    const event = await appendEvent({
      db: input.db, staff: input.staff, action: "view", feedbackId: current.feedbackId,
      reviewVersion: 0, classification: null, filters: { feedbackId: current.feedbackId },
      result: { feedbackId: current.feedbackId, feedbackUpdatedAt: current.feedbackUpdatedAt },
      resultCount: 1, feedbackUpdatedAt: current.feedbackUpdatedAt,
      question: current.question, answer: current.answer, comment: current.feedbackComment ?? "",
      notes: "", correctedAnswer: null, goldenAnswer: null, now,
    });
    const accessIntegrity = await verifyAiQualityReviewHistory(input.db, input.staff.userId);
    return { action: "view" as const, detail: current, accessEventId: event.id, accessIntegrity };
  }
  const reviewVersion = current.latestReviewVersion + 1;
  const event = await appendEvent({
    db: input.db, staff: input.staff, action: "resolve", feedbackId: current.feedbackId,
    reviewVersion, classification: input.request.classification,
    filters: { feedbackId: current.feedbackId, classification: input.request.classification },
    result: { feedbackId: current.feedbackId, reviewVersion, classification: input.request.classification },
    resultCount: 1, feedbackUpdatedAt: current.feedbackUpdatedAt,
    question: current.question, answer: current.answer, comment: current.feedbackComment ?? "",
    notes: input.request.notes, correctedAnswer: input.request.correctedAnswer,
    goldenAnswer: input.request.goldenAnswer, now,
  });
  const accessIntegrity = await verifyAiQualityReviewHistory(input.db, input.staff.userId);
  return {
    action: "resolve" as const, feedbackId: current.feedbackId, reviewVersion,
    classification: input.request.classification, accessEventId: event.id, accessIntegrity,
  };
}

export async function recordAiQualityEvaluationEvidenceExport(input: {
  db: D1Database;
  staff: PlatformStaffAccess;
  evaluationRunId: string;
  applicationCommit: string;
  corpusSha256: string;
  resultsEnvelopeSha256: string;
  exportDigest: string;
  recordCount: number;
  now?: Date;
}): Promise<{
  accessEventId: string;
  accessEventHash: string;
  accessIntegrity: { valid: boolean; checked: number };
}> {
  const now = input.now ?? new Date();
  if (
    !Number.isFinite(now.getTime())
    || !Number.isSafeInteger(input.recordCount)
    || input.recordCount < 1
    || input.recordCount > 10_000
    || !/^[A-Za-z0-9._:-]{1,160}$/.test(input.evaluationRunId)
    || !/^[a-f0-9]{40}$/.test(input.applicationCommit)
    || !/^[a-f0-9]{64}$/.test(input.corpusSha256)
    || !/^[a-f0-9]{64}$/.test(input.resultsEnvelopeSha256)
    || !/^[a-f0-9]{64}$/.test(input.exportDigest)
  ) throw new AiQualityReviewError("AI_QUALITY_REVIEW_INVALID");
  const summary = {
    purpose: "legal_evaluation_persisted_evidence",
    evaluationRunId: input.evaluationRunId,
    applicationCommit: input.applicationCommit,
    corpusSha256: input.corpusSha256,
    resultsEnvelopeSha256: input.resultsEnvelopeSha256,
    exportDigest: input.exportDigest,
    recordCount: input.recordCount,
  };
  const event = await appendEvent({
    db: input.db,
    staff: input.staff,
    action: "query",
    feedbackId: null,
    reviewVersion: 0,
    classification: null,
    filters: {
      purpose: summary.purpose,
      evaluationRunId: summary.evaluationRunId,
      applicationCommit: summary.applicationCommit,
      corpusSha256: summary.corpusSha256,
      resultsEnvelopeSha256: summary.resultsEnvelopeSha256,
    },
    result: summary,
    resultCount: 1,
    feedbackUpdatedAt: null,
    question: "",
    answer: "",
    comment: "",
    notes: "",
    correctedAnswer: null,
    goldenAnswer: null,
    now,
  });
  const accessIntegrity = await verifyAiQualityReviewHistory(input.db, input.staff.userId);
  if (!accessIntegrity.valid) {
    throw new AiQualityReviewError("AI_QUALITY_REVIEW_ACCESS_INTEGRITY_FAILED");
  }
  return {
    accessEventId: event.id,
    accessEventHash: event.eventHash.toLowerCase(),
    accessIntegrity,
  };
}
