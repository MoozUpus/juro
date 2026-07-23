"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Check, Copy, Download, Eye, FileCheck2, FilePlus2, Link2, Paperclip, ShieldCheck, Trash2, UploadCloud } from "lucide-react";
import type { CollaborationSnapshot, FileRecord, StoredDocument } from "../../../lib/document-builder/types";
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

export function DocumentAssetsPanel({ documentId, onDocumentChange }: { documentId: string; onDocumentChange: (document: StoredDocument) => void }) {
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
    const result = await apiFetch<{ document: StoredDocument; files: FileRecord[]; attachments: Attachment[] }>(`/api/document-builder-test/documents/${documentId}`);
    setDocument(result.document); setFiles(result.files); setAttachments(result.attachments); onDocumentChange(result.document);
    apiFetch<CollaborationSnapshot>(`/api/document-builder-test/documents/${documentId}/collaboration`).then(setCollaboration).catch(() => undefined);
  }, [documentId, onDocumentChange]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load is asynchronous and hydrates server-backed state
  useEffect(() => { void load().catch((caught: Error) => setError(caught.message)); }, [load]);

  const upload = async (file: File, signed = false) => {
    setBusy(signed ? "signed" : "attachment"); setError("");
    try {
      const form = new FormData(); form.set("file", file);
      const endpoint = signed ? "signed-file" : "attachments";
      await apiFetch<{ status?: string }>(`/api/document-builder-test/documents/${documentId}/${endpoint}`, { method: "POST", body: form });
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Загрузка не выполнена."); }
    finally { setBusy(""); }
  };
  const changeAttachment = async (attachmentId: string, visibleToCollaborator: boolean) => {
    await apiFetch(`/api/document-builder-test/documents/${documentId}/attachments`, { method: "PATCH", body: JSON.stringify({ attachmentId, visibleToCollaborator }) }); await load();
  };
  const deleteAttachment = async (attachmentId: string) => {
    await apiFetch(`/api/document-builder-test/documents/${documentId}/attachments`, { method: "DELETE", body: JSON.stringify({ attachmentId }) }); await load();
  };
  const analyzeAttachment = async (attachment: Attachment) => {
    setBusy(`analysis-${attachment.id}`); setAnalysis(null); setError("");
    try {
      const result = await apiFetch<{ status: string; message?: string; result?: Record<string, unknown> }>("/api/document-builder-test/attachment-analysis", { method: "POST", body: JSON.stringify({ documentId, attachmentId: attachment.id, questionnaireSummary: document?.autoContent.slice(0, 10_000) }) });
      setAnalysis(result.result ?? { message: result.message, status: result.status });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Анализ не выполнен."); }
    finally { setBusy(""); }
  };
  const createShare = async () => {
    setBusy("share");
    try { const result = await apiFetch<{ url: string; expiresAt: string }>(`/api/document-builder-test/documents/${documentId}/share`, { method: "POST", body: JSON.stringify({ action: "create" }) }); setShare(result); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Ссылка не создана."); }
    finally { setBusy(""); }
  };
  const revokeShare = async () => {
    setBusy("share");
    try {
      await apiFetch(`/api/document-builder-test/documents/${documentId}/share`, { method: "POST", body: JSON.stringify({ action: "revoke" }) });
      setShare(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Доступ не отозван."); }
    finally { setBusy(""); }
  };
  const changeStatus = async (action: "confirm_agreement" | "internal_sign") => {
    setBusy(action); setError("");
    try {
      await apiFetch<{ status: string }>(`/api/document-builder-test/documents/${documentId}`, { method: "PATCH", body: JSON.stringify({ action }) });
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Статус не изменён."); }
    finally { setBusy(""); }
  };
  const downloadGenerated = async (file: FileRecord) => {
    try {
      await downloadAuthenticatedFile(`/api/document-builder-test/documents/${documentId}/files/${file.id}`, file.fileName);
      window.location.assign("/document-builder-test/documents");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Файл не скачан."); }
  };
  const setSignedAccess = async (collaboratorUserId: string, viewAllowed: boolean, downloadAllowed: boolean) => {
    await apiFetch(`/api/document-builder-test/documents/${documentId}/collaboration`, { method: "POST", body: JSON.stringify({ action: "signed_access", collaboratorUserId, viewAllowed, downloadAllowed }) });
    await load();
  };
  const signedFile = files.find((file) => file.kind === "signed_pdf");
  return <section className="dbt-assets">
    <header><Paperclip size={22}/><div><h2>Файлы и доступы</h2><p>Файлы хранятся приватно и выдаются только через проверку прав.</p></div></header>
    {error && <p className="dbt-form-error" role="alert">{error}</p>}
    <div className="dbt-assets-actions"><input ref={attachmentInput} type="file" hidden accept=".pdf,.docx,.jpg,.jpeg,.png" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }}/><button type="button" onClick={() => attachmentInput.current?.click()} disabled={Boolean(busy)}><FilePlus2 size={18}/>{busy === "attachment" ? "Загружаем…" : "Добавить вложение"}</button><input ref={signedInput} type="file" hidden accept="application/pdf,.pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, true); event.currentTarget.value = ""; }}/>{!signedFile && <button type="button" onClick={() => signedInput.current?.click()} disabled={Boolean(busy)}><UploadCloud size={18}/>{busy === "signed" ? "Загружаем…" : "Загрузить подписанный PDF"}</button>}<button type="button" onClick={() => void createShare()} disabled={busy === "share"}><Link2 size={18}/>{busy === "share" ? "Создаём…" : "Поделиться документом на 7 дней"}</button></div>
    {share && <div className="dbt-share-result"><span><span className="dot"/>Ссылка действует 7 дней</span><input readOnly value={share.url}/><button type="button" onClick={() => navigator.clipboard.writeText(share.url)} aria-label="Скопировать ссылку"><Copy size={17}/></button><button type="button" onClick={() => void revokeShare()}>Отозвать</button></div>}
    {files.some((file) => file.kind === "docx" || file.kind === "pdf" || file.kind === "zip") && <div className="dbt-generated-files"><h3>Сформированные файлы</h3>{files.filter((file) => file.kind === "docx" || file.kind === "pdf" || file.kind === "zip").map((file) => <button type="button" key={file.id} onClick={() => void downloadGenerated(file)}><FileCheck2 size={19}/><span><strong>{file.fileName}</strong><small>{(file.sizeBytes / 1024).toFixed(0)} КБ</small></span><Download size={17}/></button>)}</div>}
    {document?.status === "Готов" && <div className="dbt-status-actions"><button type="button" disabled={Boolean(busy)} onClick={() => void changeStatus("confirm_agreement")}><Check size={17}/>Подтвердить создателем — «Согласован»</button><button type="button" disabled={Boolean(busy)} onClick={() => void changeStatus("internal_sign")}><ShieldCheck size={17}/>Внутренне подтвердить в JURO</button><small>Внутреннее подтверждение фиксирует аккаунт, дату и ID документа, но не является квалифицированной ЭЦП.</small></div>}
    {document?.status === "Согласован" && <div className="dbt-status-actions"><button type="button" disabled={Boolean(busy)} onClick={() => void changeStatus("internal_sign")}><ShieldCheck size={17}/>Внутренне подтвердить в JURO</button><small>Это не квалифицированная электронная подпись.</small></div>}
    {attachments.length > 0 && <div className="dbt-attachment-list"><h3>Вложения</h3>{attachments.map((attachment) => <article key={attachment.id}><FileCheck2 size={20}/><div><strong>{attachment.fileName}</strong><small>{(attachment.sizeBytes / 1024).toFixed(0)} КБ · {attachment.mimeType}</small></div><label><input type="checkbox" checked={Boolean(attachment.visibleToCollaborator)} onChange={(event) => void changeAttachment(attachment.id, event.target.checked)}/>Видно второй стороне</label><a href={`/api/document-builder-test/documents/${documentId}/files/${attachment.fileId}?inline=1`} target="_blank" rel="noreferrer"><Eye size={17}/>Открыть</a><button type="button" onClick={() => void analyzeAttachment(attachment)}><Bot size={17}/>{busy === `analysis-${attachment.id}` ? "Анализ…" : "AI-анализ"}</button><button type="button" className="danger" aria-label={`Удалить ${attachment.fileName}`} onClick={() => void deleteAttachment(attachment.id)}><Trash2 size={17}/></button></article>)}</div>}
    {analysis && <div className="dbt-analysis-result"><strong>Результат анализа текущей сессии</strong><pre>{JSON.stringify(analysis, null, 2)}</pre><small>Результат не сохранён в базе или истории.</small></div>}
    {signedFile && <div className="dbt-signed-file"><div><ShieldCheck size={24}/><span><strong>Подписанный PDF загружен</strong><small>Этот файл нельзя заменить.</small></span></div><a href={`/api/document-builder-test/documents/${documentId}/files/${signedFile.id}?inline=1`} target="_blank" rel="noreferrer"><Eye size={17}/>Открыть подписанную версию</a></div>}
    {signedFile && collaboration?.collaborators.length ? <div className="dbt-signed-access-list"><h3>Доступ второй стороны к подписанному PDF</h3>{collaboration.collaborators.map((person) => <article key={person.id}><div><strong>{person.displayName}</strong><small>{person.signedOpened ? "Открывал(а) PDF" : "Не открывал(а) PDF"}</small></div><label><input type="checkbox" checked={Boolean(person.signedViewAllowed)} onChange={(event) => void setSignedAccess(person.userId, event.target.checked, event.target.checked && Boolean(person.signedDownloadAllowed))}/>Просмотр</label><label><input type="checkbox" checked={Boolean(person.signedDownloadAllowed)} disabled={!person.signedViewAllowed || person.restoredViewOnly} onChange={(event) => void setSignedAccess(person.userId, true, event.target.checked)}/>Скачивание</label>{person.restoredViewOnly && <small>После восстановления доступен только просмотр</small>}</article>)}</div> : null}
  </section>;
}
