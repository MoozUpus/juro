import { notFound } from "next/navigation";

import { redirectLegacyBusinessRoute } from "../../../../../_platform/LegacyBusinessRoute";
import { isLocale } from "../../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";
type Query = { print?: string; consultation?: string; request?: string };

export default async function LegacyBusinessDocumentEdit({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<Query> }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  return redirectLegacyBusinessRoute(locale, ["documents", id, "edit"], await searchParams);
}
