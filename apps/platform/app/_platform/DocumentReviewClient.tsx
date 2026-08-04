"use client";

/* eslint-disable react-hooks/set-state-in-effect -- authenticated analysis data is hydrated after the first browser render */

import { AlertTriangle, CheckCircle2, CircleAlert, Download, Eye, FileCheck2, FileDiff, LoaderCircle, RefreshCw, ShieldCheck, Trash2, Upload } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { comparisonText } from "../../content/platform-ui";
import { uploadDocumentForAnalysis } from "../../lib/document-analysis/client-upload";
import type { AccountType, PlatformLocale } from "../../lib/platform/routing";
import { DocumentComparisonClient } from "./DocumentComparisonClient";

type Risk = { id?: string; level: string; title: string; description: string; excerpt: string | null; confidencePercent: number | null; riskType?: "document_internal" | "legal_compliance"; clause?: string | null; page?: number | null; recommendation?: string | null; proposedWording?: string | null; legalBasisSourceIds?: string[] };
type AnalysisExportFormat = "json" | "pdf" | "docx";
type AnalysisExport = { id: string; status: string; format: AnalysisExportFormat; fileName: string; sizeBytes: number | null; errorCode: string | null; completedAt: string | null; createdAt: string };
type Summary = {
  summary?: string; parties?: string[]; dates?: string[]; obligations?: string[]; payments?: string[];
  disputedTerms?: string[]; missingItems?: string[]; questions?: string[]; disclaimer?: string;
};
type Analysis = {
  id: string; status: string; errorCode?: string | null; createdAt?: string; updatedAt?: string;
  fileId: string; fileName: string; mimeType: string; sizeBytes: number; summary?: Summary | null; risks?: Risk[]; exports?: AnalysisExport[];
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
  const [uploadProgress, setUploadProgress] = useState<{ phase: "hashing" | "uploading" | "finalizing"; loaded: number; total: number } | null>(null);
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
  const exportPending = analyses.some(item => item.exports?.some(record => ["queued", "processing", "retrying"].includes(record.status)));
  useEffect(() => {
    if (!exportPending) return;
    const timer = window.setInterval(() => { void load(); }, 5_000);
    return () => window.clearInterval(timer);
  }, [exportPending, load]);

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file || !consent) return;
    setUploading(true);
    setUploadProgress({ phase: "hashing", loaded: 0, total: file.size });
    setError("");
    setNotice("");
    try {
      const body = await uploadDocumentForAnalysis(file, locale, setUploadProgress);
      setNotice(body.message || (ru ? "Анализ завершён." : "Tahlil yakunlandi."));
      setFile(null);
      setConsent(false);
      if (inputRef.current) inputRef.current.value = "";
      await load();
      if (body.analysis) setSelected(body.analysis);
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    finally { setUploading(false); setUploadProgress(null); }
  }

  const uploadPercent = uploadProgress?.phase === "uploading" && uploadProgress.total > 0
    ? Math.round((uploadProgress.loaded / uploadProgress.total) * 100)
    : null;
  const uploadStatus = !uploadProgress ? "" : uploadProgress.phase === "hashing"
    ? (ru ? "Проверяем целостность файла…" : "Fayl yaxlitligi tekshirilmoqda…")
    : uploadProgress.phase === "finalizing"
      ? (ru ? "Сохраняем файл в приватный карантин…" : "Fayl shaxsiy karantinga saqlanmoqda…")
      : uploadPercent === null
        ? (ru ? "Передаём файл…" : "Fayl yuborilmoqda…")
        : (ru ? `Передаём файл: ${uploadPercent}%` : `Fayl yuborilmoqda: ${uploadPercent}%`);

  return <>
    {error && <p className="review-message error" role="alert"><CircleAlert />{error}</p>}
    {notice && <p className="review-message success" role="status"><ShieldCheck />{notice}</p>}
    <form className="review-upload" onSubmit={upload}><div className="review-drop"><Upload /><div><strong>{file?.name || (ru ? "PDF, DOCX, JPG, PNG или ZIP" : "PDF, DOCX, JPG, PNG yoki ZIP")}</strong><span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : (ru ? "До 50 МБ · потоковая загрузка с SHA-256" : "50 MB gacha · SHA-256 bilan oqimli yuklash")}</span></div><input ref={inputRef} type="file" accept=".pdf,.docx,.jpg,.jpeg,.png,.zip,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,application/zip" onChange={event => setFile(event.target.files?.[0] ?? null)} /></div>{uploadProgress && <div className="review-upload-progress" role="progressbar" aria-label={ru ? "Прогресс загрузки файла" : "Fayl yuklash jarayoni"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadPercent ?? undefined} aria-valuetext={uploadStatus}><span style={{ transform: `scaleX(${uploadPercent === null ? .08 : Math.max(.08, uploadPercent / 100)})` }} /></div>}<p className="review-upload-status" aria-live="polite">{uploadStatus}</p><label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /><span>{ru ? "Согласен(на) на приватное сохранение и автоматизированный анализ выбранного файла. Понимаю, что результат нужно проверить." : "Tanlangan faylni maxfiy saqlash va avtomatlashtirilgan tahlilga roziman. Natijani tekshirish kerakligini tushunaman."}</span></label><button disabled={!file || !consent || uploading}>{uploading ? <LoaderCircle className="spin" /> : <FileCheck2 />}{ru ? "Загрузить и проверить" : "Yuklash va tekshirish"}</button></form>
    {loading ? <div className="review-loading"><LoaderCircle className="spin" /></div> : <div className="review-layout"><aside><h2>{ru ? "Последние файлы" : "So‘nggi fayllar"}</h2>{analyses.length ? analyses.map(item => <button className={selected?.id === item.id ? "active" : ""} key={item.id} onClick={() => setSelected(item)}><FileCheck2 /><span><strong>{item.fileName}</strong><small>{statusLabel(item.status, ru)}</small></span></button>) : <p>{ru ? "Загруженных файлов пока нет." : "Hozircha yuklangan fayllar yo‘q."}</p>}</aside><main>{selected ? <AnalysisView analysis={selected} ru={ru} onChanged={load} /> : <div className="review-empty"><FileCheck2 /><h2>{ru ? "Выберите файл для анализа" : "Tahlil uchun faylni tanlang"}</h2></div>}</main></div>}
  </>;
}

