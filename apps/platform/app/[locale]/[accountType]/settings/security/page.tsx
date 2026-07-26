import { notFound } from "next/navigation";
import { ProfileSettingsClient } from "../../../../_platform/ProfileSettingsClient";
import { isAccountType, isLocale } from "../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";
export default async function SecuritySettingsPage({ params }: { params: Promise<{ locale: string; accountType: string }> }) {
  const { locale, accountType } = await params;
  if (!isLocale(locale) || !isAccountType(accountType)) notFound();
  return <ProfileSettingsClient locale={locale} accountType={accountType} view="security" />;
}
