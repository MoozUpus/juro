"use client";

/* eslint-disable react-hooks/set-state-in-effect -- the order is intentionally read from the authenticated API */

import { ArrowLeft, Check, CircleAlert, FileCheck2, LoaderCircle, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { platformBasePath, type AccountType, type PlatformLocale } from "../../lib/platform/routing";

type CheckoutView = {
  order: { id: string; status: string; totalAmountMinor: number; currency: string; expiresAt: string | null };
  items: Array<{ id: string; titleRu: string; titleUz: string; baseAmountMinor: number; taxAmountMinor: number; totalAmountMinor: number }>;
  pricingSnapshot: { id: string; juroBaseAmountMinor: number; juroVatAmountMinor: number; clientTotalMinor: number } | null;
  invoice: { invoiceNumber: string; status: string; dueAt: string | null } | null;
  paymentAttempt: { internalStatus: string; checkoutUrl: string | null } | null;
};

function money(value: number, locale: PlatformLocale) {
  return `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "uz-UZ", { maximumFractionDigits: 0 }).format(value / 100)} сум`;
}

export function CheckoutClient({ locale, accountType, orderId, workspaceId }: { locale: PlatformLocale; accountType: AccountType; orderId: string; workspaceId?: string }) {
  const ru = locale === "ru";
  const router = useRouter();
  const [view, setView] = useState<CheckoutView | null>(null);
  const [renewalMode, setRenewalMode] = useState<"ONE_TIME" | "AUTO_RENEW">("ONE_TIME");
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const workspaceQuery = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
      const response = await fetch(`/api/checkout/${encodeURIComponent(orderId)}${workspaceQuery}`, { cache: "no-store" });
      const body = await response.json() as CheckoutView & { code?: string; error?: string };
      if (!response.ok || !body.order) throw new Error(body.error || body.code || (ru ? "Заказ не найден." : "Buyurtma topilmadi."));
      setView(body);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setLoading(false);
    }
  }, [orderId, ru, workspaceId]);
  useEffect(() => { void load(); }, [load]);

  async function confirm() {
    if (!accepted || !view) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/checkout/${encodeURIComponent(orderId)}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ requestId: crypto.randomUUID(), locale, accountType, renewalMode, paymentMethod: "SANDBOX_CARD", ...(workspaceId ? { workspaceId } : {}) }),
      });
      const body = await response.json() as { error?: string; code?: string };
      if (!response.ok) throw new Error(body.error || body.code || (ru ? "Подтверждение не выполнено." : "Tasdiqlash bajarilmadi."));
      router.push(`${platformBasePath(locale, accountType, workspaceId)}/orders/${encodeURIComponent(orderId)}/payment`);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
      setSubmitting(false);
    }
  }

  if (loading) return <div className="billing-loading" role="status"><LoaderCircle className="spin"/><span>{ru ? "Загружаем расчёт…" : "Hisob-kitob yuklanmoqda…"}</span></div>;
  const basePath = platformBasePath(locale, accountType, workspaceId);
  if (!view) return <section className="checkout-workspace"><Link className="checkout-back" href={`${basePath}/billing`}><ArrowLeft/>{ru ? "К тарифам" : "Tariflarga"}</Link><p className="billing-error" role="alert"><CircleAlert/>{error}</p></section>;
  if (view.order.status === "AWAITING_PAYMENT" || view.order.status === "ACTIVE") {
    router.replace(`${basePath}/orders/${encodeURIComponent(orderId)}/payment`);
    return <div className="billing-loading" role="status"><LoaderCircle className="spin"/><span>{ru ? "Открываем оплату…" : "To‘lov ochilmoqda…"}</span></div>;
  }
  const item = view.items[0];
  const snapshot = view.pricingSnapshot;
  return <section className="checkout-workspace">
    <Link className="checkout-back" href={`${basePath}/billing`}><ArrowLeft aria-hidden="true"/>{ru ? "К тарифам" : "Tariflarga"}</Link>
    <header><div><small>JURO · CHECKOUT</small><h1>{ru ? "Проверьте расчёт" : "Hisob-kitobni tekshiring"}</h1><p>{ru ? "Цена зафиксирована в неизменяемом снимке. Оплата не активирует подписку до подтверждённого события провайдера." : "Narx o‘zgarmas suratda qayd etilgan. Provayder tasdiqlagan hodisagacha obuna faollashmaydi."}</p></div><LockKeyhole aria-hidden="true"/></header>
    {error && <p className="billing-error" role="alert"><CircleAlert/>{error}</p>}
    <div className="checkout-grid">
      <article className="checkout-summary"><div className="checkout-title"><FileCheck2/><div><small>{ru ? "Заказ" : "Buyurtma"}</small><h2>{item ? (ru ? item.titleRu : item.titleUz) : (ru ? "Подписка JURO" : "JURO obunasi")}</h2></div></div><dl><div><dt>{ru ? "Стоимость" : "Narx"}</dt><dd>{money(snapshot?.juroBaseAmountMinor ?? 0, locale)}</dd></div><div><dt>{ru ? "Налог" : "Soliq"}</dt><dd>{money(snapshot?.juroVatAmountMinor ?? 0, locale)}</dd></div><div className="checkout-total"><dt>{ru ? "Итого к оплате" : "Jami to‘lov"}</dt><dd>{money(snapshot?.clientTotalMinor ?? view.order.totalAmountMinor, locale)}</dd></div></dl><p className="checkout-invoice">{ru ? "Счёт" : "Hisob"}: <strong>{view.invoice?.invoiceNumber ?? "—"}</strong></p></article>
      <article className="checkout-confirm"><h2>{ru ? "Порядок продления" : "Uzaytirish tartibi"}</h2><fieldset><legend className="sr-only">{ru ? "Выберите порядок продления" : "Uzaytirish tartibini tanlang"}</legend><label><input type="radio" name="renewal" checked={renewalMode === "ONE_TIME"} onChange={() => setRenewalMode("ONE_TIME")}/><span><strong>{ru ? "Один платёж" : "Bir martalik to‘lov"}</strong><small>{ru ? "Без автоматического продления" : "Avtomatik uzaytirishsiz"}</small></span></label><label><input type="radio" name="renewal" checked={renewalMode === "AUTO_RENEW"} onChange={() => setRenewalMode("AUTO_RENEW")}/><span><strong>{ru ? "Автопродление" : "Avtomatik uzaytirish"}</strong><small>{ru ? "Требует отдельного согласия и может быть отключено" : "Alohida rozilik talab qiladi va o‘chirilishi mumkin"}</small></span></label></fieldset><label className="checkout-consent"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)}/><span>{ru ? "Я проверил сумму и подтверждаю выбранный порядок продления." : "Summani tekshirdim va tanlangan uzaytirish tartibini tasdiqlayman."}</span></label><button type="button" disabled={!accepted || submitting} onClick={() => void confirm()}>{submitting ? <LoaderCircle className="spin"/> : <Check/>}{ru ? "Подтвердить и перейти к оплате" : "Tasdiqlash va to‘lovga o‘tish"}</button><p className="checkout-note">{ru ? "Staging использует тестовый провайдер: реальные деньги не списываются." : "Staging sinov provayderidan foydalanadi: haqiqiy pul yechilmaydi."}</p></article>
    </div>
  </section>;
}
