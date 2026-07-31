"use client";

/* eslint-disable react-hooks/set-state-in-effect -- authenticated handoff records are loaded after the first browser render */

import { LoaderCircle, ShieldCheck, UserRoundCheck } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { WorkspaceEntitlements } from "../../lib/billing/entitlements";
import type { PlatformLocale } from "../../lib/platform/routing";

type CaseOption = { id: string; title: string };
type HandoffRequest = { id: string; caseId: string; status: string; createdAt: string; lawyerName?: string | null; conflictStatus?: string | null; activeGrantId?: string | null };

export function LawyerHandoffClient({ locale }: { locale: PlatformLocale }) {
  const ru = locale === "ru";
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [requests, setRequests] = useState<HandoffRequest[]>([]);
  const [entitlements, setEntitlements] = useState<WorkspaceEntitlements | null>(null);
  const [caseId, setCaseId] = useState("");
  const [summary, setSummary] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const [requestResponse, caseResponse, consultationResponse] = await Promise.all([
      fetch("/api/platform/lawyer-requests", { cache: "no-store" }),
      fetch("/api/platform/cases", { cache: "no-store" }),
      fetch("/api/platform/consultations", { cache: "no-store" }),
    ]);
    const requestBody = await requestResponse.json() as { requests?: HandoffRequest[]; error?: string };
    const caseBody = await caseResponse.json() as { cases?: CaseOption[]; error?: string };
    const consultationBody = await consultationResponse.json() as { entitlements?: WorkspaceEntitlements; error?: string };
    if (!requestResponse.ok || !caseResponse.ok || !consultationResponse.ok) throw new Error(requestBody.error || caseBody.error || consultationBody.error || "Ошибка");
    const nextCases = caseBody.cases || [];
    setCases(nextCases);
    setCaseId((current) => current || nextCases[0]?.id || "");
    setRequests(requestBody.requests || []);
    setEntitlements(consultationBody.entitlements || null);
  }, []);

  useEffect(() => { void load().catch((value) => setError(value instanceof Error ? value.message : String(value))); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!entitlements?.lawyerHandoff || !caseId || !consent) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/platform/lawyer-requests", {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ caseId, anonymizedSummary: summary, consent: true, locale }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Ошибка");
      setSummary(""); setConsent(false);
      setMessage(ru ? "Заявка сохранена. До назначения юриста материалы дела не раскрываются." : "So‘rov saqlandi. Yurist tayinlanmaguncha ish materiallari oshkor qilinmaydi.");
      await load();
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    finally { setBusy(false); }
  }

  return <section className="lawyer-handoff" aria-labelledby="lawyer-handoff-heading">
    <div className="lawyer-handoff-heading">
      <UserRoundCheck aria-hidden="true" />
      <div><h2 id="lawyer-handoff-heading">{ru ? "Передать дело юристу" : "Ishni yuristga topshirish"}</h2><p>{ru ? "Сначала создаётся только анонимизированная заявка. Полный доступ к делу возможен лишь после conflict check и вашего отдельного подтверждения." : "Avval faqat anonimlashtirilgan so‘rov yaratiladi. Ishga to‘liq ruxsat faqat manfaatlar to‘qnashuvi tekshiruvi va sizning alohida tasdiqingizdan keyin beriladi."}</p></div>
    </div>
    {error && <p className="plan-error" role="alert">{error}</p>}
    {message && <p className="lawyer-handoff-success" role="status"><ShieldCheck aria-hidden="true" />{message}</p>}
    <form onSubmit={(event) => void submit(event)}>
      <label>{ru ? "Дело" : "Ish"}<select value={caseId} onChange={(event) => setCaseId(event.target.value)} disabled={!entitlements?.lawyerHandoff || busy}>{cases.length ? cases.map((item) => <option key={item.id} value={item.id}>{item.title}</option>) : <option value="">{ru ? "Нет доступных дел" : "Mavjud ish yo‘q"}</option>}</select></label>
      <label>{ru ? "Анонимизированное описание для conflict check" : "Manfaatlar to‘qnashuvi tekshiruvi uchun anonimlashtirilgan tavsif"}<textarea value={summary} minLength={20} maxLength={2000} required disabled={!entitlements?.lawyerHandoff || busy} onChange={(event) => setSummary(event.target.value)} placeholder={ru ? "Без имён, реквизитов и содержания документов" : "Ismlar, rekvizitlar va hujjat mazmunisiz"} /></label>
      <label className="consult-consent"><input type="checkbox" checked={consent} disabled={!entitlements?.lawyerHandoff || busy} onChange={(event) => setConsent(event.target.checked)} /><span>{ru ? "Подтверждаю создание анонимизированной заявки; доступ к делу пока не предоставляется." : "Anonimlashtirilgan so‘rov yaratilishini tasdiqlayman; ishga ruxsat hozircha berilmaydi."}</span></label>
      <button type="submit" disabled={!entitlements?.lawyerHandoff || !cases.length || summary.trim().length < 20 || !consent || busy}>{busy ? <LoaderCircle className="spin" /> : null}{ru ? "Создать заявку" : "So‘rov yaratish"}</button>
    </form>
    {requests.length > 0 && <div className="lawyer-handoff-list"><h3>{ru ? "Мои заявки к юристу" : "Yuristga yuborgan so‘rovlarim"}</h3>{requests.map((item) => <div key={item.id}><strong>{handoffStatus(item.status, ru)}</strong><span>{item.lawyerName || (ru ? "Ожидается назначение JURO" : "JURO tayinlashi kutilmoqda")}</span><time dateTime={item.createdAt}>{new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeZone: "Asia/Tashkent" }).format(new Date(item.createdAt))}</time></div>)}</div>}
  </section>;
}

function handoffStatus(status: string, ru: boolean) {
  const labels: Record<string, [string, string]> = { unassigned: ["Ожидается назначение", "Tayinlash kutilmoqda"], conflict_check_pending: ["Проверка конфликта", "Manfaatlar to‘qnashuvi tekshirilmoqda"], awaiting_user_consent: ["Нужно ваше подтверждение", "Sizning tasdig‘ingiz kerak"], access_granted: ["Доступ предоставлен", "Ruxsat berildi"], access_revoked: ["Доступ отозван", "Ruxsat bekor qilindi"], conflict_declined: ["Конфликт интересов", "Manfaatlar to‘qnashuvi"] };
  return labels[status]?.[ru ? 0 : 1] || status;
}