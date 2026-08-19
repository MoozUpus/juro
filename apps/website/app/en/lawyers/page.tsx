import type { Metadata } from "next";
import LawyersPage from "../../[locale]/lawyers/page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Legal professionals",
  description: "JURO’s public catalogue of professionals: specialisms, experience, languages and availability.",
  alternates: { canonical: "https://juro.uz/en/lawyers", languages: { ru: "https://juro.uz/ru/lawyers", uz: "https://juro.uz/uz/lawyers", en: "https://juro.uz/en/lawyers", "x-default": "https://juro.uz/ru/lawyers" } },
};

export default async function EnglishLawyersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <LawyersPage params={Promise.resolve({ locale: "en" })} searchParams={searchParams} />;
}
