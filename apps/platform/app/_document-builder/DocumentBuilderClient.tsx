"use client";

/* eslint-disable react-hooks/set-state-in-effect -- persisted guest drafts and authenticated documents hydrate after mount */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Eye, FileCheck2, LoaderCircle, LockKeyhole, PenLine, Save, Sparkles } from "lucide-react";
import { createDefaultAnswers, EXAMPLE_RU, EXAMPLE_UZ } from "../../lib/document-builder/defaults";
import { amountToWords } from "../../lib/document-builder/money-to-words";
import { paragraphsFromFinalText } from "../../lib/document-builder/generation/paragraphs";
import { renderReceipt, suggestedDocumentTitle } from "../../lib/document-builder/templates/receipt";
import type {
  ContactRecord,
  DocumentLanguage,
  PartyDetails,
  ReceiptAnswers,
  StoredDocument,
  UserProfile,
} from "../../lib/document-builder/types";
import { BUILDER_STEPS, BuilderQuestionnaire } from "./_components/BuilderQuestionnaire";
import { BuilderHeader, type BuilderUser } from "./_components/BuilderHeader";
import { CollaborationPanel } from "./_components/CollaborationPanel";
import { DocumentPreview } from "./_components/DocumentPreview";
import { DocumentAssetsPanel } from "./_components/DocumentAssetsPanel";
import { FinalSuccess, type GeneratedFile } from "./_components/FinalSuccess";
import { ManualEditor } from "./_components/ManualEditor";
import { BuilderAnalysisLauncher } from "./_components/BuilderAnalysisLauncher";
import { BuilderVersionHistory } from "./_components/BuilderVersionHistory";
import { apiFetch, downloadAuthenticatedFile } from "./_components/api-client";
import { useDebouncedEffect } from "./_hooks/useDebouncedEffect";
import { builderNavigationPaths } from "../../lib/platform/builder-paths";

const GUEST_KEY = "juro-document-builder-draft-v1";
const LEGACY_GUEST_KEY = ["juro", "document", "builder", "test", "draft"].join("-");

type Phase = "intro" | "builder" | "success";
type SaveState = "idle" | "saving" | "saved" | "error";

interface GuestDraft {
  phase: Phase;
  step: number;
  title: string;
  answers: ReceiptAnswers;
  finalText: string;
  manuallyEdited: boolean;
}

interface GenerationResult {
  status: string;
  files: { docx: GeneratedFile; pdf: GeneratedFile; zip: GeneratedFile };
}

function calculateProgress(answers: ReceiptAnswers): number {
  const values = [
    answers.participantMode,
    answers.actingSide,
    answers.documentPlace,
    answers.documentDate,
    answers.lender.fullName,
    answers.lender.idDocumentNumber,
    answers.borrower.fullName,
    answers.borrower.idDocumentNumber,
    answers.loanTransferDate,
    answers.loanAmountNumeric,
    answers.loanAmountWords,
    answers.loanRepaymentDate,
    answers.interest.mode,
    answers.transfer.method,
    answers.repayment.planType,
    answers.earlyRepaymentMode,
    answers.responsibilityMode,
    answers.noticesMode,
  ];
  return Math.round((values.filter((value) => String(value ?? "").trim()).length / values.length) * 100);
}

function toReceiptLanguage(): DocumentLanguage {
  if (typeof window === "undefined") return "ru";
  return window.localStorage.getItem("juro-lang") === "uz" ? "uz-cyrl" : "ru";
}

function printableReceipt(finalText: string) {
  const paragraphs = paragraphsFromFinalText(finalText);
  return { title: paragraphs[0]?.text || "Документ", paragraphs, plainText: finalText };
}

