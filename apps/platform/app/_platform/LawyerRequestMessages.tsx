"use client";

/* eslint-disable react-hooks/set-state-in-effect -- authenticated request history is loaded after initial browser render */

import {
  Copy,
  LoaderCircle,
  Paperclip,
  Pin,
  PinOff,
  Reply,
  RotateCcw,
  Search,
  Send,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
  replyToMessageId: string | null;
  replyAuthorRole: "owner" | "lawyer" | null;
  replyBody: string | null;
  pinnedAt: string | null;
  pinnedByUserId: string | null;
};

type DocumentOption = {
  id: string;
  title: string;
  status: string;
};

type Draft = {
  body: string;
  documentId: string;
  replyToMessageId?: string;
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
  const [query, setQuery] = useState("");
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [retryDraft, setRetryDraft] = useState<Draft | null>(null);
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pinningId, setPinningId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const typingTimer = useRef<number | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setError("");
    const response = await fetch(
      `/api/platform/lawyer-requests/${encodeURIComponent(requestId)}/messages`,
      { cache: "no-store" },
    );
    const payload = await response.json() as {
      messages?: Message[];
      documents?: DocumentOption[];
      unreadCount?: number;
      role?: "client" | "lawyer";
      typing?: { role: "client" | "lawyer"; expiresAt: string } | null;
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error || "Ошибка");
    const nextRole = payload.role || "client";
    const nextMessages = payload.messages || [];
    const ownAuthorRole = nextRole === "client" ? "owner" : "lawyer";
    const firstUnread = nextMessages.find((message) =>
      message.authorRole !== ownAuthorRole && !message.readAt);
    if (firstUnread) setFirstUnreadId((current) => current || firstUnread.id);
    setRole(nextRole);
    setMessages(nextMessages);
    setDocuments(payload.documents || []);
    setOtherTyping(Boolean(payload.typing));
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
      const readAt = new Date().toISOString();
      setMessages(nextMessages.map((message) => message.authorRole === ownAuthorRole
        ? message
        : { ...message, readAt, attachmentStatus: message.documentId ? "viewed" : null }));
    }
  }, [locale, requestId]);

  const setTyping = useCallback(async (typing: boolean) => {
    await fetch(
      `/api/platform/lawyer-requests/${encodeURIComponent(requestId)}/messages`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ action: "typing", typing, locale }),
      },
    );
  }, [locale, requestId]);

  useEffect(() => {
    void load().catch((value) =>
      setError(value instanceof Error ? value.message : String(value)));
    const poll = window.setInterval(() => {
      void load(true).catch(() => undefined);
    }, 3_500);
    return () => window.clearInterval(poll);
  }, [load]);

  useEffect(() => {
    if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
    if (!body.trim()) {
      void setTyping(false).catch(() => undefined);
      return;
    }
    typingTimer.current = window.setTimeout(() => {
      void setTyping(true).catch(() => undefined);
    }, 350);
    return () => {
      if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
    };
  }, [body, setTyping]);

  useEffect(() => () => {
    void setTyping(false).catch(() => undefined);
  }, [setTyping]);

  async function submit(draft: Draft) {
    if (!draft.body.trim() && !draft.documentId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/platform/lawyer-requests/${encodeURIComponent(requestId)}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-juro-csrf": "1" },
          body: JSON.stringify({
            action: "send",
            body: draft.body.trim(),
            documentId: draft.documentId || undefined,
            replyToMessageId: draft.replyToMessageId,
            locale,
          }),
        },
      );
      const payload = await response.json() as { message?: Message; error?: string };
      if (!response.ok || !payload.message) {
        throw new Error(payload.error || "Ошибка");
      }
      setMessages((current) => [...current, payload.message!]);
      setBody("");
      setDocumentId("");
      setReplyingTo(null);
      setRetryDraft(null);
      setNotice(ru ? "Сообщение отправлено." : "Xabar yuborildi.");
      void setTyping(false).catch(() => undefined);
    } catch (value) {
      setRetryDraft(draft);
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusy(false);
    }
  }

  async function pinMessage(message: Message) {
    setPinningId(message.id);
    setError("");
    const pinned = !message.pinnedAt;
    try {
      const response = await fetch(
        `/api/platform/lawyer-requests/${encodeURIComponent(requestId)}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-juro-csrf": "1" },
          body: JSON.stringify({ action: "pin", messageId: message.id, pinned, locale }),
        },
      );
      const payload = await response.json() as { pinnedAt?: string | null; error?: string };
      if (!response.ok) throw new Error(payload.error || "Ошибка");
      setMessages((current) => current.map((item) => ({
        ...item,
        pinnedAt: item.id === message.id
          ? (payload.pinnedAt || null)
          : (pinned ? null : item.pinnedAt),
        pinnedByUserId: item.id === message.id
          ? (pinned ? "current" : null)
          : (pinned ? null : item.pinnedByUserId),
      })));
      setNotice(pinned
        ? (ru ? "Сообщение закреплено для обеих сторон." : "Xabar ikki tomon uchun mahkamlandi.")
        : (ru ? "Сообщение откреплено." : "Xabar mahkamdan olindi."));
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setPinningId("");
    }
  }

  async function copyMessage(message: Message) {
    try {
      await navigator.clipboard.writeText(message.body || message.documentTitle || "");
      setNotice(ru ? "Сообщение скопировано." : "Xabar nusxalandi.");
    } catch {
      setError(ru ? "Не удалось скопировать сообщение." : "Xabarni nusxalab bo‘lmadi.");
    }
  }

  const ownAuthorRole = role === "client" ? "owner" : "lawyer";
  const normalizedQuery = query.trim().toLocaleLowerCase(ru ? "ru" : "uz");
  const visibleMessages = useMemo(() => normalizedQuery
    ? messages.filter((message) => [
      message.body,
      message.documentTitle,
      message.replyBody,
    ].some((value) => value?.toLocaleLowerCase(ru ? "ru" : "uz").includes(normalizedQuery)))
    : messages, [messages, normalizedQuery, ru]);
  const pinnedMessage = messages.find((message) => Boolean(message.pinnedAt));

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit({ body, documentId, replyToMessageId: replyingTo?.id });
  }

  return (
    <section
      className="lawyer-request-messages"
      aria-label={ru ? "Переписка по заявке" : "So‘rov bo‘yicha yozishma"}
    >
      <header className="lawyer-chat-header">
        <div>
          <h3>{ru ? "Сообщения" : "Xabarlar"}</h3>
          <small>{ru ? "Защищённая переписка по этому делу" : "Ushbu ish bo‘yicha himoyalangan yozishma"}</small>
        </div>
        <label className="lawyer-chat-search">
          <Search aria-hidden="true" />
          <span className="sr-only">{ru ? "Поиск по переписке" : "Yozishmalardan qidirish"}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={ru ? "Поиск" : "Qidirish"}
          />
        </label>
      </header>
      {pinnedMessage && (
        <button
          type="button"
          className="lawyer-chat-pinned"
          onClick={() => document.getElementById(`message-${pinnedMessage.id}`)?.scrollIntoView({ block: "center" })}
        >
          <Pin aria-hidden="true" />
          <span>
            <strong>{ru ? "Закреплено" : "Mahkamlangan"}</strong>
            <small>{pinnedMessage.body || pinnedMessage.documentTitle}</small>
          </span>
        </button>
      )}
      {error && (
        <p className="plan-error" role="alert">
          {error}{" "}
          {retryDraft ? (
            <button
              type="button"
              className="secondary"
              onClick={() => void submit(retryDraft)}
              disabled={busy}
            >
              <RotateCcw aria-hidden="true" />
              {ru ? "Повторить отправку" : "Qayta yuborish"}
            </button>
          ) : (
            <button
              type="button"
              className="secondary"
              onClick={() => void load().catch((value) =>
                setError(value instanceof Error ? value.message : String(value)))}
            >
              {ru ? "Повторить" : "Qayta urinish"}
            </button>
          )}
        </p>
      )}
      <p className="sr-only" aria-live="polite">{notice}</p>
      <div className="lawyer-message-list" aria-live="polite">
        {visibleMessages.length ? visibleMessages.map((message) => {
          const own = message.authorRole === ownAuthorRole;
          return (
            <div className="lawyer-message-row" data-own={own ? "true" : "false"} key={message.id}>
              {message.id === firstUnreadId && !normalizedQuery && (
                <div className="lawyer-unread-separator" role="separator">
                  <span>{ru ? "Новые сообщения" : "Yangi xabarlar"}</span>
                </div>
              )}
              <article id={`message-${message.id}`} data-pinned={message.pinnedAt ? "true" : "false"}>
                <header>
                  <strong>
                    {message.authorRole === "lawyer"
                      ? (ru ? "Юрист" : "Yurist")
                      : (ru ? "Владелец дела" : "Ish egasi")}
                  </strong>
                  {message.pinnedAt && <Pin aria-label={ru ? "Закреплено" : "Mahkamlangan"} />}
                </header>
                {message.replyToMessageId && (
                  <blockquote>
                    <strong>{message.replyAuthorRole === "lawyer" ? (ru ? "Юрист" : "Yurist") : (ru ? "Владелец дела" : "Ish egasi")}</strong>
                    <span>{message.replyBody || (ru ? "Вложение" : "Ilova")}</span>
                  </blockquote>
                )}
                {message.body && <p>{message.body}</p>}
                {message.documentId && (
                  <Link href={`${base}/documents/${encodeURIComponent(message.documentId)}`}>
                    <Paperclip aria-hidden="true" />
                    {message.documentTitle || (ru ? "Открыть документ" : "Hujjatni ochish")}
                    {message.documentStatus ? ` · ${message.documentStatus}` : ""}
                  </Link>
                )}
                <footer>
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
                  <span className="lawyer-message-actions">
                    <button type="button" onClick={() => setReplyingTo(message)}>
                      <Reply aria-hidden="true" />
                      <span className="sr-only">{ru ? "Ответить" : "Javob berish"}</span>
                    </button>
                    <button type="button" onClick={() => void copyMessage(message)} disabled={!message.body && !message.documentTitle}>
                      <Copy aria-hidden="true" />
                      <span className="sr-only">{ru ? "Копировать" : "Nusxalash"}</span>
                    </button>
                    <button type="button" onClick={() => void pinMessage(message)} disabled={pinningId !== ""}>
                      {pinningId === message.id
                        ? <LoaderCircle className="spin" aria-hidden="true" />
                        : message.pinnedAt ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}
                      <span className="sr-only">{message.pinnedAt ? (ru ? "Открепить" : "Mahkamdan olish") : (ru ? "Закрепить" : "Mahkamlash")}</span>
                    </button>
                  </span>
                </footer>
              </article>
            </div>
          );
        }) : <p>{normalizedQuery ? (ru ? "По этому запросу ничего не найдено." : "Bu so‘rov bo‘yicha hech narsa topilmadi.") : (ru ? "Сообщений пока нет." : "Hozircha xabarlar yo‘q.")}</p>}
      </div>
      {otherTyping && (
        <p className="lawyer-typing" role="status">
          <span aria-hidden="true"><i /><i /><i /></span>
          {role === "lawyer" ? (ru ? "Клиент печатает…" : "Mijoz yozmoqda…") : (ru ? "Юрист печатает…" : "Yurist yozmoqda…")}
        </p>
      )}
      <form onSubmit={onSubmit}>
        {replyingTo && (
          <aside className="lawyer-reply-preview">
            <Reply aria-hidden="true" />
            <span>
              <strong>{ru ? "Ответ на сообщение" : "Xabarga javob"}</strong>
              <small>{replyingTo.body || replyingTo.documentTitle}</small>
            </span>
            <button type="button" onClick={() => setReplyingTo(null)}>
              <X aria-hidden="true" />
              <span className="sr-only">{ru ? "Отменить ответ" : "Javobni bekor qilish"}</span>
            </button>
          </aside>
        )}
        <label>
          {ru ? "Сообщение" : "Xabar"}
          <textarea
            maxLength={4_000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={ru ? "Напишите сообщение по делу…" : "Ish bo‘yicha xabar yozing…"}
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
