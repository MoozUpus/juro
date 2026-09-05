import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { requireChatGPTUser } from "../chatgpt-auth";
import { publicDocumentUrlImportEnabled } from "../../lib/document-analysis/public-url-import-feature";
import { runtimeEnv } from "../../lib/document-builder/storage/runtime";
import { isAccountType, isAuthenticatedPlatformLocaleReady, isLocale, isPlatformModule, isWorkspaceId, platformPath, type AccountType, type PlatformLocale, type PlatformModule } from "../../lib/platform/routing";
import { ModuleContent } from "./ModuleContent";
import { safeDisplayName } from "../../lib/platform/display-name";
import {
  accountModuleRedirect,
  isLawyerHostRequest,
} from "../../lib/platform/lawyer-entry-routing";
import { workspaceProfile } from "../../lib/platform/profile";

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
  if (!isLocale(locale) || !isAuthenticatedPlatformLocaleReady(locale) || !isAccountType(accountType) || !isPlatformModule(module)) notFound();
  const requestHeaders = await headers();
  const lawyerHost = isLawyerHostRequest(requestHeaders);
  const user = await requireChatGPTUser(`/${locale}/${accountType}/${module}`);
  const destination = accountModuleRedirect({
    requestedLocale: locale,
    requestedAccountType: accountType,
    module,
    lawyerHost,
    requestHost: requestHeaders.get("host"),
    profile: await workspaceProfile(user.email),
  });
  if (destination) redirect(destination);
  const publicUrlImportEnabled = publicDocumentUrlImportEnabled(runtimeEnv().PUBLIC_DOCUMENT_URL_IMPORT_ENABLED);
  return (
    <ModuleContent
      locale={locale}
      accountType={accountType}
      module={module}
      userName={safeDisplayName(user.fullName ?? user.displayName)}
      publicUrlImportEnabled={publicUrlImportEnabled}
    />
  );
}

export async function renderBusinessModuleRoute({ locale, workspaceId, module }: BusinessModuleRouteInput) {
  if (!isLocale(locale) || !isAuthenticatedPlatformLocaleReady(locale) || !isWorkspaceId(workspaceId) || !isPlatformModule(module)) notFound();
  const typedLocale = locale as PlatformLocale;
  const destination = platformPath(typedLocale, "business", module, workspaceId);
  const user = await requireChatGPTUser(destination);
  const publicUrlImportEnabled = publicDocumentUrlImportEnabled(runtimeEnv().PUBLIC_DOCUMENT_URL_IMPORT_ENABLED);
  return (
    <ModuleContent
      locale={typedLocale}
      accountType="business"
      module={module}
      userName={safeDisplayName(user.fullName ?? user.displayName)}
      workspaceId={workspaceId}
      publicUrlImportEnabled={publicUrlImportEnabled}
    />
  );
}

export type { AccountType, PlatformLocale, PlatformModule };
