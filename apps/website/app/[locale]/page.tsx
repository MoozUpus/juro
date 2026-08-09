import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CinematicLandingPage } from "../components/cinematic/CinematicLandingPage";
import { ru } from "../../content/ru";
import { uz } from "../../content/uz";
import type { Language } from "../../content/types";

type Props = { params: Promise<{ locale: string }> };

function parseLocale(value: string): Language | null {
  return value === "ru" || value === "uz" ? value : null;
}

export function generateStaticParams() {
  return [{ locale: "ru" }, { locale: "uz" }];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = parseLocale(rawLocale);
  if (!locale) return {};
  const content = locale === "ru" ? ru : uz;
  const canonical = `https://juro.uz/${locale}`;
  return {
    title: content.meta.title,
    description: content.meta.description,
    alternates: {
      canonical,
      languages: {
        ru: "https://juro.uz/ru",
        uz: "https://juro.uz/uz",
        "x-default": "https://juro.uz/ru",
      },
    },
    openGraph: {
      title: content.meta.title,
      description: content.meta.description,
      url: canonical,
      siteName: "JURO",
      locale: locale === "ru" ? "ru_RU" : "uz_UZ",
      alternateLocale: [locale === "ru" ? "uz_UZ" : "ru_RU"],
      type: "website",
      images: [{ url: "/juro-og.png", width: 1681, height: 909, alt: content.meta.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: content.meta.title,
      description: content.meta.description,
      images: ["/juro-og.png"],
    },
  };
}

export default async function LocalizedHome({ params }: Props) {
  const { locale: rawLocale } = await params;
  const locale = parseLocale(rawLocale);
  if (!locale) notFound();
  return <CinematicLandingPage language={locale} />;
}
