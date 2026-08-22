"use client";

/* eslint-disable react-hooks/set-state-in-effect -- authenticated billing data is hydrated after the first browser render */

import { Check, CircleAlert, CreditCard, Download, LoaderCircle, ReceiptText, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { platformBasePath, type AccountType, type PlatformLocale } from "../../lib/platform/routing";
import type { DemoPaymentRun } from "../../lib/billing/demo-payments";

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
  demoRuns: DemoPaymentRun[];
  trial: { endsAt: string; effectiveStatus: string; daysRemaining: number } | null;
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

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
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
  const [reportStatus, setReportStatus] = useState("all");
  const formatter = useMemo(() => new Intl.DateTimeFormat(ru ? "ru-RU" : "uz-UZ", { dateStyle: "medium" }), [ru]);

  const load = useCallback(async () => {
    setError("");
    try {
      const [billingResponse, plansResponse] = await Promise.all([
        fetch("/api/platform/billing", { cache: "no-store" }),
        fetch("/api/subscriptions/plans", { cache: "no-store" }),
      ]);
      const billingBody = await billingResponse.json() as BillingData & { error?: string };
      const plansBody = await plansResponse.json() as {
        plans?: Plan[];
        error?: string;
        code?: string;
      };
      if (!billingResponse.ok) throw new Error(billingBody.error || (ru ? "Тарифы не загрузились." : "Tariflar yuklanmadi."));
      // A production checkout is deliberately closed until the owner approves a
      // real provider and price catalogue.  That is an expected safe state, not
      // a loading failure: keep the billing workspace visible so the explicitly
      // isolated demo flow remains reachable.
      if (!plansResponse.ok && plansBody.code !== "BILLING_UNAVAILABLE") {
        throw new Error(plansBody.error || (ru ? "Утверждённые цены недоступны." : "Tasdiqlangan narxlar mavjud emas."));
      }
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

  const visiblePayments = data?.payments.filter((payment) => reportStatus === "all" || payment.status === reportStatus) ?? [];
  const visibleDemoRuns = data?.demoRuns.filter((run) => reportStatus === "all" || run.status === reportStatus) ?? [];
  const reportStatuses = [...new Set([...(data?.payments ?? []).map((payment) => payment.status), ...(data?.demoRuns ?? []).map((run) => run.status)])].sort();

  function exportReport() {
    if (!data) return;
    const header = ["record_type", "id", "status", "created_at", "amount_minor", "currency", "service_kind", "payment_method", "consultation_fee_minor", "case_transfer_fee_minor", "platform_revenue_minor", "lawyer_payout_minor", "simulation"];
    const paymentRows = visiblePayments.map((payment) => ["payment", payment.id, payment.status, payment.createdAt, payment.amountMinor, payment.currency, "", "", "", "", "", "", data.provider.sandboxEnabled]);
    const demoRows = visibleDemoRuns.map((run) => ["demo_payment", run.id, run.status, run.createdAt, run.amountMinor, run.currency, run.breakdown?.serviceKind ?? "", run.breakdown?.paymentMethod ?? "", run.breakdown?.consultationFeeAmountMinor ?? "", run.breakdown?.caseTransferFeeAmountMinor ?? "", run.breakdown?.platformRevenueMinor ?? "", run.breakdown?.lawyerPayoutMinor ?? "", true]);
    const blob = new Blob([[header, ...paymentRows, ...demoRows].map((row) => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `juro-billing-report-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="billing-loading" role="status"><LoaderCircle className="spin" /><span className="sr-only">{ru ? "Загрузка тарифов" : "Tariflar yuklanmoqda"}</span></div>;
  return <section className="billing-workspace">
    <header><CreditCard aria-hidden="true"/><div><small>JURO · BILLING</small><h1>{ru ? "Тариф и оплата" : "Tarif va to‘lov"}</h1><p>{ru ? "Выберите утверждённый тариф. Полная сумма, налог и режим продления фиксируются в заказе до оплаты." : "Tasdiqlangan tarifni tanlang. To‘liq summa, soliq va uzaytirish tartibi to‘lovdan oldin buyurtmada qayd etiladi."}</p></div></header>
    {error && <p className="billing-error" role="alert"><CircleAlert aria-hidden="true"/>{error}<button type="button" onClick={() => void load()}>{ru ? "Повторить" : "Qayta urinish"}</button></p>}
    {data && <>
      <div className={`billing-provider ${data.provider.enabled ? "ready" : ""}`}><ShieldCheck aria-hidden="true"/><div><strong>{data.provider.enabled ? (ru ? "Безопасное оформление включено" : "Xavfsiz rasmiylashtirish yoqilgan") : (ru ? "Оформление временно недоступно" : "Rasmiylashtirish vaqtincha mavjud emas")}</strong><p>{data.provider.sandboxEnabled ? (ru ? "Staging: тестовая оплата, реальные деньги не списываются." : "Staging: sinov to‘lovi, haqiqiy pul yechilmaydi.") : (ru ? "Платёж активируется только после проверки провайдера." : "To‘lov faqat provayder tekshirilgandan keyin faollashadi.")}</p></div></div>
      {data.trial && <section className="billing-trial"><ShieldCheck /><div><small>{ru ? "90-ДНЕВНЫЙ TRIAL" : "90 KUNLIK TRIAL"}</small><h2>{data.trial.effectiveStatus === "active" ? (ru ? `Осталось ${data.trial.daysRemaining} дн.` : `${data.trial.daysRemaining} kun qoldi`) : (ru ? "Пробный период завершён" : "Sinov muddati tugadi")}</h2><p>{ru ? `До ${formatter.format(new Date(data.trial.endsAt))}. Окончание trial не удаляет профиль автоматически.` : `${formatter.format(new Date(data.trial.endsAt))} gacha. Trial tugashi profilni avtomatik o‘chirmaydi.`}</p></div></section>}
      {data.demo.enabled && <div className="billing-demo-entry"><div><small>PROVIDER=DEMO · SIMULATION</small><strong>{ru ? "Посмотреть подключённую демонстрацию оплаты" : "Ulangan to‘lov namoyishini ko‘rish"}</strong><p>{ru ? "Без карт, списания, Uzum API и изменения тарифа." : "Karta, pul yechish, Uzum API va tarif o‘zgarishisiz."}</p></div><Link href={`${platformBasePath(locale, accountType, workspaceId)}/demo-payments`}>{ru ? "Открыть демо" : "Demoni ochish"}</Link></div>}
      {plans.length ? <div className="billing-plans">{plans.map(plan => <article key={plan.planVersionId} className={data.subscription?.planCode === plan.code ? "current" : ""}><small>{data.subscription?.planCode === plan.code ? (ru ? "Текущий план" : "Joriy reja") : "JURO"}</small><h2>{ru ? plan.nameRu : plan.nameUz}</h2><div className="billing-price">{money(plan.priceMinor, locale)}</div><p className="billing-period">{plan.billingPeriod === "monthly" ? (ru ? "за месяц, без налога" : "oyiga, soliqsiz") : plan.billingPeriod === "annual" ? (ru ? "за год, без налога" : "yiliga, soliqsiz") : (ru ? "разовый платёж, без налога" : "bir martalik, soliqsiz")}</p><ul>{planBenefits(plan, ru).map(feature => <li key={feature}><Check aria-hidden="true"/>{feature}</li>)}</ul><button type="button" disabled={!data.provider.enabled || Boolean(pendingPlan)} onClick={() => void choose(plan.planVersionId)}>{pendingPlan === plan.planVersionId ? <LoaderCircle className="spin" aria-hidden="true"/> : <CreditCard aria-hidden="true"/>}{ru ? "Перейти к расчёту" : "Hisob-kitobga o‘tish"}</button></article>)}</div> : <div className="billing-empty" role="status"><ReceiptText aria-hidden="true"/><div><h2>{ru ? "Нет утверждённых цен" : "Tasdiqlangan narxlar yo‘q"}</h2><p>{ru ? "JURO не создаёт заказ по черновой или неподтверждённой цене." : "JURO qoralama yoki tasdiqlanmagan narx bo‘yicha buyurtma yaratmaydi."}</p></div></div>}
      <div className="billing-report-tools"><label>{ru ? "Фильтр отчёта" : "Hisobot filtri"}<select value={reportStatus} onChange={(event) => setReportStatus(event.target.value)}><option value="all">{ru ? "Все статусы" : "Barcha holatlar"}</option>{reportStatuses.map((status) => <option key={status} value={status}>{paymentStatusLabel(status, ru, data.provider.sandboxEnabled)}</option>)}</select></label><button type="button" onClick={exportReport} disabled={visiblePayments.length + visibleDemoRuns.length === 0}><Download />{ru ? "Экспорт CSV" : "CSV eksport"}</button></div>
      <section className="billing-history"><h2><ReceiptText aria-hidden="true"/>{data.provider.sandboxEnabled ? (ru ? "История демо-платежей" : "Demo to‘lovlar tarixi") : (ru ? "История платежей" : "To‘lovlar tarixi")}</h2>{visiblePayments.length ? visiblePayments.map(payment => <div key={payment.id}><strong>{money(payment.amountMinor, locale)}</strong><span>{paymentStatusLabel(payment.status, ru, data.provider.sandboxEnabled)}</span><time dateTime={payment.createdAt}>{formatter.format(new Date(payment.createdAt))}</time></div>) : <p>{ru ? "Нет операций с выбранным статусом." : "Tanlangan holatdagi operatsiyalar yo‘q."}</p>}</section>
      {data.demoRuns.length > 0 && <section className="billing-history"><h2><ReceiptText />{ru ? "Начисленные demo-комиссии" : "Hisoblangan demo komissiyalar"}</h2>{visibleDemoRuns.length ? visibleDemoRuns.map((run) => <div key={run.id}><strong>{run.breakdown ? money(run.breakdown.platformRevenueMinor, locale) : "—"}</strong><span>{run.breakdown?.serviceKind === "consultation" ? (ru ? "Консультация · 1%" : "Maslahat · 1%") : run.breakdown?.paymentMethod === "installment" ? (ru ? "Рассрочка · без case-transfer fee" : "Bo‘lib to‘lash · case-transfer fee yo‘q") : run.breakdown?.appliedCaseTransferRule ? `${run.breakdown.caseTransferFeeBasisPoints / 100}% · ${ru ? run.breakdown.appliedCaseTransferRule.labelRu : run.breakdown.appliedCaseTransferRule.labelUz}` : run.flowType}</span><time dateTime={run.createdAt}>{formatter.format(new Date(run.createdAt))}</time></div>) : <p>{ru ? "Нет demo-комиссий с выбранным статусом." : "Tanlangan holatdagi demo komissiyalar yo‘q."}</p>}</section>}
    </>}
  </section>;
}
