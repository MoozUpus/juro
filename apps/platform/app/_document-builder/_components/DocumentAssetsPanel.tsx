"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Bot,
  Check,
  Copy,
  Download,
  Eye,
  FileCheck2,
  FilePlus2,
  Link2,
  Paperclip,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from "lucide-react";
import type { CollaborationSnapshot, FileRecord, StoredDocument } from "../../../lib/document-builder/types";
import { builderNavigationPaths } from "../../../lib/platform/builder-paths";
import type { PlatformLocale } from "../../../lib/platform/routing";
import { builderError, builderUiLocale } from "../builder-localization";
import { apiFetch, downloadAuthenticatedFile } from "./api-client";

interface Attachment {
  id: string;
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  visibleToCollaborator: boolean | number;
  createdAt: string;
}

const documentAssetsCopy = {
  ru: {
    title: "Файлы и доступы",
    subtitle: "Файлы хранятся приватно и выдаются только после проверки прав доступа.",
    loadError: "Не удалось загрузить файлы документа.",
    uploadError: "Загрузка не выполнена.",
    analysisError: "Анализ не выполнен.",
    shareError: "Ссылка не создана.",
    revokeError: "Доступ не отозван.",
    statusError: "Статус не изменён.",
    downloadError: "Файл не скачан.",
    uploading: "Загружаем…",
    addAttachment: "Добавить вложение",
    uploadSigned: "Загрузить подписанный PDF",
    creating: "Создаём…",
    shareSevenDays: "Поделиться документом на 7 дней",
    linkActive: "Ссылка действует 7 дней",
    copyLink: "Скопировать ссылку",
    revoke: "Отозвать",
    generated: "Сформированные файлы",
    kb: "КБ",
    confirmAgreement: "Подтвердить создателем — «Согласован»",
    internalConfirm: "Внутренне подтвердить в JURO",
    internalNote: "Внутреннее подтверждение фиксирует аккаунт, дату и ID документа, но не является квалифицированной ЭЦП.",
    notQualifiedSignature: "Это не квалифицированная электронная подпись.",
    attachments: "Вложения",
    collaboratorVisible: "Видно второй стороне",
    open: "Открыть",
    analysing: "Анализ…",
    analyse: "AI-анализ",
    remove: (name: string) => `Удалить ${name}`,
    analysisResult: "Результат анализа текущей сессии",
    analysisTemporary: "Результат не сохранён в базе или истории.",
    signedUploaded: "Подписанный PDF загружен",
    signedImmutable: "Этот файл нельзя заменить.",
    openSigned: "Открыть подписанную версию",
    signedAccess: "Доступ второй стороны к подписанному PDF",
    opened: "Открывал(а) PDF",
    notOpened: "Не открывал(а) PDF",
    view: "Просмотр",
    download: "Скачивание",
    restoredViewOnly: "После восстановления доступен только просмотр",
  },
  uz: {
    title: "Fayllar va kirish huquqlari",
    subtitle: "Fayllar yopiq saqlanadi va faqat kirish huquqi tekshirilgach beriladi.",
    loadError: "Hujjat fayllarini yuklab bo‘lmadi.",
    uploadError: "Faylni yuklab bo‘lmadi.",
    analysisError: "Tahlil bajarilmadi.",
    shareError: "Havola yaratilmadi.",
    revokeError: "Kirish huquqi bekor qilinmadi.",
    statusError: "Holat o‘zgartirilmadi.",
    downloadError: "Fayl yuklab olinmadi.",
    uploading: "Yuklanmoqda…",
    addAttachment: "Ilova qo‘shish",
    uploadSigned: "Imzolangan PDF-ni yuklash",
    creating: "Yaratilmoqda…",
    shareSevenDays: "Hujjatni 7 kunga ulashish",
    linkActive: "Havola 7 kun amal qiladi",
    copyLink: "Havolani nusxalash",
    revoke: "Bekor qilish",
    generated: "Yaratilgan fayllar",
    kb: "KB",
    confirmAgreement: "Yaratuvchi tasdiqlashi — «Kelishilgan»",
    internalConfirm: "JURO ichida tasdiqlash",
    internalNote: "Ichki tasdiqlash akkaunt, sana va hujjat ID-sini qayd etadi, ammo malakali elektron imzo hisoblanmaydi.",
    notQualifiedSignature: "Bu malakali elektron imzo emas.",
    attachments: "Ilovalar",
    collaboratorVisible: "Ikkinchi tomonga ko‘rinadi",
    open: "Ochish",
    analysing: "Tahlil…",
    analyse: "AI tahlili",
    remove: (name: string) => `${name} faylini o‘chirish`,
    analysisResult: "Joriy sessiya tahlili natijasi",
    analysisTemporary: "Natija ma’lumotlar bazasi yoki tarixda saqlanmagan.",
    signedUploaded: "Imzolangan PDF yuklandi",
    signedImmutable: "Bu faylni almashtirib bo‘lmaydi.",
    openSigned: "Imzolangan nusxani ochish",
    signedAccess: "Ikkinchi tomonning imzolangan PDF-ga kirishi",
    opened: "PDF-ni ochgan",
    notOpened: "PDF-ni ochmagan",
    view: "Ko‘rish",
    download: "Yuklab olish",
    restoredViewOnly: "Tiklangandan keyin faqat ko‘rish mumkin",
  },
  en: {
    title: "Files and access",
    subtitle: "Files are stored privately and released only after access checks.",
    loadError: "We could not load the document files.",
    uploadError: "The file could not be uploaded.",
    analysisError: "The analysis could not be completed.",
    shareError: "The share link could not be created.",
    revokeError: "Access could not be revoked.",
    statusError: "The document status could not be changed.",
    downloadError: "The file could not be downloaded.",
    uploading: "Uploading…",
    addAttachment: "Add attachment",
    uploadSigned: "Upload signed PDF",
    creating: "Creating…",
    shareSevenDays: "Share document for 7 days",
    linkActive: "Link active for 7 days",
    copyLink: "Copy share link",
    revoke: "Revoke",
    generated: "Generated files",
    kb: "KB",
    confirmAgreement: "Confirm as creator — Approved",
    internalConfirm: "Confirm within JURO",
    internalNote: "JURO confirmation records the account, date and document ID. It is not a qualified electronic signature.",
    notQualifiedSignature: "This is not a qualified electronic signature.",
    attachments: "Attachments",
    collaboratorVisible: "Visible to the other party",
    open: "Open",
    analysing: "Analysing…",
    analyse: "AI analysis",
    remove: (name: string) => `Delete ${name}`,
    analysisResult: "Analysis result for this session",
    analysisTemporary: "This result is not stored in the database or version history.",
    signedUploaded: "Signed PDF uploaded",
    signedImmutable: "This file cannot be replaced.",
    openSigned: "Open signed version",
    signedAccess: "Other party’s access to the signed PDF",
    opened: "Opened the PDF",
    notOpened: "Has not opened the PDF",
    view: "View",
    download: "Download",
    restoredViewOnly: "Only viewing is available after access is restored",
  },
} satisfies Record<PlatformLocale, Record<string, unknown>>;

