import { notFound } from "next/navigation";
import { requireChatGPTUser } from "../../../chatgpt-auth";
import { ModuleContent } from "../../../_platform/ModuleContent";
import { isAccountType, isLocale, isPlatformModule } from "../../../../lib/platform/routing";
export const dynamic="force-dynamic";
export default async function ModulePage({params}:{params:Promise<{locale:string;accountType:string;module:string}>}){const {locale,accountType,module}=await params;if(!isLocale(locale)||!isAccountType(accountType)||!isPlatformModule(module))notFound();const user=await requireChatGPTUser(`/${locale}/${accountType}/${module}`);return <ModuleContent locale={locale} accountType={accountType} module={module} userName={user.fullName??user.displayName}/>;}