function AnalysisView({ analysis, ru, onChanged }: { analysis: Analysis; ru: boolean; onChanged: () => Promise<void> }) {
  const summary = analysis.summary;
  const [exportAttemptKeys, setExportAttemptKeys] = useState<Record<string, string>>({});
  const canOpen = analysis.status === "completed";
  const state = analysisState(analysis.status, analysis.errorCode ?? null, ru);
  const [exportingFormat, setExportingFormat] = useState<AnalysisExportFormat | null>(null);
  const [deletingExportId, setDeletingExportId] = useState<string | null>(null);
  const [exportError, setExportError] = useState("");
  const [exportNotice, setExportNotice] = useState("");
  const formats: AnalysisExportFormat[] = ["json", "pdf", "docx"];
  const exportsByFormat = new Map<AnalysisExportFormat, AnalysisExport>();
  for (const record of [...(analysis.exports ?? [])].sort((left, right) => right.createdAt.localeCompare(left.createdAt))) {
    if (!exportsByFormat.has(record.format)) exportsByFormat.set(record.format, record);
  }
  async function requestExport(format: AnalysisExportFormat) {
    const current = exportsByFormat.get(format);
    setExportingFormat(format); setExportError(""); setExportNotice("");
    const keyName = `${analysis.id}:${format}`;
    const existingKey = current?.status === "failed" ? undefined : exportAttemptKeys[keyName];
    const idempotencyKey = existingKey ?? `analysis-export-${format}-${analysis.id}-${crypto.randomUUID()}`;
    if (!existingKey) setExportAttemptKeys(keys => ({ ...keys, [keyName]: idempotencyKey }));
    try {
      const response = await fetch(`/api/platform/document-analysis/${encodeURIComponent(analysis.id)}/exports`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({ format }),
      });
      const body = await response.json() as { code?: string };
      if (!response.ok) {
        setExportAttemptKeys(keys => withoutKey(keys, keyName));
        throw new Error(exportRequestError(body.code, ru));
      }
      await onChanged();
    } catch (value) { setExportError(value instanceof Error ? value.message : String(value)); }
    finally { setExportingFormat(null); }
  }
  async function removeExport(record: AnalysisExport) {
    if (!window.confirm(ru ? `Удалить экспорт ${record.format.toUpperCase()}?` : `${record.format.toUpperCase()} eksporti o‘chirilsinmi?`)) return;
    setDeletingExportId(record.id); setExportError(""); setExportNotice("");
    try {
      const response = await fetch(`/api/platform/document-analysis/exports/${encodeURIComponent(record.id)}`, {
        method: "DELETE",
      });
      const body = await response.json() as { code?: string };
      if (!response.ok) throw new Error(exportDeleteError(body.code, ru));
      setExportAttemptKeys(keys => withoutKey(keys, `${analysis.id}:${record.format}`));
      await onChanged();
      setExportNotice(ru ? "Экспорт удалён." : "Eksport o‘chirildi.");
    } catch (value) { setExportError(value instanceof Error ? value.message : String(value)); }
    finally { setDeletingExportId(null); }
  }
  return <article className="review-result">
    <div className="review-result-head"><div><small>{statusLabel(analysis.status, ru)}</small><h2>{analysis.fileName}</h2><span>{(analysis.sizeBytes / 1024 / 1024).toFixed(2)} MB · {analysis.mimeType}</span></div><div className="review-result-actions" aria-live="polite">{canOpen && <a href={`/api/platform/document-review/files/${encodeURIComponent(analysis.fileId)}`} target="_blank" rel="noreferrer"><Eye />{ru ? "Открыть файл" : "Faylni ochish"}</a>}{canOpen && formats.map(format => { const record = exportsByFormat.get(format); const pending = ["queued", "processing", "retrying"].includes(record?.status ?? ""); const failed = record?.status === "failed"; const busy = exportingFormat === format || pending; return <span className="review-export-action" key={format}>{record?.status === "completed" ? <a href={`/api/platform/document-analysis/exports/${encodeURIComponent(record.id)}/file`}><Download />{format.toUpperCase()}</a> : <button type="button" disabled={busy || deletingExportId !== null} aria-busy={busy} onClick={() => void requestExport(format)}>{busy ? <LoaderCircle className="spin" /> : failed ? <RefreshCw /> : <Download />}{busy ? (ru ? `${format.toUpperCase()} готовится` : `${format.toUpperCase()} tayyorlanmoqda`) : failed ? (ru ? `Повторить ${format.toUpperCase()}` : `${format.toUpperCase()}ni takrorlash`) : (ru ? `Экспорт ${format.toUpperCase()}` : `${format.toUpperCase()} eksport`)}</button>}{record && ["completed", "failed"].includes(record.status) && <button type="button" aria-label={ru ? `Удалить ${format.toUpperCase()}` : `${format.toUpperCase()}ni o‘chirish`} disabled={deletingExportId !== null || exportingFormat !== null} aria-busy={deletingExportId === record.id} onClick={() => void removeExport(record)}>{deletingExportId === record.id ? <LoaderCircle className="spin" /> : <Trash2 />}</button>}</span>; })}</div></div>
    {exportError && <p className="review-message error" role="alert"><CircleAlert />{exportError}</p>}
    {exportNotice && <p className="review-message success" role="status"><ShieldCheck />{exportNotice}</p>}
    {analysis.status !== "completed" ? <div className="review-awaiting" aria-live="polite"><AlertTriangle /><div><h3>{state.heading}</h3><p>{state.message}</p></div></div> : <><section><h3>{ru ? "Краткое резюме" : "Qisqa xulosa"}</h3><p>{summary?.summary}</p></section><div className="review-summary-grid"><ListBlock title={ru ? "Стороны" : "Tomonlar"} items={summary?.parties} /><ListBlock title={ru ? "Даты" : "Sanalar"} items={summary?.dates} /><ListBlock title={ru ? "Обязательства" : "Majburiyatlar"} items={summary?.obligations} /><ListBlock title={ru ? "Платежи" : "To‘lovlar"} items={summary?.payments} /></div><section><h3>{ru ? "Риски" : "Xavflar"}</h3>{analysis.risks?.length ? <div className="review-risks">{analysis.risks.map((risk, index) => <article key={risk.id || `${risk.title}-${index}`} data-level={risk.level}><span>{riskLabel(risk.level, ru)}</span><h4>{risk.title}</h4><p>{risk.description}</p>{risk.excerpt && <blockquote>{risk.excerpt}</blockquote>}{risk.confidencePercent !== null && <small>{ru ? "Уверенность" : "Ishonch"}: {risk.confidencePercent}%</small>}</article>)}</div> : <p>{ru ? "Структурированные риски не найдены." : "Tuzilgan xavflar topilmadi."}</p>}</section><div className="review-summary-grid"><ListBlock title={ru ? "Не хватает" : "Yetishmaydi"} items={summary?.missingItems} /><ListBlock title={ru ? "Вопросы пользователю" : "Foydalanuvchiga savollar"} items={summary?.questions} /></div><p className="review-disclaimer"><CheckCircle2 />{summary?.disclaimer || (ru ? "Автоматический анализ не заменяет проверку юриста." : "Avtomatik tahlil yurist tekshiruvini almashtirmaydi.")}</p></>}
    {analysis.status === "completed" && analysis.risks?.some((risk) => risk.proposedWording) ? <section className="review-proposed-wording"><h3>{ru ? "Предлагаемые редакции" : "Taklif etilgan tahrirlar"}</h3>{(analysis.risks ?? []).filter((risk) => risk.proposedWording).map((risk, index) => <article key={`proposal-${risk.id || index}`}><h4>{risk.title}</h4>{risk.clause && <small>{risk.clause}</small>}<p>{risk.proposedWording}</p>{risk.recommendation && <p><strong>{ru ? "Почему:" : "Sababi:"}</strong> {risk.recommendation}</p>}{risk.legalBasisSourceIds?.length ? <small>{ru ? "Проверенные источники:" : "Tasdiqlangan manbalar:"} {risk.legalBasisSourceIds.join(", ")}</small> : null}</article>)}</section> : null}
  </article>;
}

