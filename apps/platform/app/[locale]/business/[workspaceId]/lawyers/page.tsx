import { notFound } from "next/navigation";
import { requireChatGPTUser } from "../../../../chatgpt-auth";
import { LawyerDirectoryClient } from "../../../../_platform/LawyerDirectoryClient";
import { isLocale, isWorkspaceId, platformPath } from "../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function BusinessLawyerDirectoryPage({ params }: { params: Promise<{ locale: string; workspaceId: string }> }) {
  const { locale, workspaceId } = await params;
  if (!isLocale(locale) || !isWorkspaceId(workspaceId)) notFound();
  await requireChatGPTUser(platformPath(locale, "business", "lawyers", workspaceId));
  return <LawyerDirectoryClient locale={locale} accountType="business" workspaceId={workspaceId} />;
}
