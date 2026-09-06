import type { Metadata } from "next";

import { isLocale, type PlatformLocale } from "../../lib/platform/routing";

const localeMetadata: Record<PlatformLocale, { title: string; description: string }> = {
  ru: {
    title: "JURO — защищённое юридическое пространство",
    description: "Личный кабинет цифровой юридической платформы JURO.",
  },
  uz: {
    title: "JURO — himoyalangan huquqiy ish maydoni",
    description: "JURO raqamli huquqiy platformasining shaxsiy kabineti.",
  },
  en: {
    title: "JURO — secure legal workspace",
    description: "Your secure workspace on the JURO AI LegalTech platform.",
  },
};

export async function generateMetadata({ params }: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return localeMetadata[locale];
}

export default function LocalizedPlatformLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
