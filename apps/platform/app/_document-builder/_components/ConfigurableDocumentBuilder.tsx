"use client";

/* eslint-disable react-hooks/set-state-in-effect -- drafts and saved documents intentionally hydrate after mount */

import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Download, Eye, FileCheck2, LoaderCircle, LockKeyhole, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DocumentDefinition, QuestionnaireAnswers, QuestionnaireField, AnswerScalar } from "../../../lib/document-builder/registry";
import { calculateQuestionnaireProgress, conditionMatches, createQuestionnaireAnswers, localize, renderConfiguredDocument, setAnswer, validateQuestionnaire, type BuilderLanguage } from "../../../lib/document-builder/registry/engine";
import type { GenericStoredDocument } from "../../../lib/document-builder/types";
import { builderNavigationPaths } from "../../../lib/platform/builder-paths";
import { DocumentPreview } from "./DocumentPreview";
import { BuilderAnalysisLauncher } from "./BuilderAnalysisLauncher";
import { BuilderVersionHistory } from "./BuilderVersionHistory";
import type { BuilderUser } from "./BuilderHeader";
import { apiFetch, downloadAuthenticatedFile } from "./api-client";
import { useDebouncedEffect } from "../_hooks/useDebouncedEffect";

type Phase = "intro" | "builder" | "success";
type GeneratedFile = { id: string; name: string; url: string; mimeType: string; size: number };
type GenerationResult = { status: string; files: { docx: GeneratedFile; pdf: GeneratedFile; zip: GeneratedFile } };
type GuestDraft = { phase: Phase; language: BuilderLanguage; step: number; title: string; answers: QuestionnaireAnswers; finalText: string; manuallyEdited: boolean };

function languageFromBrowser(): BuilderLanguage {
  if (typeof window === "undefined") return "ru";
  return window.localStorage.getItem("juro-builder-language") === "uz" || window.localStorage.getItem("juro-lang") === "uz" ? "uz" : "ru";
}

function draftKey(code: string): string { return `juro-configured-draft-${code}`; }

function defaultTitle(definition: DocumentDefinition, language: BuilderLanguage): string {
  const base = language === "uz" ? definition.titleUz : definition.titleRu;
  return `${base} — ${new Intl.DateTimeFormat(language === "uz" ? "uz-UZ" : "ru-RU").format(new Date())}`;
}

function fieldInputType(field: QuestionnaireField): string {
  if (field.type === "date") return "date";
  if (["money", "percent", "number"].includes(field.type)) return "number";
  if (field.type === "email") return "email";
  if (field.type === "phone") return "tel";
  return "text";
}

