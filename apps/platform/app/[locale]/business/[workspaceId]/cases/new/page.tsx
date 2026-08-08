import { notFound } from "next/navigation";

import { CaseCreateClient } from "../../../../../_platform/CaseCreateClient";
import { requireChatGPTUser } from "../../../../../chatgpt-auth";
import { isLocale, isWorkspaceId, platformBasePath } from "../../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function NewBusinessCasePage({ params }: { params: Promise<{ locale: string; workspaceId: string }> }) {
  const { locale, workspaceId } = await params;
  if (!isLocale(locale) || !isWorkspaceId(workspaceId)) notFound();
  const base = platformBasePath(locale, "business", workspaceId);
  await requireChatGPTUser(`${base}/cases/new`);
  return <CaseCreateClient locale={locale} accountType="business" />;
}
