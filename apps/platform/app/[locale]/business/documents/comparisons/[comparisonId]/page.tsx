import { notFound } from "next/navigation";

import { redirectLegacyBusinessRoute } from "../../../../../_platform/LegacyBusinessRoute";
import { isLocale } from "../../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function LegacyBusinessComparison({ params }: { params: Promise<{ locale: string; comparisonId: string }> }) {
  const { locale, comparisonId } = await params;
  if (!isLocale(locale)) notFound();
  return redirectLegacyBusinessRoute(locale, ["documents", "comparisons", comparisonId]);
}
