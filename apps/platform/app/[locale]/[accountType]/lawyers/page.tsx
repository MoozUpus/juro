import { notFound } from "next/navigation";
import { requireChatGPTUser } from "../../../chatgpt-auth";
import { LawyerDirectoryClient } from "../../../_platform/LawyerDirectoryClient";
import { isLocale, isPersonalAccountType, platformPath } from "../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function LawyerDirectoryPage({ params }: { params: Promise<{ locale: string; accountType: string }> }) {
  const { locale, accountType } = await params;
  if (!isLocale(locale) || !isPersonalAccountType(accountType)) notFound();
  await requireChatGPTUser(platformPath(locale, accountType, "lawyers"));
  return <LawyerDirectoryClient locale={locale} accountType={accountType} />;
}
