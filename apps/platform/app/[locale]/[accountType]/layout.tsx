import { notFound, redirect } from "next/navigation";
import { requireChatGPTUser } from "../../chatgpt-auth";
import {
  isAccountType,
  isLocale,
  workspaceTypeForAccountType,
} from "../../../lib/platform/routing";
import { PlatformShell } from "../../_platform/PlatformShell";
import "../../_platform/platform-shell.css";
import "../../_platform/global-search.css";
import "../../_platform/dashboard.css";
import "../../_platform/cases.css";
import "../../_platform/team.css";
import "../../_platform/ai-lawyer.css";
import "../../_platform/ai-evidence.css";
import "../../_platform/billing.css";
import "../../_platform/profile-settings.css";
import "../../_platform/consultations.css";
import "../../_platform/document-review.css";
import "../../_platform/document-comparison.css";
import "../../_platform/history-archive.css";
import "../../_platform/help.css";
import "../../_platform/monitoring.css";
import "../../_document-builder/document-builder.css";
import "../../_platform/platform-readability.css";
import { workspaceProfile } from "../../../lib/platform/profile";
import { getOrCreateUserProfile } from "../../../lib/document-builder/storage/db";
import { workspaceForUser, workspacesForUser } from "../../../lib/platform/workspace";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string; accountType: string }> }) {
  const { locale, accountType } = await params;
  if (!isLocale(locale) || !isAccountType(accountType)) notFound();
  const user = await requireChatGPTUser(`/${locale}/${accountType}/dashboard`);
  const userProfile = await getOrCreateUserProfile(user);
  let profile = await workspaceProfile(user.email);
  if (!profile) {
    profile = await workspaceProfile(user.email);
  }
  if (profile && !profile.onboardingCompleted) {
    redirect(`/${profile.locale}/onboarding`);
  }
  const activeWorkspace = await workspaceForUser(userProfile);
  if (activeWorkspace.type !== workspaceTypeForAccountType(accountType)) {
    const destination = activeWorkspace.type === "business"
      ? "business"
      : profile?.accountType === "business"
        ? "individual"
        : (profile?.accountType ?? "individual");
    redirect(`/${profile?.locale ?? locale}/${destination}/dashboard`);
  }
  if (
    activeWorkspace.type === "individual"
    && profile
    && profile.accountType !== "business"
    && profile.accountType !== accountType
  ) {
    redirect(`/${profile.locale}/${profile.accountType}/dashboard`);
  }
  const availableWorkspaces = await workspacesForUser(userProfile.id);
  return <PlatformShell
    locale={locale}
    accountType={accountType}
    userName={user.fullName ?? user.displayName}
    activeWorkspaceId={activeWorkspace.id}
    workspaces={availableWorkspaces}
  >{children}</PlatformShell>;
}
