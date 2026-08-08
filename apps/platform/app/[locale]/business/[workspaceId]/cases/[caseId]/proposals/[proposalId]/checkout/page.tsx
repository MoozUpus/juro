import { notFound } from "next/navigation";
import { MarketplaceProposalCheckoutClient } from "../../../../../../../../_platform/MarketplaceProposalCheckoutClient";
import { requireChatGPTUser } from "../../../../../../../../chatgpt-auth";
import { isLocale, isWorkspaceId } from "../../../../../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function BusinessProposalCheckout({ params, searchParams }: {
  params: Promise<{ locale: string; workspaceId: string; caseId: string; proposalId: string }>;
  searchParams: Promise<{ orderId?: string }>;
}) {
  const p = await params;
  const s = await searchParams;
  if (!isLocale(p.locale) || !isWorkspaceId(p.workspaceId) || !p.caseId || !p.proposalId || !s.orderId) notFound();
  const path = `/${p.locale}/business/${encodeURIComponent(p.workspaceId)}/cases/${encodeURIComponent(p.caseId)}/proposals/${encodeURIComponent(p.proposalId)}/checkout?orderId=${encodeURIComponent(s.orderId)}`;
  await requireChatGPTUser(path);
  return <MarketplaceProposalCheckoutClient locale={p.locale} accountType="business" workspaceId={p.workspaceId} orderId={s.orderId} />;
}