function ListBlock({ title, items }: { title: string; items?: string[] }) {
  return <section><h3>{title}</h3>{items?.length ? <ul>{items.map(item => <li key={item}>{item}</li>)}</ul> : <p>—</p>}</section>;
}

function statusLabel(status: string, ru: boolean) {
  if (status === "completed") return ru ? "Анализ завершён" : "Tahlil yakunlandi";
  if (status === "quarantined") return ru ? "В карантине" : "Karantinda";
  if (status === "uploaded") return ru ? "Проверка файла" : "Fayl tekshirilmoqda";
  if (status === "initiated") return ru ? "Ожидает загрузки" : "Yuklashni kutmoqda";
  if (status === "ready") return ru ? "Готов к анализу" : "Tahlilga tayyor";
  if (status === "processing") return ru ? "Анализируется" : "Tahlil qilinmoqda";
  if (status === "persisting") return ru ? "Сохраняет результат" : "Natija saqlanmoqda";
  if (status === "awaiting_ocr") return ru ? "Ожидает OCR" : "OCR kutilmoqda";
  if (status === "awaiting_external_extraction") return ru ? "Ожидает безопасного извлечения" : "Xavfsiz ajratish kutilmoqda";
  if (status === "awaiting_chunked_analysis") return ru ? "Ожидает пакетного анализа" : "Bo‘lib tahlil qilish kutilmoqda";
  if (status === "awaiting_ai_configuration") return ru ? "Ожидает подключения AI" : "AI ulanishini kutmoqda";
  if (status === "failed") return ru ? "Ошибка обработки" : "Qayta ishlash xatosi";
  return ru ? "Файл сохранён" : "Fayl saqlandi";
}

