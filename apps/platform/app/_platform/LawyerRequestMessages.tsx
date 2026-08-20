"use client";

/* eslint-disable react-hooks/set-state-in-effect -- authenticated request history is loaded after initial browser render */

import { LoaderCircle, Paperclip, Send } from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import type { PlatformLocale } from "../../lib/platform/routing";
import { usePlatformBasePath } from "./PlatformRouteContext";

type Message = {
  id: string;
  authorRole: "owner" | "lawyer";
  body: string;
  readAt: string | null;
  createdAt: string;
  documentId: string | null;
  documentTitle: string | null;
  documentStatus: string | null;
  attachmentStatus: "sent" | "viewed" | null;
};

type DocumentOption = {
  id: string;
  title: string;
  status: string;
};

export function LawyerRequestMessages({
  requestId,
  locale,
}: {
  requestId: string;
  locale: PlatformLocale;
}) {
  const ru = locale === "ru";
  const base = usePlatformBasePath();
  const [messages, setMessages] = useState<Message[]>([]);
  const [documents, setDocuments] = useState<DocumentOption[]>([]);
  const [role, setRole] = useState<"client" | "lawyer">("client");
  const [body, setBody] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const response = await fetch(
      `/api/platform/lawyer-requests/${encodeURIComponent(requestId)}/messages`,
      { cache: "no-store" },
    );
    const payload = await response.json() as {
      messages?: Message[];
      documents?: DocumentOption[];
      unreadCount?: number;
      role?: "client" | "lawyer";
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error || "Ошибка");
    const nextRole = payload.role || "client";
    const nextMessages = payload.messages || [];
    setRole(nextRole);
    setMessages(nextMessages);
    setDocuments(payload.documents || []);
    if ((payload.unreadCount ?? 0) > 0) {
      const readResponse = await fetch(
        `/api/platform/lawyer-requests/${encodeURIComponent(requestId)}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-juro-csrf": "1" },
          body: JSON.stringify({ action: "mark_read", locale }),
        },
      );
      if (!readResponse.ok) {
        const readPayload = await readResponse.json() as { error?: string };
        throw new Error(readPayload.error || "Ошибка");
      }
      const ownAuthorRole = nextRole === "client" ? "owner" : "lawyer";
      const readAt = new Date().toISOString();
      setMessages(nextMessages.map((message) => message.authorRole === ownAuthorRole
        ? message
        : { ...message, readAt, attachmentStatus: message.documentId ? "viewed" : null }));
    }
  }, [locale, requestId]);

  useEffect(() => {
    void load().catch((value) =>
      setError(value instanceof Error ? value.message : String(value)));
  }, [load]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() && !documentId) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/platform/lawyer-requests/${encodeURIComponent(requestId)}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-juro-csrf": "1" },
          body: JSON.stringify({
            action: "send",
            body: body.trim(),
            documentId: documentId || undefined,
            locale,
          }),
        },
      );
      const payload = await response.json() as {
        message?: Message;
        error?: string;
      };
      if (!response.ok || !payload.message) {
        throw new Error(payload.error || "Ошибка");
      }
      setMessages((current) => [...current, payload.message!]);
      setBody("");
      setDocumentId("");
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusy(false);
    }
  }

  const ownAuthorRole = role === "client" ? "owner" : "lawyer";
  return (
    <section
      className="lawyer-request-messages"
      aria-label={ru ? "Переписка по заявке" : "So‘rov bo‘yicha yozishma"}
    >
      <h3>{ru ? "Сообщения" : "Xabarlar"}</h3>
      {error && (
        <p className="plan-error" role="alert">
          {error}{" "}
          <button
            type="button"
            className="secondary"
            onClick={() => void load().catch((value) =>
              setError(value instanceof Error ? value.message : String(value)))}
          >
            {ru ? "Повторить" : "Qayta urinish"}
          </button>
        </p>
      )}
      <div className="lawyer-message-list" aria-live="polite">
        {messages.length ? messages.map((message) => {
          const own = message.authorRole === ownAuthorRole;
          return (
            <article key={message.id}>
              <strong>
                {message.authorRole === "lawyer"
                  ? (ru ? "Юрист" : "Yurist")
                  : (ru ? "Владелец дела" : "Ish egasi")}
              </strong>
              {message.body && <p>{message.body}</p>}
              {message.documentId && (
                <Link href={`${base}/documents/${encodeURIComponent(message.documentId)}`}>
                  <Paperclip aria-hidden="true" />
                  {message.documentTitle || (ru ? "Открыть документ" : "Hujjatni ochish")}
                  {message.documentStatus ? ` · ${message.documentStatus}` : ""}
                </Link>
              )}
              <time dateTime={message.createdAt}>
                {new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", {
                  dateStyle: "short",
                  timeStyle: "short",
                  timeZone: "Asia/Tashkent",
                }).format(new Date(message.createdAt))}
                {own
                  ? ` · ${message.readAt ? (ru ? "Прочитано" : "O‘qilgan") : (ru ? "Отправлено" : "Yuborilgan")}`
                  : ""}
              </time>
            </article>
          );
        }) : <p>{ru ? "Сообщений пока нет." : "Hozircha xabarlar yo‘q."}</p>}
      </div>
      <form onSubmit={(event) => void send(event)}>
        <label>
          {ru ? "Сообщение" : "Xabar"}
          <textarea
            maxLength={4_000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </label>
        <label>
          {ru ? "Прикрепить свой документ" : "O‘z hujjatingizni biriktiring"}
          <select value={documentId} onChange={(event) => setDocumentId(event.target.value)}>
            <option value="">{ru ? "Без документа" : "Hujjatsiz"}</option>
            {documents.map((document) => (
              <option value={document.id} key={document.id}>
                {document.title} · {document.status}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={busy || (!body.trim() && !documentId)}>
          {busy ? <LoaderCircle className="spin" /> : <Send aria-hidden="true" />}
          {ru ? "Отправить" : "Yuborish"}
        </button>
      </form>
    </section>
  );
}
