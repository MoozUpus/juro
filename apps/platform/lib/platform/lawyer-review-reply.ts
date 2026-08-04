import { z } from "zod";

import { hasLikelyPersonalData } from "./lawyer-review-moderation";

const boundedText = z.string().trim().min(1).max(2_000);
export const lawyerReviewReplyIdSchema = z.string().uuid();

export const lawyerReviewReplySubmissionSchema = z.object({
  body: boundedText,
  clientRequestId: z.string().uuid(),
  locale: z.enum(["ru", "uz"]),
}).strict();

export const lawyerReviewReplyModerationSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  moderatedBody: z.string().trim().max(2_000).optional(),
  reason: boundedText,
  locale: z.enum(["ru", "uz"]),
}).strict().superRefine((value, context) => {
  if (value.decision === "approved" && value.moderatedBody !== undefined && value.moderatedBody.length === 0) {
    context.addIssue({ code: "custom", path: ["moderatedBody"], message: "Moderated reply must not be empty." });
  }
});

export const lawyerReviewReplyListSchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).default("pending"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

export type LawyerReviewReplyCode =
  | "INVALID_INPUT"
  | "LIKELY_PERSONAL_DATA"
  | "REPLY_CONFLICT"
  | "REPLY_UNAVAILABLE"
  | "REVIEW_UNAVAILABLE";

export class LawyerReviewReplyError extends Error {
  constructor(public readonly code: LawyerReviewReplyCode) {
    super(code);
  }
}

type ReplyLifecycleInput = {
  db: D1Database;
  now: Date;
};

type ReviewForReply = {
  id: string;
  workspaceId: string;
  lawyerProfileId: string;
  requesterUserId: string;
  requesterLocale: "ru" | "uz";
};

type ExistingReply = {
  id: string;
  reviewId: string;
  body: string;
  status: "pending" | "approved" | "rejected";
  version: number;
};

function localizedNotification(locale: "ru" | "uz", kind: "submitted" | "approved" | "rejected") {
  if (locale === "uz") {
    if (kind === "submitted") return { title: "Yurist fikringizga javob berdi", body: "Javob xavfsizlik tekshiruvidan so‘ng ko‘rinadi." };
    if (kind === "approved") return { title: "Fikrga javob tasdiqlandi", body: "Javob yurist profilida chop etildi." };
    return { title: "Fikrga javobni tuzatish kerak", body: "Javob moderatsiyadan o‘tmadi. Uni tuzatib qayta yuborish mumkin." };
  }
  if (kind === "submitted") return { title: "Юрист ответил на ваш отзыв", body: "Ответ появится после проверки безопасности." };
  if (kind === "approved") return { title: "Ответ на отзыв одобрен", body: "Ответ опубликован в профиле юриста." };
  return { title: "Ответ на отзыв нужно исправить", body: "Ответ не прошёл модерацию. Его можно исправить и отправить снова." };
}

export async function submitLawyerReviewReply(input: ReplyLifecycleInput & {
  actorUserId: string;
  reviewId: string;
  body: string;
  clientRequestId: string;
}) {
  const review = await input.db.prepare(
    `SELECT r.id,r.workspace_id AS workspaceId,r.lawyer_profile_id AS lawyerProfileId,
      r.requester_user_id AS requesterUserId,
      CASE WHEN requester.locale='uz' THEN 'uz' ELSE 'ru' END AS requesterLocale
     FROM lawyer_reviews r
     JOIN lawyer_review_moderation moderation ON moderation.review_id=r.id AND moderation.decision='approved'
     JOIN lawyer_profiles profile ON profile.id=r.lawyer_profile_id
       AND profile.user_id=? AND profile.status='public_approved'
     JOIN user_profiles requester ON requester.id=r.requester_user_id
     WHERE r.id=? AND r.status='approved' LIMIT 1`,
  ).bind(input.actorUserId, input.reviewId).first<ReviewForReply>();
  if (!review) throw new LawyerReviewReplyError("REVIEW_UNAVAILABLE");

  const replay = await input.db.prepare(
    `SELECT id,review_id AS reviewId,body,status,version FROM lawyer_review_replies
     WHERE author_user_id=? AND client_request_id=? LIMIT 1`,
  ).bind(input.actorUserId, input.clientRequestId).first<ExistingReply>();
  if (replay) {
    if (replay.reviewId !== input.reviewId || replay.body !== input.body) throw new LawyerReviewReplyError("REPLY_CONFLICT");
    return { ...replay, replayed: true };
  }

  const latest = await input.db.prepare(
    `SELECT id,review_id AS reviewId,body,status,version FROM lawyer_review_replies
     WHERE review_id=? ORDER BY version DESC LIMIT 1`,
  ).bind(input.reviewId).first<ExistingReply>();
  if (latest && latest.status !== "rejected") throw new LawyerReviewReplyError("REPLY_CONFLICT");

  const id = crypto.randomUUID();
  const now = input.now.toISOString();
  const version = (latest?.version ?? 0) + 1;
  const notification = localizedNotification(review.requesterLocale, "submitted");
  try {
    await input.db.batch([
      input.db.prepare(
        `INSERT INTO lawyer_review_replies
          (id,review_id,version,lawyer_profile_id,author_user_id,client_request_id,body,status,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,'pending',?,?)`,
      ).bind(id, review.id, version, review.lawyerProfileId, input.actorUserId, input.clientRequestId, input.body, now, now),
      input.db.prepare(
        `INSERT INTO workspace_audit_events
          (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
         VALUES (?,?,?,'lawyer_review_reply',?,'lawyer_review_reply_submitted',?,?)`,
      ).bind(crypto.randomUUID(), review.workspaceId, input.actorUserId, id, JSON.stringify({ reviewId: review.id, version }), now),
      input.db.prepare(
        `INSERT INTO notifications
          (id,workspace_id,user_id,document_id,type,title,body,read_at,created_at)
         VALUES (?,?,?,NULL,'lawyer_review_reply',?,?,NULL,?)`,
      ).bind(crypto.randomUUID(), review.workspaceId, review.requesterUserId, notification.title, notification.body, now),
    ]);
  } catch {
    const winner = await input.db.prepare(
      `SELECT id,review_id AS reviewId,body,status,version FROM lawyer_review_replies
       WHERE author_user_id=? AND client_request_id=? LIMIT 1`,
    ).bind(input.actorUserId, input.clientRequestId).first<ExistingReply>();
    if (winner && winner.reviewId === input.reviewId && winner.body === input.body) return { ...winner, replayed: true };
    throw new LawyerReviewReplyError("REPLY_CONFLICT");
  }
  return { id, reviewId: review.id, body: input.body, status: "pending" as const, version, replayed: false };
}

export async function listLawyerReviewReplies(input: {
  db: D1Database;
  status: "pending" | "approved" | "rejected";
  limit: number;
}) {
  const rows = await input.db.prepare(
    `SELECT reply.id,reply.review_id AS reviewId,reply.version,reply.body,reply.status,
      reply.created_at AS createdAt,profile.display_name AS lawyerName,
      review.overall_rating AS overallRating,COALESCE(reviewModeration.moderated_body,review.body) AS reviewBody
     FROM lawyer_review_replies reply
     JOIN lawyer_reviews review ON review.id=reply.review_id AND review.status='approved'
     JOIN lawyer_review_moderation reviewModeration ON reviewModeration.review_id=review.id AND reviewModeration.decision='approved'
     JOIN lawyer_profiles profile ON profile.id=reply.lawyer_profile_id
     WHERE reply.status=? ORDER BY reply.created_at ASC,reply.id ASC LIMIT ?`,
  ).bind(input.status, input.limit).all<{
    id: string; reviewId: string; version: number; body: string; status: string;
    createdAt: string; lawyerName: string; overallRating: number; reviewBody: string | null;
  }>();
  return rows.results;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (item) => item.toString(16).padStart(2, "0")).join("");
}

