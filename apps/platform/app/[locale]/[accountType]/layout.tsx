import { notFound, redirect } from "next/navigation";
import { requireChatGPTUser } from "../../chatgpt-auth";
import { isAccountType, isLocale } from "../../../lib/platform/routing";
import { PlatformShell } from "../../_platform/PlatformShell";
import "../../_platform/platform-shell.css";
import "../../_document-builder/document-builder.css";
import { workspaceProfile } from "../../../lib/platform/profile";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string; accountType: string }> }) {
  const { locale, accountType } = await params;
  if (!isLocale(locale) || !isAccountType(accountType)) notFound();
  const user = await requireChatGPTUser("/main");
  const profile = await workspaceProfile(user.email);
  if (profile && profile.accountType !== accountType) redirect(`/${profile.locale}/${profile.accountType}/main`);
  return <PlatformShell locale={locale} accountType={accountType} userName={user.fullName ?? user.displayName}>{children}</PlatformShell>;
}
