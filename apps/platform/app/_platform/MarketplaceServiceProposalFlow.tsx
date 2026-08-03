"use client";

/* eslint-disable react-hooks/set-state-in-effect -- private proposal data is loaded after first browser render */

import { Check, CircleAlert, LoaderCircle, Send, WalletCards } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { platformBasePath, type AccountType, type PlatformLocale } from "../../lib/platform/routing";

type Proposal = {
  id: string;
  version: number;
  status: "PROPOSED" | "ACCEPTED" | "FUNDED" | "SUPERSEDED" | "DECLINED" | string;
  titleRu: string;
  titleUz: string;
  scopeRu: string;
  scopeUz: string;
  durationDescription: string;
  lawyerBaseAmountMinor: number;
  currency: "UZS";
  expiresAt: string | null;
};

const agreementVersion = "2026-08-03";

function localError(value: unknown, ru: boolean) {
  return value instanceof Error ? value.message : (ru ? "Не удалось выполнить действие." : "Amalni bajarib bo‘lmadi.");
}

export function LawyerServiceProposalForm({ locale, requestId, caseId, onSubmitted }: { locale: PlatformLocale; requestId: string; caseId: string; onSubmitted?: () => Promise<void> | void }) {
  const ru = locale === "ru";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const lawyerBaseAmountMinor = Number(form.get("lawyerBaseAmountMinor"));
    if (!Number.isSafeInteger(lawyerBaseAmountMinor) || lawyerBaseAmountMinor <= 0) {
      setError(ru ? "Укажите целую стоимость больше нуля." : "Noldan katta butun narxni kiriting.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/proposals`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          requestIdForLawyer: requestId,
          titleRu: form.get("titleRu"), titleUz: form.get("titleUz"),
          scopeRu: form.get("scopeRu"), scopeUz: form.get("scopeUz"),
          durationDescription: form.get("durationDescription"), lawyerBaseAmountMinor,
        }),
      });
      const body = await response.json() as { error?: string; code?: string };
      if (!response.ok) throw new Error(body.error || body.code || "PROPOSAL_CREATE_FAILED");
      event.currentTarget.reset();
      setNotice(ru ? "Оплачиваемое предложение отправлено владельцу дела." : "To‘lanadigan taklif ish egasiga yuborildi.");
      await onSubmitted?.();
    } catch (value) { setError(localError(value, ru)); }
    finally { setBusy(false); }
  }

  return <form className="lawyer-offer-form marketplace-service-proposal" onSubmit={(event) => void submit(event)}>
    <h2>{ru ? "Предложение с оплатой в JURO" : "JURO orqali to‘lanadigan taklif"}</h2>
    <p>{ru ? "Клиент увидит условия, подтвердит договор отдельно, затем перейдёт к защищённой оплате." : "Mijoz shartlarni ko‘radi, shartnomani alohida tasdiqlaydi va so‘ng himoyalangan to‘lovga o‘tadi."}</p>
    {error && <p className="plan-error" role="alert"><CircleAlert />{error}</p>}
    {notice && <p className="lawyer-handoff-success" role="status"><Check />{notice}</p>}
    <label>{ru ? "Название — русский" : "Nomi — ruscha"}<input name="titleRu" minLength={3} maxLength={200} required disabled={busy} /></label>
    <label>{ru ? "Nomi — o‘zbekcha" : "Nomi — o‘zbekcha"}<input name="titleUz" minLength={3} maxLength={200} required disabled={busy} /></label>
    <label>{ru ? "Объём работы — русский" : "Ish hajmi — ruscha"}<textarea name="scopeRu" minLength={20} maxLength={4000} required disabled={busy} /></label>
    <label>{ru ? "Ish hajmi — o‘zbekcha" : "Ish hajmi — o‘zbekcha"}<textarea name="scopeUz" minLength={20} maxLength={4000} required disabled={busy} /></label>
    <label>{ru ? "Срок" : "Muddat"}<input name="durationDescription" minLength={2} maxLength={500} required disabled={busy} /></label>
    <label>{ru ? "Стоимость, сум" : "Narx, so‘m"}<input name="lawyerBaseAmountMinor" type="number" inputMode="numeric" min="1" step="1" required disabled={busy} /></label>
    <button type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Send />}{ru ? "Отправить предложение" : "Taklif yuborish"}</button>
  </form>;
}

