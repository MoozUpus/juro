import { notFound } from "next/navigation";
import { ActionPlanClient } from "../../../../_platform/ActionPlanClient";
import { isAccountType, isLocale } from "../../../../../lib/platform/routing";
export const dynamic="force-dynamic";
export default async function CasePlan({params}:{params:Promise<{locale:string;accountType:string;caseId:string}>}){const {locale,accountType}=await params;if(!isLocale(locale)||!isAccountType(accountType))notFound();return <ActionPlanClient locale={locale} accountType={accountType}/>;}
