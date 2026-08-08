import { notFound } from "next/navigation";

import { ComparisonResultClient } from "../../../../../../_platform/ComparisonResultClient";
import { requireChatGPTUser } from "../../../../../../chatgpt-auth";
import { isLocale, isWorkspaceId, platformBasePath } from "../../../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function BusinessComparisonResult({ params }: { params: Promise<{ locale: string; workspaceId: string; comparisonId: string }> }) {
  const { locale, workspaceId, comparisonId } = await params;
  if (!isLocale(locale) || !isWorkspaceId(workspaceId) || !comparisonId) notFound();
  const base = platformBasePath(locale, "business", workspaceId);
  await requireChatGPTUser(`${base}/documents/comparisons/${encodeURIComponent(comparisonId)}`);
  return <ComparisonResultClient comparisonId={comparisonId} locale={locale} accountType="business" />;
}
