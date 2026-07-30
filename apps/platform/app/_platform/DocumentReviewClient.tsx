"use client";

/* eslint-disable react-hooks/set-state-in-effect -- authenticated analysis data is hydrated after the first browser render */

import { AlertTriangle, CheckCircle2, CircleAlert, Eye, FileCheck2, FileDiff, LoaderCircle, ShieldCheck, Upload } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { comparisonText } from "../../content/platform-ui";
import { uploadDocumentForAnalysis } from "../../lib/document-analysis/client-upload";
import type { AccountType, PlatformLocale } from "../../lib/platform/routing";
import { DocumentComparisonClient } from "./DocumentComparisonClient";

type Risk = { id?: string; level: string; title: string; description: string; excerpt: string | null; confidencePercent: number | null };
type Summary = {
  summary?: string; parties?: string[]; dates?: string[]; obligations?: string[]; payments?: string[];
  disputedTerms?: string[]; missingItems?: string[]; questions?: string[]; disclaimer?: string;
};
type Analysis = {
  id: string; status: string; errorCode?: string | null; createdAt?: string; updatedAt?: string;
  fileId: string; fileName: string; mimeType: string; sizeBytes: number; summary?: Summary | null; risks?: Risk[];
};

export function DocumentReviewClient({ locale, accountType }: { locale: PlatformLocale; accountType: AccountType }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [mode, setMode] = useState<"review" | "compare">(() => searchParams.get("mode") === "compare" ? "compare" : "review");
  const copy = comparisonText[locale];
  const ru = locale === "ru";
  function selectMode(next: "review" | "compare") {
    setMode(next);
    router.replace(next === "compare" ? `${pathname}?mode=compare` : pathname, { scroll: false });
  }
  function moveModeFocus(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "ArrowRight" || event.key === "End" ? "compare" : "review";
    selectMode(next);
    document.getElementById(`review-mode-${next}`)?.focus();
  }
  return (
    <section className="review-workspace">
      <header>
        {mode === "compare" ? <FileDiff /> : <FileCheck2 />}
        <div><small>JURO · {copy.tool}</small><h1>{copy.title}</h1><p>{copy.description}</p></div>
      </header>
      <div className="review-mode-tabs" role="tablist" aria-label={ru ? "Режим анализа" : "Tahlil rejimi"}>
        <button id="review-mode-review" role="tab" aria-controls="review-mode-panel" aria-selected={mode === "review"} tabIndex={mode === "review" ? 0 : -1} className={mode === "review" ? "active" : ""} onKeyDown={moveModeFocus} onClick={() => selectMode("review")}><FileCheck2 />{copy.singleMode}</button>
        <button id="review-mode-compare" role="tab" aria-controls="review-mode-panel" aria-selected={mode === "compare"} tabIndex={mode === "compare" ? 0 : -1} className={mode === "compare" ? "active" : ""} onKeyDown={moveModeFocus} onClick={() => selectMode("compare")}><FileDiff />{copy.compareMode}</button>
      </div>
      <div id="review-mode-panel" role="tabpanel" aria-labelledby={`review-mode-${mode}`}>
        {mode === "review"
          ? <SingleDocumentReview locale={locale} />
          : <DocumentComparisonClient locale={locale} accountType={accountType} />}
      </div>
    </section>
  );
}

function SingleDocumentReview({ locale }: { locale: PlatformLocale }) {
  const ru = locale === "ru";
  const inputRef = useRef<HTMLInputElement>(null);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [selected, setSelected] = useState<Analysis | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/platform/document-review", { cache: "no-store" });
      const body = await response.json() as { analyses?: Analysis[]; error?: string };
      if (!response.ok) throw new Error(body.error || (ru ? "Анализы не загрузились." : "Tahlillar yuklanmadi."));
      setAnalyses(body.analyses ?? []);
      setSelected(current => current ? (body.analyses ?? []).find(item => item.id === current.id) ?? current : (body.analyses?.[0] ?? null));
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    finally { setLoading(false); }
  }, [ru]);
  useEffect(() => { void load(); }, [load]);

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file || !consent) return;
    setUploading(true);
    setError("");
    setNotice("");
    try {
      const body = await uploadDocumentForAnalysis(file, locale);
      setNotice(body.message || (ru ? "Анализ завершён." : "Tahlil yakunlandi."));
      setFile(null);
      setConsent(false);
      if (inputRef.current) inputRef.current.value = "";
      await load();
      if (body.analysis) setSelected(body.analysis);
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    finally { setUploading(false); }
  }

  return <>
    {error && <p className="review-message error" role="alert"><CircleAlert />{error}</p>}
    {notice && <p className="review-message success" role="status"><ShieldCheck />{notice}</p>}
    <form className="review-upload" onSubmit={upload}><div className="review-drop"><Upload /><div><strong>{file?.name || (ru ? "PDF, DOCX, JPG, PNG или ZIP" : "PDF, DOCX, JPG, PNG yoki ZIP")}</strong><span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : (ru ? "До 50 МБ · потоковая загрузка с SHA-256" : "50 MB gacha · SHA-256 bilan oqimli yuklash")}</span></div><input ref={inputRef} type="file" accept=".pdf,.docx,.jpg,.jpeg,.png,.zip,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,application/zip" onChange={event => setFile(event.target.files?.[0] ?? null)} /></div><label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /><span>{ru ? "Согласен(на) на приватное сохранение и автоматизированный анализ выбранного файла. Понимаю, что результат нужно проверить." : "Tanlangan faylni maxfiy saqlash va avtomatlashtirilgan tahlilga roziman. Natijani tekshirish kerakligini tushunaman."}</span></label><button disabled={!file || !consent || uploading}>{uploading ? <LoaderCircle className="spin" /> : <FileCheck2 />}{ru ? "Загрузить и проверить" : "Yuklash va tekshirish"}</button></form>
    {loading ? <div className="review-loading"><LoaderCircle className="spin" /></div> : <div className="review-layout"><aside><h2>{ru ? "Последние файлы" : "So‘nggi fayllar"}</h2>{analyses.length ? analyses.map(item => <button className={selected?.id === item.id ? "active" : ""} key={item.id} onClick={() => setSelected(item)}><FileCheck2 /><span><strong>{item.fileName}</strong><small>{statusLabel(item.status, ru)}</small></span></button>) : <p>{ru ? "Загруженных файлов пока нет." : "Hozircha yuklangan fayllar yo‘q."}</p>}</aside><main>{selected ? <AnalysisView analysis={selected} ru={ru} /> : <div className="review-empty"><FileCheck2 /><h2>{ru ? "Выберите файл для анализа" : "Tahlil uchun faylni tanlang"}</h2></div>}</main></div>}
  </>;
}

