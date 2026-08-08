import { notFound } from "next/navigation";
import { requireChatGPTUser } from "../../../../chatgpt-auth";
import { CaseWorkspaceClient } from "../../../../_platform/CaseWorkspaceClient";
import { isAccountType, isLocale } from "../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function CasePage({ params }: { params: Promise<{ locale: string; accountType: string; caseId: string }> }) {
  const { locale, accountType, caseId } = await params;
  if (!isLocale(locale) || !isAccountType(accountType)) notFound();
  await requireChatGPTUser(`/${locale}/${accountType}/cases/${encodeURIComponent(caseId)}`);
  return <CaseWorkspaceClient locale={locale} caseId={caseId}/>;
}
