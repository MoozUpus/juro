import { headers } from "next/headers";
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
import {
  INTERNAL_REQUEST_PATH_HEADER,
  platformBasePath,
  platformPath,
  safeWorkspaceReturnPath,
  workspaceForAccountRoute,
  workspaceTypeForAccountType,
} from "../../lib/platform/routing";
import { requireChatGPTUser } from "../chatgpt-auth";
import { PlatformShell } from "./PlatformShell";
import { safeDisplayName } from "../../lib/platform/display-name";

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
  const fallbackReturnTo = platformPath(
    locale,
    accountType,
    "dashboard",
    requestedWorkspaceId,
  );
  const incomingHeaders = await headers();
  const returnTo = safeWorkspaceReturnPath(
    incomingHeaders.get(INTERNAL_REQUEST_PATH_HEADER),
    platformBasePath(locale, accountType, requestedWorkspaceId),
    fallbackReturnTo,
  );
  const user = await requireChatGPTUser(returnTo);
  const userProfile = await getOrCreateUserProfile(user);
  const profile = await workspaceProfile(user.email);
  if (profile && !profile.onboardingCompleted) {
    redirect(`/${profile.locale}/onboarding`);
  }

  const defaultWorkspace = requestedWorkspaceId
    ? await workspaceForUserById(userProfile.id, requestedWorkspaceId, {
        activate: true,
        source: "canonical_business_route",
      })
    : await workspaceForUser(userProfile);
  if (!defaultWorkspace) notFound();

  const availableWorkspaces = await workspacesForUser(userProfile.id);
  const activeWorkspace = requestedWorkspaceId
    ? defaultWorkspace
    : workspaceForAccountRoute(
        defaultWorkspace,
        availableWorkspaces,
        accountType,
      );

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

  return (
    <PlatformShell
      locale={locale}
      accountType={accountType}
      userName={safeDisplayName(user.fullName ?? user.displayName)}
      activeWorkspaceId={activeWorkspace.id}
      workspaces={availableWorkspaces}
    >
      {children}
    </PlatformShell>
  );
}