function RepeatedGroup({ field, language, value, onChange }: { field: QuestionnaireField; language: BuilderLanguage; value: Record<string, AnswerScalar>[]; onChange: (value: Record<string, AnswerScalar>[]) => void }) {
  const empty = Object.fromEntries((field.fields ?? []).map((child) => [child.id, child.type === "checkbox" ? false : ""])) as Record<string, AnswerScalar>;
  return <div className="dbt-config-repeat"><div className="dbt-config-repeat-head"><strong>{localize(field.label, language)}</strong><button type="button" onClick={() => onChange([...value, { ...empty }])}><Plus size={16}/>{language === "uz" ? "Qo‘shish" : "Добавить"}</button></div>
    {value.map((item, index) => <fieldset key={`${field.id}-${index}`}><legend>{language === "uz" ? `Yozuv ${index + 1}` : `Запись ${index + 1}`}</legend><div className="dbt-config-fields">{(field.fields ?? []).map((child) => <FieldControl key={child.id} field={child} language={language} value={item[child.id] ?? ""} error="" onChange={(next) => onChange(value.map((row, rowIndex) => rowIndex === index ? { ...row, [child.id]: next as AnswerScalar } : row))}/>)}</div><button type="button" className="dbt-remove-row" onClick={() => onChange(value.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={15}/>{language === "uz" ? "Olib tashlash" : "Удалить"}</button></fieldset>)}
    {value.length === 0 && <p className="dbt-inline-note">{language === "uz" ? "Hozircha yozuvlar yo‘q." : "Записей пока нет."}</p>}
  </div>;
}

function FieldControl({ field, language, value, error, onChange }: { field: QuestionnaireField; language: BuilderLanguage; value: unknown; error: string; onChange: (value: unknown) => void }) {
  const label = localize(field.label, language);
  const help = field.help ? localize(field.help, language) : "";
  if (field.type === "repeatable-group" || field.type === "table" || field.type === "witnesses") {
    return <RepeatedGroup field={field} language={language} value={Array.isArray(value) ? value as Record<string, AnswerScalar>[] : []} onChange={onChange}/>;
  }
  if (field.type === "checkbox") return <label className={`dbt-config-checkbox ${error ? "invalid" : ""}`}><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)}/><span>{label}{field.required && " *"}</span>{help && <small>{help}</small>}</label>;
  if (field.type === "radio") return <fieldset className={`dbt-config-choice ${error ? "invalid" : ""}`}><legend>{label}{field.required && " *"}</legend><div>{field.options?.map((option) => <label key={option.value}><input type="radio" name={field.id} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)}/><span>{localize(option.label, language)}</span></label>)}</div>{help && <small>{help}</small>}{error && <em>{language === "uz" ? "Majburiy maydon" : "Обязательное поле"}</em>}</fieldset>;
  if (field.type === "select" || field.type === "currency" || field.type === "clause-choice") return <label className={`dbt-config-field ${error ? "invalid" : ""}`}><span>{label}{field.required && " *"}</span><select value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}><option value="">{language === "uz" ? "Tanlang" : "Выберите"}</option>{field.options?.map((option) => <option value={option.value} key={option.value}>{localize(option.label, language)}</option>)}</select>{help && <small>{help}</small>}{error && <em>{language === "uz" ? "Majburiy maydon" : "Обязательное поле"}</em>}</label>;
  if (field.type === "long-text" || field.type === "bank-details") return <label className={`dbt-config-field wide ${error ? "invalid" : ""}`}><span>{label}{field.required && " *"}</span><textarea rows={4} value={String(value ?? "")} placeholder={field.placeholder ? localize(field.placeholder, language) : ""} onChange={(event) => onChange(event.target.value)}/>{help && <small>{help}</small>}{error && <em>{language === "uz" ? "Majburiy maydon" : "Обязательное поле"}</em>}</label>;
  return <label className={`dbt-config-field ${error ? "invalid" : ""}`}><span>{label}{field.required && " *"}</span><input type={fieldInputType(field)} value={String(value ?? "")} inputMode={["pinfl", "tin", "money", "percent", "number"].includes(field.type) ? "numeric" : undefined} placeholder={field.placeholder ? localize(field.placeholder, language) : ""} onChange={(event) => onChange(event.target.value)}/>{help && <small>{help}</small>}{error && <em>{language === "uz" ? "Majburiy maydon" : "Обязательное поле"}</em>}</label>;
}

