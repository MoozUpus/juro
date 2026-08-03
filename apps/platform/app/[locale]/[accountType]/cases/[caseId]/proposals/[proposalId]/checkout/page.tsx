import { notFound } from "next/navigation";
import { MarketplaceProposalCheckoutClient } from "../../../../../../../_platform/MarketplaceProposalCheckoutClient";
import { requireChatGPTUser } from "../../../../../../../chatgpt-auth";
import { isAccountType, isLocale } from "../../../../../../../../lib/platform/routing";
export const dynamic="force-dynamic";
export default async function ProposalCheckout({params,searchParams}:{params:Promise<{locale:string;accountType:string;caseId:string;proposalId:string}>;searchParams:Promise<{orderId?:string}>}){const p=await params,s=await searchParams;if(!isLocale(p.locale)||!isAccountType(p.accountType)||!s.orderId)notFound();await requireChatGPTUser(`/${p.locale}/${p.accountType}/cases/${encodeURIComponent(p.caseId)}/proposals/${encodeURIComponent(p.proposalId)}/checkout?orderId=${encodeURIComponent(s.orderId)}`);return <MarketplaceProposalCheckoutClient locale={p.locale} accountType={p.accountType} orderId={s.orderId}/>;}
