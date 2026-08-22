import { notFound, permanentRedirect } from "next/navigation";
import { isLegalLocale, legacyLegalRoutes, legalPath } from "../../legal-content";

export default async function LegacyLegalRoute({ params }: { params: Promise<{ locale: string; legalSlug: string }> }) {
  const { locale, legalSlug } = await params;
  // Vinext 0.0.50 may resolve /lawyers/:profileId through this legacy dynamic
  // route before the more specific public marketplace entry.
  if (locale === "lawyers") permanentRedirect(`/ru/lawyers/${encodeURIComponent(legalSlug)}`);
  if (!isLegalLocale(locale)) notFound();
  const canonicalSlug = legacyLegalRoutes[legalSlug];
  if (!canonicalSlug) notFound();
  permanentRedirect(legalPath(locale, canonicalSlug));
}
