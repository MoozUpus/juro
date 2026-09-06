"use client";

import { Check, LoaderCircle, MessageSquareReply, ShieldCheck } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { lawyerText } from "../../lib/platform/lawyer-localization";
import { localizedLawyerReviewReplyError } from "../../lib/platform/lawyer-review-reply";
import type { PlatformLocale } from "../../lib/platform/routing";

type ReplyStatus = "pending" | "approved" | "rejected";

export function LawyerReviewReplyForm({
  reviewId, reviewBody, overallRating, replyBody, replyStatus, replyVersion, locale, onSubmitted,
}: {
  reviewId: string;
  reviewBody: string | null;
  overallRating: number;
  replyBody?: string | null;
  replyStatus?: ReplyStatus | null;
  replyVersion?: number | null;
  locale: PlatformLocale;
  onSubmitted: () => Promise<void>;
}) {
  const text = (russian: string, uzbek: string, english: string) => lawyerText(locale, russian, uzbek, english);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const requestId = useRef(crypto.randomUUID());

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true); setError(""); setAnnouncement("");
    try {
      const response = await fetch(`/api/platform/lawyer-reviews/${encodeURIComponent(reviewId)}/reply`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ body: body.trim(), clientRequestId: requestId.current, locale }),
      });
      const payload = await response.json() as { code?: string };
      if (!response.ok) {
        const code = payload.code;
        throw new Error(
          code === "LIKELY_PERSONAL_DATA" || code === "REPLY_CONFLICT" || code === "REPLY_UNAVAILABLE" || code === "REVIEW_UNAVAILABLE"
            ? localizedLawyerReviewReplyError(locale, code)
            : localizedLawyerReviewReplyError(locale, "INVALID_INPUT"),
        );
      }
      setBody(""); requestId.current = crypto.randomUUID();
      setAnnouncement(text("Ответ отправлен на проверку. До одобрения он не публикуется.", "Javob tekshiruvga yuborildi. Tasdiqlanmaguncha chop etilmaydi.", "Your reply has been submitted for review and will remain private until approved."));
      await onSubmitted();
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    finally { setBusy(false); }
  }

  const statusLabel = replyStatus === "approved"
    ? text("Ответ опубликован", "Javob chop etildi", "Reply published")
    : replyStatus === "pending"
      ? text("Ответ проверяется", "Javob tekshirilmoqda", "Reply under review")
      : text("Ответ отклонён — его можно исправить", "Javob rad etildi — uni tuzatish mumkin", "Reply rejected — you can revise it");

  return <section className="lawyer-review-reply-editor" aria-labelledby={`lawyer-review-${reviewId}`}>
    <header><MessageSquareReply aria-hidden="true" /><div><small>{text("Опубликованный отзыв", "Chop etilgan fikr", "Published review")}</small><h2 id={`lawyer-review-${reviewId}`}>{overallRating}/5</h2></div></header>
    <blockquote>{reviewBody || text("Пользователь оставил оценку без комментария.", "Foydalanuvchi izohsiz baho qoldirdi.", "The client left a rating without a written comment.")}</blockquote>
    {replyStatus && <div className={`lawyer-review-reply-state state-${replyStatus}`}><ShieldCheck aria-hidden="true" /><div><strong>{statusLabel}</strong>{replyBody && <p>{replyBody}</p>}{replyVersion && <small>{text(`Версия ${replyVersion}`, `${replyVersion}-versiya`, `Version ${replyVersion}`)}</small>}</div></div>}
    {(!replyStatus || replyStatus === "rejected") && <form onSubmit={(event) => void submit(event)} aria-busy={busy}>
      <label>{text("Публичный ответ", "Ommaviy javob", "Public reply")}<textarea required minLength={1} maxLength={2000} value={body} onChange={(event) => setBody(event.target.value)} disabled={busy} /></label>
      <small>{text("Не указывайте контакты, номера документов или другие персональные данные.", "Kontaktlar, hujjat raqamlari yoki boshqa shaxsiy ma’lumotlarni ko‘rsatmang.", "Do not include contact details, document numbers, or other personal data.")}</small>
      <button type="submit" disabled={busy || !body.trim()}>{busy ? <LoaderCircle className="spin" aria-hidden="true" /> : <Check aria-hidden="true" />}{text("Отправить на проверку", "Tekshiruvga yuborish", "Submit for review")}</button>
    </form>}
    {error && <p className="plan-error" role="alert">{error}</p>}
    {announcement && <p className="lawyer-handoff-success" role="status">{announcement}</p>}
  </section>;
}
