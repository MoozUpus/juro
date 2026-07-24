"use client";

import { Check, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch } from "../../_components/api-client";

interface InvitationInfo {
  documentTitle: string;
  role: string;
  partyNumber: number | null;
  expiresAt: string;
}

export function InvitationClient({ token }: { token: string }) {
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void apiFetch<InvitationInfo>(`/api/document-builder/invitations/${encodeURIComponent(token)}`).then(setInfo).catch((caught: Error) => setError(caught.message));
  }, [token]);
  const act = async (action: "accept" | "decline") => {
    setBusy(true); setError("");
    try {
      const result = await apiFetch<{ accepted?: boolean; declined?: boolean; documentId?: string }>(`/api/document-builder/invitations/${encodeURIComponent(token)}`, { method: "POST", body: JSON.stringify({ action }) });
      if (result.accepted && result.documentId) window.location.assign(`/document-builder/documents/${encodeURIComponent(result.documentId)}`);
      if (result.declined) window.location.assign("/document-builder");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось обработать приглашение.");
    } finally { setBusy(false); }
  };
  return <main className="dbt-invitation-page"><section><ShieldCheck size={34}/><span className="dbt-eyebrow">JURO COLLABORATION</span><h1>Приглашение к документу</h1>{error && <p className="dbt-form-error" role="alert">{error}</p>}{!error && !info && <p>Проверяем приглашение…</p>}{info && <><h2>{info.documentTitle}</h2><p>Вам назначена роль: <strong>{info.role}</strong>{info.partyNumber ? ` · сторона ${info.partyNumber}` : ""}.</p><small>Приглашение действует до {new Date(info.expiresAt).toLocaleString("ru-RU")}.</small><div><button type="button" disabled={busy} onClick={() => void act("accept")}><Check size={18}/>Принять</button><button type="button" disabled={busy} onClick={() => void act("decline")}><X size={18}/>Отклонить</button></div></>}</section></main>;
}
