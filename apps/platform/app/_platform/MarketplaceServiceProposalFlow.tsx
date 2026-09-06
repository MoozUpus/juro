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
  titleEn?: string | null;
  scopeRu: string;
  scopeUz: string;
  scopeEn?: string | null;
  durationDescription: string;
  durationDescriptionEn?: string | null;
  lawyerBaseAmountMinor: number;
  currency: "UZS";
  expiresAt: string | null;
};

const agreementVersion = "2026-08-03";

const proposalCopy = {
  ru: { failed: "Не удалось выполнить действие.", invalidAmount: "Укажите целую стоимость больше нуля.", sent: "Оплачиваемое предложение отправлено владельцу дела.", formTitle: "Предложение с оплатой в JURO", formDescription: "Клиент увидит условия, подтвердит договор отдельно, затем перейдёт к защищённой оплате.", titleRu: "Название — русский", titleUz: "Nomi — o‘zbekcha", titleEn: "Title — English", scopeRu: "Объём работы — русский", scopeUz: "Ish hajmi — o‘zbekcha", scopeEn: "Scope — English", duration: "Срок — русский или узбекский", durationEn: "Duration — English", amount: "Стоимость, сум", send: "Отправить предложение", loading: "Загружаем предложения", region: "Предложения юриста", listTitle: "Предложения юриста с оплатой в JURO", proposed: "Ожидает вашего решения", accepted: "Условия приняты", funded: "Оплачено", durationLabel: "Срок: ", priceLabel: "Стоимость: ", currency: "сум", consent: "Подтверждаю условия услуги и согласен(на) перейти к защищённой оплате после расчёта.", accept: "Принять условия", checkout: "Перейти к оплате", unavailable: "Перевод этого предложения недоступен. Попросите юриста обновить условия перед принятием." },
  uz: { failed: "Amalni bajarib bo‘lmadi.", invalidAmount: "Noldan katta butun narxni kiriting.", sent: "To‘lanadigan taklif ish egasiga yuborildi.", formTitle: "JURO orqali to‘lanadigan taklif", formDescription: "Mijoz shartlarni ko‘radi, shartnomani alohida tasdiqlaydi va so‘ng himoyalangan to‘lovga o‘tadi.", titleRu: "Nomi — ruscha", titleUz: "Nomi — o‘zbekcha", titleEn: "Nomi — inglizcha", scopeRu: "Ish hajmi — ruscha", scopeUz: "Ish hajmi — o‘zbekcha", scopeEn: "Ish hajmi — inglizcha", duration: "Muddat — ruscha yoki o‘zbekcha", durationEn: "Muddat — inglizcha", amount: "Narx, so‘m", send: "Taklif yuborish", loading: "Takliflar yuklanmoqda", region: "Yurist takliflari", listTitle: "JURO orqali to‘lanadigan yurist takliflari", proposed: "Sizning qaroringiz kutilmoqda", accepted: "Shartlar qabul qilindi", funded: "To‘langan", durationLabel: "Muddat: ", priceLabel: "Narx: ", currency: "so‘m", consent: "Xizmat shartlarini tasdiqlayman va hisobdan so‘ng himoyalangan to‘lovga o‘tishga roziman.", accept: "Shartlarni qabul qilish", checkout: "To‘lovga o‘tish", unavailable: "Bu taklifning tarjimasi mavjud emas. Qabul qilishdan oldin yuristdan shartlarni yangilashni so‘rang." },
  en: { failed: "We could not complete this action.", invalidAmount: "Enter a whole-number price greater than zero.", sent: "The paid service proposal has been sent to the matter owner.", formTitle: "Paid service proposal", formDescription: "The client reviews the terms, accepts the agreement separately, then continues to protected payment.", titleRu: "Title — Russian", titleUz: "Title — Uzbek", titleEn: "Title — English", scopeRu: "Scope — Russian", scopeUz: "Scope — Uzbek", scopeEn: "Scope — English", duration: "Duration — Russian or Uzbek", durationEn: "Duration — English", amount: "Price, UZS", send: "Send proposal", loading: "Loading proposals", region: "Lawyer proposals", listTitle: "Lawyer proposals paid through JURO", proposed: "Awaiting your decision", accepted: "Terms accepted", funded: "Paid", durationLabel: "Duration: ", priceLabel: "Price: ", currency: "UZS", consent: "I confirm the service terms and agree to continue to protected payment after reviewing the order.", accept: "Accept terms", checkout: "Continue to payment", unavailable: "This legacy proposal is not available in English. Ask the lawyer to update the terms before accepting it." },
} as const;

