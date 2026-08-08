"use client";

/* eslint-disable react-hooks/set-state-in-effect -- authenticated request history is loaded after initial browser render */

import { FormEvent, useCallback, useEffect, useState } from "react";
import type { PlatformLocale } from "../../lib/platform/routing";

type Message = { id: string; authorRole: "owner" | "lawyer"; body: string; createdAt: string };

export function LawyerRequestMessages({ requestId, locale }: { requestId: string; locale: PlatformLocale }) {
  const ru = locale === "ru";
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(`/api/platform/lawyer-requests/${encodeURIComponent(requestId)}/messages`, { cache: "no-store" });
    const payload = await response.json() as { messages?: Message[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Ошибка");
    setMessages(payload.messages || []);
  }, [requestId]);
  useEffect(() => { void load().catch((value) => setError(value instanceof Error ? value.message : String(value))); }, [load]);
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!body.trim()) return; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/platform/lawyer-requests/${encodeURIComponent(requestId)}/messages`, { method: "POST", headers: { "content-type": "application/json", "x-juro-csrf": "1" }, body: JSON.stringify({ body, locale }) });
      const payload = await response.json() as { message?: Message; error?: string };
      if (!response.ok || !payload.message) throw new Error(payload.error || "Ошибка");
      setMessages((current) => [...current, payload.message!]); setBody("");
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); } finally { setBusy(false); }
  }
  return <section className="lawyer-request-messages" aria-label={ru ? "Переписка по заявке" : "So‘rov bo‘yicha yozishma"}>
    <h3>{ru ? "Переписка по заявке" : "So‘rov bo‘yicha yozishma"}</h3>
    {error && <p className="plan-error" role="alert">{error}</p>}
    <div className="lawyer-message-list" aria-live="polite">{messages.length ? messages.map((message) => <article key={message.id}><strong>{message.authorRole === "lawyer" ? (ru ? "Юрист" : "Yurist") : (ru ? "Владелец дела" : "Ish egasi")}</strong><p>{message.body}</p><time dateTime={message.createdAt}>{new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Tashkent" }).format(new Date(message.createdAt))}</time></article>) : <p>{ru ? "Сообщений пока нет." : "Hozircha xabarlar yo‘q."}</p>}</div>
    <form onSubmit={(event) => void send(event)}><label>{ru ? "Сообщение" : "Xabar"}<textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={4000} required disabled={busy} /></label><button type="submit" disabled={busy || !body.trim()}>{ru ? "Отправить" : "Yuborish"}</button></form>
  </section>;
}