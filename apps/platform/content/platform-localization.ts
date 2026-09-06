import type { PlatformLocale } from "../lib/platform/routing";

export type PlatformLocalizedValue<T> = Readonly<{ ru: T; uz: T; en: T }>;

/**
 * Selects an explicitly translated value without pulling the full platform
 * copy catalogue into small, route-specific client bundles.
 */
export const platformLocaleValue = <T>(
  locale: PlatformLocale,
  value: PlatformLocalizedValue<T>,
): T => value[locale];

/**
 * Some legacy endpoints still return RU/UZ prose rather than stable error
 * codes. Keep their existing RU/UZ detail, but never leak that binary fallback
 * into the English UI while those endpoints are migrated independently.
 */
export function platformApiError(
  locale: PlatformLocale,
  serverMessage: string | null | undefined,
  fallback: string,
): string {
  const normalized = serverMessage?.trim();
  return locale === "en" || !normalized ? fallback : normalized;
}