function localError(value: unknown, fallback: string) {
  return value instanceof Error ? value.message : fallback;
}

export function LawyerServiceProposalForm({ locale, requestId, caseId, onSubmitted }: { locale: PlatformLocale; requestId: string; caseId: string; onSubmitted?: () => Promise<void> | void }) {
  const copy = proposalCopy[locale];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const lawyerBaseAmountMinor = Number(form.get("lawyerBaseAmountMinor"));
    if (!Number.isSafeInteger(lawyerBaseAmountMinor) || lawyerBaseAmountMinor <= 0) {
      setError(copy.invalidAmount);
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
          titleRu: form.get("titleRu"), titleUz: form.get("titleUz"), titleEn: form.get("titleEn"),
          scopeRu: form.get("scopeRu"), scopeUz: form.get("scopeUz"), scopeEn: form.get("scopeEn"),
          durationDescription: form.get("durationDescription"), durationDescriptionEn: form.get("durationDescriptionEn"), lawyerBaseAmountMinor,
        }),
      });
      const body = await response.json() as { error?: string; code?: string };
      if (!response.ok) throw new Error(body.error || body.code || "PROPOSAL_CREATE_FAILED");
      event.currentTarget.reset();
      setNotice(copy.sent);
      await onSubmitted?.();
    } catch (value) { setError(localError(value, copy.failed)); }
    finally { setBusy(false); }
  }

  return <form className="lawyer-offer-form marketplace-service-proposal" onSubmit={(event) => void submit(event)}>
    <h2>{copy.formTitle}</h2>
    <p>{copy.formDescription}</p>
    {error && <p className="plan-error" role="alert"><CircleAlert />{error}</p>}
    {notice && <p className="lawyer-handoff-success" role="status"><Check />{notice}</p>}
    <label>{copy.titleRu}<input name="titleRu" minLength={3} maxLength={200} required disabled={busy} /></label>
    <label>{copy.titleUz}<input name="titleUz" minLength={3} maxLength={200} required disabled={busy} /></label>
    <label>{copy.titleEn}<input name="titleEn" minLength={3} maxLength={200} required disabled={busy} /></label>
    <label>{copy.scopeRu}<textarea name="scopeRu" minLength={20} maxLength={4000} required disabled={busy} /></label>
    <label>{copy.scopeUz}<textarea name="scopeUz" minLength={20} maxLength={4000} required disabled={busy} /></label>
    <label>{copy.scopeEn}<textarea name="scopeEn" minLength={20} maxLength={4000} required disabled={busy} /></label>
    <label>{copy.duration}<input name="durationDescription" minLength={2} maxLength={500} required disabled={busy} /></label>
    <label>{copy.durationEn}<input name="durationDescriptionEn" minLength={2} maxLength={500} required disabled={busy} /></label>
    <label>{copy.amount}<input name="lawyerBaseAmountMinor" type="number" inputMode="numeric" min="1" step="1" required disabled={busy} /></label>
    <button type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Send />}{copy.send}</button>
  </form>;
}

