import { notFound } from "next/navigation";

import { redirectLegacyBusinessRoute } from "../../../../../_platform/LegacyBusinessRoute";
import { isLocale } from "../../../../../../lib/platform/routing";

export const dynamic = "force-dynamic";

export default async function LegacyBusinessTemplate({ params }: { params: Promise<{ locale: string; categorySlug: string; documentCode: string }> }) {
  const { locale, categorySlug, documentCode } = await params;
  if (!isLocale(locale)) notFound();
  return redirectLegacyBusinessRoute(locale, ["document-builder", categorySlug, documentCode]);
}
