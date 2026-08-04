"use client";

import { Check, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

type Locale = "ru" | "uz";
type ReviewStatus = "pending" | "approved" | "rejected";
type Review = {
  id: string; lawyerRequestId: string; lawyerName: string; body: string | null;
  overallRating: number; speedRating: number; qualityRating: number; communicationRating: number;
  status: ReviewStatus; createdAt: string;
};

const copy = {
  ru: {
    title: "Модерация отзывов о юристах", description: "Private review queue. Одобрение не публикует отзыв автоматически; исходный текст остаётся неизменным в журнале.",
    refresh: "Обновить", pending: "Ожидают", approved: "Одобрены", rejected: "Отклонены", none: "По выбранному статусу отзывов нет.",
    ratings: "Оценки", comment: "Исходный отзыв", noComment: "Пользователь не оставил комментарий.", moderate: "Проверить", decision: "Решение", approve: "Одобрить", reject: "Отклонить",
    edited: "Текст после удаления персональных данных (необязательно)", reason: "Основание решения", reasonHint: "Не менее 1 символа. Укажите, что было проверено.", save: "Сохранить решение", cancel: "Отмена",
    success: "Решение сохранено в защищённом журнале.", error: "Не удалось выполнить запрос.", protected: "Защищённый контур · свежая 2FA", status: "Статус",
  },
  uz: {
    title: "Yuristlar haqidagi fikrlarni moderatsiya qilish", description: "Private review queue. Tasdiqlash fikrni avtomatik nashr qilmaydi; asl matn jurnalga o‘zgarmas holda saqlanadi.",
    refresh: "Yangilash", pending: "Kutilmoqda", approved: "Tasdiqlangan", rejected: "Rad etilgan", none: "Tanlangan holat bo‘yicha fikrlar yo‘q.",
    ratings: "Baholar", comment: "Asl fikr", noComment: "Foydalanuvchi izoh qoldirmadi.", moderate: "Tekshirish", decision: "Qaror", approve: "Tasdiqlash", reject: "Rad etish",
    edited: "Shaxsiy ma’lumotlar olib tashlangan matn (ixtiyoriy)", reason: "Qaror asosi", reasonHint: "Kamida 1 belgi. Nima tekshirilganini ko‘rsating.", save: "Qarorni saqlash", cancel: "Bekor qilish",
    success: "Qaror himoyalangan jurnalga saqlandi.", error: "So‘rov bajarilmadi.", protected: "Himoyalangan kontur · yangi 2FA", status: "Holat",
  },
} as const;

async function json<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

export function LawyerReviewModerationInbox({ locale, reviewerName }: { locale: Locale; reviewerName: string }) {
  const t = copy[locale];
  const [status, setStatus] = useState<ReviewStatus>("pending");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [selected, setSelected] = useState<Review | null>(null);
  const [decision, setDecision] = useState<"approved" | "rejected">("approved");
  const [moderatedBody, setModeratedBody] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/platform/admin/lawyer-reviews?status=${encodeURIComponent(status)}`, { cache: "no-store" });
      const payload = await json<{ reviews: Review[] }>(response);
      setReviews(payload.reviews); setSelected(null); setAnnouncement("");
    } catch (value) { setError(value instanceof Error ? value.message : t.error); }
    finally { setBusy(false); }
  }, [status, t.error]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  const choose = (review: Review) => { setSelected(review); setDecision("approved"); setModeratedBody(""); setReason(""); setError(""); setAnnouncement(""); };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!selected || !reason.trim()) return;
    setBusy(true); setError("");
    try {
      await json(await fetch(`/api/platform/admin/lawyer-reviews/${encodeURIComponent(selected.id)}`, {
        method: "PATCH", headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ decision, moderatedBody: moderatedBody.trim() || undefined, reason: reason.trim(), locale }),
      }));
      setAnnouncement(t.success); await load();
    } catch (value) { setError(value instanceof Error ? value.message : t.error); }
    finally { setBusy(false); }
  };
  const date = (value: string) => new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tashkent" }).format(new Date(value));
  const label = (value: ReviewStatus) => t[value];
  return <div className="staff-console">
    <a className="staff-skip" href="#staff-main">{locale === "ru" ? "К очереди" : "Navbatga o‘tish"}</a>
    <header className="staff-topbar"><div className="staff-brand"><ShieldCheck aria-hidden="true"/><span><b>JURO</b><small>LEGAL OPERATIONS</small></span></div><div className="staff-session"><span>{t.protected}</span><b>{reviewerName}</b></div><a href={`/${locale === "ru" ? "uz" : "ru"}/admin/lawyer-reviews`} hrefLang={locale === "ru" ? "uz" : "ru"}>{locale === "ru" ? "UZ" : "RU"}</a></header>
    <main id="staff-main" className="staff-main">
      <section className="staff-heading"><div><span>JURO · REVIEW SAFETY</span><h1>{t.title}</h1><p>{t.description}</p></div><div className="staff-review-toolbar"><a href={`/${locale}/admin/lawyer-review-replies`}>{locale === "ru" ? "Ответы юристов" : "Yurist javoblari"}</a><button type="button" onClick={() => void load()} disabled={busy}><RefreshCw aria-hidden="true"/>{t.refresh}</button></div></section>
      <div className="staff-filters"><label>{t.status}<select value={status} onChange={(event) => setStatus(event.target.value as ReviewStatus)}><option value="pending">{t.pending}</option><option value="approved">{t.approved}</option><option value="rejected">{t.rejected}</option></select></label></div>
      {error && <p className="staff-error" role="alert">{error}<button type="button" onClick={() => void load()}>{t.refresh}</button></p>}
      {announcement && <p role="status" className="staff-verified"><Check aria-hidden="true"/>{announcement}</p>}
      {!busy && reviews.length === 0 && <section className="staff-empty"><ShieldCheck aria-hidden="true"/><h2>{t.none}</h2></section>}
      <section className="staff-queue" aria-busy={busy}>{reviews.map((review) => <article className="staff-table-row" key={review.id}><div className="staff-source"><span>{t.ratings}: {review.overallRating}/5</span><b>{review.lawyerName}</b><small>{date(review.createdAt)}</small></div><div><b>{t.comment}</b><p>{review.body || t.noComment}</p></div><div className={`staff-status status-${review.status}`}>{label(review.status)}</div><div className="staff-row-actions"><button type="button" onClick={() => choose(review)} disabled={busy || review.status !== "pending"}>{t.moderate}</button></div></article>)}</section>
      {selected && <form className="staff-decision" onSubmit={(event) => void submit(event)}><h2>{t.decision}: {selected.lawyerName}</h2><label>{t.decision}<select value={decision} onChange={(event) => setDecision(event.target.value as "approved" | "rejected")}><option value="approved">{t.approve}</option><option value="rejected">{t.reject}</option></select></label><label>{t.edited}<textarea value={moderatedBody} maxLength={2000} onChange={(event) => setModeratedBody(event.target.value)} /></label><label>{t.reason}<textarea required value={reason} minLength={1} maxLength={2000} onChange={(event) => setReason(event.target.value)} /></label><small>{t.reasonHint}</small><div><button type="button" onClick={() => setSelected(null)} disabled={busy}><X aria-hidden="true"/>{t.cancel}</button><button className={decision === "approved" ? "staff-approve" : "staff-reject"} disabled={busy || !reason.trim()} type="submit"><Check aria-hidden="true"/>{t.save}</button></div></form>}
    </main>
  </div>;
}
