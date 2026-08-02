import { notFound } from "next/navigation";

import { WorkspaceShellLayout } from "../../../_platform/WorkspaceShellLayout";
import "../../../_platform/platform-shell.css";
import "../../../_platform/global-search.css";
import "../../../_platform/dashboard.css";
import "../../../_platform/cases.css";
import "../../../_platform/team.css";
import "../../../_platform/ai-lawyer.css";
import "../../../_platform/ai-lawyer-phase4.css";
import "../../../_platform/consultations-phase7.css";
import "../../../_platform/ai-evidence.css";
import "../../../_platform/billing.css";
import "../../../_platform/profile-settings.css";
import "../../../_platform/consultations.css";
import "../../../_platform/document-review.css";
import "../../../_platform/document-comparison.css";
import "../../../_platform/history-archive.css";
import "../../../_platform/help.css";
import "../../../_platform/action-plan.css";
import "../../../_platform/calendar.css";
import "../../../_platform/monitoring.css";
import "../../../_document-builder/document-builder.css";
import "../../../_platform/platform-readability.css";
import { isLocale, isWorkspaceId } from "../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function BusinessWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; workspaceId: string }>;
}) {
  const { locale, workspaceId } = await params;
  if (!isLocale(locale) || !isWorkspaceId(workspaceId)) notFound();
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
