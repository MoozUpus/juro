import { notFound } from "next/navigation";
import { OrderPaymentClient } from "../../../../../_platform/OrderPaymentClient";
import { requireChatGPTUser } from "../../../../../chatgpt-auth";
import { isAccountType, isLocale } from "../../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function OrderPaymentPage({ params }: { params: Promise<{ locale: string; accountType: string; orderId: string }> }) {
  const { locale, accountType, orderId } = await params;
  if (!isLocale(locale) || !isAccountType(accountType) || !orderId) notFound();
  await requireChatGPTUser(`/${locale}/${accountType}/orders/${encodeURIComponent(orderId)}/payment`);
  return <OrderPaymentClient locale={locale} accountType={accountType} orderId={orderId}/>;
}
