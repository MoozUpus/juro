"use client";

import { Check, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { PlatformLocale } from "../../../../lib/platform/routing";
import { builderIntlLocale, builderText } from "../../builder-localization";
import { ApiClientError, apiFetch } from "../../_components/api-client";

interface InvitationInfo {
  documentTitle: string;
  role: string;
  partyNumber: number | null;
  expiresAt: string;
}

export function InvitationClient({ token, locale }: { token: string; locale: PlatformLocale }) {
  const copy = useMemo(() => builderText(locale, {
    ru: { title: "Приглашение к документу", checking: "Проверяем приглашение…", role: "Вам назначена роль", party: "сторона", expires: "Приглашение действует до", accept: "Принять", decline: "Отклонить", failed: "Не удалось обработать приглашение.", revoked: "Приглашение отозвано.", declined: "Приглашение уже отклонено.", accepted: "Приглашение уже принято.", expired: "Срок действия приглашения истёк.", unavailable: "Приглашение недоступно." },
    uz: { title: "Hujjatga taklifnoma", checking: "Taklifnoma tekshirilmoqda…", role: "Sizga berilgan rol", party: "taraf", expires: "Taklifnoma quyidagi vaqtgacha amal qiladi", accept: "Qabul qilish", decline: "Rad etish", failed: "Taklifnomani qayta ishlab bo‘lmadi.", revoked: "Taklifnoma bekor qilingan.", declined: "Taklifnoma avval rad etilgan.", accepted: "Taklifnoma avval qabul qilingan.", expired: "Taklifnoma muddati tugagan.", unavailable: "Taklifnoma mavjud emas." },
    en: { title: "Document invitation", checking: "Checking the invitation…", role: "Your assigned role", party: "party", expires: "This invitation is valid until", accept: "Accept", decline: "Decline", failed: "We could not process the invitation.", revoked: "This invitation has been revoked.", declined: "This invitation has already been declined.", accepted: "This invitation has already been accepted.", expired: "This invitation has expired.", unavailable: "This invitation is unavailable." },
  }), [locale]);
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void apiFetch<InvitationInfo>(`/api/document-builder/invitations/${encodeURIComponent(token)}`)
      .then(setInfo)
      .catch((caught: unknown) => setError(invitationError(caught, copy)));
  }, [copy, token]);
  const act = async (action: "accept" | "decline") => {
    setBusy(true); setError("");
    try {
      const result = await apiFetch<{ accepted?: boolean; declined?: boolean; documentId?: string }>(`/api/document-builder/invitations/${encodeURIComponent(token)}`, { method: "POST", body: JSON.stringify({ action }) });
      if (result.accepted && result.documentId) window.location.assign(`/document-builder/documents/${encodeURIComponent(result.documentId)}`);
      if (result.declined) window.location.assign("/document-builder");
    } catch (caught) {
      setError(invitationError(caught, copy));
    } finally { setBusy(false); }
  };
  return <main className="dbt-invitation-page" lang={locale}><section><ShieldCheck size={34}/><span className="dbt-eyebrow">JURO COLLABORATION</span><h1>{copy.title}</h1>{error && <p className="dbt-form-error" role="alert">{error}</p>}{!error && !info && <p>{copy.checking}</p>}{info && <><h2>{info.documentTitle}</h2><p>{copy.role}: <strong>{info.role}</strong>{info.partyNumber ? ` · ${copy.party} ${info.partyNumber}` : ""}.</p><small>{copy.expires} {new Date(info.expiresAt).toLocaleString(builderIntlLocale(locale))}.</small><div><button type="button" disabled={busy} onClick={() => void act("accept")}><Check size={18}/>{copy.accept}</button><button type="button" disabled={busy} onClick={() => void act("decline")}><X size={18}/>{copy.decline}</button></div></>}</section></main>;
}

function invitationError(
  error: unknown,
  copy: { failed: string; revoked: string; declined: string; accepted: string; expired: string; unavailable: string },
): string {
  if (!(error instanceof ApiClientError)) return copy.failed;
  if (error.code === "INVITATION_REVOKED") return copy.revoked;
  if (error.code === "INVITATION_DECLINED") return copy.declined;
  if (error.code === "INVITATION_ACCEPTED") return copy.accepted;
  if (error.code === "INVITATION_EXPIRED") return copy.expired;
  if (error.code === "NOT_FOUND" || error.code === "FORBIDDEN") return copy.unavailable;
  return copy.failed;
}
