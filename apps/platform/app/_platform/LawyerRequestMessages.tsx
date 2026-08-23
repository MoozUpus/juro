"use client";

/* eslint-disable react-hooks/set-state-in-effect -- authenticated request history is loaded after initial browser render */

import {
  Bot,
  CalendarClock,
  CheckSquare2,
  Copy,
  FileQuestion,
  LoaderCircle,
  LockKeyhole,
  NotebookPen,
  Paperclip,
  Pin,
  PinOff,
  PhoneCall,
  Reply,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  WalletCards,
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

type InternalNote = {
  id: string;
  body: string;
  documentId: string | null;
  documentTitle: string | null;
  convertedTaskId: string | null;
  createdAt: string;
  authorName: string;
};

type ChatContext = {
  requestId: string;
  caseId: string;
  consultation: null | {
    id: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    format: "video" | "phone" | "office";
    status: string;
    attendanceOutcome: "no_show" | null;
  };
  proposal: null | {
    id: string;
    status: string;
    titleRu: string;
    titleUz: string;
    scopeRu: string;
    scopeUz: string;
    durationDescription: string;
    lawyerBaseAmountMinor: number;
    currency: string;
  };
  externalOffer: null | {
    id: string;
    status: string;
    scopeDescription: string;
    priceDescription: string;
    durationDescription: string;
  };
  documentRequests: Array<{
    id: string;
    title: string;
    status: "requested" | "provided" | "cancelled";
    providedDocumentId: string | null;
  }>;
};

type AiAssistKind =
  | "draft"
  | "summary"
  | "facts"
  | "deadlines"
  | "questions"
  | "tasks"
  | "documents"
  | "consultation";

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
  const [notes, setNotes] = useState<InternalNote[]>([]);
  const [chatContext, setChatContext] = useState<ChatContext | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [noteDocumentId, setNoteDocumentId] = useState("");
  const [noteBusyId, setNoteBusyId] = useState("");
  const [aiBusy, setAiBusy] = useState<AiAssistKind | "">("");
  const [aiKind, setAiKind] = useState<AiAssistKind | null>(null);
  const [aiResult, setAiResult] = useState("");
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
      notes?: InternalNote[];
      context?: ChatContext;
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
    setNotes(payload.notes || []);
    setChatContext(payload.context || null);
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

  async function saveInternalNote(content = noteBody, linkedDocumentId = noteDocumentId) {
    const value = content.trim();
    if (!value) return;
    setNoteBusyId("new");
    setError("");
    try {
      const response = await fetch(
        `/api/platform/lawyer-requests/${encodeURIComponent(requestId)}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-juro-csrf": "1" },
          body: JSON.stringify({
            action: "note_create",
            body: value,
            documentId: linkedDocumentId || undefined,
            locale,
          }),
        },
      );
      const payload = await response.json() as { note?: InternalNote; error?: string };
      if (!response.ok || !payload.note) throw new Error(payload.error || "Ошибка");
      setNotes((current) => [payload.note!, ...current]);
      setNoteBody("");
      setNoteDocumentId("");
      setNotice(ru ? "Приватная заметка сохранена." : "Shaxsiy qayd saqlandi.");
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setNoteBusyId("");
    }
  }

  async function convertNoteToTask(note: InternalNote) {
    const compact = note.body.replace(/^[-*#\s]+/u, "").split(/\r?\n/u)[0]?.trim() || note.body.trim();
    const title = compact.length >= 2
      ? compact.slice(0, 240)
      : (ru ? `Задача по заметке: ${compact}` : `Qayd bo‘yicha vazifa: ${compact}`).slice(0, 240);
    setNoteBusyId(note.id);
    setError("");
    try {
      const response = await fetch(
        `/api/platform/lawyer-requests/${encodeURIComponent(requestId)}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-juro-csrf": "1" },
          body: JSON.stringify({ action: "note_to_task", noteId: note.id, title, locale }),
        },
      );
      const payload = await response.json() as { task?: { id: string }; error?: string };
      if (!response.ok || !payload.task) throw new Error(payload.error || "Ошибка");
      setNotes((current) => current.map((item) => item.id === note.id
        ? { ...item, convertedTaskId: payload.task!.id }
        : item));
      setNotice(ru ? "Заметка превращена в задачу по делу." : "Qayd ish vazifasiga aylantirildi.");
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setNoteBusyId("");
    }
  }

  async function runAiAssist(kind: AiAssistKind) {
    const operation: Record<AiAssistKind, string> = ru ? {
      draft: "Подготовь профессиональный проект ответа клиенту без автоматической отправки.",
      summary: "Сделай краткую структурированную сводку переписки.",
      facts: "Извлеки только факты, явно содержащиеся в переписке.",
      deadlines: "Извлеки даты и сроки; если их нет, так и укажи.",
      questions: "Сформируй уточняющие вопросы клиенту.",
      tasks: "Предложи конкретные задачи юриста по этой переписке.",
      documents: "Найди упомянутые документы и недостающие материалы.",
      consultation: "Предложи повестку следующей консультации.",
    } : {
      draft: "Mijozga professional javob loyihasini avtomatik yubormasdan tayyorla.",
      summary: "Yozishmaning qisqa tuzilgan xulosasini tayyorla.",
      facts: "Faqat yozishmada aniq mavjud faktlarni ajrat.",
      deadlines: "Sana va muddatlarni ajrat; ular bo‘lmasa, shuni ayt.",
      questions: "Mijoz uchun aniqlashtiruvchi savollar tuz.",
      tasks: "Ushbu yozishma bo‘yicha yuristning aniq vazifalarini taklif qil.",
      documents: "Tilga olingan hujjatlar va yetishmayotgan materiallarni top.",
      consultation: "Keyingi maslahat kun tartibini taklif qil.",
    };
    const transcript = messages.slice(-20).map((message) => {
      const author = message.authorRole === "lawyer" ? "LAWYER" : "CLIENT";
      return `${author}: ${message.body || `[${message.documentTitle || "document"}]`}`;
    }).join("\n").slice(-6_000);
    const question = `${ru
      ? "Ты — приватный AI-assist юриста JURO. Результат видит только юрист, он никогда не отправляется клиенту автоматически. Не добавляй факты, которых нет в контексте. Любое юридическое утверждение подтверждай только прямой официальной ссылкой Lex.uz."
      : "Siz JURO yuristining shaxsiy AI yordamchisisiz. Natijani faqat yurist ko‘radi va u mijozga hech qachon avtomatik yuborilmaydi. Kontekstda bo‘lmagan faktlarni qo‘shmang. Har qanday huquqiy da’voni faqat Lex.uz rasmiy havolasi bilan tasdiqlang."}
\n${operation[kind]}\n\n${ru ? "КОНТЕКСТ ПЕРЕПИСКИ" : "YOZISHMA KONTEKSTI"}:\n${transcript || (ru ? "Сообщений пока нет." : "Hozircha xabarlar yo‘q.")}`;
    setAiBusy(kind);
    setAiKind(kind);
    setAiResult("");
    setError("");
    try {
      const response = await fetch("/api/platform/ai", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-juro-csrf": "1",
          "idempotency-key": `lawyer-chat-assist-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({ question, locale, answerMode: "detailed", reasoningMode: "fast" }),
      });
      const payload = await response.json() as { result?: { answer?: string }; error?: string };
      if (!response.ok || !payload.result?.answer) throw new Error(payload.error || "Ошибка");
      setAiResult(payload.result.answer);
      setNotice(ru ? "Приватный AI-проект готов и не отправлен клиенту." : "Shaxsiy AI loyihasi tayyor va mijozga yuborilmadi.");
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setAiBusy("");
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
  const aiAssistLabels: Record<AiAssistKind, string> = ru ? {
    draft: "Проект ответа",
    summary: "Сводка",
    facts: "Факты",
    deadlines: "Сроки",
    questions: "Вопросы",
    tasks: "Задачи",
    documents: "Документы",
    consultation: "План консультации",
  } : {
    draft: "Javob loyihasi",
    summary: "Xulosa",
    facts: "Faktlar",
    deadlines: "Muddatlar",
    questions: "Savollar",
    tasks: "Vazifalar",
    documents: "Hujjatlar",
    consultation: "Maslahat rejasi",
  };

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
      {chatContext && (
        <aside className="lawyer-chat-context" aria-label={ru ? "Контекст переписки" : "Yozishma konteksti"}>
          {(chatContext.proposal || chatContext.externalOffer) && (
            <article>
              <WalletCards aria-hidden="true" />
              <div>
                <strong>{ru ? "Предложение" : "Taklif"}</strong>
                {chatContext.proposal ? (
                  <>
                    <span>{ru ? chatContext.proposal.titleRu : chatContext.proposal.titleUz}</span>
                    <small>{new Intl.NumberFormat(ru ? "ru-RU" : "uz-UZ").format(chatContext.proposal.lawyerBaseAmountMinor)} {ru ? "сум" : "so‘m"} · {proposalStatus(chatContext.proposal.status, ru)}</small>
                  </>
                ) : chatContext.externalOffer ? (
                  <>
                    <span>{chatContext.externalOffer.scopeDescription}</span>
                    <small>{chatContext.externalOffer.priceDescription} · {chatContext.externalOffer.durationDescription}</small>
                  </>
                ) : null}
              </div>
              {chatContext.proposal && <Link href={`${base}/cases/${encodeURIComponent(chatContext.caseId)}`}>{chatContext.proposal.status === "ACCEPTED" ? (ru ? "Перейти к оплате" : "To‘lovga o‘tish") : (ru ? "Открыть условия" : "Shartlarni ochish")}</Link>}
            </article>
          )}
          {chatContext.consultation && (
            <article>
              <CalendarClock aria-hidden="true" />
              <div>
                <strong>{ru ? "Консультация" : "Konsultatsiya"}</strong>
                <span>{new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tashkent" }).format(new Date(chatContext.consultation.startsAt))}</span>
                <small>{consultationStatus(chatContext.consultation, ru)}</small>
              </div>
              {chatContext.consultation.format === "video" && ["confirmed", "in_progress"].includes(chatContext.consultation.status) && <Link href={`${base}/consultations/call/${encodeURIComponent(chatContext.consultation.id)}`}><PhoneCall aria-hidden="true" />{ru ? "Открыть звонок" : "Qo‘ng‘iroqni ochish"}</Link>}
            </article>
          )}
          {chatContext.documentRequests.slice(0, 2).map((item) => (
            <article key={item.id}>
              <FileQuestion aria-hidden="true" />
              <div><strong>{ru ? "Запрос документа" : "Hujjat so‘rovi"}</strong><span>{item.title}</span><small>{documentRequestStatus(item.status, ru)}</small></div>
              {item.providedDocumentId && <Link href={`${base}/documents/${encodeURIComponent(item.providedDocumentId)}`}>{ru ? "Открыть" : "Ochish"}</Link>}
            </article>
          ))}
        </aside>
      )}
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
      {role === "lawyer" && (
        <aside className="lawyer-ai-assist" aria-label={ru ? "Приватный AI-assist" : "Shaxsiy AI yordamchi"}>
          <header>
            <span><Bot aria-hidden="true" /><strong>{ru ? "Приватный AI-assist" : "Shaxsiy AI yordamchi"}</strong></span>
            <small><LockKeyhole aria-hidden="true" />{ru ? "Виден только вам · никогда не отправляется автоматически" : "Faqat sizga ko‘rinadi · hech qachon avtomatik yuborilmaydi"}</small>
          </header>
          <div className="lawyer-ai-actions">
            {(Object.keys(aiAssistLabels) as AiAssistKind[]).map((kind) => (
              <button type="button" key={kind} disabled={Boolean(aiBusy)} onClick={() => void runAiAssist(kind)}>
                {aiBusy === kind ? <LoaderCircle className="spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
                {aiAssistLabels[kind]}
              </button>
            ))}
          </div>
          {aiResult && (
            <section className="lawyer-ai-result" aria-live="polite">
              <strong>{aiKind ? aiAssistLabels[aiKind] : (ru ? "AI-проект" : "AI loyihasi")}</strong>
              <p>{aiResult}</p>
              <div>
                <button type="button" onClick={() => { setBody(aiResult.slice(0, 4_000)); setNotice(ru ? "AI-текст перенесён в черновик. Проверьте его перед отправкой." : "AI matni qoralamaga o‘tkazildi. Yuborishdan oldin tekshiring."); }}>
                  <Reply aria-hidden="true" />{ru ? "Перенести в черновик" : "Qoralamaga o‘tkazish"}
                </button>
                <button type="button" disabled={noteBusyId === "new"} onClick={() => void saveInternalNote(aiResult, "")}>
                  {noteBusyId === "new" ? <LoaderCircle className="spin" aria-hidden="true" /> : <NotebookPen aria-hidden="true" />}
                  {ru ? "Сохранить как заметку" : "Qayd sifatida saqlash"}
                </button>
              </div>
            </section>
          )}
        </aside>
      )}
      {role === "lawyer" && (
        <aside className="lawyer-internal-notes" aria-label={ru ? "Внутренние заметки" : "Ichki qaydlar"}>
          <header>
            <span><NotebookPen aria-hidden="true" /><strong>{ru ? "Внутренние заметки" : "Ichki qaydlar"}</strong></span>
            <small><LockKeyhole aria-hidden="true" />{ru ? "Клиент их не видит" : "Mijoz ularni ko‘rmaydi"}</small>
          </header>
          <form onSubmit={(event) => { event.preventDefault(); void saveInternalNote(); }}>
            <label>
              {ru ? "Новая приватная заметка" : "Yangi shaxsiy qayd"}
              <textarea maxLength={4_000} value={noteBody} onChange={(event) => setNoteBody(event.target.value)} placeholder={ru ? "Контекст, стратегия или следующий шаг…" : "Kontekst, strategiya yoki keyingi qadam…"} />
            </label>
            <label>
              {ru ? "Связать с документом" : "Hujjat bilan bog‘lash"}
              <select value={noteDocumentId} onChange={(event) => setNoteDocumentId(event.target.value)}>
                <option value="">{ru ? "Без документа" : "Hujjatsiz"}</option>
                {documents.map((document) => <option value={document.id} key={document.id}>{document.title}</option>)}
              </select>
            </label>
            <button type="submit" disabled={!noteBody.trim() || noteBusyId === "new"}>
              {noteBusyId === "new" ? <LoaderCircle className="spin" aria-hidden="true" /> : <NotebookPen aria-hidden="true" />}
              {ru ? "Сохранить приватно" : "Shaxsiy saqlash"}
            </button>
          </form>
          {notes.length > 0 && (
            <ol>
              {notes.map((note) => (
                <li key={note.id}>
                  <p>{note.body}</p>
                  {note.documentTitle && <small><Paperclip aria-hidden="true" />{note.documentTitle}</small>}
                  <footer>
                    <span>{note.authorName} · {new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Tashkent" }).format(new Date(note.createdAt))}</span>
                    {note.convertedTaskId ? (
                      <em><CheckSquare2 aria-hidden="true" />{ru ? "Задача создана" : "Vazifa yaratildi"}</em>
                    ) : (
                      <button type="button" disabled={Boolean(noteBusyId)} onClick={() => void convertNoteToTask(note)}>
                        {noteBusyId === note.id ? <LoaderCircle className="spin" aria-hidden="true" /> : <CheckSquare2 aria-hidden="true" />}
                        {ru ? "Создать задачу" : "Vazifa yaratish"}
                      </button>
                    )}
                  </footer>
                </li>
              ))}
            </ol>
          )}
        </aside>
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

function proposalStatus(status: string, ru: boolean) {
  const labels: Record<string, [string, string]> = {
    PROPOSED: ["Ожидает решения", "Qaror kutilmoqda"],
    ACCEPTED: ["Условия приняты", "Shartlar qabul qilingan"],
    FUNDED: ["Демо-оплата подтверждена", "Demo to‘lov tasdiqlangan"],
    DECLINED: ["Отклонено", "Rad etilgan"],
    SUPERSEDED: ["Заменено новой версией", "Yangi versiya bilan almashtirilgan"],
  };
  return labels[status]?.[ru ? 0 : 1] || status;
}

function consultationStatus(consultation: NonNullable<ChatContext["consultation"]>, ru: boolean) {
  if (consultation.attendanceOutcome === "no_show") return ru ? "Не состоялась · неявка" : "O‘tkazilmadi · kelmadi";
  const labels: Record<string, [string, string]> = {
    proposed: ["Время предложено", "Vaqt taklif qilingan"],
    confirmed: ["Подтверждена", "Tasdiqlangan"],
    in_progress: ["Идёт", "Davom etmoqda"],
    completed: ["Завершена", "Yakunlangan"],
    cancelled: ["Отменена", "Bekor qilingan"],
  };
  return labels[consultation.status]?.[ru ? 0 : 1] || consultation.status;
}

function documentRequestStatus(status: ChatContext["documentRequests"][number]["status"], ru: boolean) {
  const labels: Record<ChatContext["documentRequests"][number]["status"], [string, string]> = {
    requested: ["Ожидается", "Kutilmoqda"],
    provided: ["Предоставлен", "Taqdim etilgan"],
    cancelled: ["Отменён", "Bekor qilingan"],
  };
  return labels[status][ru ? 0 : 1];
}
