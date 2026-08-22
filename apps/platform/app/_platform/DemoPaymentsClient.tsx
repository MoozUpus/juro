"use client";

/* eslint-disable react-hooks/set-state-in-effect -- tenant-scoped demo history is loaded after hydration */

import { Ban, CheckCircle2, CircleAlert, CreditCard, LoaderCircle, RotateCcw, ShieldCheck, Undo2, WalletCards } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { platformBasePath, type AccountType, type PlatformLocale } from "../../lib/platform/routing";
import type { DemoPaymentAction, DemoPaymentFlowType, DemoPaymentRun } from "../../lib/billing/demo-payments";

type Data = {
  availability: {
    enabled: boolean;
    provider: "demo";
    isSimulation: true;
    externalNetwork: false;
    entitlementsActivated: false;
    reason: string;
  };
  runs: DemoPaymentRun[];
};

const FLOW_DEFAULTS: Record<DemoPaymentFlowType, number> = {
  subscription: 120_000,
  lawyer_service: 500_000,
  uzum_installment: 900_000,
};

function money(amountMinor: number, locale: PlatformLocale) {
  return `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "uz-UZ", { maximumFractionDigits: 0 }).format(amountMinor / 100)} сум`;
}

export function DemoPaymentsClient({ locale, accountType, workspaceId }: { locale: PlatformLocale; accountType: AccountType; workspaceId?: string }) {
  const ru = locale === "ru";
  const [data, setData] = useState<Data | null>(null);
  const [amounts, setAmounts] = useState<Record<DemoPaymentFlowType, string>>({
    subscription: String(FLOW_DEFAULTS.subscription),
    lawyer_service: String(FLOW_DEFAULTS.lawyer_service),
    uzum_installment: String(FLOW_DEFAULTS.uzum_installment),
  });
  const [installments, setInstallments] = useState<3 | 6 | 12>(3);
  const [serviceKind, setServiceKind] = useState<"consultation" | "case_transfer">("consultation");
  const [legalArea, setLegalArea] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(`/api/platform/demo-payments${query}`, { cache: "no-store" });
      const body = await response.json() as Data & { code?: string; error?: string };
      if (!response.ok) throw new Error(body.error || body.code || "DEMO_PAYMENT_UNAVAILABLE");
      setData(body);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    }
  }, [query]);

  useEffect(() => { void load(); }, [load]);

  async function post(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setError("");
    try {
      const response = await fetch("/api/platform/demo-payments", {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ ...body, requestId: crypto.randomUUID(), locale, ...(workspaceId ? { workspaceId } : {}) }),
      });
      const result = await response.json() as { code?: string; error?: string };
      if (!response.ok) throw new Error(result.error || result.code || "DEMO_PAYMENT_FAILED");
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusy("");
    }
  }

  async function create(flowType: DemoPaymentFlowType) {
    const sum = Number(amounts[flowType]);
    if (!Number.isInteger(sum) || sum <= 0 || sum > 1_000_000_000) {
      setError(ru ? "Введите целую демо-сумму от 1 до 1 000 000 000 сум." : "1 dan 1 000 000 000 so‘mgacha butun demo summani kiriting.");
      return;
    }
    await post({
      action: "create",
      flowType,
      amountMinor: sum * 100,
      ...(flowType === "uzum_installment" ? { installmentCount: installments } : {}),
      ...(flowType === "lawyer_service" ? { serviceKind } : {}),
      ...((flowType === "uzum_installment" || (flowType === "lawyer_service" && serviceKind === "case_transfer")) && legalArea.trim() ? { legalArea: legalArea.trim() } : {}),
    }, `create:${flowType}`);
  }

  async function transition(runId: string, outcome: DemoPaymentAction) {
    await post({ action: "transition", runId, outcome }, `${runId}:${outcome}`);
  }

  const flowLabels: Record<DemoPaymentFlowType, [string, string]> = {
    subscription: ["Подписка JURO", "JURO obunasi"],
    lawyer_service: ["Услуга юриста", "Yurist xizmati"],
    uzum_installment: ["Uzum — рассрочка", "Uzum — bo‘lib to‘lash"],
  };
  const statusLabels: Record<DemoPaymentRun["status"], [string, string]> = {
    previewed: ["Ожидает демо-решения", "Demo qarorini kutmoqda"],
    succeeded: ["Демо: успешно", "Demo: muvaffaqiyatli"],
    failed: ["Демо: отклонено", "Demo: rad etildi"],
    cancelled: ["Демо: отменено", "Demo: bekor qilindi"],
    refunded: ["Демо: возврат", "Demo: qaytarildi"],
    paid_out: ["Демо: выплата юристу", "Demo: yuristga to‘lov"],
  };

  const basePath = platformBasePath(locale, accountType, workspaceId);
  return <section className="demo-payments-workspace">
    <header><WalletCards aria-hidden="true"/><div><small>JURO · PAYMENT DEMO</small><h1>{ru ? "Демонстрация платежей" : "To‘lovlar namoyishi"}</h1><p>{ru ? "Связанный с D1 учебный контур без реальных денег, карт, Uzum API и изменения тарифа." : "Haqiqiy pul, karta, Uzum API va tarif o‘zgarishisiz D1 bilan bog‘langan o‘quv konturi."}</p></div></header>
    <div className="demo-payment-warning" role="note"><ShieldCheck aria-hidden="true"/><div><strong>{ru ? "Только симуляция" : "Faqat simulyatsiya"}</strong><p><code>provider=demo</code> · <code>isSimulation=true</code>. {ru ? "Даже успешный сценарий не создаёт подписку, entitlement, реальную оплату, чек или выплату." : "Muvaffaqiyatli ssenariy ham obuna, entitlement, haqiqiy to‘lov, chek yoki pul o‘tkazmasini yaratmaydi."}</p></div></div>
    {error && <p className="billing-error" role="alert"><CircleAlert aria-hidden="true"/>{error}<button type="button" onClick={() => void load()}>{ru ? "Повторить" : "Qayta urinish"}</button></p>}
    {!data ? <div className="billing-loading" role="status"><LoaderCircle className="spin"/><span>{ru ? "Загрузка демо-контуров" : "Demo konturlari yuklanmoqda"}</span></div> : !data.availability.enabled ? <div className="billing-empty"><Ban aria-hidden="true"/><div><h2>{ru ? "Демо отключено" : "Demo o‘chirilgan"}</h2><p>{data.availability.reason}</p></div></div> : <>
      <div className="demo-payment-flows">
        {(Object.keys(flowLabels) as DemoPaymentFlowType[]).map(flowType => <article key={flowType}>
          <small>DEMO · {flowType === "uzum_installment" ? "UZUM" : "JURO"}</small><h2>{flowLabels[flowType][ru ? 0 : 1]}</h2>
          <label>{ru ? "Условная сумма, сум" : "Shartli summa, so‘m"}<input type="number" min="1" max="1000000000" step="1" inputMode="numeric" value={amounts[flowType]} onChange={event => setAmounts(current => ({ ...current, [flowType]: event.target.value }))}/></label>
          {flowType === "uzum_installment" && <label>{ru ? "Период" : "Muddat"}<select value={installments} onChange={event => setInstallments(Number(event.target.value) as 3 | 6 | 12)}><option value="3">3 {ru ? "месяца" : "oy"}</option><option value="6">6 {ru ? "месяцев" : "oy"}</option><option value="12">12 {ru ? "месяцев" : "oy"}</option></select></label>}
          {flowType === "lawyer_service" && <label>{ru ? "Тип услуги" : "Xizmat turi"}<select value={serviceKind} onChange={(event) => setServiceKind(event.target.value as typeof serviceKind)}><option value="consultation">{ru ? "Консультация · 1%" : "Maslahat · 1%"}</option><option value="case_transfer">{ru ? "Передача дела · правило 2%/5%" : "Ishni topshirish · 2%/5% qoida"}</option></select></label>}
          {(flowType === "uzum_installment" || (flowType === "lawyer_service" && serviceKind === "case_transfer")) && <label>{ru ? "Область права" : "Huquq sohasi"}<input required={flowType === "lawyer_service"} maxLength={120} value={legalArea} onChange={(event) => setLegalArea(event.target.value)} placeholder={ru ? "Например: договорное право" : "Masalan: shartnoma huquqi"} /></label>}
          <button type="button" disabled={Boolean(busy)} onClick={() => void create(flowType)}>{busy === `create:${flowType}` ? <LoaderCircle className="spin"/> : <CreditCard/>}{ru ? "Создать демо-сценарий" : "Demo ssenariy yaratish"}</button>
        </article>)}
      </div>
      <section className="demo-payment-history"><div className="demo-payment-history-title"><div><small>APPEND-ONLY EVENTS</small><h2>{ru ? "Демо-записи" : "Demo yozuvlari"}</h2></div><button type="button" onClick={() => void load()} aria-label={ru ? "Обновить демо-записи" : "Demo yozuvlarini yangilash"}><RotateCcw/></button></div>
        {data.runs.length ? data.runs.map(run => <article key={run.id}>
          <div><small>{run.externalId}</small><strong>{flowLabels[run.flowType][ru ? 0 : 1]}</strong><span>{money(run.amountMinor, locale)}{run.installmentCount ? ` · ${run.installmentCount} ${ru ? "мес." : "oy"}` : ""}</span></div>
          <p className={`demo-payment-status ${run.status}`}>{statusLabels[run.status][ru ? 0 : 1]}</p>
          {run.breakdown && <dl className="demo-fee-breakdown"><div><dt>{ru ? "Стоимость услуги юриста" : "Yurist xizmati narxi"}</dt><dd>{money(run.breakdown.lawyerServiceAmountMinor, locale)}</dd></div>{run.breakdown.consultationFeeAmountMinor > 0 && <div><dt>{ru ? `Комиссия консультации — ${run.breakdown.consultationFeeBasisPoints / 100}%` : `Maslahat komissiyasi — ${run.breakdown.consultationFeeBasisPoints / 100}%`}</dt><dd>{money(run.breakdown.consultationFeeAmountMinor, locale)}</dd></div>}{run.breakdown.caseTransferFeeAmountMinor > 0 && <div><dt>{ru ? `Комиссия передачи дела — ${run.breakdown.caseTransferFeeBasisPoints / 100}%` : `Ishni topshirish komissiyasi — ${run.breakdown.caseTransferFeeBasisPoints / 100}%`}</dt><dd>{money(run.breakdown.caseTransferFeeAmountMinor, locale)}</dd><small>{ru ? run.breakdown.appliedCaseTransferRule?.labelRu : run.breakdown.appliedCaseTransferRule?.labelUz}</small></div>}{run.breakdown.juroServiceMarkupMinor > 0 && <div><dt>{ru ? "Сервисная стоимость JURO" : "JURO xizmat narxi"}</dt><dd>{money(run.breakdown.juroServiceMarkupMinor, locale)}</dd></div>}{run.breakdown.installmentCount && <div><dt>{ru ? "Рассрочка" : "Bo‘lib to‘lash"}</dt><dd>{run.breakdown.installmentCount} {ru ? "мес." : "oy"}</dd><small>{ru ? "Дополнительная case-transfer fee с юриста: 0" : "Yuristdan qo‘shimcha case-transfer fee: 0"}</small></div>}<div className="total"><dt>{ru ? "Итог клиенту" : "Mijoz jami"}</dt><dd>{money(run.breakdown.clientTotalMinor, locale)}</dd></div>{run.breakdown.serviceKind !== "subscription" && <div className="total"><dt>{ru ? "Причитается юристу" : "Yuristga tegishli"}</dt><dd>{money(run.breakdown.lawyerPayoutMinor, locale)}</dd></div>}{run.breakdown.platformRevenueMinor > 0 && <div><dt>{ru ? "Итог платформе" : "Platforma jami"}</dt><dd>{money(run.breakdown.platformRevenueMinor, locale)}</dd></div>}</dl>}
          <div className="demo-payment-actions">
            {run.status === "previewed" && <><button type="button" disabled={Boolean(busy)} onClick={() => void transition(run.id, "succeed")}><CheckCircle2/>{ru ? "Успех" : "Muvaffaqiyat"}</button><button type="button" disabled={Boolean(busy)} onClick={() => void transition(run.id, "fail")}><CircleAlert/>{ru ? "Отклонить" : "Rad etish"}</button><button type="button" disabled={Boolean(busy)} onClick={() => void transition(run.id, "cancel")}><Ban/>{ru ? "Отменить" : "Bekor qilish"}</button></>}
            {run.status === "succeeded" && <button type="button" disabled={Boolean(busy)} onClick={() => void transition(run.id, "refund")}><Undo2/>{ru ? "Демо-возврат" : "Demo qaytarish"}</button>}
            {run.status === "succeeded" && run.flowType === "lawyer_service" && <button type="button" disabled={Boolean(busy)} onClick={() => void transition(run.id, "payout")}><WalletCards/>{ru ? "Демо-выплата" : "Demo to‘lov"}</button>}
          </div>
        </article>) : <p>{ru ? "Демо-записей пока нет." : "Hozircha demo yozuvlari yo‘q."}</p>}
      </section>
    </>}
    <Link className="demo-payment-back" href={`${basePath}/billing`}>{ru ? "Вернуться к тарифу" : "Tarifga qaytish"}</Link>
  </section>;
}
