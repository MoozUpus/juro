import { notFound } from "next/navigation";
import { LawyerCallRoom } from "../../../../../_platform/LawyerCallRoom";
import { requireChatGPTUser } from "../../../../../chatgpt-auth";
import { isLocale, isPersonalAccountType, platformBasePath } from "../../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";
export default async function ConsultationCallPage({ params }: { params: Promise<{ locale: string; accountType: string; consultationId: string }> }) {
  const { locale, accountType, consultationId } = await params;
  if (!isLocale(locale) || !isPersonalAccountType(accountType)) notFound();
  const base = platformBasePath(locale, accountType);
  await requireChatGPTUser(`${base}/consultations/call/${encodeURIComponent(consultationId)}`);
  return <LawyerCallRoom locale={locale} consultationId={consultationId} returnPath={`${base}/consultations`} />;
}
