"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Download, Eye, FileCheck2, MessageSquareText, Send, UserPlus, Users, X } from "lucide-react";
import type { CollaborationSnapshot } from "../../../lib/document-builder/types";
import { apiFetch } from "./api-client";

export function CollaborationPanel({ documentId, accessRole, finalText, currentUserEmail, signedFileId, onApplied }: { documentId: string; accessRole: "owner" | "collaborator"; finalText: string; currentUserEmail?: string; signedFileId?: string | null; onApplied: () => void }) {
  const [snapshot, setSnapshot] = useState<CollaborationSnapshot | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [comment, setComment] = useState("");
  const [oldText, setOldText] = useState("");
  const [newText, setNewText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => apiFetch<CollaborationSnapshot>(`/api/document-builder-test/documents/${documentId}/collaboration`).then(setSnapshot).catch((caught: Error) => setError(caught.message)), [documentId]);
  useEffect(() => { void load(); }, [load]);
  const act = async (body: Record<string, unknown>) => {
    setBusy(true); setError("");
    try {
      const result = await apiFetch<{ snapshot?: CollaborationSnapshot; applied?: boolean }>(`/api/document-builder-test/documents/${documentId}/collaboration`, { method: "POST", body: JSON.stringify(body) });
      if (result.snapshot) setSnapshot(result.snapshot);
      if (result.applied) onApplied();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось выполнить действие."); }
    finally { setBusy(false); }
  };
  const currentCollaborator = snapshot?.collaborators.find((person) => person.email.toLocaleLowerCase() === currentUserEmail?.toLocaleLowerCase());
  return <section className="dbt-collaboration">
    <header><Users size={22}/><div><h2>Совместная работа</h2><p>{accessRole === "owner" ? "Пригласите вторую сторону, обсудите и согласуйте изменения." : "Вы можете комментировать и предлагать изменения, но не переписывать документ напрямую."}</p></div></header>
    {error && <p className="dbt-form-error" role="alert">{error}</p>}
    {accessRole === "owner" && <div className="dbt-invite"><label><span>Email или номер телефона пользователя JURO</span><input value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="name@example.uz или +998…"/></label><button type="button" disabled={busy || !identifier.trim()} onClick={() => void act({ action: "invite", identifier }).then(() => setIdentifier(""))}><UserPlus size={17}/>Пригласить</button></div>}
    {snapshot?.collaborators.length ? <div className="dbt-collaborators">{snapshot.collaborators.map((person) => <article key={person.id}><span>{person.displayName.slice(0, 1).toLocaleUpperCase()}</span><div><strong>{person.displayName}</strong><small>{person.email} · {person.status}</small></div>{accessRole === "owner" && <button type="button" onClick={() => void act({ action: "revoke_collaborator", collaboratorUserId: person.userId })}>Закрыть доступ</button>}</article>)}</div> : <p className="dbt-empty-inline">Вторая сторона ещё не приглашена.</p>}
    {accessRole === "collaborator" && signedFileId && <div className="dbt-collaborator-signed"><FileCheck2 size={22}/><div><strong>Подписанная версия</strong><small>{currentCollaborator?.signedViewAllowed ? "Владелец открыл доступ" : "Доступ закрыт владельцем"}</small></div>{currentCollaborator?.signedViewAllowed && <a href={`/api/document-builder-test/documents/${documentId}/files/${signedFileId}?inline=1`} target="_blank" rel="noreferrer"><Eye size={17}/>Открыть</a>}{currentCollaborator?.signedDownloadAllowed && <a href={`/api/document-builder-test/documents/${documentId}/files/${signedFileId}`}><Download size={17}/>Скачать</a>}</div>}
    <div className="dbt-collab-grid"><div><h3><MessageSquareText size={17}/>Комментарии</h3><div className="dbt-comments">{snapshot?.comments.map((item) => <article key={item.id}><strong>{item.authorName}</strong><p>{item.body}</p><small>{new Date(item.createdAt).toLocaleString("ru-RU")}</small></article>)}{!snapshot?.comments.length && <p>Комментариев пока нет.</p>}</div><div className="dbt-comment-input"><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Оставить комментарий…"/><button type="button" aria-label="Отправить комментарий" disabled={busy || !comment.trim()} onClick={() => void act({ action: "comment", body: comment }).then(() => setComment(""))}><Send size={17}/></button></div></div><div><h3>Предложить изменение</h3><label><span>Точный исходный фрагмент</span><textarea value={oldText} onChange={(event) => setOldText(event.target.value)} placeholder={finalText.slice(0, 100)}/></label><label><span>Новая редакция</span><textarea value={newText} onChange={(event) => setNewText(event.target.value)}/></label><button type="button" className="dbt-propose" disabled={busy || !oldText.trim() || !newText.trim()} onClick={() => void act({ action: "proposal", oldText, newText }).then(() => { setOldText(""); setNewText(""); })}>Предложить изменение</button></div></div>
    <div className="dbt-proposals">{snapshot?.proposals.map((proposal) => <article key={proposal.id}><div><span className={`dbt-proposal-status ${proposal.status}`}>{proposal.status === "pending" ? "На согласовании" : proposal.status === "applied" ? "Применено" : "Отклонено"}</span><p><del>{proposal.oldText}</del></p><p><ins>{proposal.newText}</ins></p><small>Создатель: {proposal.ownerAccepted ? "подтвердил" : "ожидает"} · Вторая сторона: {proposal.collaboratorAccepted ? "подтвердила" : "ожидает"}</small></div>{proposal.status === "pending" && <div><button type="button" onClick={() => void act({ action: "accept_proposal", proposalId: proposal.id })}><Check size={16}/>Принять</button><button type="button" onClick={() => void act({ action: "reject_proposal", proposalId: proposal.id })}><X size={16}/>Отклонить</button></div>}</article>)}</div>
    {accessRole === "collaborator" && <button type="button" className="dbt-confirm-data" disabled={busy} onClick={() => void act({ action: "confirm_data" })}><Check size={17}/>Подтвердить данные документа</button>}
  </section>;
}
