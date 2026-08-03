"use client";

/* eslint-disable react-hooks/set-state-in-effect -- authenticated remote data is hydrated after the first browser render */

import { BookOpenCheck, Bot, Check, CircleAlert, FilePlus2, FileQuestion, History, ListPlus, LoaderCircle, Pencil, RotateCcw, Send, ShieldAlert, Square, ThumbsUp, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { AiRestartableRequestError, AiRetryableRequestError, createAiRetryRequest, isRestartableAiTerminal, isUserCancelledAiRequest, shouldOfferAiRetry, shouldUseFreshAiRetry, type AiRetryRequest } from "../../lib/ai/client-retry";
import type { PlatformLocale } from "../../lib/platform/routing";
import { usePlatformBasePath } from "./PlatformRouteContext";

type ProviderStatus = { configured: boolean; provider: string | null; model: string | null; fallbackConfigured: boolean };
type Usage = { used: number; limit: number; periodEnd: string };
type SourceFreshness = { status: "fresh" | "stale" | "unavailable"; asOf: string; ageDays: number | null; maxAgeDays: number };
type Conversation = { id: string; title: string; locale: string; status: string; updatedAt: string; lastAnswer: string | null; facts: Fact[] };
type Fact = { id: string; statement: string; status: string };
type Source = { sourceId: string; actTitle: string; actIdentifier: string | null; article: string | null; excerpt: string | null; originalUrl: string; status: string; effectiveDate: string | null; verifiedAt: string };
type LegalResult = {
  responseKind: "answer" | "clarification_required";
  summary: string;
  answer: string;
  clarificationQuestions: string[];
  confirmedFindings: Array<{ title: string; explanation: string }>;
  assumptions: Array<{ statement: string; impact: string }>;
  risks: Array<{ level: "low" | "medium" | "high" | "critical"; title: string; explanation: string }>;
  sources: Source[];
  requiredDocuments: Array<{ name: string; reason: string; required: boolean }>;
  actionPlan: Array<{ title: string; description: string }>;
  deadlines: Array<{ title: string; dueDate: string | null; calculationMethod: string; confidence: string }>;
  urgency: "normal" | "high" | "critical";
  suggestedDocument: { templateCode: string | null; title: string; reason: string } | null;
  suggestLawyer: boolean;
  legalDatabaseAsOf: string;
};
type AiMessageOperation = "new" | "follow_up" | "edit" | "regenerate";
type Branch = { branchId: string; parentBranchId: string | null; requestMessageId: string; responseMessageId: string; operation: AiMessageOperation; versionNumber: number; question: string; createdAt: string };
type Answer = { conversationId: string; messageId?: string; requestMessageId?: string | null; branchId?: string | null; operation?: AiMessageOperation; question?: string; branches?: Branch[]; result: LegalResult; facts: Fact[]; sourceFreshness?: SourceFreshness; usage?: Usage };
type AiRequestPayload = {
  question?: string;
  locale: PlatformLocale;
  answerMode: "short" | "detailed";
  reasoningMode: "fast" | "deep";
  conversationId?: string;
  operation: AiMessageOperation;
  sourceMessageId?: string;
};
type AiFeedbackType = "helpful" | "not_helpful" | "wrong_norm" | "broken_link" | "outdated" | "incomplete" | "language" | "unsafe" | "ignored_facts";
type AiFeedback = { feedbackType: AiFeedbackType; comment: string | null; updatedAt: string };

const feedbackOptions: AiFeedbackType[] = ["not_helpful", "wrong_norm", "broken_link", "outdated", "incomplete", "language", "unsafe", "ignored_facts"];

export function AiLawyerClient({ locale }: { locale: PlatformLocale }) {
  const ru = locale === "ru";
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const selectedConversationId = searchParams.get("conversationId") || "";
  const selectedBranchId = searchParams.get("branchId") || "";
  const base = usePlatformBasePath();
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [question, setQuestion] = useState(() => (searchParams.get("prompt") || "").slice(0, 4_000));
  const [answerMode, setAnswerMode] = useState<"short" | "detailed">("detailed");
  const [reasoningMode, setReasoningMode] = useState<"fast" | "deep">("fast");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [editSourceMessageId, setEditSourceMessageId] = useState("");
  const [error, setError] = useState("");
  const [streamStatus, setStreamStatus] = useState("");
  const streamAbortRef = useRef<AbortController | null>(null);
  const pendingAiRequestRef = useRef<AiRetryRequest<AiRequestPayload> | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [openingSuggestedDocument, setOpeningSuggestedDocument] = useState(false);
  const [feedback, setFeedback] = useState<AiFeedback[]>([]);
  const [feedbackType, setFeedbackType] = useState<AiFeedbackType>("not_helpful");
  const [feedbackComment, setFeedbackComment] = useState("");
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState("");

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedConversationId) params.set("conversationId", selectedConversationId);
      if (selectedBranchId) params.set("branchId", selectedBranchId);
      const response = await fetch(`/api/platform/ai${params.size ? `?${params}` : ""}`, { cache: "no-store" });
      const body = await response.json() as { status?: ProviderStatus; usage?: Usage; conversations?: Conversation[]; selected?: Answer | null; error?: string };
      if (!response.ok) throw new Error(body.error || (ru ? "AI-модуль не загрузился." : "AI moduli yuklanmadi."));
      setStatus(body.status ?? null);
      setUsage(body.usage ?? null);
      setConversations(body.conversations ?? []);
      setAnswer(body.selected ?? null);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setLoading(false);
    }
  }, [ru, selectedBranchId, selectedConversationId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!answer?.messageId) { setFeedback([]); setFeedbackStatus(""); return; }
    let active = true;
    void fetch(`/api/platform/ai/feedback?assistantMessageId=${encodeURIComponent(answer.messageId)}`, { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json() as { feedback?: AiFeedback[] } }))
      .then(({ response, body }) => { if (active && response.ok) setFeedback(body.feedback ?? []); })
      .catch(() => { /* Feedback is supplementary; an unavailable read must not hide the legal answer. */ });
    return () => { active = false; };
  }, [answer?.messageId]);

  async function submit(
    event?: FormEvent,
    override?: { operation: "regenerate"; sourceMessageId: string },
    retry?: AiRetryRequest<AiRequestPayload>,
  ) {
    event?.preventDefault();
    const operation: AiMessageOperation = retry?.payload.operation || override?.operation || (editSourceMessageId ? "edit" : (answer?.conversationId || selectedConversationId ? "follow_up" : "new"));
    const sourceMessageId = retry?.payload.sourceMessageId || override?.sourceMessageId || editSourceMessageId || undefined;
    if ((operation !== "regenerate" && !(retry?.payload.question || question.trim())) || sending || !status?.configured) return;
    const pending = retry || createAiRetryRequest<AiRequestPayload>({
      question: operation === "regenerate" ? undefined : question,
      locale,
      answerMode,
      reasoningMode,
      conversationId: answer?.conversationId || selectedConversationId || undefined,
      operation,
      sourceMessageId,
    }, () => crypto.randomUUID());
    const controller = new AbortController();
    streamAbortRef.current = controller;
    setSending(true);
    setError("");
    setCanRetry(false);
    setStreamStatus(ru ? "JURO принимает запрос…" : "JURO so‘rovni qabul qilmoqda…");
    try {
      const response = await fetch("/api/platform/ai", {
        method: "POST",
        headers: {
          accept: "text/event-stream",
          "content-type": "application/json",
          "x-juro-csrf": "1",
          "idempotency-key": pending.idempotencyKey,
        },
        body: JSON.stringify(pending.payload),
        signal: controller.signal,
      });
      if (!response.ok || !response.headers.get("content-type")?.includes("text/event-stream")) {
        throw new Error(ru ? "Не удалось открыть защищённый поток ответа." : "Himoyalangan javob oqimini ochib bo‘lmadi.");
      }
      let terminal;
      try {
        terminal = await readAiEventStream(response, (progress) => {
          if (progress.stage === "provider_started") {
            setStreamStatus(ru ? "AI формирует структурированный ответ…" : "AI tuzilgan javobni tayyorlamoqda…");
          } else if (progress.stage === "provider_delta") {
            setStreamStatus(ru ? "JURO проверяет структуру и источники…" : "JURO tuzilma va manbalarni tekshirmoqda…");
          } else if (progress.stage === "fallback") {
            setStreamStatus(ru ? "Основной провайдер недоступен — включён резервный…" : "Asosiy provayder ishlamayapti — zaxira yoqildi…");
          }
        });
      } catch (streamError) {
        throw new AiRetryableRequestError(
          streamError instanceof Error ? streamError.message : "STREAM_TERMINAL_EVENT_MISSING",
        );
      }
      const body = terminal.body as Answer & { error?: string; code?: string };
      if (terminal.status < 200 || terminal.status >= 300) {
        const message = body.error || (ru ? "Не удалось получить ответ." : "Javob olinmadi.");
        if (isRestartableAiTerminal(terminal.status, body.code)) throw new AiRestartableRequestError(message);
        throw new Error(message);
      }
      if (terminal.status === 202) throw new AiRetryableRequestError(ru ? "Запрос уже обрабатывается. Повторите проверку через несколько секунд." : "So‘rov qayta ishlanmoqda. Bir necha soniyadan so‘ng qayta tekshiring.");
      setAnswer(body);
      if (body.usage) setUsage(body.usage);
      setQuestion("");
      setEditSourceMessageId("");
      pendingAiRequestRef.current = null;
      setCanRetry(false);
      const nextParams = new URLSearchParams({ conversationId: body.conversationId });
      if (body.branchId) nextParams.set("branchId", body.branchId);
      router.replace(`${pathname}?${nextParams}`, { scroll: false });
    } catch (value) {
      const cancelled = isUserCancelledAiRequest(value);
      if (!cancelled && shouldOfferAiRetry(value)) {
        pendingAiRequestRef.current = shouldUseFreshAiRetry(value)
          ? createAiRetryRequest(pending.payload, () => crypto.randomUUID())
          : pending;
        setCanRetry(true);
      }
      setError(cancelled
        ? (ru ? "Генерация остановлена. Лимит не списан." : "Javob yaratish to‘xtatildi. Limit yechilmadi.")
        : value instanceof Error ? value.message : String(value));
    } finally {
      streamAbortRef.current = null;
      setStreamStatus("");
      setSending(false);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  async function updateFact(factId: string, nextStatus: "confirmed" | "rejected") {
    const response = await fetch(`/api/platform/ai/facts/${encodeURIComponent(factId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-juro-csrf": "1" },
      body: JSON.stringify({ status: nextStatus }),
    });
    const body = await response.json() as { error?: string };
    if (!response.ok) { setError(body.error || (ru ? "Факт не обновлён." : "Fakt yangilanmadi.")); return; }
    setAnswer((current) => current ? { ...current, facts: current.facts.map((fact) => fact.id === factId ? { ...fact, status: nextStatus } : fact) } : current);
  }

  async function savePlanToCase() {
    if (!answer?.messageId || answer.result.responseKind !== "answer" || !answer.result.actionPlan.length || savingPlan) return;
    const confirmed = window.confirm(ru
      ? "Создать новое дело и задачи по показанному плану? Исходный AI-ответ сохранится без изменений."
      : "Ko‘rsatilgan reja bo‘yicha yangi ish va vazifalar yaratilsinmi? Asl AI javobi o‘zgarmaydi.");
    if (!confirmed) return;
    setSavingPlan(true);
    setError("");
    try {
      const response = await fetch("/api/platform/ai/action-plan", {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ assistantMessageId: answer.messageId, locale }),
      });
      const body = await response.json() as { caseId?: string; error?: string };
      if (!response.ok || !body.caseId) throw new Error(body.error || (ru ? "План не сохранён в дело." : "Reja ishga saqlanmadi."));
      router.push(`${base}/cases/${encodeURIComponent(body.caseId)}`);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setSavingPlan(false);
    }
  }

  async function openSuggestedDocument() {
    if (!answer?.messageId || answer.result.responseKind !== "answer" || !answer.result.suggestedDocument || openingSuggestedDocument) return;
    const confirmed = window.confirm(ru
      ? "Открыть опубликованный шаблон JURO для проверки и заполнения? JURO ещё не создаст документ и не передаст данные в URL."
      : "Tekshirish va to‘ldirish uchun JUROdagi e’lon qilingan shablon ochilsinmi? JURO hozircha hujjat yaratmaydi va ma’lumotlarni URLga uzatmaydi.");
    if (!confirmed) return;
    setOpeningSuggestedDocument(true);
    setError("");
    try {
      const response = await fetch("/api/platform/ai/suggested-document", {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ assistantMessageId: answer.messageId, locale }),
      });
      const body = await response.json() as { templateCode?: string; categorySlug?: string; error?: string };
      if (!response.ok || !body.templateCode || !body.categorySlug) {
        throw new Error(body.error || (ru ? "Шаблон не удалось проверить." : "Shablonni tekshirib bo‘lmadi."));
      }
      router.push(`${base}/document-builder/${encodeURIComponent(body.categorySlug)}/${encodeURIComponent(body.templateCode)}`);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setOpeningSuggestedDocument(false);
    }
  }

  async function saveFeedback(nextType: AiFeedbackType, comment = "") {
    if (!answer?.messageId || savingFeedback) return;
    setSavingFeedback(true);
    setFeedbackStatus("");
    try {
      const response = await fetch("/api/platform/ai/feedback", {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ assistantMessageId: answer.messageId, feedbackType: nextType, comment }),
      });
      const body = await response.json() as { error?: string; feedbackType?: AiFeedbackType; updatedAt?: string };
      if (!response.ok || body.feedbackType === undefined || body.updatedAt === undefined) throw new Error(body.error || (ru ? "Отзыв не сохранён." : "Fikr-mulohaza saqlanmadi."));
      const savedFeedback: AiFeedback = { feedbackType: body.feedbackType, comment: comment.trim() || null, updatedAt: body.updatedAt };
      setFeedback((current) => [...current.filter((item) => item.feedbackType !== savedFeedback.feedbackType), savedFeedback]);
      setFeedbackComment("");
      setFeedbackStatus(ru ? "Спасибо, отзыв сохранён для проверки качества JURO." : "Rahmat, fikr-mulohaza JURO sifatini tekshirish uchun saqlandi.");
    } catch (value) {
      setFeedbackStatus(value instanceof Error ? value.message : String(value));
    } finally {
      setSavingFeedback(false);
    }
  }

  function feedbackLabel(type: AiFeedbackType) {
    const ruLabels: Record<AiFeedbackType, string> = { helpful: "Полезно", not_helpful: "Не помогло", wrong_norm: "Неверная норма", broken_link: "Нерабочая ссылка", outdated: "Устарело", incomplete: "Неполно", language: "Проблема языка", unsafe: "Небезопасно", ignored_facts: "Не учтены факты" };
    const uzLabels: Record<AiFeedbackType, string> = { helpful: "Foydali", not_helpful: "Yordam bermadi", wrong_norm: "Noto‘g‘ri norma", broken_link: "Ishlamaydigan havola", outdated: "Eskirgan", incomplete: "To‘liq emas", language: "Til muammosi", unsafe: "Xavfsiz emas", ignored_facts: "Faktlar hisobga olinmadi" };
    return (ru ? ruLabels : uzLabels)[type];
  }

  if (loading) return <div className="ai-workspace-loading"><LoaderCircle className="spin" /></div>;
  return (
    <section className="ai-workspace">
      <aside className="ai-conversations">
        <header><Bot /><div><small>JURO</small><strong>{ru ? "Диалоги" : "Suhbatlar"}</strong></div></header>
        <button className="ai-new" onClick={() => { pendingAiRequestRef.current = null; setCanRetry(false); setAnswer(null); setQuestion(""); setEditSourceMessageId(""); router.replace(pathname, { scroll: false }); }}>{ru ? "+ Новый вопрос" : "+ Yangi savol"}</button>
        <div>{conversations.length ? conversations.map((item) => <button key={item.id} onClick={() => { setEditSourceMessageId(""); router.replace(`${pathname}?conversationId=${encodeURIComponent(item.id)}`, { scroll: false }); }}><strong>{item.title}</strong><small>{formatDate(item.updatedAt, ru)}</small></button>) : <p>{ru ? "История появится после первого обработанного вопроса." : "Tarix birinchi qayta ishlangan savoldan keyin paydo bo‘ladi."}</p>}</div>
      </aside>
      <main className="ai-dialog">
        <header><span><Bot /></span><div><h1>{ru ? "AI-юрист JURO" : "JURO AI-yuristi"}</h1><p>{status?.configured ? (ru ? `Узбекистан · ${usage?.used ?? 0} из ${usage?.limit ?? 20} ответов` : `O‘zbekiston · ${usage?.used ?? 0}/${usage?.limit ?? 20} javob`) : (ru ? "Провайдер не подключён" : "Provayder ulanmagan")}</p></div></header>
        {!status?.configured && <div className="ai-unavailable" role="status"><ShieldAlert /><div><strong>{ru ? "AI пока недоступен" : "AI hozircha ishlamaydi"}</strong><p>{ru ? "Сервер не подтвердил ключ AI-провайдера. JURO не имитирует ответ и не показывает ложный success." : "Server AI-provayder kalitini tasdiqlamadi. JURO javobni taqlid qilmaydi va soxta muvaffaqiyatni ko‘rsatmaydi."}</p></div></div>}
        {error && <div className="ai-error" role="alert"><CircleAlert /><div><p>{error}</p>{canRetry && <button type="button" disabled={sending} onClick={() => { const pending = pendingAiRequestRef.current; if (pending) void submit(undefined, undefined, pending); }}>{ru ? "Безопасно повторить запрос" : "So‘rovni xavfsiz qaytarish"}</button>}</div></div>}
        <div className="ai-answer-stream" aria-live="polite" aria-busy={sending}>
          {!answer ? (
            <div className="ai-start"><FileQuestion /><h2>{ru ? "Опишите юридическую ситуацию" : "Yuridik vaziyatni yozing"}</h2><p>{ru ? "Не указывайте лишние персональные данные. JURO отделит подтверждённые нормы от предположений." : "Ortiqcha shaxsiy ma’lumotlarni yozmang. JURO tasdiqlangan normalarni taxminlardan ajratadi."}</p></div>
          ) : <>
            <LegalAnswer result={answer.result} freshness={answer.sourceFreshness} ru={ru} />
            <div className="ai-answer-actions">
              {answer.result.responseKind === "answer" && answer.result.actionPlan.length > 0 && <button type="button" disabled={!answer.messageId || sending || savingPlan} onClick={() => void savePlanToCase()}><ListPlus />{savingPlan ? (ru ? "Сохраняем план…" : "Reja saqlanmoqda…") : (ru ? "Добавить план в новое дело" : "Rejani yangi ishga qo‘shish")}</button>}
              {answer.result.responseKind === "answer" && answer.result.suggestedDocument && <button type="button" disabled={!answer.messageId || sending || openingSuggestedDocument} onClick={() => void openSuggestedDocument()}><FilePlus2 />{openingSuggestedDocument ? (ru ? "Проверяем шаблон…" : "Shablon tekshirilmoqda…") : (ru ? "Открыть шаблон JURO" : "JURO shablonini ochish")}</button>}
              <button type="button" disabled={!answer.requestMessageId || sending} onClick={() => { if (answer.requestMessageId) { setQuestion(answer.question || ""); setEditSourceMessageId(answer.requestMessageId); } }}><Pencil />{ru ? "Редактировать вопрос" : "Savolni tahrirlash"}</button>
              <button type="button" disabled={!answer.messageId || sending || !status?.configured} onClick={() => { if (answer.messageId) void submit(undefined, { operation: "regenerate", sourceMessageId: answer.messageId }); }}><RotateCcw />{ru ? "Повторить ответ" : "Javobni qayta yaratish"}</button>
            </div>
            {answer.messageId && <section className="ai-feedback" aria-labelledby="ai-feedback-heading">
              <div><h2 id="ai-feedback-heading">{ru ? "Оцените этот ответ" : "Bu javobni baholang"}</h2><p>{ru ? "Отзыв привязан к этому сохранённому ответу и помогает проверить качество источников." : "Fikr-mulohaza shu saqlangan javobga bog‘lanadi va manbalar sifatini tekshirishga yordam beradi."}</p></div>
              <div className="ai-feedback-actions">
                <button type="button" className={feedback.some((item) => item.feedbackType === "helpful") ? "selected" : undefined} disabled={savingFeedback} onClick={() => void saveFeedback("helpful")}><ThumbsUp />{feedback.some((item) => item.feedbackType === "helpful") ? (ru ? "Полезно — сохранено" : "Foydali — saqlandi") : feedbackLabel("helpful")}</button>
                <details>
                  <summary>{ru ? "Сообщить о проблеме" : "Muammo haqida xabar berish"}</summary>
                  <div className="ai-feedback-form">
                    <label>{ru ? "Что не так" : "Nima noto‘g‘ri"}<select value={feedbackType} onChange={(event) => setFeedbackType(event.target.value as AiFeedbackType)}>{feedbackOptions.map((item) => <option value={item} key={item}>{feedbackLabel(item)}</option>)}</select></label>
                    <label>{ru ? "Комментарий — необязательно" : "Izoh — ixtiyoriy"}<textarea value={feedbackComment} maxLength={2_000} onChange={(event) => setFeedbackComment(event.target.value)} placeholder={ru ? "Не указывайте лишние персональные данные." : "Ortiqcha shaxsiy ma’lumotlarni kiritmang."} /></label>
                    <button type="button" disabled={savingFeedback} onClick={() => void saveFeedback(feedbackType, feedbackComment)}>{savingFeedback ? (ru ? "Сохраняем…" : "Saqlanmoqda…") : (ru ? "Сохранить отзыв" : "Fikrni saqlash")}</button>
                  </div>
                </details>
              </div>
              {feedbackStatus && <p className="ai-feedback-status" role="status">{feedbackStatus}</p>}
            </section>}
            {answer.branches && answer.branches.length > 1 && <nav className="ai-branch-history" aria-label={ru ? "Версии ответа" : "Javob versiyalari"}>
              <span><History />{ru ? "Версии" : "Versiyalar"}</span>
              {answer.branches.map((branch) => <button type="button" aria-current={branch.branchId === answer.branchId ? "page" : undefined} key={branch.branchId} onClick={() => { setEditSourceMessageId(""); router.replace(`${pathname}?conversationId=${encodeURIComponent(answer.conversationId)}&branchId=${encodeURIComponent(branch.branchId)}`, { scroll: false }); }}>{branch.versionNumber} · {branch.operation}</button>)}
            </nav>}
          </>}
        </div>
        <form className="ai-composer" onSubmit={submit}>
          {editSourceMessageId && <div className="ai-edit-notice" role="status"><span>{ru ? "Редактирование создаст новую версию; исходный ответ сохранится." : "Tahrirlash yangi versiya yaratadi; oldingi javob saqlanadi."}</span><button type="button" onClick={() => { setEditSourceMessageId(""); setQuestion(""); }}>{ru ? "Отменить" : "Bekor qilish"}</button></div>}
          <div className="ai-modes">
            <label>{ru ? "Ответ" : "Javob"}<select value={answerMode} onChange={(event) => setAnswerMode(event.target.value as "short" | "detailed")}><option value="short">{ru ? "Кратко" : "Qisqa"}</option><option value="detailed">{ru ? "Подробно" : "Batafsil"}</option></select></label>
            <label>{ru ? "Режим" : "Rejim"}<select value={reasoningMode} onChange={(event) => setReasoningMode(event.target.value as "fast" | "deep")}><option value="fast">{ru ? "Быстро" : "Tez"}</option><option value="deep">{ru ? "Глубоко" : "Chuqur"}</option></select></label>
          </div>
          <label className="sr-only" htmlFor="ai-question">{ru ? "Юридический вопрос" : "Yuridik savol"}</label>
          <textarea id="ai-question" value={question} onChange={(event) => { pendingAiRequestRef.current = null; setCanRetry(false); setQuestion(event.target.value); }} onKeyDown={handleComposerKeyDown} disabled={!status?.configured || sending} placeholder={ru ? "Что произошло? Enter — отправить" : "Nima bo‘ldi? Enter — yuborish"} />
          {sending
            ? <button type="button" onClick={() => streamAbortRef.current?.abort()} aria-label={ru ? "Остановить генерацию" : "Javob yaratishni to‘xtatish"}><Square /></button>
            : <button disabled={!status?.configured || !question.trim()} aria-label={ru ? "Отправить" : "Yuborish"}><Send /></button>}
          <small role={sending ? "status" : undefined}>{streamStatus || (ru ? "Подтверждённые выводы строятся только на опубликованных источниках JURO." : "Tasdiqlangan xulosalar faqat JUROda e’lon qilingan manbalarga asoslanadi.")}</small>
        </form>
      </main>
      <aside className="ai-context">
        <header><BookOpenCheck /><strong>{ru ? "Контекст" : "Kontekst"}</strong></header>
        <section><h2>{ru ? "Факты для подтверждения" : "Tasdiqlash uchun faktlar"}</h2>{answer?.facts.length ? answer.facts.map((fact) => <div className={`ai-fact ${fact.status}`} key={fact.id}><p>{fact.statement}</p>{fact.status === "proposed" ? <span><button onClick={() => void updateFact(fact.id, "confirmed")} aria-label={ru ? "Подтвердить факт" : "Faktni tasdiqlash"}><Check /></button><button onClick={() => void updateFact(fact.id, "rejected")} aria-label={ru ? "Отклонить факт" : "Faktni rad etish"}><X /></button></span> : <small>{fact.status === "confirmed" ? (ru ? "Подтверждено" : "Tasdiqlandi") : (ru ? "Отклонено" : "Rad etildi")}</small>}</div>) : <p>{ru ? "Предположения появятся после разбора." : "Taxminlar tahlildan keyin paydo bo‘ladi."}</p>}</section>
        <section className="ai-evidence"><h2>{ru ? "Источники" : "Manbalar"}</h2>{answer?.result.sources.length ? answer.result.sources.map((source) => safeOfficialUrl(source.originalUrl) ? <a key={`${source.sourceId}:${source.article || "source"}`} href={source.originalUrl} target="_blank" rel="noreferrer"><strong>{source.actTitle}</strong><small>{source.article || source.actIdentifier || (ru ? "Официальный источник" : "Rasmiy manba")}</small>{source.excerpt && <span>{source.excerpt}</span>}<em>{ru ? `Проверено ${formatDate(source.verifiedAt, ru)}` : `${formatDate(source.verifiedAt, ru)} tekshirildi`}</em></a> : null) : <p>{ru ? "Подтверждённый фрагмент пока не найден; статья и цитата не выдумываются." : "Tasdiqlangan parcha topilmadi; modda va iqtibos o‘ylab topilmaydi."}</p>}</section>
      </aside>
    </section>
  );
}

type AiStreamStatus = {
  stage?: "accepted" | "provider_started" | "provider_delta" | "fallback";
  provider?: string;
  model?: string;
  receivedCharacters?: number;
};

async function readAiEventStream(
  response: Response,
  onStatus: (status: AiStreamStatus) => void,
): Promise<{ status: number; body: unknown }> {
  if (!response.body) throw new Error("STREAM_BODY_MISSING");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal: { status: number; body: unknown } | null = null;

  const processFrame = (frame: string) => {
    const event = frame.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim();
    const data = frame.split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!event || !data) return;
    let parsed: unknown;
    try { parsed = JSON.parse(data); } catch { throw new Error("STREAM_EVENT_INVALID"); }
    if (event === "status") onStatus(parsed as AiStreamStatus);
    if (event === "complete" || event === "error") {
      const value = parsed as { status?: number; body?: unknown };
      terminal = { status: value.status ?? 500, body: value.body ?? {} };
    }
  };

  while (!terminal) {
    const { done, value } = await reader.read();
    buffer = (buffer + decoder.decode(value, { stream: !done })).replace(/\r\n/g, "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      processFrame(frame);
      boundary = buffer.indexOf("\n\n");
    }
    if (done) break;
  }
  if (!terminal && buffer.trim()) processFrame(buffer);
  if (!terminal) throw new Error("STREAM_TERMINAL_EVENT_MISSING");
  return terminal;
}

function LegalAnswer({ result, freshness, ru }: { result: LegalResult; freshness?: SourceFreshness; ru: boolean }) {
  return <article className="ai-answer">
    <small>JURO · {result.responseKind === "answer" ? (ru ? "структурированный ответ" : "tuzilgan javob") : (ru ? "нужно уточнение · лимит не списан" : "aniqlik kerak · limit yechilmadi")}</small>
    {freshness && freshness.status !== "fresh" && <div className={`ai-source-freshness ai-source-freshness-${freshness.status}`} role="status">
      <CircleAlert aria-hidden="true" />
      <p>{freshness.status === "unavailable"
        ? (ru
          ? "Полная синхронизация Lex.uz и Advice.uz не подтверждена. JURO не показывает правовой вывод как подтверждённый."
          : "Lex.uz va Advice.uz to‘liq sinxronlangani tasdiqlanmagan. JURO huquqiy xulosani tasdiqlangan deb ko‘rsatmaydi.")
        : (ru
          ? `Правовая база старше ${freshness.maxAgeDays} дней. Последняя подтверждённая полная синхронизация: ${formatDate(freshness.asOf, true)}.`
          : `Huquqiy baza ${freshness.maxAgeDays} kundan eski. Oxirgi tasdiqlangan to‘liq sinxronlash: ${formatDate(freshness.asOf, false)}.`)}</p>
    </div>}
    <h2>{result.summary}</h2>
    <p className="ai-answer-body">{result.answer}</p>
    {result.urgency !== "normal" && <div className="ai-cautions"><ShieldAlert /><p>{result.urgency === "critical" ? (ru ? "Критическая срочность: проверьте ближайший срок и возможность немедленной помощи." : "Juda shoshilinch: yaqin muddat va zudlik bilan yordam olish imkonini tekshiring.") : (ru ? "Вопрос требует приоритетного внимания." : "Masala ustuvor e’tiborni talab qiladi.")}</p></div>}
    {result.clarificationQuestions.length > 0 && <><h3>{ru ? "Что уточнить" : "Nimani aniqlashtirish kerak"}</h3><ol>{result.clarificationQuestions.map((item) => <li key={item}>{item}</li>)}</ol></>}
    {result.confirmedFindings.length > 0 && <><h3>{ru ? "Подтверждено источниками" : "Manbalar bilan tasdiqlangan"}</h3>{result.confirmedFindings.map((item) => <section className="ai-result-block" key={item.title}><strong>{item.title}</strong><p>{item.explanation}</p></section>)}</>}
    {result.assumptions.length > 0 && <><h3>{ru ? "Предположения" : "Taxminlar"}</h3>{result.assumptions.map((item) => <section className="ai-result-block ai-assumption" key={item.statement}><strong>{item.statement}</strong><p>{item.impact}</p></section>)}</>}
    {result.risks.length > 0 && <><h3>{ru ? "Риски" : "Xavflar"}</h3>{result.risks.map((risk) => <section className={`ai-result-block risk-${risk.level}`} key={`${risk.level}:${risk.title}`}><strong>{risk.title}</strong><p>{risk.explanation}</p></section>)}</>}
    {result.actionPlan.length > 0 && <><h3>{ru ? "План действий" : "Harakatlar rejasi"}</h3><ol>{result.actionPlan.map((step) => <li key={step.title}><strong>{step.title}</strong><p>{step.description}</p></li>)}</ol></>}
    {result.suggestedDocument && <section className="ai-result-block"><h3>{ru ? "Рекомендованный документ" : "Tavsiya etilgan hujjat"}</h3><strong>{result.suggestedDocument.title}</strong><p>{result.suggestedDocument.reason}</p></section>}
    {result.requiredDocuments.length > 0 && <><h3>{ru ? "Документы" : "Hujjatlar"}</h3><ul>{result.requiredDocuments.map((document) => <li key={document.name}><strong>{document.name}</strong> — {document.reason}</li>)}</ul></>}
    {result.deadlines.length > 0 && <><h3>{ru ? "Сроки" : "Muddatlar"}</h3>{result.deadlines.map((deadline) => <section className="ai-result-block" key={deadline.title}><strong>{deadline.title}{deadline.dueDate ? ` · ${deadline.dueDate}` : ""}</strong><p>{deadline.calculationMethod}</p></section>)}</>}
  </article>;
}

function formatDate(value: string, ru: boolean) {
  return new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeZone: "Asia/Tashkent" }).format(new Date(value));
}

function safeOfficialUrl(value: string) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}
