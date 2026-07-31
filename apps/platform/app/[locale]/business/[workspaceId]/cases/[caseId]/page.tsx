import { notFound } from "next/navigation";

import { ActionPlanClient } from "../../../../../_platform/ActionPlanClient";
import { requireChatGPTUser } from "../../../../../chatgpt-auth";
import { isLocale, isWorkspaceId, platformBasePath } from "../../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function BusinessCasePage({ params }: { params: Promise<{ locale: string; workspaceId: string; caseId: string }> }) {
  const { locale, workspaceId, caseId } = await params;
  if (!isLocale(locale) || !isWorkspaceId(workspaceId)) notFound();
  const base = platformBasePath(locale, "business", workspaceId);
  await requireChatGPTUser(`${base}/cases/${encodeURIComponent(caseId)}`);
  return <ActionPlanClient locale={locale} accountType="business" initialCaseId={caseId} />;
}
