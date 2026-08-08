import { notFound } from "next/navigation";

import { redirectLegacyBusinessRoute } from "../../../../_platform/LegacyBusinessRoute";
import { isLocale } from "../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function LegacyBusinessDetail({ params }: { params: Promise<{ locale: string; caseId: string }> }) {
  const { locale, caseId } = await params;
  if (!isLocale(locale)) notFound();
  return redirectLegacyBusinessRoute(locale, ["action-plan", caseId]);
}
