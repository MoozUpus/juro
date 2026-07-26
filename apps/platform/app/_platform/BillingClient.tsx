"use client";

/* eslint-disable react-hooks/set-state-in-effect -- authenticated billing data is hydrated after the first browser render */

import { Check, CircleAlert, CreditCard, LoaderCircle, ReceiptText, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { PlatformLocale } from "../../lib/platform/routing";

type BillingData = {
  provider: { configured: boolean; provider: string | null };
  config: {
    freeStart: { label: { ru: string; uz: string }; details: { ru: string; uz: string } };
    plans: Array<{ code: string; name: { ru: string; uz: string }; priceLabel: string; features: { ru: string[]; uz: string[] } }>;
  };
  subscription: { planCode: string; status: string; currentPeriodEndsAt: string | null } | null;
  payments: Array<{ id: string; amountMinor: number; currency: string; status: string; createdAt: string }>;
};

export function BillingClient({ locale }: { locale: PlatformLocale }) {
  const ru = locale === "ru";
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingPlan, setPendingPlan] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/platform/billing", { cache: "no-store" });
      const body = await response.json() as BillingData & { error?: string };
      if (!response.ok) throw new Error(body.error || (ru ? "Тарифы не загрузились." : "Tariflar yuklanmadi."));
      setData(body);
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    finally { setLoading(false); }
  }, [ru]);
  useEffect(() => { void load(); }, [load]);

  async function choose(planCode: string) {
    setPendingPlan(planCode);
    setError("");
    const response = await fetch("/api/platform/billing", {
      method: "POST",
      headers: { "content-type": "application/json", "x-juro-csrf": "1" },
      body: JSON.stringify({ planCode }),
    });
    const body = await response.json() as { error?: string };
    if (!response.ok) setError(body.error || (ru ? "Оплата не началась." : "To‘lov boshlanmadi."));
    setPendingPlan("");
  }

  if (loading) return <div className="billing-loading"><LoaderCircle className="spin" /></div>;
  return <section className="billing-workspace"><header><CreditCard /><div><small>JURO · BILLING</small><h1>{ru ? "Тариф и оплата" : "Tarif va to‘lov"}</h1><p>{ru ? "Условия хранятся в одной конфигурации. Платёж не считается успешным без ответа реального провайдера." : "Shartlar yagona konfiguratsiyada saqlanadi. Haqiqiy provayder javobisiz to‘lov muvaffaqiyatli hisoblanmaydi."}</p></div></header>{error && <p className="billing-error" role="alert"><CircleAlert />{error}</p>}{data && <><div className={`billing-provider ${data.provider.configured ? "ready" : ""}`}><ShieldCheck /><div><strong>{data.provider.configured ? (ru ? "Платёжный провайдер подключён" : "To‘lov provayderi ulangan") : (ru ? "Checkout пока недоступен" : "Checkout hozircha mavjud emas")}</strong><p>{data.provider.configured ? data.provider.provider : (ru ? "Для production-оплаты нужны PAYMENT_PROVIDER, PAYMENT_API_KEY и PAYMENT_WEBHOOK_SECRET." : "Production to‘lovi uchun PAYMENT_PROVIDER, PAYMENT_API_KEY va PAYMENT_WEBHOOK_SECRET kerak.")}</p></div></div><div className="billing-free"><strong>{data.config.freeStart.label[locale]}</strong><p>{data.config.freeStart.details[locale]}</p></div><div className="billing-plans">{data.config.plans.map(plan => <article key={plan.code} className={data.subscription?.planCode === plan.code ? "current" : ""}><small>{data.subscription?.planCode === plan.code ? (ru ? "Текущий план" : "Joriy reja") : "JURO"}</small><h2>{plan.name[locale]}</h2><div className="billing-price">{plan.priceLabel}</div><ul>{plan.features[locale].map(feature => <li key={feature}><Check />{feature}</li>)}</ul><button disabled={!data.provider.configured || Boolean(pendingPlan)} onClick={() => void choose(plan.code)}>{pendingPlan === plan.code ? <LoaderCircle className="spin" /> : <CreditCard />}{ru ? "Выбрать тариф" : "Tarifni tanlash"}</button></article>)}</div><section className="billing-history"><h2><ReceiptText />{ru ? "История платежей" : "To‘lovlar tarixi"}</h2>{data.payments.length ? data.payments.map(payment => <div key={payment.id}><strong>{new Intl.NumberFormat(ru ? "ru-RU" : "uz-UZ").format(payment.amountMinor / 100)} {payment.currency}</strong><span>{payment.status}</span><time>{new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ",{dateStyle:"medium"}).format(new Date(payment.createdAt))}</time></div>) : <p>{ru ? "Подтверждённых платежей пока нет." : "Hozircha tasdiqlangan to‘lovlar yo‘q."}</p>}</section></>}</section>;
}
