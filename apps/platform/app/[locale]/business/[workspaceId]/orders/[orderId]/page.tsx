import { notFound } from "next/navigation";
import { OrderPaymentClient } from "../../../../../_platform/OrderPaymentClient";
import { requireChatGPTUser } from "../../../../../chatgpt-auth";
import { isLocale, isWorkspaceId } from "../../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function BusinessOrderPage({ params }: { params: Promise<{ locale: string; workspaceId: string; orderId: string }> }) {
  const { locale, workspaceId, orderId } = await params;
  if (!isLocale(locale) || !isWorkspaceId(workspaceId) || !orderId) notFound();
  await requireChatGPTUser(`/${locale}/business/${encodeURIComponent(workspaceId)}/orders/${encodeURIComponent(orderId)}`);
  return <OrderPaymentClient locale={locale} accountType="business" workspaceId={workspaceId} orderId={orderId}/>;
}
