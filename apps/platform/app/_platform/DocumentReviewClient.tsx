"use client";

/* eslint-disable react-hooks/set-state-in-effect -- authenticated analysis data is hydrated after the first browser render */

import { AlertTriangle, Check, CheckCircle2, CircleAlert, Download, Eye, FileCheck2, FileDiff, FileText, Link2, LoaderCircle, RefreshCw, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { comparisonText } from "../../content/platform-ui";
import { importDocumentUrlForAnalysis, uploadDocumentForAnalysis } from "../../lib/document-analysis/client-upload";
import type { AnalysisPackageContext, AnalysisPackageMemberRole, AnalysisPackageRelationshipKind } from "../../lib/document-comparison/types";
import type { AccountType, PlatformLocale } from "../../lib/platform/routing";
import { DocumentComparisonClient } from "./DocumentComparisonClient";

type Risk = { id?: string; level: string; title: string; description: string; excerpt: string | null; confidencePercent: number | null; riskType?: "document_internal" | "legal_compliance"; clause?: string | null; page?: number | null; recommendation?: string | null; proposedWording?: string | null; legalBasisSourceIds?: string[] };
type AnalysisExportFormat = "json" | "pdf" | "docx";
type AnalysisExportVariant = "analysis_report" | "corrected_clean" | "corrected_redline";
type AnalysisExport = { id: string; status: string; format: AnalysisExportFormat; variant: AnalysisExportVariant; sourceVersionId: string | null; fileName: string; sizeBytes: number | null; errorCode: string | null; completedAt: string | null; createdAt: string };
type Summary = {
  summary?: string; parties?: string[]; dates?: string[]; obligations?: string[]; payments?: string[];
  disputedTerms?: string[]; missingItems?: string[]; questions?: string[]; disclaimer?: string;
  extraction?: { packageContext?: AnalysisPackageContext | null };
};
type Analysis = {
  id: string; status: string; errorCode?: string | null; retryExhausted?: boolean; createdAt?: string; updatedAt?: string;
  fileId: string; fileName: string; mimeType: string; sizeBytes: number; caseId?: string | null; summary?: Summary | null; risks?: Risk[]; exports?: AnalysisExport[];
};
type AnalysisCaseOption = { id: string; title: string; status: string; updatedAt: string };
type RevisionStatus = "pending" | "accepted" | "rejected" | "applied" | "stale" | "ambiguous";
type SuggestedRevision = {
  id: string; analysisId: string; riskId: string; status: RevisionStatus; originalText: string; proposedText: string;
  decidedAt: string | null; appliedVersionId: string | null; riskLevel: string; riskTitle: string;
  riskDescription: string; clause: string | null; page: number | null; recommendation: string | null;
  legalBasisSourceIds: string[];
};
type AnalysisDocumentVersion = {
  id: string; analysisId: string; version: number; sourceKind: "extracted" | "corrected"; fileName: string;
  mimeType: string; sizeBytes: number; sha256: string; createdAt: string;
};
type BuilderAnalysisSource = {
  documentId: string;
  sourceRevision: number;
  currentRevision: number;
};

const activeAnalysisStatuses = new Set([
  "quarantined",
  "ready",
  "processing",
  "persisting",
  "awaiting_ocr",
  "ocr_processing",
  "retrying",
]);

function hasRetryExhausted(analysis: Pick<Analysis, "retryExhausted">): boolean {
  return analysis.retryExhausted === true;
}

export function DocumentReviewClient({ locale, accountType, publicUrlImportEnabled }: { locale: PlatformLocale; accountType: AccountType; publicUrlImportEnabled: boolean }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [mode, setMode] = useState<"review" | "compare">(() => searchParams.get("mode") === "compare" ? "compare" : "review");
  const copy = comparisonText[locale];
  const ru = locale === "ru";
  function selectMode(next: "review" | "compare") {
    setMode(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "compare") params.set("mode", "compare");
    else params.delete("mode");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
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
          ? <SingleDocumentReview locale={locale} initialCaseId={searchParams.get("caseId")} initialAnalysisId={searchParams.get("analysisId")} publicUrlImportEnabled={publicUrlImportEnabled} />
          : <DocumentComparisonClient locale={locale} accountType={accountType} />}
      </div>
    </section>
  );
}

