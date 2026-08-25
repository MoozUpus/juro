import type { Metadata } from "next";
import LawyersPage from "../../[locale]/lawyers/page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Legal professionals",
  description: "JURO’s public catalogue of professionals: specialisms, experience, languages and availability.",
  alternates: { canonical: "https://juro.uz/en/lawyers", languages: { ru: "https://juro.uz/ru/lawyers", uz: "https://juro.uz/uz/lawyers", en: "https://juro.uz/en/lawyers", "x-default": "https://juro.uz/ru/lawyers" } },
  openGraph: { title: "Legal professionals", description: "JURO’s public catalogue of professionals: specialisms, experience, languages and availability.", url: "https://juro.uz/en/lawyers", siteName: "JURO", type: "website", images: [{ url: "/juro-og.png", width: 1681, height: 909, alt: "JURO legal professionals" }] },
  twitter: { card: "summary_large_image", title: "Legal professionals", description: "JURO’s public catalogue of professionals: specialisms, experience, languages and availability.", images: ["/juro-og.png"] },
};

export default async function EnglishLawyersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <LawyersPage params={Promise.resolve({ locale: "en" })} searchParams={searchParams} />;
}
