import type { MetadataRoute } from "next";
import { legalSlugs } from "./legal-content";

export default function sitemap(): MetadataRoute.Sitemap {
  const updated = new Date("2026-07-24T00:00:00+05:00");
  return [
    { url: "https://juro.uz/", lastModified: updated, changeFrequency: "weekly", priority: 1 },
    ...(["ru", "uz"] as const).flatMap(locale => legalSlugs.map(slug => ({ url: `https://juro.uz/${locale}/${slug}`, lastModified: updated, changeFrequency: "monthly" as const, priority: .5 }))),
  ];
}
