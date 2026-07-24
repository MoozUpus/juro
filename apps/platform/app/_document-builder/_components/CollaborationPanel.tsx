"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Download, Eye, FileCheck2, MessageSquareText, Send, UserPlus, Users, X } from "lucide-react";
import type { CollaborationSnapshot } from "../../../lib/document-builder/types";
import { apiFetch } from "./api-client";

export function CollaborationPanel({ documentId, accessRole, finalText, currentUserEmail, signedFileId, onApplied }: { documentId: string; accessRole: "owner" | "collaborator"; finalText: string; currentUserEmail?: string; signedFileId?: string | null; onApplied: () => void }) {
  const [snapshot, setSnapshot] = useState<CollaborationSnapshot | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [inviteRole, setInviteRole] = useState("counterparty");
  const [partyNumber, setPartyNumber] = useState(2);
  const [inviteLink, setInviteLink] = useState("");
  const [comment, setComment] = useState("");
  const [oldText, setOldText] = useState("");
  const [newText, setNewText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => apiFetch<CollaborationSnapshot>(`/api/document-builder/documents/${documentId}/collaboration`).then(setSnapshot).catch((caught: Error) => setError(caught.message)), [documentId]);
  useEffect(() => { void load(); }, [load]);
  const act = async (body: Record<string, unknown>) => {
    setBusy(true); setError("");
    try {
      const result = await apiFetch<{ snapshot?: CollaborationSnapshot; applied?: boolean; invitation?: { path: string } }>(`/api/document-builder/documents/${documentId}/collaboration`, { method: "POST", body: JSON.stringify(body) });
      if (result.snapshot) setSnapshot(result.snapshot);
      if (result.applied) onApplied();
      if (result.invitation?.path) setInviteLink(`${window.location.origin}${result.invitation.path}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось выполнить действие."); }
    finally { setBusy(false); }
  };
  const currentCollaborator = snapshot?.collaborators.find((person) => person.email.toLocaleLowerCase() === currentUserEmail?.toLocaleLowerCase());
  return <section className="dbt-collaboration">
    <header><Users size={22}/><div><h2>Совместная работа</h2><p>{accessRole === "owner" ? "Пригласите вторую или третью сторону, назначьте роль, обсудите и согласуйте изменения." : "Вы можете комментировать и предлагать изменения в пределах назначенной роли."}</p></div></header>
    {error && <p className="dbt-form-error" role="alert">{error}</p>}
    {accessRole === "owner" && <div className="dbt-invite"><label><span>Email или номер телефона пользователя JURO</span><input value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="name@example.uz или +998…"/></label><label><span>Роль</span><select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}><option value="counterparty">Сторона договора</option><option value="co-party">Со-сторона</option><option value="representative">Представитель</option><option value="editor">Редактор</option><option value="commenter">Комментатор</option><option value="viewer">Наблюдатель</option><option value="legal-reviewer">Юрист-проверяющий</option><option value="approver">Согласующий</option></select></label><label><span>Участник</span><select value={partyNumber} onChange={(event) => setPartyNumber(Number(event.target.value))}><option value={2}>Вторая сторона</option><option value={3}>Третья сторона</option></select></label><button type="button" disabled={busy || !identifier.trim()} onClick={() => void act({ action: "invite", identifier, role: inviteRole, partyNumber }).then(() => setIdentifier(""))}><UserPlus size={17}/>Пригласить</button></div>}
    {accessRole === "owner" && inviteLink && <div className="dbt-invite-link"><span>Защищённая ссылка действует 7 дней и привязана к указанному пользователю.</span><input readOnly value={inviteLink}/><button type="button" onClick={() => void navigator.clipboard.writeText(inviteLink)}><Copy size={16}/>Копировать</button></div>}
    {snapshot?.collaborators.length ? <div className="dbt-collaborators">{snapshot.collaborators.map((person) => <article key={person.id}><span>{person.displayName.slice(0, 1).toLocaleUpperCase()}</span><div><strong>{person.displayName}</strong><small>{person.email} · {person.role ?? "участник"}{person.partyNumber ? ` · сторона ${person.partyNumber}` : ""} · {person.approvalStatus ?? person.status}</small></div>{accessRole === "owner" && <button type="button" onClick={() => void act({ action: "revoke_collaborator", collaboratorUserId: person.userId })}>Закрыть доступ</button>}</article>)}</div> : <p className="dbt-empty-inline">Вторая или третья сторона ещё не приглашена.</p>}
    {accessRole === "collaborator" && signedFileId && <div className="dbt-collaborator-signed"><FileCheck2 size={22}/><div><strong>Подписанная версия</strong><small>{currentCollaborator?.signedViewAllowed ? "Владелец открыл доступ" : "Доступ закрыт владельцем"}</small></div>{currentCollaborator?.signedViewAllowed && <a href={`/api/document-builder/documents/${documentId}/files/${signedFileId}?inline=1`} target="_blank" rel="noreferrer"><Eye size={17}/>Открыть</a>}{currentCollaborator?.signedDownloadAllowed && <a href={`/api/document-builder/documents/${documentId}/files/${signedFileId}`}><Download size={17}/>Скачать</a>}</div>}
    <div className="dbt-collab-grid"><div><h3><MessageSquareText size={17}/>Комментарии</h3><div className="dbt-comments">{snapshot?.comments.map((item) => <article key={item.id}><strong>{item.authorName}</strong>{item.threadStatus && <span className={`dbt-comment-status ${item.threadStatus}`}>{item.threadStatus === "resolved" ? "Решено" : "Открыто"}</span>}<p>{item.body}</p><small>{new Date(item.createdAt).toLocaleString("ru-RU")}</small>{accessRole === "owner" && item.threadId && <button type="button" onClick={() => void act({ action: item.threadStatus === "resolved" ? "reopen_comment" : "resolve_comment", threadId: item.threadId })}>{item.threadStatus === "resolved" ? "Открыть снова" : "Отметить решённым"}</button>}</article>)}{!snapshot?.comments.length && <p>Комментариев пока нет.</p>}</div><div className="dbt-comment-input"><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Оставить комментарий…"/><button type="button" aria-label="Отправить комментарий" disabled={busy || !comment.trim()} onClick={() => void act({ action: "comment", body: comment }).then(() => setComment(""))}><Send size={17}/></button></div></div><div><h3>Предложить изменение</h3><label><span>Точный исходный фрагмент</span><textarea value={oldText} onChange={(event) => setOldText(event.target.value)} placeholder={finalText.slice(0, 100)}/></label><label><span>Новая редакция</span><textarea value={newText} onChange={(event) => setNewText(event.target.value)}/></label><button type="button" className="dbt-propose" disabled={busy || !oldText.trim() || !newText.trim()} onClick={() => void act({ action: "proposal", oldText, newText }).then(() => { setOldText(""); setNewText(""); })}>Предложить изменение</button></div></div>
    <div className="dbt-proposals">{snapshot?.proposals.map((proposal) => <article key={proposal.id}><div><span className={`dbt-proposal-status ${proposal.status}`}>{proposal.status === "pending" ? "На согласовании" : proposal.status === "applied" ? "Применено" : "Отклонено"}</span><p><del>{proposal.oldText}</del></p><p><ins>{proposal.newText}</ins></p><small>Создатель: {proposal.ownerAccepted ? "подтвердил" : "ожидает"} · Вторая сторона: {proposal.collaboratorAccepted ? "подтвердила" : "ожидает"}</small></div>{proposal.status === "pending" && <div><button type="button" onClick={() => void act({ action: "accept_proposal", proposalId: proposal.id })}><Check size={16}/>Принять</button><button type="button" onClick={() => void act({ action: "reject_proposal", proposalId: proposal.id })}><X size={16}/>Отклонить</button></div>}</article>)}</div>
    {accessRole === "collaborator" && <button type="button" className="dbt-confirm-data" disabled={busy} onClick={() => void act({ action: "confirm_data" })}><Check size={17}/>Подтвердить данные документа</button>}
  </section>;
}