function AnalysisView({ analysis, ru }: { analysis: Analysis; ru: boolean }) {
  const summary = analysis.summary;
  const canOpen = analysis.status === "completed";
  const waitingMessage = analysis.status === "quarantined"
    ? (ru ? "Файл помещён в карантин и не передан AI: staging-сканер вредоносного содержимого ещё не подключён." : "Fayl karantinga joylandi va AI ga yuborilmadi: staging zararli fayl skaneri hali ulanmagan.")
    : (ru ? "Файл ещё не прошёл обязательную проверку безопасности и не передан AI." : "Fayl majburiy xavfsizlik tekshiruvidan hali o‘tmadi va AI ga yuborilmadi.");
  return <article className="review-result"><div className="review-result-head"><div><small>{statusLabel(analysis.status, ru)}</small><h2>{analysis.fileName}</h2><span>{(analysis.sizeBytes / 1024 / 1024).toFixed(2)} MB · {analysis.mimeType}</span></div>{canOpen && <a href={`/api/platform/document-review/files/${encodeURIComponent(analysis.fileId)}`} target="_blank" rel="noreferrer"><Eye />{ru ? "Открыть файл" : "Faylni ochish"}</a>}</div>{analysis.status !== "completed" ? <div className="review-awaiting"><AlertTriangle /><div><h3>{ru ? "Анализ не запущен" : "Tahlil ishga tushirilmadi"}</h3><p>{waitingMessage}</p></div></div> : <><section><h3>{ru ? "Краткое резюме" : "Qisqa xulosa"}</h3><p>{summary?.summary}</p></section><div className="review-summary-grid"><ListBlock title={ru ? "Стороны" : "Tomonlar"} items={summary?.parties} /><ListBlock title={ru ? "Даты" : "Sanalar"} items={summary?.dates} /><ListBlock title={ru ? "Обязательства" : "Majburiyatlar"} items={summary?.obligations} /><ListBlock title={ru ? "Платежи" : "To‘lovlar"} items={summary?.payments} /></div><section><h3>{ru ? "Риски" : "Xavflar"}</h3>{analysis.risks?.length ? <div className="review-risks">{analysis.risks.map((risk, index) => <article key={risk.id || `${risk.title}-${index}`} data-level={risk.level}><span>{riskLabel(risk.level, ru)}</span><h4>{risk.title}</h4><p>{risk.description}</p>{risk.excerpt && <blockquote>{risk.excerpt}</blockquote>}{risk.confidencePercent !== null && <small>{ru ? "Уверенность" : "Ishonch"}: {risk.confidencePercent}%</small>}</article>)}</div> : <p>{ru ? "Структурированные риски не найдены." : "Tuzilgan xavflar topilmadi."}</p>}</section><div className="review-summary-grid"><ListBlock title={ru ? "Не хватает" : "Yetishmaydi"} items={summary?.missingItems} /><ListBlock title={ru ? "Вопросы пользователю" : "Foydalanuvchiga savollar"} items={summary?.questions} /></div><p className="review-disclaimer"><CheckCircle2 />{summary?.disclaimer || (ru ? "Автоматический анализ не заменяет проверку юриста." : "Avtomatik tahlil yurist tekshiruvini almashtirmaydi.")}</p></>}</article>;
}

function ListBlock({ title, items }: { title: string; items?: string[] }) {
  return <section><h3>{title}</h3>{items?.length ? <ul>{items.map(item => <li key={item}>{item}</li>)}</ul> : <p>—</p>}</section>;
}

function statusLabel(status: string, ru: boolean) {
  if (status === "completed") return ru ? "Анализ завершён" : "Tahlil yakunlandi";
  if (status === "quarantined") return ru ? "В карантине" : "Karantinda";
  if (status === "uploaded") return ru ? "Проверка файла" : "Fayl tekshirilmoqda";
  if (status === "initiated") return ru ? "Ожидает загрузки" : "Yuklashni kutmoqda";
  if (status === "awaiting_ai_configuration") return ru ? "Ожидает подключения AI" : "AI ulanishini kutmoqda";
  return ru ? "Файл сохранён" : "Fayl saqlandi";
}

function riskLabel(level: string, ru: boolean) {
  const labels: Record<string, [string, string]> = { high: ["Высокий", "Yuqori"], medium: ["Средний", "O‘rta"], low: ["Низкий", "Past"], information: ["Информация", "Ma’lumot"] };
  return labels[level]?.[ru ? 0 : 1] ?? level;
}