function SingleDocumentReview({ locale, initialCaseId, initialAnalysisId, publicUrlImportEnabled }: { locale: PlatformLocale; initialCaseId: string | null; initialAnalysisId: string | null; publicUrlImportEnabled: boolean }) {
  const ru = locale === "ru";
  const inputRef = useRef<HTMLInputElement>(null);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [cases, setCases] = useState<AnalysisCaseOption[]>([]);
  const [uploadCaseId, setUploadCaseId] = useState(initialCaseId ?? "");
  const [selected, setSelected] = useState<Analysis | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [publicUrl, setPublicUrl] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ phase: "hashing" | "uploading" | "finalizing"; loaded: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/platform/document-review", { cache: "no-store" });
      const body = await response.json() as { analyses?: Analysis[]; cases?: AnalysisCaseOption[]; error?: string };
      if (!response.ok) throw new Error(body.error || (ru ? "Анализы не загрузились." : "Tahlillar yuklanmadi."));
      const nextAnalyses = body.analyses ?? [];
      const nextCases = body.cases ?? [];
      setAnalyses(nextAnalyses);
      setCases(nextCases);
      setUploadCaseId(current => current || (initialCaseId && nextCases.some(item => item.id === initialCaseId) ? initialCaseId : ""));
      setSelected(current => current ? nextAnalyses.find(item => item.id === current.id) ?? current : (nextAnalyses.find(item => item.id === initialAnalysisId) ?? nextAnalyses[0] ?? null));
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    finally { setLoading(false); }
  }, [initialAnalysisId, initialCaseId, ru]);
  useEffect(() => { void load(); }, [load]);
  const exportPending = analyses.some(item => item.exports?.some(record => ["queued", "processing", "retrying"].includes(record.status)));
  const analysisPending = analyses.some((item) =>
    !hasRetryExhausted(item) && activeAnalysisStatuses.has(item.status)
  );
  useEffect(() => {
    if (!exportPending && !analysisPending) return;
    const timer = window.setInterval(() => { void load(); }, 5_000);
    return () => window.clearInterval(timer);
  }, [analysisPending, exportPending, load]);

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file || !consent) return;
    setUploading(true);
    setUploadProgress({ phase: "hashing", loaded: 0, total: file.size });
    setError("");
    setNotice("");
    try {
      const body = await uploadDocumentForAnalysis(file, locale, setUploadProgress, uploadCaseId || null);
      setNotice(body.message || (ru ? "Анализ завершён." : "Tahlil yakunlandi."));
      setFile(null);
      setConsent(false);
      if (inputRef.current) inputRef.current.value = "";
      await load();
      if (body.analysis) setSelected(body.analysis);
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    finally { setUploading(false); setUploadProgress(null); }
  }

  async function importUrl(event: FormEvent) {
    event.preventDefault();
    if (!publicUrlImportEnabled || !publicUrl.trim() || !consent) return;
    setUploading(true);
    setUploadProgress(null);
    setError("");
    setNotice("");
    try {
      const body = await importDocumentUrlForAnalysis(publicUrl, locale, uploadCaseId || null);
      setNotice(body.message || (ru ? "Файл импортирован в приватный карантин." : "Fayl shaxsiy karantinga import qilindi."));
      setPublicUrl("");
      setConsent(false);
      await load();
      if (body.analysis) setSelected(body.analysis);
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    finally { setUploading(false); }
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
  const consentCopy = ru
    ? (publicUrlImportEnabled
      ? "Согласен(на) на приватное сохранение и автоматизированный анализ выбранного файла или публичной ссылки. Понимаю, что результат нужно проверить."
      : "Согласен(на) на приватное сохранение и автоматизированный анализ выбранного файла. Понимаю, что результат нужно проверить.")
    : (publicUrlImportEnabled
      ? "Tanlangan fayl yoki ommaviy havolani maxfiy saqlash va avtomatlashtirilgan tahlilga roziman. Natijani tekshirish kerakligini tushunaman."
      : "Tanlangan faylni maxfiy saqlash va avtomatlashtirilgan tahlilga roziman. Natijani tekshirish kerakligini tushunaman.");

  return <>
    {error && <p className="review-message error" role="alert"><CircleAlert />{error}</p>}
    {notice && <p className="review-message success" role="status"><ShieldCheck />{notice}</p>}
    <form className="review-upload" onSubmit={upload}>
      <label className="review-drop" htmlFor="document-review-file">
        <Upload />
        <div>
          <strong>{file?.name || (ru ? "PDF, DOCX, JPG, PNG или ZIP" : "PDF, DOCX, JPG, PNG yoki ZIP")}</strong>
          <span id="document-review-file-hint">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : (ru ? "До 50 МБ · потоковая загрузка с SHA-256" : "50 MB gacha · SHA-256 bilan oqimli yuklash")}</span>
        </div>
        <input id="document-review-file" ref={inputRef} type="file" aria-label={ru ? "Выберите файл для анализа" : "Tahlil uchun faylni tanlang"} aria-describedby="document-review-file-hint" accept=".pdf,.docx,.jpg,.jpeg,.png,.zip,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,application/zip" disabled={uploading} onChange={event => setFile(event.target.files?.[0] ?? null)} />
      </label>
      <label className="review-upload-case"><span>{ru ? "Добавить анализ в дело" : "Tahlilni ishga qo‘shish"}</span><select value={uploadCaseId} onChange={event => setUploadCaseId(event.target.value)} disabled={uploading}><option value="">{ru ? "Без дела" : "Ishsiz"}</option>{cases.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>{uploadProgress && <div className="review-upload-progress" role="progressbar" aria-label={ru ? "Прогресс загрузки файла" : "Fayl yuklash jarayoni"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadPercent ?? undefined} aria-valuetext={uploadStatus}><span style={{ transform: `scaleX(${uploadPercent === null ? .08 : Math.max(.08, uploadPercent / 100)})` }} /></div>}<p className="review-upload-status" aria-live="polite">{uploadStatus}</p><label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /><span>{consentCopy}</span></label><button disabled={!file || !consent || uploading}>{uploading ? <LoaderCircle className="spin" /> : <FileCheck2 />}{ru ? "Загрузить и проверить" : "Yuklash va tekshirish"}</button>
    </form>
    {publicUrlImportEnabled ? <form className="review-url-import" onSubmit={importUrl}>
      <div><Link2 /><label htmlFor="review-public-url"><strong>{ru ? "Импортировать публичную ссылку" : "Ommaviy havolani import qilish"}</strong><span>{ru ? "Только HTTPS · без паролей и закрытых кабинетов · PDF, DOCX, JPG, PNG или ZIP" : "Faqat HTTPS · parol va yopiq kabinetlarsiz · PDF, DOCX, JPG, PNG yoki ZIP"}</span></label></div>
      <input id="review-public-url" type="url" inputMode="url" autoComplete="url" maxLength={2048} placeholder="https://example.uz/document.pdf" value={publicUrl} onChange={event => setPublicUrl(event.target.value)} disabled={uploading} />
      <button type="submit" disabled={!publicUrl.trim() || !consent || uploading}>{uploading ? <LoaderCircle className="spin" /> : <Link2 />}{ru ? "Импортировать" : "Import qilish"}</button>
    </form> : <aside className="review-url-import-disabled" aria-label={ru ? "Импорт по публичной ссылке временно недоступен" : "Ommaviy havola orqali import vaqtincha mavjud emas"}>
      <Link2 aria-hidden="true" />
      <div><strong>{ru ? "Импорт по публичной ссылке" : "Ommaviy havola orqali import"}</strong><span>{ru ? "Контролируемая beta-функция временно недоступна. Загрузите файл с устройства." : "Nazorat qilinadigan beta-funksiya vaqtincha mavjud emas. Faylni qurilmadan yuklang."}</span></div>
    </aside>}
    {loading ? <div className="review-loading"><LoaderCircle className="spin" /></div> : <div className="review-layout"><aside><h2>{ru ? "Последние файлы" : "So‘nggi fayllar"}</h2>{analyses.length ? analyses.map(item => <button className={selected?.id === item.id ? "active" : ""} key={item.id} onClick={() => setSelected(item)}><FileCheck2 /><span><strong>{item.fileName}</strong><small>{statusLabel(item.status, ru, hasRetryExhausted(item))}</small></span></button>) : <p>{ru ? "Загруженных файлов пока нет." : "Hozircha yuklangan fayllar yo‘q."}</p>}</aside><main>{selected ? <AnalysisView analysis={selected} cases={cases} ru={ru} onChanged={load} /> : <div className="review-empty"><FileCheck2 /><h2>{ru ? "Выберите файл для анализа" : "Tahlil uchun faylni tanlang"}</h2></div>}</main></div>}
  </>;
}

function AnalysisView({ analysis, cases, ru, onChanged }: { analysis: Analysis; cases: AnalysisCaseOption[]; ru: boolean; onChanged: () => Promise<void> }) {
  const summary = analysis.summary;
  const [exportAttemptKeys, setExportAttemptKeys] = useState<Record<string, string>>({});
  const canOpen = analysis.status === "completed";
  const retryExhausted = hasRetryExhausted(analysis);
  const state = analysisState(analysis.status, analysis.errorCode ?? null, retryExhausted, ru);
  const [exportingFormat, setExportingFormat] = useState<AnalysisExportFormat | null>(null);
  const [deletingExportId, setDeletingExportId] = useState<string | null>(null);
  const [exportError, setExportError] = useState("");
  const [exportNotice, setExportNotice] = useState("");
  const [caseId, setCaseId] = useState(analysis.caseId ?? "");
  const [caseBusy, setCaseBusy] = useState(false);
  const [caseMessage, setCaseMessage] = useState("");
  useEffect(() => { setCaseId(analysis.caseId ?? ""); setCaseMessage(""); }, [analysis.id, analysis.caseId]);
  const formats: AnalysisExportFormat[] = ["json", "pdf", "docx"];
  const exportsByFormat = new Map<AnalysisExportFormat, AnalysisExport>();
  for (const record of [...(analysis.exports ?? [])].filter((item) => item.variant === "analysis_report").sort((left, right) => right.createdAt.localeCompare(left.createdAt))) {
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
  async function saveCaseLink() {
    setCaseBusy(true); setCaseMessage("");
    try {
      const response = await fetch(`/api/platform/document-analysis/${encodeURIComponent(analysis.id)}/case`, {
        method: "PUT",
        headers: { "content-type": "application/json", "idempotency-key": `analysis-case-${crypto.randomUUID()}`, "x-juro-csrf": "1" },
        body: JSON.stringify({ caseId: caseId || null }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || (ru ? "Дело не сохранено." : "Ish saqlanmadi."));
      await onChanged();
      setCaseMessage(caseId ? (ru ? "Анализ добавлен в дело." : "Tahlil ishga qo‘shildi.") : (ru ? "Анализ отвязан от дела." : "Tahlil ishdan ajratildi."));
    } catch (value) { setCaseMessage(value instanceof Error ? value.message : String(value)); }
    finally { setCaseBusy(false); }
  }
  return <article className="review-result">
    <div className="review-result-head"><div><small>{statusLabel(analysis.status, ru, retryExhausted)}</small><h2>{analysis.fileName}</h2><span>{(analysis.sizeBytes / 1024 / 1024).toFixed(2)} MB · {analysis.mimeType}</span></div><div className="review-result-actions" aria-live="polite">{canOpen && <a href={`/api/platform/document-review/files/${encodeURIComponent(analysis.fileId)}`} target="_blank" rel="noreferrer"><Eye />{ru ? "Открыть файл" : "Faylni ochish"}</a>}{canOpen && formats.map(format => { const record = exportsByFormat.get(format); const pending = ["queued", "processing", "retrying"].includes(record?.status ?? ""); const failed = record?.status === "failed"; const busy = exportingFormat === format || pending; return <span className="review-export-action" key={format}>{record?.status === "completed" ? <a href={`/api/platform/document-analysis/exports/${encodeURIComponent(record.id)}/file`}><Download />{format.toUpperCase()}</a> : <button type="button" disabled={busy || deletingExportId !== null} aria-busy={busy} onClick={() => void requestExport(format)}>{busy ? <LoaderCircle className="spin" /> : failed ? <RefreshCw /> : <Download />}{busy ? (ru ? `${format.toUpperCase()} готовится` : `${format.toUpperCase()} tayyorlanmoqda`) : failed ? (ru ? `Повторить ${format.toUpperCase()}` : `${format.toUpperCase()}ni takrorlash`) : (ru ? `Экспорт ${format.toUpperCase()}` : `${format.toUpperCase()} eksport`)}</button>}{record && ["completed", "failed"].includes(record.status) && <button type="button" aria-label={ru ? `Удалить ${format.toUpperCase()}` : `${format.toUpperCase()}ni o‘chirish`} disabled={deletingExportId !== null || exportingFormat !== null} aria-busy={deletingExportId === record.id} onClick={() => void removeExport(record)}>{deletingExportId === record.id ? <LoaderCircle className="spin" /> : <Trash2 />}</button>}</span>; })}</div></div>
    <div className="review-case-link"><label><span>{ru ? "Дело" : "Ish"}</span><select value={caseId} onChange={event => { setCaseId(event.target.value); setCaseMessage(""); }} disabled={caseBusy}><option value="">{ru ? "Без дела" : "Ishsiz"}</option>{cases.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><button type="button" disabled={caseBusy || caseId === (analysis.caseId ?? "")} aria-busy={caseBusy} onClick={() => void saveCaseLink()}>{caseBusy ? <LoaderCircle className="spin" /> : <FileText />}{ru ? "Сохранить привязку" : "Bog‘lanishni saqlash"}</button><span role="status" aria-live="polite">{caseMessage}</span></div>
    {exportError && <p className="review-message error" role="alert"><CircleAlert />{exportError}</p>}
    {exportNotice && <p className="review-message success" role="status"><ShieldCheck />{exportNotice}</p>}
    {analysis.status !== "completed" ? <div className="review-awaiting" aria-live="polite"><AlertTriangle /><div><h3>{state.heading}</h3><p>{state.message}</p></div></div> : <><section><h3>{ru ? "Краткое резюме" : "Qisqa xulosa"}</h3><p>{summary?.summary}</p></section>{summary?.extraction?.packageContext?.members.length ? <PackageContextView context={summary.extraction.packageContext} ru={ru} /> : null}<div className="review-summary-grid"><ListBlock title={ru ? "Стороны" : "Tomonlar"} items={summary?.parties} /><ListBlock title={ru ? "Даты" : "Sanalar"} items={summary?.dates} /><ListBlock title={ru ? "Обязательства" : "Majburiyatlar"} items={summary?.obligations} /><ListBlock title={ru ? "Платежи" : "To‘lovlar"} items={summary?.payments} /></div><section><h3>{ru ? "Риски" : "Xavflar"}</h3>{analysis.risks?.length ? <div className="review-risks">{analysis.risks.map((risk, index) => <article key={risk.id || `${risk.title}-${index}`} data-level={risk.level}><span>{riskLabel(risk.level, ru)}</span><h4>{risk.title}</h4><p>{risk.description}</p>{risk.excerpt && <blockquote>{risk.excerpt}</blockquote>}{risk.confidencePercent !== null && <small>{ru ? "Уверенность" : "Ishonch"}: {risk.confidencePercent}%</small>}</article>)}</div> : <p>{ru ? "Структурированные риски не найдены." : "Tuzilgan xavflar topilmadi."}</p>}</section><div className="review-summary-grid"><ListBlock title={ru ? "Не хватает" : "Yetishmaydi"} items={summary?.missingItems} /><ListBlock title={ru ? "Вопросы пользователю" : "Foydalanuvchiga savollar"} items={summary?.questions} /></div><p className="review-disclaimer"><CheckCircle2 />{summary?.disclaimer || (ru ? "Автоматический анализ не заменяет проверку юриста." : "Avtomatik tahlil yurist tekshiruvini almashtirmaydi.")}</p></>}
    {analysis.status === "completed" && analysis.risks?.some((risk) => risk.proposedWording) ? <RevisionPanel analysisId={analysis.id} exports={analysis.exports ?? []} ru={ru} onAnalysisChanged={onChanged} /> : null}
  </article>;
}

function RevisionPanel({ analysisId, exports, ru, onAnalysisChanged }: { analysisId: string; exports: AnalysisExport[]; ru: boolean; onAnalysisChanged: () => Promise<void> }) {
  const [revisions, setRevisions] = useState<SuggestedRevision[]>([]);
  const [versions, setVersions] = useState<AnalysisDocumentVersion[]>([]);
  const [builderSource, setBuilderSource] = useState<BuilderAnalysisSource | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [applying, setApplying] = useState<"selected" | "all" | null>(null);
  const [confirmMode, setConfirmMode] = useState<"selected" | "all" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const [deletingExportId, setDeletingExportId] = useState<string | null>(null);
  const [applyingBuilderVersionId, setApplyingBuilderVersionId] = useState<string | null>(null);
  const [attemptKeys, setAttemptKeys] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(`/api/platform/document-analysis/${encodeURIComponent(analysisId)}/revisions`, { cache: "no-store" });
      const body = await response.json() as { revisions?: SuggestedRevision[]; versions?: AnalysisDocumentVersion[]; builderSource?: BuilderAnalysisSource | null; code?: string; error?: string };
      if (!response.ok) throw new Error(revisionError(body.code, body.error, ru));
      setRevisions(body.revisions ?? []);
      setVersions(body.versions ?? []);
      setBuilderSource(body.builderSource ?? null);
      setSelectedIds((current) => current.filter((id) => (body.revisions ?? []).some((item) => item.id === id && item.status === "accepted")));
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setLoading(false);
    }
  }, [analysisId, ru]);

  useEffect(() => { setLoading(true); void load(); }, [load]);

  async function decide(revision: SuggestedRevision, decision: "accepted" | "rejected") {
    setBusyId(revision.id); setError(""); setNotice("");
    try {
      const response = await fetch(
        `/api/platform/document-analysis/${encodeURIComponent(analysisId)}/revisions/${encodeURIComponent(revision.id)}`,
        { method: "PATCH", headers: { "content-type": "application/json", "x-juro-csrf": "1" }, body: JSON.stringify({ decision }) },
      );
      const body = await response.json() as { code?: string; error?: string };
      if (!response.ok) throw new Error(revisionError(body.code, body.error, ru));
      setSelectedIds((current) => decision === "accepted"
        ? [...new Set([...current, revision.id])]
        : current.filter((id) => id !== revision.id));
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusyId(null);
    }
  }

  async function apply(mode: "selected" | "all") {
    const ids = mode === "selected" ? [...selectedIds].sort() : [];
    const attemptName = `${mode}:${ids.join("|")}`;
    const idempotencyKey = attemptKeys[attemptName] ?? `analysis-revision-${crypto.randomUUID()}`;
    setAttemptKeys((current) => ({ ...current, [attemptName]: idempotencyKey }));
    setApplying(mode); setConfirmMode(null); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/platform/document-analysis/${encodeURIComponent(analysisId)}/revisions`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey, "x-juro-csrf": "1" },
        body: JSON.stringify({ mode, revisionIds: ids }),
      });
      const body = await response.json() as { code?: string; error?: string; partial?: boolean; version?: AnalysisDocumentVersion };
      if (!response.ok) {
        setAttemptKeys((current) => withoutKey(current, attemptName));
        throw new Error(revisionError(body.code, body.error, ru));
      }
      setSelectedIds([]);
      setNotice(body.partial
        ? (ru ? "Новая версия создана. Неоднозначные или устаревшие фрагменты пропущены." : "Yangi nusxa yaratildi. Noaniq yoki eskirgan parchalar o‘tkazib yuborildi.")
        : (ru ? `Нормализованная версия ${body.version?.version ?? ""} создана.` : `${body.version?.version ?? ""}-normallashtirilgan nusxa yaratildi.`));
      await load();
      await onAnalysisChanged().catch(() => undefined);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
      await load();
    } finally {
      setApplying(null);
    }
  }

  async function requestVersionExport(version: AnalysisDocumentVersion, variant: "corrected_clean" | "corrected_redline", format: "pdf" | "docx") {
    const keyName = `${version.id}:${variant}:${format}`;
    const existing = exports.find((item) => item.sourceVersionId === version.id && item.variant === variant && item.format === format);
    const idempotencyKey = existing?.status === "failed" ? `analysis-version-export-${crypto.randomUUID()}` : attemptKeys[keyName] ?? `analysis-version-export-${crypto.randomUUID()}`;
    setAttemptKeys((current) => ({ ...current, [keyName]: idempotencyKey }));
    setExportingKey(keyName); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/platform/document-analysis/${encodeURIComponent(analysisId)}/exports`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey, "x-juro-csrf": "1" },
        body: JSON.stringify({ format, variant, sourceVersionId: version.id }),
      });
      const body = await response.json() as { code?: string };
      if (!response.ok) { setAttemptKeys((current) => withoutKey(current, keyName)); throw new Error(exportRequestError(body.code, ru)); }
      setNotice(ru ? "Экспорт поставлен в защищённую очередь." : "Eksport himoyalangan navbatga qo‘yildi.");
      await onAnalysisChanged();
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    finally { setExportingKey(null); }
  }

  async function removeVersionExport(record: AnalysisExport) {
    if (!window.confirm(ru ? "Удалить этот экспорт?" : "Bu eksport o‘chirilsinmi?")) return;
    setDeletingExportId(record.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/platform/document-analysis/exports/${encodeURIComponent(record.id)}`, { method: "DELETE", headers: { "x-juro-csrf": "1" } });
      const body = await response.json() as { code?: string };
      if (!response.ok) throw new Error(exportDeleteError(body.code, ru));
      await onAnalysisChanged();
      setNotice(ru ? "Экспорт удалён." : "Eksport o‘chirildi.");
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    finally { setDeletingExportId(null); }
  }

  async function applyVersionToBuilder(version: AnalysisDocumentVersion) {
    if (!builderSource) return;
    const keyName = `builder:${version.id}:${builderSource.sourceRevision}`;
    const idempotencyKey = attemptKeys[keyName] ?? `builder-analysis-correction-${crypto.randomUUID()}`;
    setAttemptKeys((current) => ({ ...current, [keyName]: idempotencyKey }));
    setApplyingBuilderVersionId(version.id); setError(""); setNotice("");
    try {
      const response = await fetch(
        `/api/platform/document-analysis/${encodeURIComponent(analysisId)}/versions/${encodeURIComponent(version.id)}/apply-builder`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "idempotency-key": idempotencyKey, "x-juro-csrf": "1" },
          body: JSON.stringify({ sourceRevision: builderSource.sourceRevision }),
        },
      );
      const body = await response.json() as { revision?: number; code?: string; error?: string };
      if (!response.ok || !body.revision) {
        if (response.status !== 409) setAttemptKeys((current) => withoutKey(current, keyName));
        throw new Error(body.error || (ru ? "Исправленная версия не применена в конструкторе." : "Tuzatilgan nusxa konstruktorda qo‘llanmadi."));
      }
      setBuilderSource((current) => current ? { ...current, currentRevision: body.revision as number } : null);
      setNotice(ru
        ? `Исправления сохранены в конструкторе как ревизия ${body.revision}.`
        : `Tuzatishlar konstruktorda ${body.revision}-reviziya sifatida saqlandi.`);
      await onAnalysisChanged().catch(() => undefined);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setApplyingBuilderVersionId(null);
    }
  }

  const accepted = revisions.filter((item) => item.status === "accepted");
  const available = revisions.filter((item) => item.status === "pending" || item.status === "accepted");
  const correctedVersions = versions.filter((item) => item.sourceKind === "corrected");
  return <section className="review-revisions" aria-labelledby={`revision-title-${analysisId}`}>
    <div className="review-revisions-heading">
      <div><h3 id={`revision-title-${analysisId}`}>{ru ? "Предлагаемые исправления" : "Taklif etilgan tuzatishlar"}</h3><p>{ru ? "Сравните исходный и новый текст. JURO ничего не применяет без вашего действия." : "Asl va yangi matnni solishtiring. JURO sizning amalingizsiz hech narsani qo‘llamaydi."}</p></div>
      {correctedVersions.length > 0 && <div className="review-version-downloads" aria-label={ru ? "Исправленные версии" : "Tuzatilgan nusxalar"}>{correctedVersions.map((version) => <div className="review-version-export" key={version.id}><strong>{ru ? `Версия ${version.version}` : `${version.version}-nusxa`}</strong><a href={`/api/platform/document-analysis/${encodeURIComponent(analysisId)}/versions/${encodeURIComponent(version.id)}/file`}><Download />MD</a>{builderSource && <button type="button" disabled={applyingBuilderVersionId !== null || builderSource.currentRevision !== builderSource.sourceRevision} aria-busy={applyingBuilderVersionId === version.id} title={builderSource.currentRevision !== builderSource.sourceRevision ? (ru ? "Документ изменился после анализа — запустите новый анализ" : "Hujjat tahlildan keyin o‘zgardi — yangi tahlilni boshlang") : undefined} onClick={() => void applyVersionToBuilder(version)}>{applyingBuilderVersionId === version.id ? <LoaderCircle className="spin" /> : <FileCheck2 />}{ru ? "В конструктор" : "Konstruktorga"}</button>}{(["corrected_clean", "corrected_redline"] as const).flatMap((variant) => (["docx", "pdf"] as const).map((format) => {
        const record = [...exports].filter((item) => item.sourceVersionId === version.id && item.variant === variant && item.format === format).sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
        const keyName = `${version.id}:${variant}:${format}`;
        const pending = ["queued", "processing", "retrying"].includes(record?.status ?? "");
        const label = `${variant === "corrected_clean" ? (ru ? "Чистая" : "Toza") : (ru ? "С отметками" : "Belgilar bilan")} ${format.toUpperCase()}`;
        return <span key={`${variant}-${format}`}>{record?.status === "completed" ? <a href={`/api/platform/document-analysis/exports/${encodeURIComponent(record.id)}/file`}><Download />{label}</a> : <button type="button" disabled={pending || exportingKey !== null || deletingExportId !== null} aria-busy={pending || exportingKey === keyName} onClick={() => void requestVersionExport(version, variant, format)}>{pending || exportingKey === keyName ? <LoaderCircle className="spin" /> : record?.status === "failed" ? <RefreshCw /> : <Download />}{label}</button>}{record && ["completed", "failed"].includes(record.status) && <button type="button" className="icon" aria-label={ru ? `Удалить ${label}` : `${label}ni o‘chirish`} disabled={deletingExportId !== null || exportingKey !== null} onClick={() => void removeVersionExport(record)}>{deletingExportId === record.id ? <LoaderCircle className="spin" /> : <Trash2 />}</button>}</span>;
      }))}</div>)}</div>}
    </div>
    <p className="review-normalized-note"><FileText />{ru ? "Исправления создают отдельный нормализованный Markdown-файл. Исходный PDF или DOCX и его форматирование не изменяются." : "Tuzatishlar alohida normallashtirilgan Markdown faylini yaratadi. Asl PDF yoki DOCX va uning formatlanishi o‘zgarmaydi."}</p>
    {error && <p className="review-message error" role="alert"><CircleAlert />{error}<button type="button" onClick={() => void load()}>{ru ? "Повторить" : "Takrorlash"}</button></p>}
    {notice && <p className="review-message success" role="status"><CheckCircle2 />{notice}</p>}
    {loading ? <div className="review-revision-skeleton" aria-label={ru ? "Загружаем исправления" : "Tuzatishlar yuklanmoqda"}><i /><i /><i /></div> : revisions.length === 0 ? <div className="review-revision-empty"><FileText /><h4>{ru ? "Для этого анализа нет применимых исправлений" : "Bu tahlil uchun qo‘llanadigan tuzatishlar yo‘q"}</h4><p>{ru ? "Старые анализы могут не иметь нормализованной исходной версии. Новый анализ создаёт её автоматически." : "Eski tahlillarda normallashtirilgan manba nusxasi bo‘lmasligi mumkin. Yangi tahlil uni avtomatik yaratadi."}</p></div> : <div className="review-revision-list">{revisions.map((revision) => {
      const terminal = ["applied", "stale", "ambiguous"].includes(revision.status);
      const busy = busyId === revision.id;
      const selected = selectedIds.includes(revision.id);
      return <article key={revision.id} data-status={revision.status}>
        <header><div><span>{riskLabel(revision.riskLevel, ru)}</span><h4>{revision.riskTitle}</h4>{revision.clause && <small>{revision.clause}{revision.page ? ` · ${ru ? "стр." : "sah."} ${revision.page}` : ""}</small>}</div><strong>{revisionStatusLabel(revision.status, ru)}</strong></header>
        <div className="review-revision-diff"><div><small>{ru ? "Исходный текст" : "Asl matn"}</small><p>{revision.originalText}</p></div><div><small>{ru ? "Предлагаемый текст" : "Taklif etilgan matn"}</small><p>{revision.proposedText}</p></div></div>
        {revision.recommendation && <p><b>{ru ? "Обоснование:" : "Asos:"}</b> {revision.recommendation}</p>}
        {revision.legalBasisSourceIds.length > 0 && <p className="review-revision-sources"><b>{ru ? "Связанные источники:" : "Bog‘langan manbalar:"}</b> {revision.legalBasisSourceIds.join(", ")}</p>}
        {!terminal && <footer><label><input type="checkbox" checked={selected} disabled={revision.status !== "accepted" || busy} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...new Set([...current, revision.id])] : current.filter((id) => id !== revision.id))} /><span>{ru ? "Включить в выбранные" : "Tanlanganlarga qo‘shish"}</span></label><div><button type="button" disabled={busy} aria-busy={busy} className={revision.status === "rejected" ? "active" : ""} onClick={() => void decide(revision, "rejected")}>{busy ? <LoaderCircle className="spin" /> : <X />}{ru ? "Отклонить" : "Rad etish"}</button><button type="button" disabled={busy} aria-busy={busy} className={revision.status === "accepted" ? "active primary" : "primary"} onClick={() => void decide(revision, "accepted")}>{busy ? <LoaderCircle className="spin" /> : <Check />}{ru ? "Принять" : "Qabul qilish"}</button></div></footer>}
      </article>;
    })}</div>}
    {!loading && revisions.length > 0 && <div className="review-revision-apply">
      <div><strong>{ru ? `Принято: ${accepted.length}. Выбрано: ${selectedIds.length}.` : `Qabul qilindi: ${accepted.length}. Tanlandi: ${selectedIds.length}.`}</strong><span>{ru ? "Каждое применение создаёт новую неизменяемую версию." : "Har bir qo‘llash yangi o‘zgarmas nusxani yaratadi."}</span></div>
      <div><button type="button" disabled={selectedIds.length === 0 || applying !== null} onClick={() => setConfirmMode("selected")}>{applying === "selected" ? <LoaderCircle className="spin" /> : <Check />}{ru ? "Применить выбранные" : "Tanlanganlarni qo‘llash"}</button><button type="button" className="primary" disabled={available.length === 0 || applying !== null} onClick={() => setConfirmMode("all")}>{applying === "all" ? <LoaderCircle className="spin" /> : <FileCheck2 />}{ru ? "Применить все доступные" : "Barcha mavjudlarini qo‘llash"}</button></div>
    </div>}
    {confirmMode && <div className="review-revision-confirm" aria-labelledby={`revision-confirm-${analysisId}`}><div><h4 id={`revision-confirm-${analysisId}`}>{ru ? "Создать новую нормализованную версию?" : "Yangi normallashtirilgan nusxa yaratilsinmi?"}</h4><p>{confirmMode === "all" ? (ru ? `Будут применены все доступные исправления: ${available.length}.` : `Barcha mavjud tuzatishlar qo‘llanadi: ${available.length}.`) : (ru ? `Будут применены выбранные исправления: ${selectedIds.length}.` : `Tanlangan tuzatishlar qo‘llanadi: ${selectedIds.length}.`)}</p></div><div><button type="button" onClick={() => setConfirmMode(null)}>{ru ? "Отмена" : "Bekor qilish"}</button><button type="button" className="primary" onClick={() => void apply(confirmMode)}>{ru ? "Создать версию" : "Nusxa yaratish"}</button></div></div>}
  </section>;
}

function ListBlock({ title, items }: { title: string; items?: string[] }) {
  return <section><h3>{title}</h3>{items?.length ? <ul>{items.map(item => <li key={item}>{item}</li>)}</ul> : <p>—</p>}</section>;
}

function PackageContextView({ context, ru }: { context: AnalysisPackageContext; ru: boolean }) {
  const names = new Map(context.members.map((member) => [member.id, member.name]));
  const primary = context.primaryMemberId ? names.get(context.primaryMemberId) : null;
  return <section className="review-package-context" aria-labelledby="review-package-context-heading">
    <div className="review-package-context-head"><div><h3 id="review-package-context-heading">{ru ? "Связи документов в пакете" : "Paketdagi hujjatlar aloqasi"}</h3><p>{ru ? "JURO определил структуру по именам и содержимому файлов. Проверьте связи перед применением юридических выводов." : "JURO tuzilmani fayl nomlari va mazmuni bo‘yicha aniqladi. Huquqiy xulosalarni qo‘llashdan oldin aloqalarni tekshiring."}</p></div>{primary && <span>{ru ? "Основной" : "Asosiy"}: {primary}</span>}</div>
    <ul className="review-package-members">{context.members.map((member) => <li key={member.id} data-primary={member.id === context.primaryMemberId || undefined}><FileText /><span><strong>{member.name}</strong><small>{packageRoleLabel(member.role, ru)} · {member.detectedLanguage.toUpperCase()}</small></span></li>)}</ul>
    {context.relationships.length ? <ul className="review-package-relationships">{context.relationships.map((relationship, index) => <li key={`${relationship.fromMemberId}:${relationship.toMemberId}:${relationship.kind}:${index}`}><strong>{names.get(relationship.fromMemberId) ?? relationship.fromMemberId} → {names.get(relationship.toMemberId) ?? relationship.toMemberId}</strong><span>{packageRelationshipLabel(relationship.kind, ru)} · {ru ? "уверенность" : "ishonch"}: {packageConfidenceLabel(relationship.confidence, ru)}</span></li>)}</ul> : <p>{ru ? "Явные связи не найдены; файлы будут проанализированы как единый пакет." : "Aniq aloqalar topilmadi; fayllar yagona paket sifatida tahlil qilinadi."}</p>}
  </section>;
}

function packageRoleLabel(role: AnalysisPackageMemberRole, ru: boolean) {
  const labels: Record<AnalysisPackageMemberRole, [string, string]> = {
    primary: ["Основной документ", "Asosiy hujjat"], annex: ["Приложение", "Ilova"],
    amendment: ["Дополнительное соглашение", "Qo‘shimcha kelishuv"], acceptance_act: ["Акт", "Dalolatnoma"],
    correspondence: ["Переписка или уведомление", "Xat yoki bildirishnoma"], evidence: ["Подтверждающий документ", "Tasdiqlovchi hujjat"],
    unknown: ["Роль требует проверки", "Rolni tekshirish kerak"],
  };
  return labels[role][ru ? 0 : 1];
}

function packageRelationshipLabel(kind: AnalysisPackageRelationshipKind, ru: boolean) {
  const labels: Record<AnalysisPackageRelationshipKind, [string, string]> = {
    annex_to: ["приложение к документу", "hujjatga ilova"], amends: ["изменяет документ", "hujjatni o‘zgartiradi"],
    acceptance_for: ["подтверждает исполнение", "ijroni tasdiqlaydi"], supports: ["подтверждает обстоятельства", "holatlarni tasdiqlaydi"],
    references: ["ссылается на документ", "hujjatga havola qiladi"], possible_duplicate: ["возможная копия", "ehtimoliy nusxa"],
  };
  return labels[kind][ru ? 0 : 1];
}

function packageConfidenceLabel(confidence: "high" | "medium" | "low", ru: boolean) {
  const labels = { high: ["высокая", "yuqori"], medium: ["средняя", "o‘rta"], low: ["низкая", "past"] } as const;
  return labels[confidence][ru ? 0 : 1];
}

function statusLabel(status: string, ru: boolean, retryExhausted = false) {
  if (status === "completed") return ru ? "Анализ завершён" : "Tahlil yakunlandi";
  if (retryExhausted) return ru ? "Требует повтора" : "Qayta ishga tushirish kerak";
  if (status === "quarantined") return ru ? "В карантине" : "Karantinda";
  if (status === "uploaded") return ru ? "Проверка файла" : "Fayl tekshirilmoqda";
  if (status === "initiated") return ru ? "Ожидает загрузки" : "Yuklashni kutmoqda";
  if (status === "ready") return ru ? "Готов к анализу" : "Tahlilga tayyor";
  if (status === "processing") return ru ? "Анализируется" : "Tahlil qilinmoqda";
  if (status === "persisting") return ru ? "Сохраняет результат" : "Natija saqlanmoqda";
  if (status === "awaiting_ocr") return ru ? "Ожидает OCR" : "OCR kutilmoqda";
  if (status === "ocr_processing") return ru ? "Распознаёт текст" : "Matn tanilmoqda";
  if (status === "retrying") return ru ? "Повторяет анализ" : "Tahlil qayta urinmoqda";
  if (status === "awaiting_external_extraction") return ru ? "Ожидает безопасного извлечения" : "Xavfsiz ajratish kutilmoqda";
  if (status === "awaiting_chunked_analysis") return ru ? "Ожидает пакетного анализа" : "Bo‘lib tahlil qilish kutilmoqda";
  if (status === "awaiting_ai_configuration") return ru ? "Ожидает подключения AI" : "AI ulanishini kutmoqda";
  if (status === "failed") return ru ? "Ошибка обработки" : "Qayta ishlash xatosi";
  return ru ? "Файл сохранён" : "Fayl saqlandi";
}

function analysisState(status: string, errorCode: string | null, retryExhausted: boolean, ru: boolean) {
  if (retryExhausted) {
    return {
      heading: ru ? "Автоматические попытки остановлены" : "Avtomatik urinishlar to‘xtatildi",
      message: ru
        ? "Результат не создан после ограниченных повторов. Файл сохранён; сотрудник JURO может безопасно повторить задачу."
        : "Cheklangan qayta urinishlardan keyin natija yaratilmagan. Fayl saqlangan; JURO xodimi vazifani xavfsiz qayta ishga tushirishi mumkin.",
    };
  }
  const pdfFailures: Record<string, [string, string, string, string]> = {
    OCR_PAGE_LIMIT_EXCEEDED: ["Слишком много страниц", "Sahifalar soni limitdan oshdi", "Документ или пакет содержит более 500 известных страниц. Файл не передан AI; разделите его на части.", "Hujjat yoki paketda 500 dan ortiq aniqlangan sahifa bor. Fayl AI ga yuborilmadi; uni qismlarga ajrating."],
    OCR_PDF_PASSWORD_PROTECTED: ["PDF защищён паролем", "PDF parol bilan himoyalangan", "Снимите пароль с копии документа и загрузите её повторно. JURO не пытался обойти защиту.", "Hujjat nusxasidan parolni olib tashlang va qayta yuklang. JURO himoyani chetlab o‘tishga urinmadi."],
    OCR_PDF_CORRUPT: ["PDF повреждён", "PDF buzilgan", "Структура PDF не прошла проверку до распознавания. Создайте новую копию файла и повторите загрузку.", "PDF tuzilishi matnni tanishdan oldingi tekshiruvdan o‘tmadi. Yangi nusxa yarating va qayta yuklang."],
    OCR_PDF_PREFLIGHT_TIMEOUT: ["Проверка PDF не завершилась", "PDF tekshiruvi tugamadi", "Проверка структуры превысила безопасное время. Файл не передан AI; повторите попытку позже или разделите документ.", "Tuzilma tekshiruvi xavfsiz vaqt chegarasidan oshdi. Fayl AI ga yuborilmadi; keyinroq takrorlang yoki hujjatni bo‘ling."],
  };
  const pdfFailure = errorCode ? pdfFailures[errorCode] : undefined;
  if (pdfFailure) {
    return { heading: ru ? pdfFailure[0] : pdfFailure[1], message: ru ? pdfFailure[2] : pdfFailure[3] };
  }
  if (errorCode === "DOCUMENT_ANALYSIS_CAPACITY_REQUIRED") {
    return {
      heading: ru ? "Документ превышает доступный лимит" : "Hujjat mavjud limitdan katta",
      message: ru
        ? "JURO не отправил файл в AI: для него ещё не подключён безопасный потоковый или пакетный обработчик. Разделите материал на меньшие части и загрузите их отдельно."
        : "JURO faylni AI ga yubormadi: buning uchun xavfsiz oqimli yoki bo‘lib qayta ishlovchi hali ulanmagan. Materialni kichik qismlarga ajrating va ularni alohida yuklang.",
    };
  }
  if (errorCode === "DOCUMENT_ANALYSIS_PACKAGE_OCR_REQUIRED") {
    return {
      heading: ru ? "В пакете найден скан" : "Paketda skan topildi",
      message: ru
        ? "Пакет поставлен в очередь распознавания по отдельным файлам. Юридический анализ начнётся только после успешного OCR всего пакета."
        : "Paket fayllar bo‘yicha matnni tanish navbatiga qo‘yildi. Yuridik tahlil faqat butun paket OCR’dan muvaffaqiyatli o‘tgach boshlanadi.",
    };
  }
  const states: Record<string, [string, string, string, string]> = {
    quarantined: ["Анализ не запущен", "Tahlil ishga tushirilmadi", "Файл помещён в карантин и не передан AI. JURO передаст его только после успешного сканирования вредоносного содержимого.", "Fayl karantinga joylandi va AI ga yuborilmadi. JURO uni faqat zararli tarkib muvaffaqiyatli skanerlangandan keyin yuboradi."],
    processing: ["Идёт анализ", "Tahlil ketmoqda", "JURO извлекает структуру документа и проверяет выводы. Можно покинуть страницу и вернуться позже.", "JURO hujjat tuzilishini ajratmoqda va xulosalarni tekshirmoqda. Sahifadan chiqib, keyin qaytish mumkin."],
    persisting: ["Результат сохраняется", "Natija saqlanmoqda", "Анализ завершён у провайдера; JURO атомарно сохраняет нормализованный результат.", "Provayder tahlilni yakunladi; JURO normallashtirilgan natijani atomar saqlamoqda."],
    awaiting_ocr: ["Идёт подготовка OCR", "OCR tayyorlanmoqda", "Текст не извлечён напрямую. Файл поставлен в защищённую очередь распознавания; юридический AI получит только проверенный результат.", "Matn to‘g‘ridan-to‘g‘ri ajratilmadi. Fayl himoyalangan OCR navbatiga qo‘yildi; yuridik AI faqat tekshirilgan natijani oladi."],
    ocr_processing: ["Распознаём текст", "Matn tanilmoqda", "JURO распознаёт страницы документа в защищённом процессе. Юридический AI получит только проверенный текст.", "JURO hujjat sahifalarini himoyalangan jarayonda tanimoqda. Yuridik AI faqat tekshirilgan matnni oladi."],
    retrying: ["Повторяем анализ", "Tahlil qayta urinmoqda", "Временная ошибка не создала результат. JURO выполняет ограниченный безопасный повтор в фоне; можно вернуться позже.", "Vaqtinchalik xato natija yaratmadi. JURO fonda cheklangan xavfsiz qayta urinishni bajarmoqda; keyinroq qaytishingiz mumkin."],
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

function revisionStatusLabel(status: RevisionStatus, ru: boolean) {
  const labels: Record<RevisionStatus, [string, string]> = {
    pending: ["Ожидает решения", "Qaror kutilmoqda"],
    accepted: ["Принято", "Qabul qilindi"],
    rejected: ["Отклонено", "Rad etildi"],
    applied: ["Применено", "Qo‘llandi"],
    stale: ["Фрагмент изменился", "Parcha o‘zgargan"],
    ambiguous: ["Нужно выбрать вручную", "Qo‘lda tanlash kerak"],
  };
  return labels[status][ru ? 0 : 1];
}

function revisionError(code: string | undefined, fallback: string | undefined, ru: boolean) {
  const messages: Record<string, [string, string]> = {
    ANALYSIS_REVISION_NOT_FOUND: ["Исправления не найдены.", "Tuzatishlar topilmadi."],
    ANALYSIS_REVISION_NOT_READY: ["Исправления доступны после завершения анализа.", "Tuzatishlar tahlil yakunlangandan keyin mavjud."],
    ANALYSIS_REVISION_INVALID_DECISION: ["Это исправление уже нельзя изменить.", "Bu tuzatishni endi o‘zgartirib bo‘lmaydi."],
    ANALYSIS_REVISION_INVALID_SELECTION: ["Выбранные исправления недоступны для применения.", "Tanlangan tuzatishlarni qo‘llab bo‘lmaydi."],
    ANALYSIS_REVISION_IDEMPOTENCY_CONFLICT: ["Запрос устарел. Обновите страницу и повторите действие.", "So‘rov eskirgan. Sahifani yangilang va amalni takrorlang."],
    ANALYSIS_REVISION_SOURCE_INVALID: ["Нормализованный текст недоступен или повреждён.", "Normallashtirilgan matn mavjud emas yoki buzilgan."],
    ANALYSIS_REVISION_NO_APPLICABLE_CHANGES: ["Фрагменты изменились или встречаются несколько раз. Автоматическое применение остановлено.", "Parchalar o‘zgargan yoki bir necha marta uchraydi. Avtomatik qo‘llash to‘xtatildi."],
    ANALYSIS_REVISION_CONFLICT: ["Версия изменилась. Обновите страницу и повторите действие.", "Nusxa o‘zgardi. Sahifani yangilang va amalni takrorlang."],
    ANALYSIS_REVISION_STORAGE_FAILED: ["Версия не сохранена. Исходный документ не изменён.", "Nusxa saqlanmadi. Asl hujjat o‘zgarmadi."],
  };
  const message = code ? messages[code] : undefined;
  return message?.[ru ? 0 : 1] ?? fallback ?? (ru ? "Действие не выполнено." : "Amal bajarilmadi.");
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
