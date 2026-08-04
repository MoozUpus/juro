"use client";

import { Check, Eye, RefreshCw, Scale, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type {
  AiQualityClassification,
  AiQualityQueueRow,
  AiQualityReviewDetail,
} from "../../lib/ai/quality-review";

type Locale = "ru" | "uz";
type ReviewStatus = "pending" | "reviewed" | "all";

const copy = {
  ru: {
    title: "Юридическая проверка AI-ответов", description: "Очередь пользовательских сигналов. Текст вопроса и ответа раскрывается только после отдельного аудируемого действия.",
    protected: "Защищённый контур · свежая 2FA", refresh: "Обновить", status: "Статус", pending: "Новые", reviewed: "Проверенные", all: "Все",
    empty: "По выбранному фильтру сигналов нет.", open: "Открыть для проверки", type: "Тип сигнала", model: "Технический контекст", updated: "Обновлено", comment: "Комментарий пользователя", noComment: "Комментарий не добавлен.",
    question: "Вопрос пользователя", answer: "AI-ответ", decision: "Юридическое решение", classification: "Классификация", notes: "Обоснование", corrected: "Исправленный ответ (необязательно)", golden: "Эталонный ответ (необязательно)", save: "Зафиксировать новую версию", success: "Решение сохранено в неизменяемом журнале.",
    loading: "Загрузка…", error: "Не удалось выполнить запрос.", integrity: "Цепочка доступа проверена", stale: "Сигнал изменён после последней проверки", version: "Версия проверки", close: "Закрыть детали",
  },
  uz: {
    title: "AI-javoblarni yuridik tekshirish", description: "Foydalanuvchi signallari navbati. Savol va javob matni faqat alohida audit qilinadigan amaldan keyin ochiladi.",
    protected: "Himoyalangan kontur · yangi 2FA", refresh: "Yangilash", status: "Holat", pending: "Yangi", reviewed: "Tekshirilgan", all: "Barchasi",
    empty: "Tanlangan filtr bo‘yicha signal yo‘q.", open: "Tekshirish uchun ochish", type: "Signal turi", model: "Texnik kontekst", updated: "Yangilangan", comment: "Foydalanuvchi izohi", noComment: "Izoh qo‘shilmagan.",
    question: "Foydalanuvchi savoli", answer: "AI-javob", decision: "Yuridik qaror", classification: "Tasnif", notes: "Asos", corrected: "Tuzatilgan javob (ixtiyoriy)", golden: "Etalon javob (ixtiyoriy)", save: "Yangi versiyani qayd etish", success: "Qaror o‘zgarmas jurnalga saqlandi.",
    loading: "Yuklanmoqda…", error: "So‘rov bajarilmadi.", integrity: "Kirish zanjiri tekshirildi", stale: "Signal oxirgi tekshiruvdan keyin o‘zgargan", version: "Tekshiruv versiyasi", close: "Tafsilotlarni yopish",
  },
} as const;

const classificationCopy: Record<Locale, Record<AiQualityClassification, string>> = {
  ru: { correct: "Корректно", partially_incorrect: "Частично неверно", incorrect: "Неверно", unsafe: "Небезопасно", outdated_source: "Устаревший источник", broken_citation: "Битая/ложная ссылка", insufficient_context: "Недостаточно контекста", language_issue: "Проблема языка" },
  uz: { correct: "To‘g‘ri", partially_incorrect: "Qisman noto‘g‘ri", incorrect: "Noto‘g‘ri", unsafe: "Xavfli", outdated_source: "Eskirgan manba", broken_citation: "Noto‘g‘ri havola", insufficient_context: "Kontekst yetarli emas", language_issue: "Til muammosi" },
};

async function post<T>(body: unknown): Promise<T> {
  const response = await fetch("/api/platform/admin/ai-quality", {
    method: "POST", cache: "no-store",
    headers: { "content-type": "application/json", "x-juro-csrf": "1" },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as T & { code?: string };
  if (!response.ok) throw new Error(payload.code || `HTTP ${response.status}`);
  return payload;
}

export function AiQualityConsole({ locale, reviewerName }: { locale: Locale; reviewerName: string }) {
  const t = copy[locale];
  const [status, setStatus] = useState<ReviewStatus>("pending");
  const [rows, setRows] = useState<AiQualityQueueRow[]>([]);
  const [detail, setDetail] = useState<AiQualityReviewDetail | null>(null);
  const [classification, setClassification] = useState<AiQualityClassification>("correct");
  const [notes, setNotes] = useState("");
  const [correctedAnswer, setCorrectedAnswer] = useState("");
  const [goldenAnswer, setGoldenAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const detailHeading = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const result = await post<{ rows: AiQualityQueueRow[]; accessIntegrity: { valid: boolean } }>({ action: "query", filters: { reviewStatus: status, limit: 100 } });
      if (!result.accessIntegrity.valid) throw new Error("AI_QUALITY_REVIEW_ACCESS_INTEGRITY_FAILED");
      setRows(result.rows); setDetail(null); setAnnouncement(t.integrity);
    } catch (value) { setError(value instanceof Error ? value.message : t.error); }
    finally { setBusy(false); }
  }, [status, t.error, t.integrity]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const open = async (feedbackId: string) => {
    setBusy(true); setError(""); setAnnouncement("");
    try {
      const result = await post<{ detail: AiQualityReviewDetail; accessIntegrity: { valid: boolean } }>({ action: "view", feedbackId });
      if (!result.accessIntegrity.valid) throw new Error("AI_QUALITY_REVIEW_ACCESS_INTEGRITY_FAILED");
      setDetail(result.detail); setClassification("correct"); setNotes(""); setCorrectedAnswer(""); setGoldenAnswer("");
      window.setTimeout(() => detailHeading.current?.focus(), 0);
    } catch (value) { setError(value instanceof Error ? value.message : t.error); }
    finally { setBusy(false); }
  };

  const resolve = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!detail || !notes.trim()) return;
    setBusy(true); setError("");
    try {
      await post({ action: "resolve", feedbackId: detail.feedbackId, classification, notes, correctedAnswer, goldenAnswer });
      setAnnouncement(t.success); await load();
    } catch (value) { setError(value instanceof Error ? value.message : t.error); }
    finally { setBusy(false); }
  };

  const date = (value: string) => new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tashkent" }).format(new Date(value));
  return <div className="staff-console ai-quality-console">
    <a className="staff-skip" href="#staff-main">{locale === "ru" ? "К очереди" : "Navbatga o‘tish"}</a>
    <header className="staff-topbar"><div className="staff-brand"><Scale aria-hidden="true"/><span><b>JURO</b><small>AI QUALITY</small></span></div><div className="staff-session"><span>{t.protected}</span><b>{reviewerName}</b></div><a href={`/${locale === "ru" ? "uz" : "ru"}/admin/ai-quality`} hrefLang={locale === "ru" ? "uz" : "ru"}>{locale === "ru" ? "UZ" : "RU"}</a></header>
    <main id="staff-main" className="staff-main">
      <section className="staff-heading"><div><span>JURO · LEGAL QUALITY</span><h1>{t.title}</h1><p>{t.description}</p></div><button type="button" onClick={() => void load()} disabled={busy}><RefreshCw aria-hidden="true"/>{t.refresh}</button></section>
      <div className="staff-filters"><label>{t.status}<select value={status} onChange={(event) => setStatus(event.target.value as ReviewStatus)}><option value="pending">{t.pending}</option><option value="reviewed">{t.reviewed}</option><option value="all">{t.all}</option></select></label></div>
      <div aria-live="polite" aria-atomic="true">{error && <p className="staff-error" role="alert">{error}<button type="button" onClick={() => void load()}>{t.refresh}</button></p>}{announcement && <p className="staff-verified"><ShieldCheck aria-hidden="true"/>{announcement}</p>}</div>
      {busy && rows.length === 0 && <p className="staff-loading" role="status">{t.loading}</p>}
      {!busy && rows.length === 0 && <section className="staff-empty"><ShieldCheck aria-hidden="true"/><h2>{t.empty}</h2></section>}
      <section className="staff-queue" aria-busy={busy}>{rows.map((row) => <article className="staff-table-row ai-quality-row" key={row.feedbackId}>
        <div className="staff-source"><span>{t.type}</span><b>{row.feedbackType}</b><small>{date(row.feedbackUpdatedAt)}</small></div>
        <div><b>{t.model}</b><p>{row.provider} · {row.model} · {row.reasoningMode}</p>{row.stale && <strong className="staff-warning">{t.stale}</strong>}</div>
        <div className={`staff-status ${row.classification ? "status-approved" : "status-pending"}`}>{row.classification ? classificationCopy[locale][row.classification] : t.pending}{row.latestReviewVersion && <small>{t.version} {row.latestReviewVersion}</small>}</div>
        <div className="staff-row-actions"><button type="button" onClick={() => void open(row.feedbackId)} disabled={busy}><Eye aria-hidden="true"/>{t.open}</button></div>
      </article>)}</section>
      {detail && <section className="ai-quality-detail" aria-labelledby="ai-quality-detail-title">
        <div className="ai-quality-detail-heading"><h2 id="ai-quality-detail-title" ref={detailHeading} tabIndex={-1}>{t.decision}</h2><button type="button" onClick={() => setDetail(null)}>{t.close}</button></div>
        <dl className="ai-quality-facts"><div><dt>{t.type}</dt><dd>{detail.feedbackType}</dd></div><div><dt>{t.model}</dt><dd>{detail.provider} · {detail.model}</dd></div><div><dt>{t.updated}</dt><dd>{date(detail.feedbackUpdatedAt)}</dd></div></dl>
        <article className="ai-quality-content"><h3>{t.question}</h3><p>{detail.question}</p></article>
        <article className="ai-quality-content"><h3>{t.answer}</h3><p>{detail.answer}</p></article>
        <article className="ai-quality-content"><h3>{t.comment}</h3><p>{detail.feedbackComment || t.noComment}</p></article>
        <form className="staff-decision ai-quality-decision" onSubmit={(event) => void resolve(event)}>
          <label>{t.classification}<select value={classification} onChange={(event) => setClassification(event.target.value as AiQualityClassification)}>{Object.entries(classificationCopy[locale]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>{t.notes}<textarea required minLength={1} maxLength={4000} value={notes} onChange={(event) => setNotes(event.target.value)}/></label>
          <label>{t.corrected}<textarea maxLength={50000} value={correctedAnswer} onChange={(event) => setCorrectedAnswer(event.target.value)}/></label>
          <label>{t.golden}<textarea maxLength={50000} value={goldenAnswer} onChange={(event) => setGoldenAnswer(event.target.value)}/></label>
          <button className="staff-approve" type="submit" disabled={busy || !notes.trim()}><Check aria-hidden="true"/>{t.save}</button>
        </form>
      </section>}
    </main>
  </div>;
}
