import type { PlatformLocale } from "../platform/routing";

export type AiOutputLocale = PlatformLocale;
export type AiDiscoveryLocale = Exclude<AiOutputLocale, "en">;

export function aiText(
  locale: AiOutputLocale,
  ru: string,
  uz: string,
  en: string,
): string {
  if (locale === "en") return en;
  return locale === "uz" ? uz : ru;
}

export function parseAiOutputLocale(value: unknown): AiOutputLocale {
  if (value === "uz" || value === "en") return value;
  return "ru";
}

/**
 * Lex.uz retrieval remains deliberately constrained to the source languages
 * supported by the verified retrieval stack. English controls the answer
 * language, while official-source discovery uses Russian queries until the
 * retrieval boundary explicitly supports English without weakening provenance.
 */
export function aiDiscoveryLocale(locale: AiOutputLocale): AiDiscoveryLocale {
  return locale === "uz" ? "uz" : "ru";
}