export function DocumentBuilderClient({ initialUser, signInPath, initialDocumentId, printMode = false, initialConsultation = null }: {
  initialUser: BuilderUser | null;
  signInPath: string;
  initialDocumentId?: string;
  printMode?: boolean;
  initialConsultation?: { type: "ai" | "lawyer"; requestId: string } | null;
}) {
  const paths = builderNavigationPaths(usePathname());
  const [user] = useState(initialUser);
  const [phase, setPhase] = useState<Phase>(initialDocumentId ? "builder" : "intro");
  const [answers, setAnswers] = useState<ReceiptAnswers>(() => createDefaultAnswers("ru"));
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [documentId, setDocumentId] = useState(initialDocumentId ?? "");
  const [revision, setRevision] = useState(1);
  const revisionRef = useRef(1);
  const [status, setStatus] = useState("Черновик");
  const [signedFileId, setSignedFileId] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [finalText, setFinalText] = useState("");
  const [manuallyEdited, setManuallyEdited] = useState(false);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const [mobilePreview, setMobilePreview] = useState(false);
  const [editorOpen, setEditorOpen] = useState(Boolean(initialUser));
  const [generating, setGenerating] = useState(false);
  const [files, setFiles] = useState<GenerationResult["files"] | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [accessRole, setAccessRole] = useState<"owner" | "collaborator">("owner");
  const [consultationOpen, setConsultationOpen] = useState(false);
  const createPromise = useRef<Promise<string> | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const agreementWarningShown = useRef(false);
  const skipNextAutosave = useRef(false);

  const rendered = useMemo(() => renderReceipt(answers), [answers]);
  const autoText = rendered.plainText;
  const visibleReceipt = useMemo(() => manuallyEdited ? printableReceipt(finalText) : rendered, [manuallyEdited, finalText, rendered]);
  const example = useMemo(() => renderReceipt(answers.language === "ru" ? EXAMPLE_RU : EXAMPLE_UZ), [answers.language]);
  const progress = calculateProgress(answers);

  const hydrateDocument = useCallback((stored: StoredDocument) => {
    setAnswers(stored.answers);
    setTitle(stored.title);
    setFinalText(stored.finalContent);
    setManuallyEdited(stored.manuallyEdited);
    setRevision(stored.revision);
    revisionRef.current = stored.revision;
    setStatus(stored.status);
    setSignedFileId(stored.signedFileId);
    setAccessRole(stored.accessRole ?? "owner");
    setPhase("builder");
    setEditorOpen(true);
  }, []);

  const syncDocumentMetadata = useCallback((stored: StoredDocument) => {
    setStatus(stored.status);
    setSignedFileId(stored.signedFileId);
    setRevision(stored.revision);
    revisionRef.current = stored.revision;
  }, []);

  useEffect(() => {
    if (initialDocumentId && user) {
      apiFetch<{ document: StoredDocument }>(`/api/document-builder/documents/${initialDocumentId}`)
        .then(({ document }) => hydrateDocument(document))
        .catch((caught: Error) => setError(caught.message))
        .finally(() => setHydrated(true));
      return;
    }
    const language = toReceiptLanguage();
    const base = createDefaultAnswers(language);
    if (!user) {
      try {
        const raw = sessionStorage.getItem(GUEST_KEY) ?? sessionStorage.getItem(LEGACY_GUEST_KEY);
        if (raw) {
          sessionStorage.setItem(GUEST_KEY, raw);
          sessionStorage.removeItem(LEGACY_GUEST_KEY);
          const guest = JSON.parse(raw) as GuestDraft;
          setPhase(guest.phase === "success" ? "builder" : guest.phase);
          setStep(guest.step);
          setAnswers(guest.answers);
          setTitle(guest.title);
          setFinalText(guest.finalText);
          setManuallyEdited(false);
          setHydrated(true);
          return;
        }
      } catch {
        sessionStorage.removeItem(GUEST_KEY);
      }
    } else {
      try {
        const raw = sessionStorage.getItem(GUEST_KEY) ?? sessionStorage.getItem(LEGACY_GUEST_KEY);
        if (raw) {
          sessionStorage.setItem(GUEST_KEY, raw);
          sessionStorage.removeItem(LEGACY_GUEST_KEY);
          const guest = JSON.parse(raw) as GuestDraft;
          setPhase(guest.phase === "intro" ? "intro" : "builder");
          setStep(guest.step);
          setAnswers(guest.answers);
          setTitle(guest.title);
          setFinalText(guest.finalText || renderReceipt(guest.answers).plainText);
          setManuallyEdited(guest.manuallyEdited);
          setEditorOpen(true);
          setHydrated(true);
          return;
        }
      } catch {
        sessionStorage.removeItem(GUEST_KEY);
      }
    }
    setAnswers(base);
    setFinalText(renderReceipt(base).plainText);
    setTitle(suggestedDocumentTitle(base));
    setHydrated(true);
  }, [initialDocumentId, user, hydrateDocument]);

  useEffect(() => {
    if (!user) return;
    apiFetch<{ user: UserProfile | null }>("/api/document-builder/bootstrap").then((result) => setProfile(result.user)).catch(() => undefined);
    apiFetch<{ contacts: ContactRecord[] }>("/api/document-builder/contacts").then((result) => setContacts(result.contacts)).catch(() => undefined);
  }, [user]);

  const createDraft = useCallback(async (): Promise<string> => {
    if (documentId) return documentId;
    if (!user) throw new Error("AUTH_REQUIRED");
    if (createPromise.current) return createPromise.current;
    createPromise.current = apiFetch<{ document: StoredDocument }>("/api/document-builder/drafts", {
      method: "POST",
      body: JSON.stringify({ answers, title: title || suggestedDocumentTitle(answers), autoContent: autoText, finalContent: finalText || autoText, manuallyEdited }),
    }).then(({ document }) => {
      setDocumentId(document.id);
      setRevision(document.revision);
      revisionRef.current = document.revision;
      setStatus(document.status);
      sessionStorage.removeItem(GUEST_KEY);
      return document.id;
    }).finally(() => { createPromise.current = null; });
    return createPromise.current;
  }, [documentId, user, answers, title, autoText, finalText, manuallyEdited]);

  useEffect(() => {
    if (hydrated && user && phase === "builder" && !documentId && !initialDocumentId) {
      void createDraft().catch((caught: Error) => setError(caught.message));
    }
  }, [hydrated, user, phase, documentId, initialDocumentId, createDraft]);

  useDebouncedEffect(() => {
    if (!hydrated || user || phase !== "builder") return;
    const guest: GuestDraft = { phase, step, title, answers, finalText: finalText || autoText, manuallyEdited: false };
    sessionStorage.setItem(GUEST_KEY, JSON.stringify(guest));
  }, [hydrated, user, phase, step, title, answers, finalText, autoText], 250);

  const persist = useCallback((id: string): Promise<void> => {
    const snapshot = { title: title || suggestedDocumentTitle(answers), answers, autoContent: autoText, finalContent: finalText || autoText, manuallyEdited };
    const run = async () => {
      setSaveState("saving");
      try {
        const result = await apiFetch<{ revision: number; status: string }>(`/api/document-builder/documents/${id}`, {
          method: "PUT",
          body: JSON.stringify({ ...snapshot, revision: revisionRef.current }),
        });
        revisionRef.current = result.revision;
        setRevision(result.revision);
        setStatus(result.status);
        setSaveState("saved");
      } catch (caught) {
        setSaveState("error");
        setError(caught instanceof Error ? caught.message : "Автосохранение не выполнено.");
        throw caught;
      }
    };
    saveQueue.current = saveQueue.current.catch(() => undefined).then(run);
    return saveQueue.current;
  }, [title, answers, autoText, finalText, manuallyEdited]);

  useDebouncedEffect(() => {
    if (!hydrated || !user || !documentId || accessRole !== "owner" || phase !== "builder") return;
    if (skipNextAutosave.current) { skipNextAutosave.current = false; return; }
    void persist(documentId);
  }, [hydrated, user, documentId, accessRole, phase, title, answers, autoText, finalText, manuallyEdited], 900);

  useEffect(() => {
    if (phase !== "builder") return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "Введённые данные могут быть потеряны."; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase]);

  useEffect(() => {
    if (phase !== "builder") return;
    const guardNavigation = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.target === "_blank" || target.hasAttribute("download")) return;
      const destination = new URL(target.href, window.location.href);
      if (destination.href === window.location.href) return;
      if (!window.confirm("Вы действительно хотите покинуть конструктор? Введённые данные могут быть потеряны.")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", guardNavigation, true);
    return () => document.removeEventListener("click", guardNavigation, true);
  }, [phase]);

  useEffect(() => {
    if (printMode && hydrated && finalText) {
      const timer = window.setTimeout(() => window.print(), 700);
      return () => window.clearTimeout(timer);
    }
  }, [printMode, hydrated, finalText]);

  const guardAgreementEdit = (): boolean => {
    if (status !== "Согласован" || agreementWarningShown.current) return true;
    const confirmed = window.confirm("Изменение документа отменит согласование второй стороны");
    if (confirmed) agreementWarningShown.current = true;
    return confirmed;
  };

  const changeAnswers = (next: ReceiptAnswers) => {
    if (!guardAgreementEdit()) return;
    const expectedWords = amountToWords(next.loanAmountNumeric, next.language, next.currency, next.includeCents);
    const normalized = !next.loanAmountWordsManuallyEdited ? { ...next, loanAmountWords: expectedWords } : next;
    setAnswers(normalized);
    if (!manuallyEdited) setFinalText(renderReceipt(normalized).plainText);
  };

  const start = () => {
    const next = { ...answers, loanAmountWords: amountToWords(answers.loanAmountNumeric, answers.language, answers.currency, answers.includeCents) };
    setAnswers(next);
    setTitle(suggestedDocumentTitle(next));
    setFinalText(renderReceipt(next).plainText);
    setPhase("builder");
    setStep(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const changeLanguage = (language: DocumentLanguage) => {
    if (phase !== "intro") return;
    const next = createDefaultAnswers(language);
    setAnswers(next);
    setTitle(suggestedDocumentTitle(next));
    setFinalText(renderReceipt(next).plainText);
  };

  const editFinalText = (value: string) => {
    if (!guardAgreementEdit()) return;
    setUndoStack((stack) => [...stack.slice(-49), finalText]);
    setRedoStack([]);
    setFinalText(value);
    setManuallyEdited(value !== autoText);
  };
  const undo = () => {
    if (!guardAgreementEdit()) return;
    const previous = undoStack.at(-1); if (previous === undefined) return;
    setRedoStack((stack) => [...stack, finalText]); setUndoStack((stack) => stack.slice(0, -1)); setFinalText(previous); setManuallyEdited(previous !== autoText);
  };
  const redo = () => {
    if (!guardAgreementEdit()) return;
    const next = redoStack.at(-1); if (next === undefined) return;
    setUndoStack((stack) => [...stack, finalText]); setRedoStack((stack) => stack.slice(0, -1)); setFinalText(next); setManuallyEdited(next !== autoText);
  };
  const resetText = () => { if (!guardAgreementEdit()) return; setUndoStack((stack) => [...stack, finalText]); setRedoStack([]); setFinalText(autoText); setManuallyEdited(false); };

  const signIn = () => {
    const guest: GuestDraft = { phase: "builder", step, title, answers, finalText: finalText || autoText, manuallyEdited };
    sessionStorage.setItem(GUEST_KEY, JSON.stringify(guest));
    window.location.assign(signInPath);
  };

  const generate = async () => {
    if (!user) { signIn(); return; }
    if (!answers.accuracyConfirmed) { setError("Подтвердите общую обязательную галочку перед созданием файлов."); setStep(4); return; }
    setGenerating(true); setError("");
    try {
      const id = await createDraft();
      await persist(id);
      const result = await apiFetch<GenerationResult>(`/api/document-builder/documents/${id}/generate`, { method: "POST", body: "{}" });
      setFiles(result.files); setStatus(result.status); setPhase("success"); window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось сформировать файлы."); }
    finally { setGenerating(false); }
  };

  const download = async (file: GeneratedFile) => {
    try {
      await downloadAuthenticatedFile(file.url, file.name);
      window.location.assign(paths.documents);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Скачивание не выполнено."); }
  };

  const requestConsultation = async (type: "ai" | "lawyer") => {
    if (!documentId) return;
    try {
      const result = await apiFetch<{ handoffUrl: string }>("/api/document-builder/consultations", { method: "POST", body: JSON.stringify({ documentId, type }) });
      window.location.assign(result.handoffUrl);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось создать обращение."); }
  };

  const saveProfile = async (party: PartyDetails) => {
    try {
      const result = await apiFetch<{ user: UserProfile }>("/api/document-builder/bootstrap", {
        method: "PATCH",
        body: JSON.stringify(party),
      });
      setProfile(result.user);
      setSaveState("saved");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Профиль не обновлён.");
      throw caught;
    }
  };

  const updateContact = async (contactId: string, party: PartyDetails) => {
    const contact = contacts.find((item) => item.id === contactId);
    if (!contact) throw new Error("Контакт не найден.");
    try {
      await apiFetch(`/api/document-builder/contacts/${contactId}`, {
        method: "PUT",
        body: JSON.stringify({
          label: contact.label,
          fullName: party.fullName,
          birthDate: party.birthDate,
          idDocumentType: party.idDocumentType,
          idDocumentNumber: party.idDocumentNumber,
          idIssuedBy: party.idIssuedBy,
          idIssueDate: party.idIssueDate,
          pinfl: party.pinfl,
          registeredAddress: party.registeredAddress,
          phone: party.phone,
        }),
      });
      setContacts((items) => items.map((item) => item.id === contactId ? {
        ...item,
        fullName: party.fullName,
        birthDate: party.birthDate || null,
        idDocumentType: party.idDocumentType || null,
        idDocumentNumber: party.idDocumentNumber || null,
        idIssuedBy: party.idIssuedBy || null,
        idIssueDate: party.idIssueDate || null,
        pinfl: party.pinfl || null,
        registeredAddress: party.registeredAddress || null,
        phone: party.phone || null,
        updatedAt: new Date().toISOString(),
      } : item));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Контакт не обновлён.");
      throw caught;
    }
  };

  if (printMode) {
    return <div className="dbt-print-only">{hydrated ? <DocumentPreview document={printableReceipt(finalText)} mobileOpen/> : <p>Подготовка документа к печати…</p>}</div>;
  }

  if (!hydrated) return <div className="dbt-loading"><Image src="/juro-logo-primary.png" alt="JURO" width={140} height={137} priority unoptimized/><LoaderCircle size={28}/><p>Открываем конструктор…</p></div>;

  if (phase === "intro") return <div className="dbt-root"><BuilderHeader user={user} signInPath={signInPath}/><div className="dbt-intro"><section className="dbt-intro-copy"><span className="dbt-eyebrow"><FileCheck2 size={16}/>Первый бесплатный документ JURO</span><h1>Расписка в получении денежных средств</h1><p>Документ подтверждает передачу денежных средств в качестве займа и обязанность их возврата.</p><div className="dbt-intro-meta"><span><strong>≈ 5 минут</strong><small>примерное время заполнения</small></span><span><strong>DOCX + PDF</strong><small>настоящие готовые файлы</small></span></div><fieldset className="dbt-language"><legend>Язык документа</legend><label className={answers.language === "ru" ? "selected" : ""}><input type="radio" checked={answers.language === "ru"} onChange={() => changeLanguage("ru")}/><span><strong>Русский</strong><small>Полная русская версия</small></span></label><label className={answers.language === "uz-cyrl" ? "selected" : ""}><input type="radio" checked={answers.language === "uz-cyrl"} onChange={() => changeLanguage("uz-cyrl")}/><span><strong>Ўзбекча</strong><small>Ўзбек кирилл алифбосида</small></span></label></fieldset><button type="button" className="dbt-start" onClick={start}>Создать документ<ArrowRight size={19}/></button><p className="dbt-intro-note">Начать можно без регистрации. До входа ответы сохраняются только в текущей вкладке.</p></section><DocumentPreview document={example} example/></div></div>;

  if (phase === "success" && files) return <div className="dbt-root"><BuilderHeader user={user} signInPath={signInPath}/><div className="dbt-success-wrap">{error && <div className="dbt-global-error" role="alert">{error}</div>}<FinalSuccess files={files} libraryPath={paths.library} onDownload={(file) => void download(file)} onPrint={() => window.open(`${paths.document(documentId)}?print=1`, "_blank", "noopener,noreferrer")} onConsultation={() => setConsultationOpen(true)}/>{consultationOpen && <div className="dbt-modal-backdrop" role="presentation" onMouseDown={() => setConsultationOpen(false)}><section className="dbt-consultation-modal" role="dialog" aria-modal="true" aria-labelledby="consultation-title" onMouseDown={(event) => event.stopPropagation()}><h2 id="consultation-title">Получить консультацию</h2><p>Контекст документа и ответы анкеты будут прикреплены автоматически.</p><button type="button" onClick={() => void requestConsultation("ai")}><Sparkles size={20}/><span><strong>AI-юрист</strong><small>Создать обращение с полным контекстом</small></span></button><button type="button" onClick={() => void requestConsultation("lawyer")}><PenLine size={20}/><span><strong>Живой юрист</strong><small>Зарегистрировать заявку без повторной загрузки</small></span></button><button type="button" className="dbt-modal-close" onClick={() => setConsultationOpen(false)}>Закрыть</button></section></div>}</div></div>;

  if (accessRole === "collaborator") return <div className="dbt-root"><BuilderHeader user={user} signInPath={signInPath}/><div className="dbt-collaborator-page">{error && <div className="dbt-global-error" role="alert">{error}</div>}<div className="dbt-collaborator-document"><DocumentPreview document={printableReceipt(finalText)} mobileOpen/></div>{documentId && <CollaborationPanel documentId={documentId} accessRole="collaborator" finalText={finalText} currentUserEmail={user?.email} signedFileId={signedFileId} onApplied={() => window.location.reload()}/>}</div></div>;

  return <div className="dbt-root"><BuilderHeader user={user} signInPath={signInPath}/><div className="dbt-builder">
    <div className="dbt-builder-top"><div><Link href={paths.builder} className="dbt-back"><ArrowLeft size={16}/>Новый документ</Link><h1>Расписка в получении денежных средств</h1><div className="dbt-status-line"><span className={`dbt-save-state ${saveState}`}>{!user ? <><LockKeyhole size={14}/>Гостевой режим</> : saveState === "saving" ? <><LoaderCircle size={14}/>Сохраняем…</> : saveState === "error" ? "Ошибка сохранения" : <><Save size={14}/>Черновик сохранён</>}</span>{documentId && <span>ID: {documentId.slice(0, 8)}</span>}<span>Ревизия: {revision}</span><span>Статус: {status}</span></div></div><div className="dbt-title-edit"><label><span>Название документа</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={suggestedDocumentTitle(answers)}/></label><small>Категория: Займы и расписки</small></div></div>
    {initialConsultation && <div className="dbt-handoff-banner" role="status"><Sparkles size={18}/><span><strong>{initialConsultation.type === "ai" ? "Запрос AI-юристу создан" : "Заявка живому юристу создана"}</strong><small>Контекст документа и анкеты прикреплён. Номер обращения: {initialConsultation.requestId.slice(0, 8)}</small></span></div>}
    {error && <div className="dbt-global-error" role="alert"><span>{error}</span>{!user && <button type="button" onClick={signIn}>Войти</button>}<button type="button" aria-label="Закрыть сообщение" onClick={() => setError("")}>×</button></div>}
    <div className="dbt-progress"><div><span style={{ width: `${progress}%` }}/></div><strong>{progress}%</strong></div>
    <nav className="dbt-steps" aria-label="Разделы анкеты">{BUILDER_STEPS.map((label, index) => <button type="button" className={step === index ? "active" : index < step ? "visited" : ""} onClick={() => setStep(index)} key={label}><span>{index < step ? <Check size={15}/> : index + 1}</span><small>{label}</small></button>)}</nav>
    <button type="button" className="dbt-mobile-preview-button" onClick={() => setMobilePreview(true)}><Eye size={18}/>Предпросмотр</button>
    <div className="dbt-workspace"><div className="dbt-form-column"><BuilderQuestionnaire answers={answers} onChange={changeAnswers} step={step} profile={profile} contacts={contacts} onSaveProfile={saveProfile} onUpdateContact={updateContact}/><div className="dbt-form-nav"><button type="button" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}><ArrowLeft size={17}/>Назад</button>{step < 4 ? <button type="button" className="primary" onClick={() => setStep(Math.min(4, step + 1))}>Продолжить<ArrowRight size={17}/></button> : <button type="button" className="primary" onClick={() => void generate()} disabled={generating}>{generating ? <><LoaderCircle className="spin" size={18}/>Формируем DOCX, PDF и ZIP…</> : user ? <>Создать файлы<FileCheck2 size={18}/></> : <>Войти и создать файлы<LockKeyhole size={18}/></>}</button>}</div>{user && step === 4 && <BuilderAnalysisLauncher locale={answers.language === "ru" ? "ru" : "uz"} reviewPath={paths.documentReview} onPrepare={async () => { const id = await createDraft(); await persist(id); return id; }}/>}</div><DocumentPreview document={visibleReceipt} mobileOpen={mobilePreview} onClose={() => setMobilePreview(false)}/></div>
    <div className="dbt-editor-wrap"><div className="dbt-editor-heading"><button type="button" onClick={() => setEditorOpen(!editorOpen)}><PenLine size={17}/>{editorOpen ? "Скрыть ручной редактор" : "Открыть ручной редактор"}</button>{!user && <span>Доступен после входа</span>}</div>{editorOpen && <ManualEditor value={finalText || autoText} onChange={editFinalText} onUndo={undo} onRedo={redo} onReset={resetText} canUndo={undoStack.length > 0} canRedo={redoStack.length > 0} locked={!user}/>}</div>
    {documentId && user && <><BuilderVersionHistory documentId={documentId} locale={answers.language === "ru" ? "ru" : "uz"} onPrepare={async () => { await persist(documentId); return { documentId, revision: revisionRef.current }; }} onRestored={async () => { const result = await apiFetch<{ document: StoredDocument }>(`/api/document-builder/documents/${documentId}`); skipNextAutosave.current = true; hydrateDocument(result.document); }}/><DocumentAssetsPanel documentId={documentId} onDocumentChange={syncDocumentMetadata}/><CollaborationPanel documentId={documentId} accessRole="owner" finalText={finalText || autoText} currentUserEmail={user.email} signedFileId={signedFileId} onApplied={() => window.location.reload()}/></>}
  </div></div>;
}
