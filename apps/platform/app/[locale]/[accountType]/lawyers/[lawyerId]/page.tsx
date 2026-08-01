import { notFound } from "next/navigation";
import { requireChatGPTUser } from "../../../../chatgpt-auth";
import { isLocale, isPersonalAccountType } from "../../../../../lib/platform/routing";
import { LawyerProfileClient } from "../../../../_platform/LawyerProfileClient";
export const dynamic = "force-dynamic";
export default async function LawyerProfilePage({ params }: { params: Promise<{locale:string;accountType:string;lawyerId:string}> }) { const {locale,accountType,lawyerId}=await params; if(!isLocale(locale)||!isPersonalAccountType(accountType))notFound(); await requireChatGPTUser(`/${locale}/${accountType}/lawyers/${encodeURIComponent(lawyerId)}`); return <LawyerProfileClient locale={locale} lawyerId={lawyerId}/>; }
