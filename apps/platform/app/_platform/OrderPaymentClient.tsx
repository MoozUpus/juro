"use client";

/* eslint-disable react-hooks/set-state-in-effect -- provider-confirmed order state is read after every action */

import { ArrowLeft, CheckCircle2, CircleAlert, CreditCard, LoaderCircle, RotateCcw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { platformBasePath, type AccountType, type PlatformLocale } from "../../lib/platform/routing";

type PaymentView = {
  availability?: { sandboxEnabled?: boolean };
  order: { id: string; orderType: string; status: string; totalAmountMinor: number; providerStatus: string | null; settledAt: string | null };
  invoice: { invoiceNumber: string; status: string; paidAt: string | null } | null;
  paymentAttempt: { internalStatus: string; providerStatus: string | null; amountMinor: number } | null;
};

function money(value: number, locale: PlatformLocale) {
  return `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "uz-UZ", { maximumFractionDigits: 0 }).format(value / 100)} сум`;
}

export function OrderPaymentClient({ locale, accountType, orderId, workspaceId }: { locale: PlatformLocale; accountType: AccountType; orderId: string; workspaceId?: string }) {
  const ru = locale === "ru";
  const [view, setView] = useState<PaymentView | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<"FUNDED" | "DECLINED" | "">("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const workspaceQuery = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
      const response = await fetch(`/api/checkout/${encodeURIComponent(orderId)}${workspaceQuery}`, { cache: "no-store" });
      const body = await response.json() as PaymentView & { code?: string; error?: string };
      if (!response.ok || !body.order) throw new Error(body.error || body.code || (ru ? "Заказ не найден." : "Buyurtma topilmadi."));
      setView(body);
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    finally { setLoading(false); }
  }, [orderId, ru, workspaceId]);
  useEffect(() => { void load(); }, [load]);

  async function authorize(outcome: "FUNDED" | "DECLINED") {
    setProcessing(outcome);
    setError("");
    try {
      const response = await fetch(`/api/checkout/${encodeURIComponent(orderId)}/sandbox-authorize`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-juro-csrf": "1" },
        body: JSON.stringify({ requestId: crypto.randomUUID(), locale, outcome, ...(workspaceId ? { workspaceId } : {}) }),
      });
      const body = await response.json() as { code?: string; error?: string };
      if (!response.ok) throw new Error(body.error || body.code || (ru ? "Провайдер отклонил запрос." : "Provayder so‘rovni rad etdi."));
      await load();
    } catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    finally { setProcessing(""); }
  }

  if (loading) return <div className="billing-loading" role="status"><LoaderCircle className="spin"/><span>{ru ? "Проверяем статус оплаты…" : "To‘lov holati tekshirilmoqda…"}</span></div>;
  if (!view) return <section className="checkout-workspace"><p className="billing-error" role="alert"><CircleAlert/>{error}</p></section>;
  const active = view.order.status === "ACTIVE" && (view.order.orderType === "LEGAL_SERVICE" || view.invoice?.status === "paid");
  const failed = view.paymentAttempt?.internalStatus === "failed";
  const basePath = platformBasePath(locale, accountType, workspaceId);
  const service = view.order.orderType === "LEGAL_SERVICE";
  return <section className="checkout-workspace payment-status-workspace">
    <Link className="checkout-back" href={`${basePath}/billing`}><ArrowLeft/>{ru ? "Тариф и платежи" : "Tarif va to‘lovlar"}</Link>
  <header className={active ? "payment-success" : ""}><div><small>JURO · PAYMENT</small><h1>{active ? (ru ? "Оплата подтверждена" : "To‘lov tasdiqlandi") : failed ? (ru ? "Оплата отклонена" : "To‘lov rad etildi") : (ru ? "Подтверждение оплаты" : "To‘lovni tasdiqlash")}</h1><p>{active ? (service ? (ru ? "Услуга активирована после проверенного серверного события. Создано обязательство перед юристом; выплата остаётся на безопасном hold до settlement." : "Xizmat tekshirilgan server hodisasidan keyin faollashdi. Yurist oldidagi majburiyat yaratildi; to‘lov settlementgacha xavfsiz hold’da.") : (ru ? "Подписка активирована только после проверенного серверного события. Платёж и проводки сохранены." : "Obuna faqat tekshirilgan server hodisasidan keyin faollashtirildi. To‘lov va yozuvlar saqlandi.")) : (ru ? "В staging можно проверить успешный и отклонённый сценарии без списания реальных денег." : "Stagingda haqiqiy pul yechmasdan muvaffaqiyatli va rad etilgan ssenariylarni tekshirish mumkin.")}</p></div>{active ? <CheckCircle2/> : <ShieldCheck/>}</header>
    {error && <p className="billing-error" role="alert"><CircleAlert/>{error}</p>}
    <article className="payment-card"><div><span>{ru ? "Сумма" : "Summa"}</span><strong>{money(view.order.totalAmountMinor, locale)}</strong></div><div><span>{ru ? "Счёт" : "Hisob"}</span><strong>{view.invoice?.invoiceNumber ?? "—"}</strong></div><div><span>{ru ? "Статус" : "Holat"}</span><strong>{active ? (ru ? "Оплачен" : "To‘langan") : failed ? (ru ? "Отклонён" : "Rad etilgan") : (ru ? "Ожидает подтверждения" : "Tasdiqlash kutilmoqda")}</strong></div></article>
    {active ? <div className="payment-actions"><Link className="payment-primary" href={`${basePath}/billing`}><CheckCircle2/>{ru ? "Вернуться к тарифу" : "Tarifga qaytish"}</Link></div> : view.availability?.sandboxEnabled ? <div className="sandbox-panel"><div><small>STAGING SANDBOX</small><h2>{failed ? (ru ? "Повторить тест" : "Sinovni takrorlash") : (ru ? "Выберите ответ провайдера" : "Provayder javobini tanlang")}</h2><p>{ru ? "Кнопка отправляет подписанное серверное событие через тот же обработчик, который активирует подписку." : "Tugma obunani faollashtiradigan ayni ishlovchi orqali imzolangan server hodisasini yuboradi."}</p></div><div className="sandbox-actions"><button type="button" disabled={Boolean(processing)} onClick={() => void authorize("FUNDED")}>{processing === "FUNDED" ? <LoaderCircle className="spin"/> : <CreditCard/>}{ru ? "Тест: оплатить" : "Sinov: to‘lash"}</button><button type="button" className="secondary" disabled={Boolean(processing)} onClick={() => void authorize("DECLINED")}>{processing === "DECLINED" ? <LoaderCircle className="spin"/> : <CircleAlert/>}{ru ? "Тест: отклонить" : "Sinov: rad etish"}</button></div></div> : <div className="billing-empty"><ShieldCheck/><div><h2>{ru ? "Ожидаем платёжного провайдера" : "To‘lov provayderi kutilmoqda"}</h2><p>{ru ? "Статус обновится только после проверенного webhook. Перезагрузите страницу позже." : "Holat faqat tekshirilgan webhookdan keyin yangilanadi. Sahifani keyinroq yangilang."}</p><button type="button" onClick={() => { setLoading(true); void load(); }}><RotateCcw/>{ru ? "Проверить снова" : "Qayta tekshirish"}</button></div></div>}
  </section>;
}
