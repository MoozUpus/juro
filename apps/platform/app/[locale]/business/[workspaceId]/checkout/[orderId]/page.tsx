import { notFound } from "next/navigation";
import { CheckoutClient } from "../../../../../_platform/CheckoutClient";
import { requireChatGPTUser } from "../../../../../chatgpt-auth";
import { isLocale, isWorkspaceId } from "../../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function BusinessCheckoutPage({ params }: { params: Promise<{ locale: string; workspaceId: string; orderId: string }> }) {
  const { locale, workspaceId, orderId } = await params;
  if (!isLocale(locale) || !isWorkspaceId(workspaceId) || !orderId) notFound();
  await requireChatGPTUser(`/${locale}/business/${encodeURIComponent(workspaceId)}/checkout/${encodeURIComponent(orderId)}`);
  return <CheckoutClient locale={locale} accountType="business" workspaceId={workspaceId} orderId={orderId}/>;
}
