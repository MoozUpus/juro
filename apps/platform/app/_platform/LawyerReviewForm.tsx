"use client";

import { type FormEvent, useState } from "react";
import type { PlatformLocale } from "../../lib/platform/routing";

const ratingValues = [5, 4, 3, 2, 1] as const;

type RatingField = "overallRating" | "speedRating" | "qualityRating" | "communicationRating";
type Ratings = Record<RatingField, number>;

export function LawyerReviewForm({ requestId, locale }: { requestId: string; locale: PlatformLocale }) {
  const ru = locale === "ru";
  const [ratings, setRatings] = useState<Ratings>({ overallRating: 5, speedRating: 5, qualityRating: 5, communicationRating: 5 });
  const [body, setBody] = useState("");
  const [state, setState] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const labels: Record<RatingField, string> = ru
    ? { overallRating: "Общая оценка", speedRating: "Скорость", qualityRating: "Качество", communicationRating: "Коммуникация" }
    : { overallRating: "Umumiy baho", speedRating: "Tezlik", qualityRating: "Sifat", communicationRating: "Muloqot" };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true); setState("");
    try {
      const response = await fetch(`/api/platform/lawyer-requests/${encodeURIComponent(requestId)}/review`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ ...ratings, body: body.trim() || undefined, locale }),
      });
      const payload = await response.json() as { error?: string };
      setState(response.ok
        ? (ru ? "Спасибо, отзыв передан на модерацию." : "Rahmat, fikr moderatsiyaga yuborildi.")
        : (payload.error || (ru ? "Не удалось отправить отзыв." : "Fikr yuborilmadi.")));
    } catch {
      setState(ru ? "Не удалось отправить отзыв." : "Fikr yuborilmadi.");
    } finally { setSubmitting(false); }
  }

  return <form className="lawyer-review-form" onSubmit={(event) => void submit(event)}>
    <h3>{ru ? "Оценить работу юриста" : "Yurist ishini baholash"}</h3>
    <div className="lawyer-review-ratings">
      {(Object.keys(labels) as RatingField[]).map((field) => <label key={field}>{labels[field]}
        <select value={ratings[field]} disabled={submitting} onChange={(event) => setRatings((current) => ({ ...current, [field]: Number(event.target.value) }))}>
          {ratingValues.map((value) => <option key={value} value={value}>{value}/5</option>)}
        </select>
      </label>)}
    </div>
    <label>{ru ? "Комментарий (необязательно)" : "Izoh (ixtiyoriy)"}
      <textarea value={body} maxLength={2000} disabled={submitting} onChange={(event) => setBody(event.target.value)} />
    </label>
    <button type="submit" disabled={submitting}>{submitting ? (ru ? "Отправляется…" : "Yuborilmoqda…") : (ru ? "Отправить отзыв" : "Fikr yuborish")}</button>
    {state && <p role="status">{state}</p>}
  </form>;
}