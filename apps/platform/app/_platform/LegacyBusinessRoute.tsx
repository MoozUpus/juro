import { redirect } from "next/navigation";

import { getOrCreateUserProfile } from "../../lib/document-builder/storage/db";
import { workspaceProfile } from "../../lib/platform/profile";
import {
  isPersonalAccountType,
  platformBasePath,
  type PlatformLocale,
} from "../../lib/platform/routing";
import { workspaceForUser } from "../../lib/platform/workspace";
import { requireChatGPTUser } from "../chatgpt-auth";

function targetPath(
  base: string,
  segments: string[],
  query: Record<string, string | undefined>,
): string {
  const pathname = `${base}/${segments.map(encodeURIComponent).join("/")}`;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) search.set(key, value);
  }
  const serialized = search.toString();
  return serialized ? `${pathname}?${serialized}` : pathname;
}

export async function redirectLegacyBusinessRoute(
  locale: PlatformLocale,
  segments: string[],
  query: Record<string, string | undefined> = {},
): Promise<never> {
  const legacyPath = targetPath(`/${locale}/business`, segments, query);
  const user = await requireChatGPTUser(legacyPath);
  const userProfile = await getOrCreateUserProfile(user);
  const activeWorkspace = await workspaceForUser(userProfile);
  if (activeWorkspace.type === "business") {
    redirect(targetPath(
      platformBasePath(locale, "business", activeWorkspace.id),
      segments,
      query,
    ));
  }

  const profile = await workspaceProfile(user.email);
  const accountType = profile && isPersonalAccountType(profile.accountType)
    ? profile.accountType
    : "individual";
  redirect(targetPath(platformBasePath(locale, accountType), segments, query));
}
