import { notFound } from "next/navigation";

import { redirectLegacyBusinessRoute } from "../../../_platform/LegacyBusinessRoute";
import { isLocale } from "../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function LegacyBusinessEntry({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return redirectLegacyBusinessRoute(locale, ["documents"]);
}
