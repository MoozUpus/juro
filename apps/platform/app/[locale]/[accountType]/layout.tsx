import { notFound } from "next/navigation";

import { WorkspaceShellLayout } from "../../_platform/WorkspaceShellLayout";
import "../../_platform/platform-shell.css";
import "../../_platform/global-search.css";
import "../../_platform/platform-readability.css";
import {
  isAccountType,
  isAuthenticatedPlatformLocaleReady,
} from "../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; accountType: string }>;
}) {
  const { locale, accountType } = await params;
  if (!isAuthenticatedPlatformLocaleReady(locale) || !isAccountType(accountType)) notFound();
  return (
    <WorkspaceShellLayout locale={locale} accountType={accountType}>
      {children}
    </WorkspaceShellLayout>
  );
}