function analysisState(status: string, errorCode: string | null, ru: boolean) {
  if (errorCode === "DOCUMENT_ANALYSIS_PACKAGE_OCR_REQUIRED") {
    return {
      heading: ru ? "В пакете найден скан" : "Paketda skan topildi",
      message: ru
        ? "Пакет не передан AI. Загрузите скан отдельно для OCR или соберите ZIP только из текстовых PDF и DOCX."
        : "Paket AI ga yuborilmadi. Skan faylni OCR uchun alohida yuklang yoki ZIP paketini faqat matnli PDF va DOCX fayllaridan tuzing.",
    };
  }
  const states: Record<string, [string, string, string, string]> = {
    quarantined: ["Анализ не запущен", "Tahlil ishga tushirilmadi", "Файл помещён в карантин и не передан AI: staging-сканер вредоносного содержимого ещё не подключён.", "Fayl karantinga joylandi va AI ga yuborilmadi: staging zararli fayl skaneri hali ulanmagan."],
    processing: ["Идёт анализ", "Tahlil ketmoqda", "JURO извлекает структуру документа и проверяет выводы. Можно покинуть страницу и вернуться позже.", "JURO hujjat tuzilishini ajratmoqda va xulosalarni tekshirmoqda. Sahifadan chiqib, keyin qaytish mumkin."],
    persisting: ["Результат сохраняется", "Natija saqlanmoqda", "Анализ завершён у провайдера; JURO атомарно сохраняет нормализованный результат.", "Provayder tahlilni yakunladi; JURO normallashtirilgan natijani atomar saqlamoqda."],
    awaiting_ocr: ["Нужно распознать скан", "Skan matnini tanish kerak", "Текст не извлечён напрямую. Файл не отправлен AI и ожидает подключённого OCR-конвейера.", "Matn to‘g‘ridan-to‘g‘ri ajratilmadi. Fayl AI ga yuborilmadi va OCR jarayonini kutmoqda."],
    awaiting_external_extraction: ["Нужен безопасный обработчик", "Xavfsiz qayta ishlovchi kerak", "Файл превышает лимит встроенного извлечения и не отправлен AI. Требуется потоковый обработчик.", "Fayl ichki ajratish limitidan katta va AI ga yuborilmadi. Oqimli qayta ishlovchi kerak."],
    awaiting_chunked_analysis: ["Нужен пакетный анализ", "Bo‘lib tahlil qilish kerak", "Извлечённый текст превышает безопасный контекст одного запроса. JURO ожидает разбивку с итоговой проверкой.", "Ajratilgan matn bitta so‘rov uchun xavfsiz kontekstdan katta. JURO bo‘lib tahlil qilishni kutmoqda."],
    awaiting_ai_configuration: ["AI пока не подключён", "AI hali ulanmagan", "Безопасно извлечённый документ сохранён, но не отправлен провайдеру: server-side AI secret не настроен.", "Xavfsiz ajratilgan hujjat saqlandi, ammo provayderga yuborilmadi: server-side AI siri sozlanmagan."],
    failed: ["Обработка остановлена", "Qayta ishlash to‘xtadi", "Результат не создан. JURO сохранил диагностический код без содержимого документа; задачу можно безопасно повторить.", "Natija yaratilmadi. JURO hujjat matnisiz diagnostika kodini saqladi; vazifani xavfsiz qayta boshlash mumkin."],
  };
  const fallback: [string, string, string, string] = ["Проверка ещё не завершена", "Tekshiruv hali tugamadi", "Файл ещё не прошёл обязательные этапы безопасности и не передан AI.", "Fayl majburiy xavfsizlik bosqichlaridan hali o‘tmadi va AI ga yuborilmadi."];
  const [headingRu, headingUz, messageRu, messageUz] = states[status] ?? fallback;
  return { heading: ru ? headingRu : headingUz, message: ru ? messageRu : messageUz };
}

