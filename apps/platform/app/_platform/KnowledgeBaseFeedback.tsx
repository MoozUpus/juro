"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";

import type { PlatformLocale } from "../../lib/platform/routing";

export function KnowledgeBaseFeedback({ articleSlug, versionId, locale }: { articleSlug: string; versionId: string; locale: PlatformLocale }) {
  const ru = locale === "ru";
  const [selection, setSelection] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");

  async function submit(helpful: boolean) {
    setPending(true); setStatus("");
    const key = `kb-feedback-${crypto.randomUUID()}`;
    try {
      const response = await fetch(`/api/platform/help/articles/${encodeURIComponent(articleSlug)}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1", "idempotency-key": key },
        body: JSON.stringify({ versionId, helpful }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Feedback unavailable");
      setSelection(helpful);
      setStatus(ru ? "Спасибо. Оценка сохранена." : "Rahmat. Baho saqlandi.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : (ru ? "Не удалось сохранить оценку." : "Bahoni saqlab bo‘lmadi."));
    } finally { setPending(false); }
  }

  return <section className="knowledge-feedback" aria-labelledby="knowledge-feedback-title" aria-busy={pending}>
    <div><h2 id="knowledge-feedback-title">{ru ? "Статья помогла?" : "Maqola yordam berdimi?"}</h2><p>{ru ? "Оценка помогает улучшать инструкции, но не отправляет содержание ваших дел." : "Baho yo‘riqnomalarni yaxshilashga yordam beradi va ishlaringiz mazmunini yubormaydi."}</p></div>
    <span>
      <button type="button" aria-pressed={selection === true} disabled={pending} onClick={() => void submit(true)}><ThumbsUp aria-hidden="true" />{ru ? "Да" : "Ha"}</button>
      <button type="button" aria-pressed={selection === false} disabled={pending} onClick={() => void submit(false)}><ThumbsDown aria-hidden="true" />{ru ? "Нет" : "Yo‘q"}</button>
    </span>
    <p className="knowledge-feedback-status" role="status" aria-live="polite">{status}</p>
  </section>;
}