export async function moderateLawyerReviewReply(input: ReplyLifecycleInput & {
  moderatorUserId: string;
  replyId: string;
  decision: "approved" | "rejected";
  moderatedBody?: string;
  reason: string;
}) {
  const reply = await input.db.prepare(
    `SELECT reply.id,reply.review_id AS reviewId,reply.body,reply.version,reply.status,
      review.workspace_id AS workspaceId,reply.author_user_id AS authorUserId,
      CASE WHEN author.locale='uz' THEN 'uz' ELSE 'ru' END AS authorLocale,
      author.default_workspace_id AS authorWorkspaceId
     FROM lawyer_review_replies reply
     JOIN lawyer_reviews review ON review.id=reply.review_id
     JOIN user_profiles author ON author.id=reply.author_user_id
     WHERE reply.id=? LIMIT 1`,
  ).bind(input.replyId).first<{
    id: string; reviewId: string; body: string; version: number; status: string;
    workspaceId: string; authorUserId: string; authorLocale: "ru" | "uz"; authorWorkspaceId: string | null;
  }>();
  if (!reply || reply.status !== "pending") throw new LawyerReviewReplyError("REPLY_UNAVAILABLE");
  const effectiveBody = input.moderatedBody ?? reply.body;
  if (input.decision === "approved" && hasLikelyPersonalData(effectiveBody)) {
    throw new LawyerReviewReplyError("LIKELY_PERSONAL_DATA");
  }
  const now = input.now.toISOString();
  const originalBodySha256 = await sha256(reply.body);
  const notification = localizedNotification(reply.authorLocale, input.decision);
  try {
    await input.db.batch([
      input.db.prepare(
        `INSERT INTO lawyer_review_reply_moderation
          (id,reply_id,moderator_user_id,decision,moderated_body,reason,original_body_sha256,created_at)
         VALUES (?,?,?,?,?,?,?,?)`,
      ).bind(crypto.randomUUID(), reply.id, input.moderatorUserId, input.decision, input.moderatedBody ?? null, input.reason, originalBodySha256, now),
      input.db.prepare(
        `INSERT INTO workspace_audit_events
          (id,workspace_id,actor_user_id,entity_type,entity_id,action,metadata_json,created_at)
         VALUES (?,?,?,'lawyer_review_reply',?,'lawyer_review_reply_moderated',?,?)`,
      ).bind(crypto.randomUUID(), reply.workspaceId, input.moderatorUserId, reply.id, JSON.stringify({ reviewId: reply.reviewId, version: reply.version, decision: input.decision, originalBodySha256 }), now),
      input.db.prepare(
        `INSERT INTO notifications
          (id,workspace_id,user_id,document_id,type,title,body,read_at,created_at)
         VALUES (?,?,?,NULL,'lawyer_review_reply_moderation',?,?,NULL,?)`,
      ).bind(crypto.randomUUID(), reply.authorWorkspaceId, reply.authorUserId, notification.title, notification.body, now),
    ]);
  } catch {
    throw new LawyerReviewReplyError("REPLY_UNAVAILABLE");
  }
  return { id: reply.id, status: input.decision, originalBodySha256 };
}

export function localizedLawyerReviewReplyError(locale: "ru" | "uz", code: LawyerReviewReplyCode) {
  const ru = locale === "ru";
  const messages: Record<LawyerReviewReplyCode, string> = {
    INVALID_INPUT: ru ? "Проверьте текст ответа." : "Javob matnini tekshiring.",
    LIKELY_PERSONAL_DATA: ru ? "Удалите персональные данные перед публикацией." : "Nashrdan oldin shaxsiy ma’lumotlarni olib tashlang.",
    REPLY_CONFLICT: ru ? "Для этого отзыва уже есть ответ на проверке или опубликованный ответ." : "Bu fikr uchun tekshirilayotgan yoki chop etilgan javob mavjud.",
    REPLY_UNAVAILABLE: ru ? "Ответ уже обработан или недоступен." : "Javob allaqachon ko‘rib chiqilgan yoki mavjud emas.",
    REVIEW_UNAVAILABLE: ru ? "Опубликованный отзыв недоступен для ответа." : "Chop etilgan fikrga javob berib bo‘lmaydi.",
  };
  return messages[code];
}
