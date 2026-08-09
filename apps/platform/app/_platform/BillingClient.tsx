"use client";

/* eslint-disable react-hooks/set-state-in-effect -- authenticated billing data is hydrated after the first browser render */

import { Check, CircleAlert, CreditCard, LoaderCircle, ReceiptText, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { platformBasePath, type AccountType, type PlatformLocale } from "../../lib/platform/routing";

type Plan = {
  planVersionId: string;
  code: string;
  nameRu: string;
  nameUz: string;
  billingPeriod: "monthly" | "annual" | "one_time";
  priceMinor: number;
  currency: "UZS";
  entitlementsJson: string;
};

type BillingData = {
  provider: { enabled: boolean; sandboxEnabled: boolean; productionApproved: boolean; reason: string };
  demo: { enabled: boolean; provider: "demo"; isSimulation: true; entitlementsActivated: false };
  subscription: { planCode: string; status: string; currentPeriodEndsAt: string | null } | null;
  payments: Array<{ id: string; amountMinor: number; currency: string; status: string; createdAt: string }>;
};

function money(amountMinor: number, locale: PlatformLocale) {
  return `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "uz-UZ", { maximumFractionDigits: 0 }).format(amountMinor / 100)} сум`;
}

function paymentStatusLabel(status: string, ru: boolean, simulation: boolean) {
  if (!simulation) return status;

  const labels: Record<string, [string, string]> = {
    settled: ["Демо: оплачено", "Demo: to‘landi"],
    paid: ["Демо: оплачено", "Demo: to‘landi"],
    failed: ["Демо: отклонено", "Demo: rad etildi"],
    cancelled: ["Демо: отменено", "Demo: bekor qilindi"],
    refunded: ["Демо: возвращено", "Demo: qaytarildi"],
    pending: ["Демо: ожидает", "Demo: kutilmoqda"],
  };

  return (labels[status.toLowerCase()] ?? ["Демо: статус обновляется", "Demo: holat yangilanmoqda"])[ru ? 0 : 1];
}

function planBenefits(plan: Plan, ru: boolean): string[] {
  try {
    const parsed = JSON.parse(plan.entitlementsJson) as { entitlements?: Array<{ code?: string; limitValue?: number | null }> };
    const values = (parsed.entitlements ?? []).slice(0, 4).map((item) => {
      const code = String(item.code ?? "").replaceAll(/[._-]/g, " ");
      return item.limitValue == null ? code : `${code}: ${item.limitValue}`;
    }).filter(Boolean);
    if (values.length) return values;
  } catch { /* invalid plan config is blocked by checkout; the list remains readable */ }
  return [ru ? "Точные условия зафиксируются перед оплатой" : "Aniq shartlar to‘lovdan oldin qayd etiladi"];
}

export function BillingClient({ locale, accountType, workspaceId }: { locale: PlatformLocale; accountType: AccountType; workspaceId?: string }) {
  const ru = locale === "ru";
  const router = useRouter();
  const [data, setData] = useState<BillingData | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingPlan, setPendingPlan] = useState("");
  const formatter = useMemo(() => new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", { dateStyle: "medium" }), [ru]);

  const load = useCallback(async () => {
    setError("");
    try {
      const [billingResponse, plansResponse] = await Promise.all([
        fetch("/api/platform/billing", { cache: "no-store" }),
        fetch("/api/subscriptions/plans", { cache: "no-store" }),
      ]);
      const billingBody = await billingResponse.json() as BillingData & { error?: string };
      const plansBody = await plansResponse.json() as { plans?: Plan[]; error?: string };
      if (!billingResponse.ok) throw new Error(billingBody.error || (ru ? "Тарифы не загрузились." : "Tariflar yuklanmadi."));
      if (!plansResponse.ok) throw new Error(plansBody.error || (ru ? "Утверждённые цены недоступны." : "Tasdiqlangan narxlar mavjud emas."));
      setData(billingBody);
      setPlans(plansBody.plans ?? []);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setLoading(false);
    }
  }, [ru]);

  useEffect(() => { void load(); }, [load]);

  async function choose(planVersionId: string) {
    setPendingPlan(planVersionId);
    setError("");
    try {
      const response = await fetch("/api/checkout/create", {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ requestId: crypto.randomUUID(), planVersionId, locale, ...(workspaceId ? { workspaceId } : {}) }),
      });
      const body = await response.json() as { order?: { id?: unknown }; error?: string; code?: string };
      if (!response.ok || typeof body.order?.id !== "string") throw new Error(body.error || body.code || (ru ? "Не удалось создать заказ." : "Buyurtma yaratilmadi."));
      router.push(`${platformBasePath(locale, accountType, workspaceId)}/checkout/${encodeURIComponent(body.order.id)}`);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
      setPendingPlan("");
    }
  }

  if (loading) return <div className="billing-loading" role="status"><LoaderCircle className="spin" /><span className="sr-only">{ru ? "Загрузка тарифов" : "Tariflar yuklanmoqda"}</span></div>;
  return <section className="billing-workspace">
    <header><CreditCard aria-hidden="true"/><div><small>JURO · BILLING</small><h1>{ru ? "Тариф и оплата" : "Tarif va to‘lov"}</h1><p>{ru ? "Выберите утверждённый тариф. Полная сумма, налог и режим продления фиксируются в заказе до оплаты." : "Tasdiqlangan tarifni tanlang. To‘liq summa, soliq va uzaytirish tartibi to‘lovdan oldin buyurtmada qayd etiladi."}</p></div></header>
    {error && <p className="billing-error" role="alert"><CircleAlert aria-hidden="true"/>{error}<button type="button" onClick={() => void load()}>{ru ? "Повторить" : "Qayta urinish"}</button></p>}
    {data && <>
      <div className={`billing-provider ${data.provider.enabled ? "ready" : ""}`}><ShieldCheck aria-hidden="true"/><div><strong>{data.provider.enabled ? (ru ? "Безопасное оформление включено" : "Xavfsiz rasmiylashtirish yoqilgan") : (ru ? "Оформление временно недоступно" : "Rasmiylashtirish vaqtincha mavjud emas")}</strong><p>{data.provider.sandboxEnabled ? (ru ? "Staging: тестовая оплата, реальные деньги не списываются." : "Staging: sinov to‘lovi, haqiqiy pul yechilmaydi.") : (ru ? "Платёж активируется только после проверки провайдера." : "To‘lov faqat provayder tekshirilgandan keyin faollashadi.")}</p></div></div>
      {data.demo.enabled && <div className="billing-demo-entry"><div><small>PROVIDER=DEMO · SIMULATION</small><strong>{ru ? "Посмотреть подключённую демонстрацию оплаты" : "Ulangan to‘lov namoyishini ko‘rish"}</strong><p>{ru ? "Без карт, списания, Uzum API и изменения тарифа." : "Karta, pul yechish, Uzum API va tarif o‘zgarishisiz."}</p></div><Link href={`${platformBasePath(locale, accountType, workspaceId)}/demo-payments`}>{ru ? "Открыть демо" : "Demoni ochish"}</Link></div>}
      {plans.length ? <div className="billing-plans">{plans.map(plan => <article key={plan.planVersionId} className={data.subscription?.planCode === plan.code ? "current" : ""}><small>{data.subscription?.planCode === plan.code ? (ru ? "Текущий план" : "Joriy reja") : "JURO"}</small><h2>{ru ? plan.nameRu : plan.nameUz}</h2><div className="billing-price">{money(plan.priceMinor, locale)}</div><p className="billing-period">{plan.billingPeriod === "monthly" ? (ru ? "за месяц, без налога" : "oyiga, soliqsiz") : plan.billingPeriod === "annual" ? (ru ? "за год, без налога" : "yiliga, soliqsiz") : (ru ? "разовый платёж, без налога" : "bir martalik, soliqsiz")}</p><ul>{planBenefits(plan, ru).map(feature => <li key={feature}><Check aria-hidden="true"/>{feature}</li>)}</ul><button type="button" disabled={!data.provider.enabled || Boolean(pendingPlan)} onClick={() => void choose(plan.planVersionId)}>{pendingPlan === plan.planVersionId ? <LoaderCircle className="spin" aria-hidden="true"/> : <CreditCard aria-hidden="true"/>}{ru ? "Перейти к расчёту" : "Hisob-kitobga o‘tish"}</button></article>)}</div> : <div className="billing-empty" role="status"><ReceiptText aria-hidden="true"/><div><h2>{ru ? "Нет утверждённых цен" : "Tasdiqlangan narxlar yo‘q"}</h2><p>{ru ? "JURO не создаёт заказ по черновой или неподтверждённой цене." : "JURO qoralama yoki tasdiqlanmagan narx bo‘yicha buyurtma yaratmaydi."}</p></div></div>}
      <section className="billing-history"><h2><ReceiptText aria-hidden="true"/>{data.provider.sandboxEnabled ? (ru ? "История демо-платежей" : "Demo to‘lovlar tarixi") : (ru ? "История платежей" : "To‘lovlar tarixi")}</h2>{data.payments.length ? data.payments.map(payment => <div key={payment.id}><strong>{money(payment.amountMinor, locale)}</strong><span>{paymentStatusLabel(payment.status, ru, data.provider.sandboxEnabled)}</span><time dateTime={payment.createdAt}>{formatter.format(new Date(payment.createdAt))}</time></div>) : <p>{ru ? "Подтверждённых платежей пока нет." : "Hozircha tasdiqlangan to‘lovlar yo‘q."}</p>}</section>
    </>}
  </section>;
}
