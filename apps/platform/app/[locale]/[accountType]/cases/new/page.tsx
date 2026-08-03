import { notFound } from "next/navigation";

import { CaseCreateClient } from "../../../../_platform/CaseCreateClient";
import { requireChatGPTUser } from "../../../../chatgpt-auth";
import { isAccountType, isLocale } from "../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function NewCasePage({ params }: { params: Promise<{ locale: string; accountType: string }> }) {
  const { locale, accountType } = await params;
  if (!isLocale(locale) || !isAccountType(accountType)) notFound();
  await requireChatGPTUser(`/${locale}/${accountType}/cases/new`);
  return <CaseCreateClient locale={locale} accountType={accountType} />;
}
