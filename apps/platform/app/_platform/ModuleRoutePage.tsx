import { notFound } from "next/navigation";

import { requireChatGPTUser } from "../chatgpt-auth";
import { isAccountType, isLocale, isPlatformModule, isWorkspaceId, platformPath, type AccountType, type PlatformLocale, type PlatformModule } from "../../lib/platform/routing";
import { ModuleContent } from "./ModuleContent";

type AccountModuleRouteInput = {
  locale: string;
  accountType: string;
  module: PlatformModule;
};

type BusinessModuleRouteInput = {
  locale: string;
  workspaceId: string;
  module: PlatformModule;
};

/**
 * Keeps static module routes and the dynamic module fallback on the same
 * authentication and rendering path. Static routes exist only so their CSS
 * can be emitted with the module that needs it, rather than every workspace.
 */
export async function renderAccountModuleRoute({ locale, accountType, module }: AccountModuleRouteInput) {
  if (!isLocale(locale) || !isAccountType(accountType) || !isPlatformModule(module)) notFound();
  const user = await requireChatGPTUser(`/${locale}/${accountType}/${module}`);
  return (
    <ModuleContent
      locale={locale}
      accountType={accountType}
      module={module}
      userName={user.fullName ?? user.displayName}
    />
  );
}

export async function renderBusinessModuleRoute({ locale, workspaceId, module }: BusinessModuleRouteInput) {
  if (!isLocale(locale) || !isWorkspaceId(workspaceId) || !isPlatformModule(module)) notFound();
  const typedLocale = locale as PlatformLocale;
  const destination = platformPath(typedLocale, "business", module, workspaceId);
  const user = await requireChatGPTUser(destination);
  return (
    <ModuleContent
      locale={typedLocale}
      accountType="business"
      module={module}
      userName={user.fullName ?? user.displayName}
      workspaceId={workspaceId}
    />
  );
}

export type { AccountType, PlatformLocale, PlatformModule };
