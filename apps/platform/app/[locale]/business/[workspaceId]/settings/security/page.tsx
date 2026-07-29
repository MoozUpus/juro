import { notFound } from "next/navigation";

import { ProfileSettingsClient } from "../../../../../_platform/ProfileSettingsClient";
import { isLocale, isWorkspaceId } from "../../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function BusinessSecuritySettings({ params }: { params: Promise<{ locale: string; workspaceId: string }> }) {
  const { locale, workspaceId } = await params;
  if (!isLocale(locale) || !isWorkspaceId(workspaceId)) notFound();
  return <ProfileSettingsClient locale={locale} accountType="business" view="security" />;
}