function riskLabel(level: string, ru: boolean) {
  const labels: Record<string, [string, string]> = { high: ["Высокий", "Yuqori"], medium: ["Средний", "O‘rta"], low: ["Низкий", "Past"], information: ["Информация", "Ma’lumot"] };
  return labels[level]?.[ru ? 0 : 1] ?? level;
}

function exportRequestError(code: string | undefined, ru: boolean) {
  if (code === "ANALYSIS_EXPORT_NOT_READY") return ru ? "Экспорт доступен после завершения анализа." : "Eksport tahlil yakunlangandan keyin mavjud.";
  if (code === "ANALYSIS_EXPORT_IDEMPOTENCY_CONFLICT") return ru ? "Запрос экспорта уже использован. Повторите действие." : "Eksport so‘rovi allaqachon ishlatilgan. Amalni takrorlang.";
  return ru ? "Экспорт не создан." : "Eksport yaratilmadi.";
}

function withoutKey(values: Record<string, string>, key: string): Record<string, string> {
  if (!(key in values)) return values;
  const next = { ...values };
  delete next[key];
  return next;
}

function exportDeleteError(code: string | undefined, ru: boolean) {
  if (code === "ANALYSIS_EXPORT_NOT_TERMINAL") return ru ? "Дождитесь завершения экспорта." : "Eksport yakunlanishini kuting.";
  if (code === "ANALYSIS_EXPORT_DELETE_FAILED") return ru ? "Экспорт не удалён. Повторите действие." : "Eksport o‘chirilmadi. Amalni takrorlang.";
  return ru ? "Экспорт не найден." : "Eksport topilmadi.";
}
