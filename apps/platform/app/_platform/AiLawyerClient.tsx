"use client";

/* eslint-disable react-hooks/set-state-in-effect -- authenticated remote data is hydrated after the first browser render */

import { BookOpenCheck, Bot, Check, CircleAlert, FileQuestion, History, LoaderCircle, Pencil, RotateCcw, Send, ShieldAlert, Square, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import type { PlatformLocale } from "../../lib/platform/routing";

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
  suggestLawyer: boolean;
  legalDatabaseAsOf: string;
};
type AiMessageOperation = "new" | "follow_up" | "edit" | "regenerate";
type Branch = { branchId: string; parentBranchId: string | null; requestMessageId: string; responseMessageId: string; operation: AiMessageOperation; versionNumber: number; question: string; createdAt: string };
type Answer = { conversationId: string; messageId?: string; requestMessageId?: string | null; branchId?: string | null; operation?: AiMessageOperation; question?: string; branches?: Branch[]; result: LegalResult; facts: Fact[]; sourceFreshness?: SourceFreshness; usage?: Usage };

export function AiLawyerClient({ locale }: { locale: PlatformLocale }) {
  const ru = locale === "ru";
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const selectedConversationId = searchParams.get("conversationId") || "";
  const selectedBranchId = searchParams.get("branchId") || "";
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

  async function submit(event?: FormEvent, override?: { operation: "regenerate"; sourceMessageId: string }) {
    event?.preventDefault();
    const operation: AiMessageOperation = override?.operation || (editSourceMessageId ? "edit" : (answer?.conversationId || selectedConversationId ? "follow_up" : "new"));
    const sourceMessageId = override?.sourceMessageId || editSourceMessageId || undefined;
    if ((operation !== "regenerate" && !question.trim()) || sending || !status?.configured) return;
    const controller = new AbortController();
    streamAbortRef.current = controller;
    setSending(true);
    setError("");
    setStreamStatus(ru ? "JURO принимает запрос…" : "JURO so‘rovni qabul qilmoqda…");
    try {
      const response = await fetch("/api/platform/ai", {
        method: "POST",
        headers: {
          accept: "text/event-stream",
          "content-type": "application/json",
          "x-juro-csrf": "1",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          question: operation === "regenerate" ? undefined : question,
          locale,
          answerMode,
          reasoningMode,
          conversationId: answer?.conversationId || selectedConversationId || undefined,
          operation,
          sourceMessageId,
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.headers.get("content-type")?.includes("text/event-stream")) {
        throw new Error(ru ? "Не удалось открыть защищённый поток ответа." : "Himoyalangan javob oqimini ochib bo‘lmadi.");
      }
      const terminal = await readAiEventStream(response, (progress) => {
        if (progress.stage === "provider_started") {
          setStreamStatus(ru ? "AI формирует структурированный ответ…" : "AI tuzilgan javobni tayyorlamoqda…");
        } else if (progress.stage === "provider_delta") {
          setStreamStatus(ru ? "JURO проверяет структуру и источники…" : "JURO tuzilma va manbalarni tekshirmoqda…");
        } else if (progress.stage === "fallback") {
          setStreamStatus(ru ? "Основной провайдер недоступен — включён резервный…" : "Asosiy provayder ishlamayapti — zaxira yoqildi…");
        }
      });
      const body = terminal.body as Answer & { error?: string; code?: string };
      if (terminal.status < 200 || terminal.status >= 300) throw new Error(body.error || (ru ? "Не удалось получить ответ." : "Javob olinmadi."));
      if (terminal.status === 202) throw new Error(ru ? "Запрос уже обрабатывается. Откройте диалог через несколько секунд." : "So‘rov qayta ishlanmoqda. Suhbatni bir necha soniyadan so‘ng oching.");
      setAnswer(body);
      if (body.usage) setUsage(body.usage);
      setQuestion("");
      setEditSourceMessageId("");
      const nextParams = new URLSearchParams({ conversationId: body.conversationId });
      if (body.branchId) nextParams.set("branchId", body.branchId);
      router.replace(`${pathname}?${nextParams}`, { scroll: false });
    } catch (value) {
      setError(value instanceof DOMException && value.name === "AbortError"
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

  if (loading) return <div className="ai-workspace-loading"><LoaderCircle className="spin" /></div>;
  return (
    <section className="ai-workspace">
      <aside className="ai-conversations">
        <header><Bot /><div><small>JURO</small><strong>{ru ? "Диалоги" : "Suhbatlar"}</strong></div></header>
        <button className="ai-new" onClick={() => { setAnswer(null); setQuestion(""); setEditSourceMessageId(""); router.replace(pathname, { scroll: false }); }}>{ru ? "+ Новый вопрос" : "+ Yangi savol"}</button>
        <div>{conversations.length ? conversations.map((item) => <button key={item.id} onClick={() => { setEditSourceMessageId(""); router.replace(`${pathname}?conversationId=${encodeURIComponent(item.id)}`, { scroll: false }); }}><strong>{item.title}</strong><small>{formatDate(item.updatedAt, ru)}</small></button>) : <p>{ru ? "История появится после первого обработанного вопроса." : "Tarix birinchi qayta ishlangan savoldan keyin paydo bo‘ladi."}</p>}</div>
      </aside>
      <main className="ai-dialog">
        <header><span><Bot /></span><div><h1>{ru ? "AI-юрист JURO" : "JURO AI-yuristi"}</h1><p>{status?.configured ? (ru ? `Узбекистан · ${usage?.used ?? 0} из ${usage?.limit ?? 20} ответов` : `O‘zbekiston · ${usage?.used ?? 0}/${usage?.limit ?? 20} javob`) : (ru ? "Провайдер не подключён" : "Provayder ulanmagan")}</p></div></header>
        {!status?.configured && <div className="ai-unavailable" role="status"><ShieldAlert /><div><strong>{ru ? "AI пока недоступен" : "AI hozircha ishlamaydi"}</strong><p>{ru ? "Сервер не подтвердил ключ AI-провайдера. JURO не имитирует ответ и не показывает ложный success." : "Server AI-provayder kalitini tasdiqlamadi. JURO javobni taqlid qilmaydi va soxta muvaffaqiyatni ko‘rsatmaydi."}</p></div></div>}
        {error && <div className="ai-error" role="alert"><CircleAlert />{error}</div>}
        <div className="ai-answer-stream" aria-live="polite" aria-busy={sending}>
          {!answer ? (
            <div className="ai-start"><FileQuestion /><h2>{ru ? "Опишите юридическую ситуацию" : "Yuridik vaziyatni yozing"}</h2><p>{ru ? "Не указывайте лишние персональные данные. JURO отделит подтверждённые нормы от предположений." : "Ortiqcha shaxsiy ma’lumotlarni yozmang. JURO tasdiqlangan normalarni taxminlardan ajratadi."}</p></div>
          ) : <>
            <LegalAnswer result={answer.result} freshness={answer.sourceFreshness} ru={ru} />
            <div className="ai-answer-actions">
              <button type="button" disabled={!answer.requestMessageId || sending} onClick={() => { if (answer.requestMessageId) { setQuestion(answer.question || ""); setEditSourceMessageId(answer.requestMessageId); } }}><Pencil />{ru ? "Редактировать вопрос" : "Savolni tahrirlash"}</button>
              <button type="button" disabled={!answer.messageId || sending || !status?.configured} onClick={() => { if (answer.messageId) void submit(undefined, { operation: "regenerate", sourceMessageId: answer.messageId }); }}><RotateCcw />{ru ? "Повторить ответ" : "Javobni qayta yaratish"}</button>
            </div>
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
          <textarea id="ai-question" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={handleComposerKeyDown} disabled={!status?.configured || sending} placeholder={ru ? "Что произошло? Enter — отправить" : "Nima bo‘ldi? Enter — yuborish"} />
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
