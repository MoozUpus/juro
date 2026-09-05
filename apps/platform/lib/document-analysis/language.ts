import type { PlatformLocale } from "../platform/routing";

export type SupportedDocumentAnalysisLocale = "ru" | "uz";

/**
 * English workspace chrome is supported independently from legal-analysis
 * output. Until the provider has a verified English legal prompt, English
 * users receive a visible RU/UZ selector and Russian is its initial value.
 */
export function defaultDocumentAnalysisLocale(locale: PlatformLocale): SupportedDocumentAnalysisLocale {
  const defaults: Record<PlatformLocale, SupportedDocumentAnalysisLocale> = {
    ru: "ru",
    uz: "uz",
    en: "ru",
  };
  return defaults[locale];
}
