import { notFound } from "next/navigation";

import { WorkspaceShellLayout } from "../../../_platform/WorkspaceShellLayout";
import "../../../_platform/platform-shell.css";
import "../../../_platform/global-search.css";
import "../../../_platform/platform-readability.css";
import {
  isAuthenticatedPlatformLocaleReady,
  isWorkspaceId,
} from "../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function BusinessWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; workspaceId: string }>;
}) {
  const { locale, workspaceId } = await params;
  if (!isAuthenticatedPlatformLocaleReady(locale) || !isWorkspaceId(workspaceId)) notFound();
  return (
    <WorkspaceShellLayout
      locale={locale}
      accountType="business"
      requestedWorkspaceId={workspaceId}
    >
      {children}
    </WorkspaceShellLayout>
  );
}
