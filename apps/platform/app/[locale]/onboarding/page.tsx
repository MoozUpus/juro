import { notFound } from "next/navigation";
import { isLocale } from "../../../lib/platform/routing";
import { OnboardingScreen } from "../../onboarding/page";

export const dynamic = "force-dynamic";

export default async function LocalizedOnboarding({ params }: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <OnboardingScreen locale={locale} />;
}
