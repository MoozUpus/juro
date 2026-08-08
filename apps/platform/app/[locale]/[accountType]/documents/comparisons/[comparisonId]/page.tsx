import { notFound } from "next/navigation";

import { ComparisonResultClient } from "../../../../../_platform/ComparisonResultClient";
import { requireChatGPTUser } from "../../../../../chatgpt-auth";
import { isAccountType, isLocale } from "../../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function ComparisonResultPage({
  params,
}: {
  params: Promise<{ locale: string; accountType: string; comparisonId: string }>;
}) {
  const { locale, accountType, comparisonId } = await params;
  if (!isLocale(locale) || !isAccountType(accountType) || !comparisonId) notFound();
  await requireChatGPTUser(
    `/${locale}/${accountType}/documents/comparisons/${encodeURIComponent(comparisonId)}`,
  );
  return (
    <ComparisonResultClient
      comparisonId={comparisonId}
      locale={locale}
      accountType={accountType}
    />
  );
}