export function DocumentAssetsPanel({
  documentId,
  onDocumentChange,
  locale,
}: {
  documentId: string;
  onDocumentChange: (document: StoredDocument) => void;
  locale?: PlatformLocale;
}) {
  const paths = builderNavigationPaths(usePathname());
  const uiLocale = builderUiLocale(locale ?? paths.locale);
  const copy = documentAssetsCopy[uiLocale];
  const [document, setDocument] = useState<StoredDocument | null>(null);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [collaboration, setCollaboration] = useState<CollaborationSnapshot | null>(null);
  const [share, setShare] = useState<{ url: string; expiresAt: string } | null>(null);
  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const attachmentInput = useRef<HTMLInputElement>(null);
  const signedInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const result = await apiFetch<{ document: StoredDocument; files: FileRecord[]; attachments: Attachment[] }>(`/api/document-builder/documents/${documentId}`);
    setDocument(result.document);
    setFiles(result.files);
    setAttachments(result.attachments);
    onDocumentChange(result.document);
    apiFetch<CollaborationSnapshot>(`/api/document-builder/documents/${documentId}/collaboration`)
      .then(setCollaboration)
      .catch(() => undefined);
  }, [documentId, onDocumentChange]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((caught: unknown) => setError(builderError(uiLocale, caught, copy.loadError)));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [copy.loadError, load, uiLocale]);

  const upload = async (file: File, signed = false) => {
    setBusy(signed ? "signed" : "attachment");
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      const endpoint = signed ? "signed-file" : "attachments";
      await apiFetch<{ status?: string }>(`/api/document-builder/documents/${documentId}/${endpoint}`, { method: "POST", body: form });
      await load();
    } catch (caught) {
      setError(builderError(uiLocale, caught, copy.uploadError));
    } finally {
      setBusy("");
    }
  };

  const changeAttachment = async (attachmentId: string, visibleToCollaborator: boolean) => {
    try {
      await apiFetch(`/api/document-builder/documents/${documentId}/attachments`, { method: "PATCH", body: JSON.stringify({ attachmentId, visibleToCollaborator }) });
      await load();
    } catch (caught) {
      setError(builderError(uiLocale, caught, copy.uploadError));
    }
  };

  const deleteAttachment = async (attachmentId: string) => {
    try {
      await apiFetch(`/api/document-builder/documents/${documentId}/attachments`, { method: "DELETE", body: JSON.stringify({ attachmentId }) });
      await load();
    } catch (caught) {
      setError(builderError(uiLocale, caught, copy.uploadError));
    }
  };

  const analyzeAttachment = async (attachment: Attachment) => {
    setBusy(`analysis-${attachment.id}`);
    setAnalysis(null);
    setError("");
    try {
      const result = await apiFetch<{ status: string; message?: string; result?: Record<string, unknown> }>("/api/document-builder/attachment-analysis", {
        method: "POST",
        body: JSON.stringify({ documentId, attachmentId: attachment.id, questionnaireSummary: document?.autoContent.slice(0, 10_000) }),
      });
      setAnalysis(result.result ?? { message: result.message, status: result.status });
    } catch (caught) {
      setError(builderError(uiLocale, caught, copy.analysisError));
    } finally {
      setBusy("");
    }
  };

  const createShare = async () => {
    setBusy("share");
    setError("");
    try {
      const result = await apiFetch<{ url: string; expiresAt: string }>(`/api/document-builder/documents/${documentId}/share`, { method: "POST", body: JSON.stringify({ action: "create" }) });
      setShare(result);
    } catch (caught) {
      setError(builderError(uiLocale, caught, copy.shareError));
    } finally {
      setBusy("");
    }
  };

  const revokeShare = async () => {
    setBusy("share");
    setError("");
    try {
      await apiFetch(`/api/document-builder/documents/${documentId}/share`, { method: "POST", body: JSON.stringify({ action: "revoke" }) });
      setShare(null);
    } catch (caught) {
      setError(builderError(uiLocale, caught, copy.revokeError));
    } finally {
      setBusy("");
    }
  };

  const changeStatus = async (action: "confirm_agreement" | "internal_sign") => {
    setBusy(action);
    setError("");
    try {
      await apiFetch<{ status: string }>(`/api/document-builder/documents/${documentId}`, { method: "PATCH", body: JSON.stringify({ action }) });
      await load();
    } catch (caught) {
      setError(builderError(uiLocale, caught, copy.statusError));
    } finally {
      setBusy("");
    }
  };

  const downloadGenerated = async (file: FileRecord) => {
    try {
      await downloadAuthenticatedFile(`/api/document-builder/documents/${documentId}/files/${file.id}`, file.fileName);
      window.location.assign(paths.documents);
    } catch (caught) {
      setError(builderError(uiLocale, caught, copy.downloadError));
    }
  };

  const setSignedAccess = async (collaboratorUserId: string, viewAllowed: boolean, downloadAllowed: boolean) => {
    try {
      await apiFetch(`/api/document-builder/documents/${documentId}/collaboration`, { method: "POST", body: JSON.stringify({ action: "signed_access", collaboratorUserId, viewAllowed, downloadAllowed }) });
      await load();
    } catch (caught) {
      setError(builderError(uiLocale, caught, copy.statusError));
    }
  };

  const signedFile = files.find((file) => file.kind === "signed_pdf");

  return (
    <section className="dbt-assets" aria-busy={Boolean(busy)}>
      <header><Paperclip size={22}/><div><h2>{copy.title}</h2><p>{copy.subtitle}</p></div></header>
      {error && <p className="dbt-form-error" role="alert">{error}</p>}
      <div className="dbt-assets-actions">
        <input ref={attachmentInput} type="file" hidden accept=".pdf,.docx,.jpg,.jpeg,.png" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }}/>
        <button type="button" onClick={() => attachmentInput.current?.click()} disabled={Boolean(busy)}><FilePlus2 size={18}/>{busy === "attachment" ? copy.uploading : copy.addAttachment}</button>
        <input ref={signedInput} type="file" hidden accept="application/pdf,.pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, true); event.currentTarget.value = ""; }}/>
        {!signedFile && <button type="button" onClick={() => signedInput.current?.click()} disabled={Boolean(busy)}><UploadCloud size={18}/>{busy === "signed" ? copy.uploading : copy.uploadSigned}</button>}
        <button type="button" onClick={() => void createShare()} disabled={busy === "share"}><Link2 size={18}/>{busy === "share" ? copy.creating : copy.shareSevenDays}</button>
      </div>
      {share && <div className="dbt-share-result"><span><span className="dot"/>{copy.linkActive}</span><input aria-label={copy.copyLink} readOnly value={share.url}/><button type="button" onClick={() => void navigator.clipboard.writeText(share.url)} aria-label={copy.copyLink}><Copy size={17}/></button><button type="button" onClick={() => void revokeShare()}>{copy.revoke}</button></div>}
      {files.some((file) => file.kind === "docx" || file.kind === "pdf" || file.kind === "zip") && <div className="dbt-generated-files"><h3>{copy.generated}</h3>{files.filter((file) => file.kind === "docx" || file.kind === "pdf" || file.kind === "zip").map((file) => <button type="button" key={file.id} onClick={() => void downloadGenerated(file)}><FileCheck2 size={19}/><span><strong>{file.fileName}</strong><small>{(file.sizeBytes / 1024).toFixed(0)} {copy.kb}</small></span><Download size={17}/></button>)}</div>}
      {document?.status === "Готов" && <div className="dbt-status-actions"><button type="button" disabled={Boolean(busy)} onClick={() => void changeStatus("confirm_agreement")}><Check size={17}/>{copy.confirmAgreement}</button><button type="button" disabled={Boolean(busy)} onClick={() => void changeStatus("internal_sign")}><ShieldCheck size={17}/>{copy.internalConfirm}</button><small>{copy.internalNote}</small></div>}
      {document?.status === "Согласован" && <div className="dbt-status-actions"><button type="button" disabled={Boolean(busy)} onClick={() => void changeStatus("internal_sign")}><ShieldCheck size={17}/>{copy.internalConfirm}</button><small>{copy.notQualifiedSignature}</small></div>}
      {attachments.length > 0 && <div className="dbt-attachment-list"><h3>{copy.attachments}</h3>{attachments.map((attachment) => <article key={attachment.id}><FileCheck2 size={20}/><div><strong>{attachment.fileName}</strong><small>{(attachment.sizeBytes / 1024).toFixed(0)} {copy.kb} · {attachment.mimeType}</small></div><label><input type="checkbox" checked={Boolean(attachment.visibleToCollaborator)} onChange={(event) => void changeAttachment(attachment.id, event.target.checked)}/>{copy.collaboratorVisible}</label><a href={`/api/document-builder/documents/${documentId}/files/${attachment.fileId}?inline=1`} target="_blank" rel="noreferrer"><Eye size={17}/>{copy.open}</a><button type="button" onClick={() => void analyzeAttachment(attachment)}><Bot size={17}/>{busy === `analysis-${attachment.id}` ? copy.analysing : copy.analyse}</button><button type="button" className="danger" aria-label={copy.remove(attachment.fileName)} onClick={() => void deleteAttachment(attachment.id)}><Trash2 size={17}/></button></article>)}</div>}
      {analysis && <div className="dbt-analysis-result"><strong>{copy.analysisResult}</strong><pre>{JSON.stringify(analysis, null, 2)}</pre><small>{copy.analysisTemporary}</small></div>}
      {signedFile && <div className="dbt-signed-file"><div><ShieldCheck size={24}/><span><strong>{copy.signedUploaded}</strong><small>{copy.signedImmutable}</small></span></div><a href={`/api/document-builder/documents/${documentId}/files/${signedFile.id}?inline=1`} target="_blank" rel="noreferrer"><Eye size={17}/>{copy.openSigned}</a></div>}
      {signedFile && collaboration?.collaborators.length ? <div className="dbt-signed-access-list"><h3>{copy.signedAccess}</h3>{collaboration.collaborators.map((person) => <article key={person.id}><div><strong>{person.displayName}</strong><small>{person.signedOpened ? copy.opened : copy.notOpened}</small></div><label><input type="checkbox" checked={Boolean(person.signedViewAllowed)} onChange={(event) => void setSignedAccess(person.userId, event.target.checked, event.target.checked && Boolean(person.signedDownloadAllowed))}/>{copy.view}</label><label><input type="checkbox" checked={Boolean(person.signedDownloadAllowed)} disabled={!person.signedViewAllowed || person.restoredViewOnly} onChange={(event) => void setSignedAccess(person.userId, true, event.target.checked)}/>{copy.download}</label>{person.restoredViewOnly && <small>{copy.restoredViewOnly}</small>}</article>)}</div> : null}
    </section>
  );
}
