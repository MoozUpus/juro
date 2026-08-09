import { notFound, permanentRedirect } from "next/navigation";
import { isLegalLocale, legacyLegalRoutes, legalPath } from "../../legal-content";

export default async function LegacyLegalRoute({ params }: { params: Promise<{ locale: string; legalSlug: string }> }) {
  const { locale, legalSlug } = await params;
  if (!isLegalLocale(locale)) notFound();
  const canonicalSlug = legacyLegalRoutes[legalSlug];
  if (!canonicalSlug) notFound();
  permanentRedirect(legalPath(locale, canonicalSlug));
}
