import type { MetadataRoute } from "next";
import { knowledgeSlugs } from "../content/knowledge";
import { legalPath, legalSlugs } from "./legal-content";

export default function sitemap(): MetadataRoute.Sitemap {
  const updated = new Date("2026-08-19T00:00:00+05:00");
  return [
    { url: "https://juro.uz/ru", lastModified: updated, changeFrequency: "weekly", priority: 1 },
    { url: "https://juro.uz/uz", lastModified: updated, changeFrequency: "weekly", priority: 1 },
    { url: "https://juro.uz/en", lastModified: updated, changeFrequency: "weekly", priority: 1 },
    ...(["ru", "uz", "en"] as const).flatMap((locale) => [
      {
        url: `https://juro.uz/${locale}/trust`,
        lastModified: updated,
        changeFrequency: "monthly" as const,
        priority: 0.75,
      },
      {
        url: `https://juro.uz/${locale}/video`,
        lastModified: updated,
        changeFrequency: "monthly" as const,
        priority: 0.7,
      },
      {
        url: `https://juro.uz/${locale}/lawyers`,
        lastModified: updated,
        changeFrequency: "daily" as const,
        priority: 0.75,
      },
      {
        url: `https://juro.uz/${locale}/legal`,
        lastModified: updated,
        changeFrequency: "monthly" as const,
        priority: 0.65,
      },
      ...legalSlugs.map((slug) => ({
        url: locale === "en" ? `https://juro.uz/en/legal/${slug}` : `https://juro.uz${legalPath(locale, slug)}`,
        lastModified: updated,
        changeFrequency: "monthly" as const,
        priority: 0.5,
      })),
      ...knowledgeSlugs.map((slug) => ({
        url: `https://juro.uz/${locale}/knowledge/${slug}`,
        lastModified: updated,
        changeFrequency: "monthly" as const,
        priority: 0.65,
      })),
    ]),
  ];
}
