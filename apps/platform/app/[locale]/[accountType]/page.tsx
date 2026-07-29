import { redirect } from "next/navigation";
import { isAccountType, isLocale } from "../../../lib/platform/routing";
export default async function WorkspaceIndex({ params }: { params: Promise<{ locale: string; accountType: string }> }) { const { locale, accountType }=await params; if(!isLocale(locale)||!isAccountType(accountType)) redirect("/dashboard"); redirect(`/${locale}/${accountType}/dashboard`); }
