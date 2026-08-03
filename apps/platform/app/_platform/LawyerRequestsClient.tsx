"use client";

/* eslint-disable react-hooks/set-state-in-effect -- authenticated assigned requests are loaded after the first browser render */

import { LoaderCircle, ShieldCheck, ShieldX, UserRoundCheck } from "lucide-react";
import { LawyerRequestMessages } from "./LawyerRequestMessages";
import { LawyerServiceProposalForm } from "./MarketplaceServiceProposalFlow";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { PlatformLocale } from "../../lib/platform/routing";

type AssignedRequest = {
  id: string;
  status: string;
  anonymizedSummary: string;
  createdAt: string;
  conflictStatus?: string | null;
  accessGrantId?: string | null;
  accessGrantedAt?: string | null;
  caseId?: string | null;
  caseTitle?: string | null;
  caseDescription?: string | null;
  legalArea?: string | null;
  caseStatus?: string | null;
  offerId?: string | null;
  offerStatus?: string | null;
  offerScopeDescription?: string | null;
  offerPriceDescription?: string | null;
  offerDurationDescription?: string | null;
};

export function LawyerRequestsClient({ locale }: { locale: PlatformLocale }) {
  const ru = locale === "ru";
  const [requests, setRequests] = useState<AssignedRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [offerDrafts, setOfferDrafts] = useState<Record<string, { scopeDescription: string; priceDescription: string; durationDescription: string }>>({});

  const load = useCallback(async () => {
    const response = await fetch("/api/platform/lawyer-requests/assigned", { cache: "no-store" });
    const body = await response.json() as { requests?: AssignedRequest[]; error?: string };
    if (!response.ok) throw new Error(body.error || "Ошибка");
    setRequests(body.requests || []);
  }, []);

  useEffect(() => {
    void load().catch((value) => setError(value instanceof Error ? value.message : String(value))).finally(() => setLoading(false));
  }, [load]);

  async function decide(item: AssignedRequest, decision: "clear" | "conflict") {
    setActionId(item.id); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/platform/lawyer-requests/${encodeURIComponent(item.id)}/conflict-check`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ decision, locale }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Ошибка");
      setMessage(decision === "clear"
        ? (ru ? "Проверка завершена: теперь владелец дела сам решает, предоставлять ли доступ." : "Tekshiruv tugallandi: endi ish egasi ruxsat berishni mustaqil hal qiladi.")
        : (ru ? "Конфликт отмечен. Материалы дела не будут раскрыты." : "Manfaatlar to‘qnashuvi belgilandi. Ish materiallari oshkor qilinmaydi."));
      await load();
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    finally { setActionId(""); }
  }

  async function complete(item: AssignedRequest) { setActionId(item.id); setError(""); try { const response=await fetch(`/api/platform/lawyer-requests/${encodeURIComponent(item.id)}/completion`, { method:"POST", headers:{"x-juro-csrf":"1"} }); const body=await response.json() as {error?:string}; if(!response.ok) throw new Error(body.error||"Ошибка"); setMessage(ru?"Работа отмечена завершённой.":"Ish yakunlandi deb belgilandi."); await load(); } catch(value) { setError(value instanceof Error ? value.message : String(value)); } finally { setActionId(""); } }

  async function submitOffer(event: FormEvent<HTMLFormElement>, item: AssignedRequest) {
    event.preventDefault();
    const draft = offerDrafts[item.id];
    if (!draft) return;
    setActionId(item.id); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/platform/lawyer-requests/${encodeURIComponent(item.id)}/offer`, {
        method: "POST", headers: { "content-type": "application/json", "x-juro-csrf": "1" }, body: JSON.stringify({ ...draft, locale }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Ошибка");
      setMessage(ru ? "Предложение сохранено и ожидает решения владельца дела." : "Taklif saqlandi va ish egasining qarorini kutmoqda.");
      await load();
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    finally { setActionId(""); }
  }

  return <section className="lawyer-requests" aria-labelledby="lawyer-requests-heading">
    <header><UserRoundCheck aria-hidden="true" /><div><small>JURO</small><h1 id="lawyer-requests-heading">{ru ? "Заявки по вашим делам" : "Sizga yuborilgan so‘rovlar"}</h1><p>{ru ? "До вашего положительного conflict check видна только анонимизированная информация. Полные материалы открываются лишь после отдельного согласия владельца дела." : "Sizning ijobiy manfaatlar to‘qnashuvi tekshiruvingizgacha faqat anonimlashtirilgan ma’lumot ko‘rinadi. To‘liq materiallar faqat ish egasining alohida roziligidan keyin ochiladi."}</p></div></header>
    {error && <p className="plan-error" role="alert">{error}</p>}
    {message && <p className="lawyer-handoff-success" role="status"><ShieldCheck aria-hidden="true" />{message}</p>}
    {loading ? <LoaderCircle className="spin" /> : requests.length ? <div className="lawyer-request-list">{requests.map((item) => <article key={item.id}>
      <div className="lawyer-request-summary"><strong>{lawyerRequestStatus(item.status, ru)}</strong><time dateTime={item.createdAt}>{new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", { dateStyle: "medium", timeZone: "Asia/Tashkent" }).format(new Date(item.createdAt))}</time><p>{item.anonymizedSummary}</p></div>
      {item.status === "conflict_check_pending" && <div className="lawyer-conflict-actions"><button type="button" disabled={actionId === item.id} onClick={() => void decide(item, "clear")}>{actionId === item.id ? <LoaderCircle className="spin" /> : <ShieldCheck aria-hidden="true" />}{ru ? "Конфликта нет" : "To‘qnashuv yo‘q"}</button><button type="button" className="secondary" disabled={actionId === item.id} onClick={() => void decide(item, "conflict")}>{actionId === item.id ? <LoaderCircle className="spin" /> : <ShieldX aria-hidden="true" />}{ru ? "Есть конфликт" : "To‘qnashuv bor"}</button></div>}
      {item.accessGrantId ? <><div className="lawyer-case-access"><strong>{ru ? "Доступ к делу предоставлен" : "Ishga ruxsat berildi"}</strong><p>{item.caseTitle || (ru ? "Дело" : "Ish")}{item.legalArea ? ` · ${item.legalArea}` : ""}</p>{item.caseDescription && <p>{item.caseDescription}</p>}</div>{item.caseId && <LawyerServiceProposalForm locale={locale} requestId={item.id} caseId={item.caseId} onSubmitted={load} />}{item.offerId && <div className="lawyer-offer-card"><strong>{offerStatus(item.offerStatus, ru)}</strong><p>{item.offerScopeDescription}</p><p>{ru ? "Стоимость: " : "Narx: "}{item.offerPriceDescription}</p><p>{ru ? "Срок: " : "Muddat: "}{item.offerDurationDescription}</p></div>}{(!item.offerId || item.offerStatus === "declined") && <form className="lawyer-offer-form" onSubmit={(event) => void submitOffer(event, item)}><h2>{ru ? "Внешнее предложение без оплаты в JURO" : "JURO orqali to‘lovsiz tashqi taklif"}</h2><label>{ru ? "Объём работы" : "Ish hajmi"}<textarea required minLength={20} maxLength={2000} value={offerDrafts[item.id]?.scopeDescription || ""} onChange={(event) => setOfferDrafts((current) => ({ ...current, [item.id]: { scopeDescription: event.target.value, priceDescription: current[item.id]?.priceDescription || "", durationDescription: current[item.id]?.durationDescription || "" } }))} /></label><label>{ru ? "Стоимость" : "Narx"}<input required minLength={2} maxLength={500} value={offerDrafts[item.id]?.priceDescription || ""} onChange={(event) => setOfferDrafts((current) => ({ ...current, [item.id]: { scopeDescription: current[item.id]?.scopeDescription || "", priceDescription: event.target.value, durationDescription: current[item.id]?.durationDescription || "" } }))} /></label><label>{ru ? "Срок" : "Muddat"}<input required minLength={2} maxLength={500} value={offerDrafts[item.id]?.durationDescription || ""} onChange={(event) => setOfferDrafts((current) => ({ ...current, [item.id]: { scopeDescription: current[item.id]?.scopeDescription || "", priceDescription: current[item.id]?.priceDescription || "", durationDescription: event.target.value } }))} /></label><button type="submit" disabled={actionId === item.id}>{actionId === item.id ? <LoaderCircle className="spin" /> : null}{ru ? "Отправить внешние условия" : "Tashqi shartlarni yuborish"}</button></form>}</> : <p className="lawyer-request-privacy">{ru ? "Материалы дела недоступны, пока владелец не предоставит доступ." : "Ish egasi ruxsat bermaguncha ish materiallari mavjud emas."}</p>}
    {item.offerStatus === "accepted" && item.status === "offer_accepted" && <button type="button" onClick={() => void complete(item)} disabled={actionId === item.id}>{ru ? "Отметить работу завершённой" : "Ishni yakunlangan deb belgilash"}</button>}{item.accessGrantId && <LawyerRequestMessages requestId={item.id} locale={locale} />}</article>)}</div> : <div className="consult-empty"><UserRoundCheck aria-hidden="true" /><h2>{ru ? "Назначенных заявок пока нет" : "Hozircha tayinlangan so‘rovlar yo‘q"}</h2><p>{ru ? "JURO не создаёт демонстрационные заявки. Новая запись появится только после реального назначения." : "JURO namoyish so‘rovlarini yaratmaydi. Yangi yozuv faqat haqiqiy tayinlashdan keyin paydo bo‘ladi."}</p></div>}
  </section>;
}

function offerStatus(status: string | null | undefined, ru: boolean) { const labels: Record<string, [string, string]> = { proposed: ["Предложение ожидает решения", "Taklif qarorni kutmoqda"], accepted: ["Условия приняты", "Shartlar qabul qilindi"], declined: ["Условия отклонены", "Shartlar rad etildi"] }; return labels[status || ""]?.[ru ? 0 : 1] || status || ""; }

function lawyerRequestStatus(status: string, ru: boolean) {
  const labels: Record<string, [string, string]> = { conflict_check_pending: ["Требуется проверка конфликта", "Manfaatlar to‘qnashuvini tekshirish kerak"], awaiting_user_consent: ["Ожидается решение владельца", "Ish egasining qarori kutilmoqda"], access_granted: ["Доступ к делу предоставлен", "Ishga ruxsat berildi"], access_revoked: ["Доступ отозван", "Ruxsat bekor qilindi"], conflict_declined: ["Конфликт интересов", "Manfaatlar to‘qnashuvi"] };
  return labels[status]?.[ru ? 0 : 1] || status;
}