export function ClientServiceProposals({ locale, accountType, workspaceId, caseId }: { locale: PlatformLocale; accountType: AccountType; workspaceId?: string; caseId: string }) {
  const ru = locale === "ru";
  const router = useRouter();
  const [items, setItems] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [consents, setConsents] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/proposals`, { cache: "no-store" });
    const body = await response.json() as { proposals?: Proposal[]; error?: string };
    if (!response.ok) throw new Error(body.error || "PROPOSALS_UNAVAILABLE");
    setItems(body.proposals || []);
  }, [caseId]);

  useEffect(() => { void load().catch((value) => setError(localError(value, ru))).finally(() => setLoading(false)); }, [load, ru]);

  async function accept(item: Proposal) {
    if (!consents[item.id]) return;
    setBusyId(item.id); setError("");
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/proposals/${encodeURIComponent(item.id)}/accept`, {
        method: "POST", headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ requestId: crypto.randomUUID(), agreementVersion, accepted: true, locale }),
      });
      const body = await response.json() as { error?: string; code?: string };
      if (!response.ok) throw new Error(body.error || body.code || "PROPOSAL_ACCEPT_FAILED");
      await load();
    } catch (value) { setError(localError(value, ru)); }
    finally { setBusyId(""); }
  }

  async function checkout(item: Proposal) {
    setBusyId(item.id); setError("");
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/proposals/${encodeURIComponent(item.id)}/checkout`, {
        method: "POST", headers: { "content-type": "application/json", "x-juro-csrf": "1" }, body: JSON.stringify({ requestId: crypto.randomUUID() }),
      });
      const body = await response.json() as { order?: { id?: string }; error?: string; code?: string };
      const orderId = body.order?.id;
      if (!response.ok || !orderId) throw new Error(body.error || body.code || "CHECKOUT_CREATE_FAILED");
      router.push(`${platformBasePath(locale, accountType, workspaceId)}/cases/${encodeURIComponent(caseId)}/proposals/${encodeURIComponent(item.id)}/checkout?orderId=${encodeURIComponent(orderId)}`);
    } catch (value) { setError(localError(value, ru)); }
    finally { setBusyId(""); }
  }

  if (loading) return <LoaderCircle className="spin" aria-label={ru ? "Загружаем предложения" : "Takliflar yuklanmoqda"} />;
  if (!items.length) return null;
  return <section className="lawyer-handoff-list marketplace-service-proposals" aria-label={ru ? "Предложения юриста" : "Yurist takliflari"}>
    <h3>{ru ? "Предложения юриста с оплатой в JURO" : "JURO orqali to‘lanadigan yurist takliflari"}</h3>
    {error && <p className="plan-error" role="alert"><CircleAlert />{error}</p>}
    {items.map((item) => <article key={item.id}>
      <strong>{item.status === "PROPOSED" ? (ru ? "Ожидает вашего решения" : "Sizning qaroringiz kutilmoqda") : item.status === "ACCEPTED" ? (ru ? "Условия приняты" : "Shartlar qabul qilindi") : item.status === "FUNDED" ? (ru ? "Оплачено" : "To‘langan") : item.status}</strong>
      <h4>{ru ? item.titleRu : item.titleUz}</h4><p>{ru ? item.scopeRu : item.scopeUz}</p>
      <p>{ru ? "Срок: " : "Muddat: "}{item.durationDescription}</p><p>{ru ? "Стоимость: " : "Narx: "}{new Intl.NumberFormat(ru ? "ru-RU" : "uz-UZ").format(item.lawyerBaseAmountMinor)} {ru ? "сум" : "so‘m"}</p>
      {item.status === "PROPOSED" && <div className="lawyer-access-action"><label className="consult-consent"><input type="checkbox" checked={Boolean(consents[item.id])} disabled={busyId === item.id} onChange={(event) => setConsents((current) => ({ ...current, [item.id]: event.target.checked }))} /><span>{ru ? "Подтверждаю условия услуги и согласен(на) перейти к защищённой оплате после расчёта." : "Xizmat shartlarini tasdiqlayman va hisobdan so‘ng himoyalangan to‘lovga o‘tishga roziman."}</span></label><button type="button" disabled={!consents[item.id] || busyId === item.id} onClick={() => void accept(item)}>{busyId === item.id ? <LoaderCircle className="spin" /> : <Check />}{ru ? "Принять условия" : "Shartlarni qabul qilish"}</button></div>}
      {item.status === "ACCEPTED" && <button type="button" disabled={busyId === item.id} onClick={() => void checkout(item)}>{busyId === item.id ? <LoaderCircle className="spin" /> : <WalletCards />}{ru ? "Перейти к оплате" : "To‘lovga o‘tish"}</button>}
    </article>)}
  </section>;
}
