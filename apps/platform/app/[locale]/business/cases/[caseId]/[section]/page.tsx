import { notFound } from "next/navigation";

import { redirectLegacyBusinessRoute } from "../../../../../_platform/LegacyBusinessRoute";
import { isCaseSection, isLocale } from "../../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function LegacyBusinessCaseSection({
  params,
}: {
  params: Promise<{ locale: string; caseId: string; section: string }>;
}) {
  const { locale, caseId, section } = await params;
  if (!isLocale(locale) || !isCaseSection(section)) notFound();
  return redirectLegacyBusinessRoute(locale, ["cases", caseId, section]);
}
