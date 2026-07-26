"use client";

/* eslint-disable react-hooks/set-state-in-effect -- document list is loaded from D1 after mount */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, Copy, Download, Eye, FileCheck2, FilePlus2, Files, FolderArchive, Heart, Link2, LoaderCircle, MoreHorizontal, Pencil, Search, Star, Trash2, UploadCloud } from "lucide-react";
import type { ChatGPTUser } from "../../chatgpt-auth";
import type { DocumentRecord, FileRecord } from "../../../lib/document-builder/types";
import { BuilderHeader } from "../_components/BuilderHeader";
import { ApiClientError, apiFetch, downloadAuthenticatedFile } from "../_components/api-client";
import { useDebouncedEffect } from "../_hooks/useDebouncedEffect";

type Folder = "all" | "created" | "shared" | "favorite" | "archive";
type StandaloneShare = { id: string; url: string; code: string | null; status: "active" | "expired" | "inactive" };

export function DocumentsClient({ user, signInPath }: { user: ChatGPTUser; signInPath: string }) {
  const [documents, setDocuments] = useState<Array<DocumentRecord & { accessRole: "owner" | "collaborator" }>>([]);
  const [standalone, setStandalone] = useState<FileRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [folder, setFolder] = useState<Folder>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("newest");
  const [from, setFrom] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [menu, setMenu] = useState("");
  const [deleteDecision, setDeleteDecision] = useState<DocumentRecord | null>(null);
  const [standaloneShare, setStandaloneShare] = useState<Record<string, StandaloneShare | null>>({});
  const uploadRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ folder, search: debouncedSearch, status, sort });
      if (from) params.set("from", from);
      const result = await apiFetch<{ documents: Array<DocumentRecord & { accessRole: "owner" | "collaborator" }>; standaloneFiles: FileRecord[]; total: number }>(`/api/document-builder/documents?${params}`);
      setDocuments(result.documents); setStandalone(result.standaloneFiles); setTotal(result.total);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось загрузить документы."); }
    finally { setLoading(false); }
  }, [folder, debouncedSearch, status, sort, from]);
  useEffect(() => { void load(); }, [load]);
  useDebouncedEffect(() => { setDebouncedSearch(search); }, [search], 350);

  const patch = async (id: string, body: Record<string, unknown>) => {
    await apiFetch(`/api/document-builder/documents/${id}`, { method: "PATCH", body: JSON.stringify(body) }); setMenu(""); await load();
  };
  const duplicate = async (id: string) => {
    const result = await apiFetch<{ document: DocumentRecord }>("/api/document-builder/documents", { method: "POST", body: JSON.stringify({ sourceDocumentId: id }) });
    window.location.assign(`/document-builder/documents/${result.document.id}`);
  };
  const removeDocument = async (document: DocumentRecord, policy?: "keep" | "delete") => {
    try {
      const query = policy ? `?signed=${policy}` : "";
      await apiFetch(`/api/document-builder/documents/${document.id}${query}`, { method: "DELETE" });
      setDeleteDecision(null); setToast("Документ удалён"); window.setTimeout(() => setToast(""), 2_500); await load();
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.code === "SIGNED_FILE_DECISION_REQUIRED") { setDeleteDecision(document); return; }
      setError(caught instanceof Error ? caught.message : "Удаление не выполнено.");
    }
  };
  const uploadSigned = async (document: DocumentRecord, file: File) => {
    const form = new FormData(); form.set("file", file);
    try { await apiFetch(`/api/document-builder/documents/${document.id}/signed-file`, { method: "POST", body: form }); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "PDF не загружен."); }
  };
  const patchStandalone = async (id: string, body: Record<string, unknown>) => { await apiFetch(`/api/document-builder/standalone-files/${id}`, { method: "PATCH", body: JSON.stringify(body) }); await load(); };
  const deleteStandalone = async (file: FileRecord) => { await apiFetch(`/api/document-builder/standalone-files/${file.id}`, { method: "DELETE" }); await load(); };
  const loadStandaloneShare = async (id: string) => {
    const result = await apiFetch<{ share: StandaloneShare | null }>(`/api/document-builder/standalone-files/${id}/share`); setStandaloneShare((value) => ({ ...value, [id]: result.share }));
  };
  const createStandaloneShare = async (id: string) => {
    try {
      const result = await apiFetch<{ share: StandaloneShare }>(`/api/document-builder/standalone-files/${id}/share`, { method: "POST", body: JSON.stringify({ action: "create" }) });
      setStandaloneShare((value) => ({ ...value, [id]: result.share }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Ссылка не создана."); await loadStandaloneShare(id); }
  };
  const deleteExpiredShare = async (id: string) => {
    await apiFetch(`/api/document-builder/standalone-files/${id}/share`, { method: "POST", body: JSON.stringify({ action: "delete_expired" }) }); setStandaloneShare((value) => ({ ...value, [id]: null }));
  };
  const copyAll = (share: StandaloneShare) => share.code && navigator.clipboard.writeText(`Ссылка: ${share.url}\nКод: ${share.code}`);

  return <div className="dbt-root"><BuilderHeader user={user} signInPath={signInPath}/><main className="dbt-documents-page">
    <header className="dbt-page-title"><div><span><Files size={22}/></span><div><h1>Мои документы</h1><p>{total} {total === 1 ? "документ" : "документов и файлов"}</p></div></div><Link href="/document-builder/library"><FilePlus2 size={18}/>Создать документ</Link></header>
    {toast && <div className="dbt-toast" role="status">{toast}</div>}
    {error && <div className="dbt-global-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")}>×</button></div>}
    <div className="dbt-docs-layout"><aside className="dbt-folders">{([{ id: "all", label: "Все", icon: Files }, { id: "created", label: "Созданные", icon: FileCheck2 }, { id: "shared", label: "Доступные мне", icon: Link2 }, { id: "favorite", label: "Избранное", icon: Star }, { id: "archive", label: "Архив", icon: FolderArchive }] as const).map(({ id, label, icon: Icon }) => <button type="button" className={folder === id ? "active" : ""} onClick={() => setFolder(id)} key={id}><Icon size={18}/>{label}</button>)}</aside><section className="dbt-docs-content"><div className="dbt-doc-filters"><label className="dbt-doc-search"><Search size={18}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по названию или участникам"/></label><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Фильтр по статусу"><option value="">Все статусы</option><option>Черновик</option><option>Готов</option><option>Согласован</option><option>Подписан</option></select><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="Создано после даты"/><select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Сортировка"><option value="newest">Новые сначала</option><option value="oldest">Старые сначала</option><option value="title">По названию</option></select></div>
      {loading ? <div className="dbt-list-loading"><LoaderCircle size={25}/><p>Загружаем документы…</p></div> : documents.length === 0 && standalone.length === 0 ? <div className="dbt-empty-state"><FilePlus2 size={38}/><h2>Здесь пока нет документов</h2><p>Выберите шаблон — черновик появится здесь после входа.</p><Link href="/document-builder/library">Выбрать шаблон</Link></div> : <div className="dbt-document-list">
        {documents.map((document) => <article className="dbt-document-card" key={document.id}><span className="dbt-file-icon"><FileCheck2 size={23}/></span><div className="dbt-document-main"><div><span className={`dbt-doc-status status-${document.status.toLocaleLowerCase()}`}>{document.status}</span>{document.accessRole === "collaborator" && <span className="dbt-incoming">Совместный доступ</span>}</div><h2>{document.title}</h2><p>{[document.lenderName, document.borrowerName].filter(Boolean).join(" ↔ ") || "Участники ещё не указаны"}</p><small>{document.category} · {document.templateCode ? `№ ${document.templateCode} · ` : ""}{new Date(document.updatedAt).toLocaleDateString("ru-RU")}</small></div><div className="dbt-document-actions"><a href={`/document-builder/documents/${document.id}`}>{document.status === "Черновик" ? "Продолжить" : "Открыть"}</a>{document.signedFileId && <a href={`/api/document-builder/documents/${document.id}/files/${document.signedFileId}?inline=1`} target="_blank" rel="noreferrer">Подписанная версия</a>}{document.accessRole === "owner" && <><button type="button" className={document.isFavorite ? "favorite" : ""} aria-label={document.isFavorite ? "Убрать из избранного" : "Добавить в избранное"} onClick={() => void patch(document.id, { action: "favorite", value: !document.isFavorite })}><Heart size={18}/></button><button type="button" aria-label="Другие действия" onClick={() => setMenu(menu === document.id ? "" : document.id)}><MoreHorizontal size={19}/></button>{menu === document.id && <div className="dbt-card-menu"><button type="button" onClick={() => { const next = window.prompt("Новое название", document.title); if (next) void patch(document.id, { action: "rename", title: next }); }}><Pencil size={16}/>Переименовать</button><button type="button" onClick={() => void duplicate(document.id)}><Copy size={16}/>Создать копию</button>{document.status === "Архив" ? <button type="button" onClick={() => void patch(document.id, { action: "restore" })}><ArchiveRestore size={16}/>Восстановить</button> : <button type="button" onClick={() => void patch(document.id, { action: "archive" })}><Archive size={16}/>Переместить в архив</button>}{!document.signedFileId && <><input ref={(node) => { uploadRefs.current[document.id] = node; }} type="file" hidden accept="application/pdf,.pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadSigned(document, file); event.currentTarget.value = ""; }}/><button type="button" onClick={() => uploadRefs.current[document.id]?.click()}><UploadCloud size={16}/>Загрузить подписанный PDF</button></>}<button type="button" className="danger" onClick={() => void removeDocument(document)}><Trash2 size={16}/>Удалить</button></div>}</>}</div></article>)}
        {standalone.map((file) => { const share = standaloneShare[file.id]; return <article className="dbt-document-card standalone" key={file.id}><span className="dbt-file-icon"><FileCheck2 size={23}/></span><div className="dbt-document-main"><h2>{file.fileName}</h2><p>Отдельно сохранённый подписанный PDF</p><small>{(file.sizeBytes / 1024).toFixed(0)} КБ</small>{share !== undefined && <div className="dbt-standalone-share">{share ? <><div className="dbt-share-line"><input readOnly value={share.url}/>{share.status === "active" && <><span className="active"><i/>Активна</span><button type="button" onClick={() => void createStandaloneShare(file.id)}>Создать новую ссылку</button></>}{share.status === "expired" && <button type="button" onClick={() => void deleteExpiredShare(file.id)}>Удалить ссылку</button>}</div>{share.status === "active" && share.code && <div className="dbt-share-code"><span>Код: <strong>{share.code}</strong></span><button type="button" onClick={() => navigator.clipboard.writeText(share.url)}>Скопировать ссылку</button><button type="button" onClick={() => navigator.clipboard.writeText(share.code!)}>Скопировать код</button><button type="button" onClick={() => void copyAll(share)}>Скопировать ссылку и код вместе</button></div>}</> : <button type="button" onClick={() => void createStandaloneShare(file.id)}><Link2 size={16}/>Создать ссылку на 24 часа</button>}</div>}</div><div className="dbt-document-actions"><a href={`/api/document-builder/standalone-files/${file.id}?inline=1`} target="_blank" rel="noreferrer"><Eye size={17}/>Открыть</a><button type="button" onClick={() => void downloadAuthenticatedFile(`/api/document-builder/standalone-files/${file.id}`, file.fileName)}><Download size={17}/>Скачать</button><button type="button" onClick={() => void loadStandaloneShare(file.id)}><Link2 size={17}/>Поделиться</button><button type="button" onClick={() => { const next = window.prompt("Новое название", file.fileName.replace(/\.pdf$/i, "")); if (next) void patchStandalone(file.id, { action: "rename", title: next }); }}><Pencil size={17}/></button>{file.archivedAt ? <button type="button" onClick={() => void patchStandalone(file.id, { action: "restore" })}><ArchiveRestore size={17}/></button> : <button type="button" onClick={() => void patchStandalone(file.id, { action: "archive" })}><Archive size={17}/></button>}<button type="button" className="danger" onClick={() => void deleteStandalone(file)}><Trash2 size={17}/></button></div></article>; })}
      </div>}
    </section></div>
    {deleteDecision && <div className="dbt-modal-backdrop"><section className="dbt-delete-choice" role="dialog" aria-modal="true"><h2>Что сделать с подписанным PDF?</h2><p>Основной документ будет удалён без возможности восстановления.</p><button type="button" onClick={() => void removeDocument(deleteDecision, "delete")}><Trash2 size={18}/>Удалить подписанный PDF вместе с документом</button><button type="button" onClick={() => void removeDocument(deleteDecision, "keep")}><FileCheck2 size={18}/>Сохранить подписанный PDF отдельно</button><button type="button" className="cancel" onClick={() => setDeleteDecision(null)}>Отмена</button></section></div>}
  </main></div>;
}
