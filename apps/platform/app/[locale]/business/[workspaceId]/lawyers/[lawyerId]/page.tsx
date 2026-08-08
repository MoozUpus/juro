import { notFound } from "next/navigation";
import { requireChatGPTUser } from "../../../../../chatgpt-auth";
import { LawyerProfileClient } from "../../../../../_platform/LawyerProfileClient";
import { isLocale, isWorkspaceId, platformPath } from "../../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function BusinessLawyerProfilePage({ params }: { params: Promise<{ locale: string; workspaceId: string; lawyerId: string }> }) {
  const { locale, workspaceId, lawyerId } = await params;
  if (!isLocale(locale) || !isWorkspaceId(workspaceId) || !lawyerId) notFound();
  await requireChatGPTUser(`${platformPath(locale, "business", "lawyers", workspaceId)}/${encodeURIComponent(lawyerId)}`);
  return <LawyerProfileClient locale={locale} lawyerId={lawyerId} />;
}
