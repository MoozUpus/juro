import { notFound } from "next/navigation";
import { LawyerCallRoom } from "../../../../../../_platform/LawyerCallRoom";
import { requireChatGPTUser } from "../../../../../../chatgpt-auth";
import { isLocale, isWorkspaceId, platformBasePath } from "../../../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";
export default async function BusinessConsultationCallPage({ params }: { params: Promise<{ locale: string; workspaceId: string; consultationId: string }> }) {
  const { locale, workspaceId, consultationId } = await params;
  if (!isLocale(locale) || !isWorkspaceId(workspaceId)) notFound();
  const base = platformBasePath(locale, "business", workspaceId);
  await requireChatGPTUser(`${base}/consultations/call/${encodeURIComponent(consultationId)}`);
  return <LawyerCallRoom locale={locale} consultationId={consultationId} returnPath={`${base}/consultations`} />;
}