export function ClientServiceProposals({ locale, accountType, workspaceId, caseId }: { locale: PlatformLocale; accountType: AccountType; workspaceId?: string; caseId: string }) {
  const copy = proposalCopy[locale];
  const router = useRouter();
  const [items, setItems] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [consents, setConsents] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
    const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/proposals${query}`, { cache: "no-store" });
    const body = await response.json() as { proposals?: Proposal[]; error?: string };
    if (!response.ok) throw new Error(body.error || "PROPOSALS_UNAVAILABLE");
    setItems(body.proposals || []);
  }, [caseId, workspaceId]);

  useEffect(() => { void load().catch((value) => setError(localError(value, copy.failed))).finally(() => setLoading(false)); }, [copy.failed, load]);

  async function accept(item: Proposal) {
    if (!consents[item.id]) return;
    setBusyId(item.id); setError("");
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/proposals/${encodeURIComponent(item.id)}/accept`, {
        method: "POST", headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ requestId: crypto.randomUUID(), agreementVersion, accepted: true, locale, ...(workspaceId ? { workspaceId } : {}) }),
      });
      const body = await response.json() as { error?: string; code?: string };
      if (!response.ok) throw new Error(body.error || body.code || "PROPOSAL_ACCEPT_FAILED");
      await load();
    } catch (value) { setError(localError(value, copy.failed)); }
    finally { setBusyId(""); }
  }

  async function checkout(item: Proposal) {
    setBusyId(item.id); setError("");
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/proposals/${encodeURIComponent(item.id)}/checkout`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-juro-csrf": "1",
          "x-juro-locale": locale,
        },
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          ...(workspaceId ? { workspaceId } : {}),
        }),
      });
      const body = await response.json() as { order?: { id?: string }; error?: string; code?: string };
      const orderId = body.order?.id;
      if (!response.ok || !orderId) throw new Error(body.error || body.code || "CHECKOUT_CREATE_FAILED");
      router.push(`${platformBasePath(locale, accountType, workspaceId)}/cases/${encodeURIComponent(caseId)}/proposals/${encodeURIComponent(item.id)}/checkout?orderId=${encodeURIComponent(orderId)}`);
    } catch (value) { setError(localError(value, copy.failed)); }
    finally { setBusyId(""); }
  }

  if (loading) return <LoaderCircle className="spin" aria-label={copy.loading} />;
  if (!items.length) return null;
  return <section className="lawyer-handoff-list marketplace-service-proposals" aria-label={copy.region}>
    <h3>{copy.listTitle}</h3>
    {error && <p className="plan-error" role="alert"><CircleAlert />{error}</p>}
    {items.map((item) => {
      const englishReady = locale !== "en" || Boolean(item.titleEn && item.scopeEn && item.durationDescriptionEn);
      const title = locale === "ru" ? item.titleRu : locale === "uz" ? item.titleUz : item.titleEn || "JURO legal service";
      const scope = locale === "ru" ? item.scopeRu : locale === "uz" ? item.scopeUz : item.scopeEn || copy.unavailable;
      const duration = locale === "en" ? item.durationDescriptionEn || "—" : item.durationDescription;
      return <article key={item.id}>
        <strong>{item.status === "PROPOSED" ? copy.proposed : item.status === "ACCEPTED" ? copy.accepted : item.status === "FUNDED" ? copy.funded : item.status}</strong>
        <h4>{title}</h4><p>{scope}</p>
        <p>{copy.durationLabel}{duration}</p><p>{copy.priceLabel}{new Intl.NumberFormat({ ru: "ru-RU", uz: "uz-UZ", en: "en-GB" }[locale]).format(item.lawyerBaseAmountMinor)} {copy.currency}</p>
        {!englishReady && <p className="plan-error" role="status">{copy.unavailable}</p>}
        {item.status === "PROPOSED" && <div className="lawyer-access-action"><label className="consult-consent"><input type="checkbox" checked={Boolean(consents[item.id])} disabled={!englishReady || busyId === item.id} onChange={(event) => setConsents((current) => ({ ...current, [item.id]: event.target.checked }))} /><span>{copy.consent}</span></label><button type="button" disabled={!englishReady || !consents[item.id] || busyId === item.id} onClick={() => void accept(item)}>{busyId === item.id ? <LoaderCircle className="spin" /> : <Check />}{copy.accept}</button></div>}
        {item.status === "ACCEPTED" && <button type="button" disabled={!englishReady || busyId === item.id} onClick={() => void checkout(item)}>{busyId === item.id ? <LoaderCircle className="spin" /> : <WalletCards />}{copy.checkout}</button>}
      </article>;
    })}
  </section>;
}
