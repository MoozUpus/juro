import { notFound, redirect } from "next/navigation";

import { getOrCreateUserProfile } from "../../lib/document-builder/storage/db";
import { workspaceProfile } from "../../lib/platform/profile";
import {
  workspaceForUser,
  workspaceForUserById,
  workspacesForUser,
} from "../../lib/platform/workspace";
import type {
  AccountType,
  PlatformLocale,
} from "../../lib/platform/routing";
import { platformPath, workspaceTypeForAccountType } from "../../lib/platform/routing";
import { requireChatGPTUser } from "../chatgpt-auth";
import { PlatformShell } from "./PlatformShell";

export async function WorkspaceShellLayout({
  children,
  locale,
  accountType,
  requestedWorkspaceId,
}: {
  children: React.ReactNode;
  locale: PlatformLocale;
  accountType: AccountType;
  requestedWorkspaceId?: string;
}) {
  const returnTo = platformPath(
    locale,
    accountType,
    "dashboard",
    requestedWorkspaceId,
  );
  const user = await requireChatGPTUser(returnTo);
  const userProfile = await getOrCreateUserProfile(user);
  const profile = await workspaceProfile(user.email);
  if (profile && !profile.onboardingCompleted) {
    redirect(`/${profile.locale}/onboarding`);
  }

  const activeWorkspace = requestedWorkspaceId
    ? await workspaceForUserById(userProfile.id, requestedWorkspaceId, {
        activate: true,
        source: "canonical_business_route",
      })
    : await workspaceForUser(userProfile);
  if (!activeWorkspace) notFound();

  if (activeWorkspace.type !== workspaceTypeForAccountType(accountType)) {
    const destination = activeWorkspace.type === "business"
      ? "business"
      : profile?.accountType === "business"
        ? "individual"
        : (profile?.accountType ?? "individual");
    const base = destination === "business"
      ? `/${profile?.locale ?? locale}/business/${encodeURIComponent(activeWorkspace.id)}`
      : `/${profile?.locale ?? locale}/${destination}`;
    redirect(`${base}/dashboard`);
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
  return (
    <PlatformShell
      locale={locale}
      accountType={accountType}
      userName={user.fullName ?? user.displayName}
      activeWorkspaceId={activeWorkspace.id}
      workspaces={availableWorkspaces}
    >
      {children}
    </PlatformShell>
  );
}
