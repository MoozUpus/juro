"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";

import { platformApiError } from "../../content/platform-ui";
import type { PlatformLocale } from "../../lib/platform/routing";

const feedbackCopy = {
  ru: {
    saved: "Спасибо. Оценка сохранена.",
    failed: "Не удалось сохранить оценку.",
    title: "Статья помогла?",
    description: "Оценка помогает улучшать инструкции, но не отправляет содержание ваших дел.",
    yes: "Да",
    no: "Нет",
  },
  uz: {
    saved: "Rahmat. Baho saqlandi.",
    failed: "Bahoni saqlab bo‘lmadi.",
    title: "Maqola yordam berdimi?",
    description: "Baho yo‘riqnomalarni yaxshilashga yordam beradi va ishlaringiz mazmunini yubormaydi.",
    yes: "Ha",
    no: "Yo‘q",
  },
  en: {
    saved: "Thank you. Your feedback has been saved.",
    failed: "We could not save your feedback.",
    title: "Was this article helpful?",
    description: "Your rating helps us improve these instructions. It never sends the contents of your matters.",
    yes: "Yes",
    no: "No",
  },
} as const;

export function KnowledgeBaseFeedback({ articleSlug, versionId, locale }: { articleSlug: string; versionId: string; locale: PlatformLocale }) {
  const copy = feedbackCopy[locale];
  const [selection, setSelection] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");

  async function submit(helpful: boolean) {
    setPending(true); setStatus("");
    const key = `kb-feedback-${crypto.randomUUID()}`;
    try {
      const response = await fetch(`/api/platform/help/articles/${encodeURIComponent(articleSlug)}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1", "x-juro-locale": locale, "idempotency-key": key },
        body: JSON.stringify({ versionId, helpful }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(platformApiError(locale, body.error, copy.failed));
      setSelection(helpful);
      setStatus(copy.saved);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : copy.failed);
    } finally { setPending(false); }
  }

  return <section className="knowledge-feedback" aria-labelledby="knowledge-feedback-title" aria-busy={pending}>
    <div><h2 id="knowledge-feedback-title">{copy.title}</h2><p>{copy.description}</p></div>
    <span>
      <button type="button" aria-pressed={selection === true} disabled={pending} onClick={() => void submit(true)}><ThumbsUp aria-hidden="true" />{copy.yes}</button>
      <button type="button" aria-pressed={selection === false} disabled={pending} onClick={() => void submit(false)}><ThumbsDown aria-hidden="true" />{copy.no}</button>
    </span>
    <p className="knowledge-feedback-status" role="status" aria-live="polite">{status}</p>
  </section>;
}
