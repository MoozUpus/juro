import { notFound, permanentRedirect } from "next/navigation";
import { legacyLegalRoutes } from "../../legal-content";

export default async function EnglishLegacyLegalRoute({ params }: { params: Promise<{ legalSlug: string }> }) {
  const { legalSlug } = await params;
  const canonicalSlug = legacyLegalRoutes[legalSlug];
  if (!canonicalSlug) notFound();
  permanentRedirect(`/en/legal/${canonicalSlug}`);
}
