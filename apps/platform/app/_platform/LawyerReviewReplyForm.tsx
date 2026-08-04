"use client";

import { Check, LoaderCircle, MessageSquareReply, ShieldCheck } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
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
  const ru = locale === "ru";
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
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || (ru ? "Не удалось отправить ответ." : "Javobni yuborib bo‘lmadi."));
      setBody(""); requestId.current = crypto.randomUUID();
      setAnnouncement(ru ? "Ответ отправлен на проверку. До одобрения он не публикуется." : "Javob tekshiruvga yuborildi. Tasdiqlanmaguncha chop etilmaydi.");
      await onSubmitted();
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    finally { setBusy(false); }
  }

  const statusLabel = replyStatus === "approved"
    ? (ru ? "Ответ опубликован" : "Javob chop etildi")
    : replyStatus === "pending"
      ? (ru ? "Ответ проверяется" : "Javob tekshirilmoqda")
      : (ru ? "Ответ отклонён — его можно исправить" : "Javob rad etildi — uni tuzatish mumkin");

  return <section className="lawyer-review-reply-editor" aria-labelledby={`lawyer-review-${reviewId}`}>
    <header><MessageSquareReply aria-hidden="true" /><div><small>{ru ? "Опубликованный отзыв" : "Chop etilgan fikr"}</small><h2 id={`lawyer-review-${reviewId}`}>{overallRating}/5</h2></div></header>
    <blockquote>{reviewBody || (ru ? "Пользователь оставил оценку без комментария." : "Foydalanuvchi izohsiz baho qoldirdi.")}</blockquote>
    {replyStatus && <div className={`lawyer-review-reply-state state-${replyStatus}`}><ShieldCheck aria-hidden="true" /><div><strong>{statusLabel}</strong>{replyBody && <p>{replyBody}</p>}{replyVersion && <small>{ru ? `Версия ${replyVersion}` : `${replyVersion}-versiya`}</small>}</div></div>}
    {(!replyStatus || replyStatus === "rejected") && <form onSubmit={(event) => void submit(event)} aria-busy={busy}>
      <label>{ru ? "Публичный ответ" : "Ommaviy javob"}<textarea required minLength={1} maxLength={2000} value={body} onChange={(event) => setBody(event.target.value)} disabled={busy} /></label>
      <small>{ru ? "Не указывайте контакты, номера документов или другие персональные данные." : "Kontaktlar, hujjat raqamlari yoki boshqa shaxsiy ma’lumotlarni ko‘rsatmang."}</small>
      <button type="submit" disabled={busy || !body.trim()}>{busy ? <LoaderCircle className="spin" aria-hidden="true" /> : <Check aria-hidden="true" />}{ru ? "Отправить на проверку" : "Tekshiruvga yuborish"}</button>
    </form>}
    {error && <p className="plan-error" role="alert">{error}</p>}
    {announcement && <p className="lawyer-handoff-success" role="status">{announcement}</p>}
  </section>;
}
