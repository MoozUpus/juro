import { notFound } from "next/navigation";
import { CheckoutClient } from "../../../../_platform/CheckoutClient";
import { requireChatGPTUser } from "../../../../chatgpt-auth";
import { isAccountType, isLocale } from "../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({ params }: { params: Promise<{ locale: string; accountType: string; orderId: string }> }) {
  const { locale, accountType, orderId } = await params;
  if (!isLocale(locale) || !isAccountType(accountType) || !orderId) notFound();
  await requireChatGPTUser(`/${locale}/${accountType}/checkout/${encodeURIComponent(orderId)}`);
  return <CheckoutClient locale={locale} accountType={accountType} orderId={orderId}/>;
}