export function ConfigurableDocumentBuilder({ definition, initialUser, signInPath, initialDocumentId }: { definition: DocumentDefinition; initialUser: BuilderUser | null; signInPath: string; initialDocumentId?: string }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const caseId = searchParams.get("caseId") ?? undefined;
  const planStepId = searchParams.get("stepId") ?? undefined;
  const paths = useMemo(
    () => builderNavigationPaths(pathname, { caseId, planStepId }),
    [pathname, caseId, planStepId],
  );
  const routeLocale = paths.locale;
  const [phase, setPhase] = useState<Phase>(initialDocumentId ? "builder" : "intro");
  const [language, setLanguage] = useState<BuilderLanguage>(paths.locale ?? "ru");
  const [answers, setAnswers] = useState<QuestionnaireAnswers>(() => createQuestionnaireAnswers(definition));
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [documentId, setDocumentId] = useState(initialDocumentId ?? "");
  const revisionRef = useRef(1);
  const [finalText, setFinalText] = useState("");
  const [manuallyEdited, setManuallyEdited] = useState(false);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [files, setFiles] = useState<GenerationResult["files"] | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const createPromise = useRef<Promise<string> | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const skipNextAutosave = useRef(false);
  const rendered = useMemo(() => renderConfiguredDocument(definition, answers, language), [definition, answers, language]);
  const visibleDocument = useMemo(() => manuallyEdited ? { ...rendered, paragraphs: finalText.split(/\n{2,}/).map((text, index) => ({ id: `manual-${index}`, kind: index === 0 ? "title" as const : "body" as const, text })), plainText: finalText } : rendered, [rendered, manuallyEdited, finalText]);
  const progress = calculateQuestionnaireProgress(definition, answers);
  const currentStep = definition.questionnaire[step];

  const hydrate = useCallback((stored: GenericStoredDocument) => {
    setLanguage(stored.language === "uz" ? "uz" : "ru"); setAnswers(stored.answers); setTitle(stored.title); setFinalText(stored.finalContent);
    setManuallyEdited(stored.manuallyEdited); setDocumentId(stored.id); revisionRef.current = stored.revision; setPhase("builder");
  }, []);

  useEffect(() => {
    if (initialDocumentId && initialUser) {
      apiFetch<{ document: GenericStoredDocument }>(`/api/document-builder/configured-documents/${initialDocumentId}`).then(({ document }) => hydrate(document)).catch((caught: Error) => setError(caught.message)).finally(() => setHydrated(true));
      return;
    }
    const preferred = routeLocale ?? languageFromBrowser(); setLanguage(preferred); setTitle(defaultTitle(definition, preferred));
    try {
      const raw = sessionStorage.getItem(draftKey(definition.code));
      if (raw) { const guest = JSON.parse(raw) as GuestDraft; setPhase(guest.phase === "success" ? "builder" : guest.phase); setLanguage(guest.language); setStep(guest.step); setTitle(guest.title); setAnswers(guest.answers); setFinalText(guest.finalText); setManuallyEdited(Boolean(initialUser && guest.manuallyEdited)); }
    } catch { sessionStorage.removeItem(draftKey(definition.code)); }
    setHydrated(true);
  }, [definition, hydrate, initialDocumentId, initialUser, routeLocale]);

  useEffect(() => { if (!finalText && rendered.plainText) setFinalText(rendered.plainText); }, [finalText, rendered.plainText]);
  useEffect(() => { if (!manuallyEdited) setFinalText(rendered.plainText); }, [rendered.plainText, manuallyEdited]);
  useEffect(() => {
    if (!hydrated || initialUser) return;
    const guest: GuestDraft = { phase, language, step, title, answers, finalText, manuallyEdited: false };
    sessionStorage.setItem(draftKey(definition.code), JSON.stringify(guest));
  }, [answers, definition.code, finalText, hydrated, initialUser, language, manuallyEdited, phase, step, title]);
  useEffect(() => { const handler = (event: BeforeUnloadEvent) => { if (phase === "builder") { event.preventDefault(); event.returnValue = ""; } }; window.addEventListener("beforeunload", handler); return () => window.removeEventListener("beforeunload", handler); }, [phase]);

  const ensureDocument = useCallback(async (): Promise<string> => {
    if (documentId) return documentId;
    if (!initialUser) throw new Error(language === "uz" ? "Saqlash uchun tizimga kiring." : "Войдите, чтобы сохранить документ.");
    if (createPromise.current) return createPromise.current;
    createPromise.current = apiFetch<{ document: GenericStoredDocument }>("/api/document-builder/configured-drafts", { method: "POST", body: JSON.stringify({ templateCode: definition.code, language, title: title || defaultTitle(definition, language), answers, finalContent: finalText, manuallyEdited, caseId, planStepId }) }).then(({ document }) => { hydrate(document); sessionStorage.removeItem(draftKey(definition.code)); router.replace(paths.document(document.id)); return document.id; }).finally(() => { createPromise.current = null; });
    return createPromise.current;
  }, [answers, caseId, definition, documentId, finalText, hydrate, initialUser, language, manuallyEdited, paths, planStepId, router, title]);

  const save = useCallback((targetDocumentId = documentId): Promise<void> => {
    if (!initialUser || !targetDocumentId || !hydrated) return Promise.resolve();
    const run = async () => {
      setSaveState("saving");
      try {
        const result = await apiFetch<{ revision: number }>(`/api/document-builder/configured-documents/${targetDocumentId}`, { method: "PUT", body: JSON.stringify({ language, title, answers, autoContent: rendered.plainText, finalContent: finalText, manuallyEdited, revision: revisionRef.current }) });
        revisionRef.current = result.revision; setSaveState("saved");
      } catch (caught) {
        setSaveState("error");
        setError(caught instanceof Error ? caught.message : "Не удалось сохранить документ.");
        throw caught;
      }
    };
    saveQueue.current = saveQueue.current.catch(() => undefined).then(run);
    return saveQueue.current;
  }, [answers, documentId, finalText, hydrated, initialUser, language, manuallyEdited, rendered.plainText, title]);
  useDebouncedEffect(() => { if (skipNextAutosave.current) { skipNextAutosave.current = false; return; } void save().catch(() => undefined); }, [answers, language, title, finalText, manuallyEdited, documentId], 700);

  const start = async () => { setPhase("builder"); if (initialUser) { try { await ensureDocument(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось создать черновик."); } } };
  const update = (field: QuestionnaireField, value: unknown) => { setAnswers((current) => setAnswer(current, field.id, value as never)); setErrors((current) => { const next = { ...current }; delete next[field.id]; return next; }); };
  const goNext = () => {
    const validation = validateQuestionnaire(definition, answers); const currentIds = new Set(currentStep.fields.filter((field) => conditionMatches(field.condition, answers)).map((field) => field.id));
    const stepErrors = Object.fromEntries(Object.entries(validation).filter(([id]) => currentIds.has(id))); setErrors(stepErrors);
    if (Object.keys(stepErrors).length) { setError(language === "uz" ? "Majburiy maydonlarni to‘ldiring." : "Заполните обязательные поля текущего раздела."); return; }
    setError(""); setStep((value) => Math.min(definition.questionnaire.length - 1, value + 1));
  };
  const changeLanguage = (next: BuilderLanguage) => { setLanguage(next); window.localStorage.setItem("juro-builder-language", next); if (!manuallyEdited) setFinalText(renderConfiguredDocument(definition, answers, next).plainText); };
  const generate = async () => {
    const validation = validateQuestionnaire(definition, answers); setErrors(validation);
    if (Object.keys(validation).length) { setError(language === "uz" ? "Hujjat yaratishdan oldin majburiy maydonlarni to‘ldiring." : "Перед созданием заполните обязательные поля."); return; }
    if (!initialUser) { window.location.assign(signInPath); return; }
    setGenerating(true); setError("");
    try { const id = await ensureDocument(); await save(id); const result = await apiFetch<GenerationResult>(`/api/document-builder/configured-documents/${id}/generate`, { method: "POST", body: "{}" }); setFiles(result.files); setPhase("success"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось сформировать файлы."); }
    finally { setGenerating(false); }
  };
  const download = async (file: GeneratedFile) => { try { await downloadAuthenticatedFile(file.url, file.name); window.location.assign(paths.documents); } catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось скачать файл."); } };

  if (!hydrated) return <div className="dbt-config-loading"><LoaderCircle size={28}/><p>Загружаем конструктор…</p></div>;
  if (phase === "intro") return <div className="dbt-config-intro"><section><Link href={paths.category(definition.categorySlug)}><ArrowLeft size={17}/>{language === "uz" ? "Toifaga qaytish" : "Назад к категории"}</Link><div className="dbt-language-toggle"><button type="button" className={language === "ru" ? "active" : ""} onClick={() => changeLanguage("ru")}>RU</button><button type="button" className={language === "uz" ? "active" : ""} onClick={() => changeLanguage("uz")}>UZ</button></div><span className="dbt-template-number">№ {definition.code} · v{definition.version}</span><h1>{language === "uz" ? definition.titleUz : definition.titleRu}</h1><p>{language === "uz" ? definition.descriptionUz : definition.descriptionRu}</p><div className="dbt-config-intro-meta"><span>{definition.estimatedMinutes} {language === "uz" ? "daqiqa" : "минут"}</span><span>RU · UZ</span><span>DOCX · PDF</span></div><div className="dbt-legal-note"><LockKeyhole size={19}/><p>{definition.editorialStatus === "Published" ? (language === "uz" ? "Ushbu shablon hujjat loyihasini tayyorlaydi. Murakkab vaziyatlarda yurist tekshiruvi tavsiya etiladi." : "Шаблон формирует проект документа. В сложных ситуациях рекомендуется проверка юристом.") : (language === "uz" ? "Beta-shablon: huquqiy matn va o‘zbekcha tahrir tekshiruvdan o‘tmoqda. Natijani topshirish yoki imzolashdan oldin yuristga tekshirtiring." : "Бета-шаблон: юридический текст и узбекская редакция проходят проверку. Перед подачей или подписанием обязательно проверьте результат у юриста.")}</p></div><button type="button" className="dbt-start-config" onClick={() => void start()}>{language === "uz" ? "Hujjat yaratish" : "Создать документ"}<ArrowRight size={18}/></button></section><DocumentPreview document={rendered}/></div>;
  if (phase === "success" && files) return <div className="dbt-config-success"><FileCheck2 size={48}/><h1>{language === "uz" ? "Hujjat tayyor" : "Документ готов"}</h1><p>{language === "uz" ? "Fayllar xavfsiz saqlandi va yuklab olishga tayyor." : "Файлы безопасно сохранены и готовы к скачиванию."}</p><div><button type="button" onClick={() => void download(files.docx)}><Download size={18}/>DOCX</button><button type="button" onClick={() => void download(files.pdf)}><Download size={18}/>PDF</button><button type="button" onClick={() => void download(files.zip)}><Download size={18}/>ZIP</button></div><Link href={paths.documents}>{language === "uz" ? "Mening hujjatlarim" : "Мои документы"}</Link></div>;

  return <div className="dbt-config-builder"><header className="dbt-config-builder-head"><div><Link href={paths.category(definition.categorySlug)}><ArrowLeft size={16}/>{language === "uz" ? "Toifa" : "Категория"}</Link><span>№ {definition.code}</span><span className={`dbt-save-indicator ${saveState}`}>{saveState === "saving" ? <><LoaderCircle size={14}/>{language === "uz" ? "Saqlanmoqda" : "Сохраняем"}</> : saveState === "saved" ? <><Save size={14}/>{language === "uz" ? "Saqlandi" : "Сохранено"}</> : !initialUser ? (language === "uz" ? "Vaqtincha ushbu oynada" : "Временно в этой вкладке") : ""}</span></div><div className="dbt-language-toggle"><button type="button" className={language === "ru" ? "active" : ""} onClick={() => changeLanguage("ru")}>RU</button><button type="button" className={language === "uz" ? "active" : ""} onClick={() => changeLanguage("uz")}>UZ</button></div><h1>{language === "uz" ? definition.titleUz : definition.titleRu}</h1><div className="dbt-config-progress"><span style={{ width: `${progress}%` }}/><b>{progress}%</b></div></header>
    {error && <div className="dbt-global-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")}>×</button></div>}
    <nav className="dbt-config-steps" aria-label={language === "uz" ? "Bosqichlar" : "Разделы"}>{definition.questionnaire.map((item, index) => <button type="button" className={index === step ? "active" : index < step ? "done" : ""} onClick={() => setStep(index)} key={item.id}><span>{index < step ? <Check size={14}/> : index + 1}</span>{localize(item.title, language)}</button>)}</nav>
    <div className="dbt-config-layout"><section className="dbt-config-form"><div className="dbt-config-step-title"><span>{language === "uz" ? `Bosqich ${step + 1}/${definition.questionnaire.length}` : `Шаг ${step + 1} из ${definition.questionnaire.length}`}</span><h2>{localize(currentStep.title, language)}</h2>{currentStep.description && <p>{localize(currentStep.description, language)}</p>}</div><div className="dbt-config-fields">{currentStep.fields.filter((field) => conditionMatches(field.condition, answers)).map((field) => <FieldControl key={field.id} field={field} language={language} value={answers[field.id]} error={errors[field.id] ?? ""} onChange={(value) => update(field, value)}/>)}</div>
      {initialUser && <details className="dbt-config-editor"><summary>{language === "uz" ? "Hujjat matnini qo‘lda tahrirlash" : "Редактировать весь текст вручную"}</summary><p>{language === "uz" ? "Tuzilma saqlanadi; qo‘lda o‘zgartirish uchun foydalanuvchi javobgar." : "Оформление сохраняется; за ручные изменения отвечает пользователь."}</p><textarea rows={18} value={finalText} onChange={(event) => { setFinalText(event.target.value); setManuallyEdited(true); }}/><button type="button" onClick={() => { setFinalText(rendered.plainText); setManuallyEdited(false); }}><RotateCcw size={16}/>{language === "uz" ? "Dastlabki matnni qaytarish" : "Вернуть исходный текст"}</button></details>}
      {!initialUser && <div className="dbt-privacy-note"><LockKeyhole size={18}/><p>{language === "uz" ? "Javoblar hozir faqat ushbu brauzer oynasida saqlanadi. Serverda saqlash, matnni tahrirlash va fayllarni yuklab olish uchun tizimga kiring." : "Ответы пока сохраняются только в этой вкладке браузера. Войдите для серверного сохранения, редактирования текста и скачивания файлов."}</p></div>}
      <div className="dbt-config-navigation"><button type="button" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}><ArrowLeft size={17}/>{language === "uz" ? "Orqaga" : "Назад"}</button>{step < definition.questionnaire.length - 1 ? <button type="button" className="primary" onClick={goNext}>{language === "uz" ? "Davom etish" : "Продолжить"}<ArrowRight size={17}/></button> : <button type="button" className="primary" disabled={generating} onClick={() => void generate()}>{generating ? <LoaderCircle size={17}/> : <FileCheck2 size={17}/>} {initialUser ? (language === "uz" ? "Hujjat va fayllarni yaratish" : "Создать документ и файлы") : (language === "uz" ? "Kirish va yaratish" : "Войти и создать")}</button>}</div>
      {initialUser && step === definition.questionnaire.length - 1 && <BuilderAnalysisLauncher
        locale={language}
        reviewPath={paths.documentReview}
        onPrepare={async () => {
          const id = await ensureDocument();
          await save(id);
          return id;
        }}
      />}
    </section><DocumentPreview document={visibleDocument}/></div>{documentId && initialUser && <BuilderVersionHistory documentId={documentId} locale={language} onPrepare={async () => { await save(documentId); return { documentId, revision: revisionRef.current }; }} onRestored={async () => { const result = await apiFetch<{ document: GenericStoredDocument }>(`/api/document-builder/configured-documents/${documentId}`); skipNextAutosave.current = true; hydrate(result.document); }}/>}<button type="button" className="dbt-mobile-preview-button" onClick={() => setMobilePreview(true)}><Eye size={18}/>{language === "uz" ? "Ko‘rib chiqish" : "Предпросмотр"}</button>{mobilePreview && <DocumentPreview document={visibleDocument} mobileOpen onClose={() => setMobilePreview(false)}/>}</div>;
}
