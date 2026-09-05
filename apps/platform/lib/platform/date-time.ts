/**
 * User-facing dates are always expressed in the product's operating timezone.
 * Keep this separate from legal date arithmetic: a `YYYY-MM-DD` value is a
 * calendar date, not a UTC timestamp, so it is parsed at noon UTC to preserve
 * the intended day before it is displayed in Asia/Tashkent.
 */
export type PlatformDateLocale = "ru" | "uz" | "en";

export const PLATFORM_TIME_ZONE = "Asia/Tashkent";

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function platformIntlLocale(
  locale: PlatformDateLocale,
): "ru-RU" | "uz-Latn-UZ" | "en-GB" {
  return locale === "uz"
    ? "uz-Latn-UZ"
    : locale === "en"
      ? "en-GB"
      : "ru-RU";
}

export function platformDate(value: Date | string): Date | null {
  const parsed = value instanceof Date
    ? new Date(value.getTime())
    : CALENDAR_DATE.test(value)
      ? new Date(`${value}T12:00:00.000Z`)
      : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatPlatformDate(
  value: Date | string,
  locale: PlatformDateLocale,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
): string {
  const date = platformDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat(platformIntlLocale(locale), {
    ...options,
    timeZone: options.timeZone ?? PLATFORM_TIME_ZONE,
  }).format(date);
}

export function formatPlatformDateTime(value: Date | string, locale: PlatformDateLocale): string {
  return formatPlatformDate(value, locale, { dateStyle: "medium", timeStyle: "short" });
}

export function formatPlatformMonth(value: Date | string, locale: PlatformDateLocale): string {
  return formatPlatformDate(value, locale, { month: "long", year: "numeric" });
}

export function formatPlatformLongDate(value: Date | string, locale: PlatformDateLocale): string {
  return formatPlatformDate(value, locale, { day: "numeric", month: "long", year: "numeric" });
}

export function formatPlatformDayMonth(value: Date | string, locale: PlatformDateLocale): string {
  return formatPlatformDate(value, locale, { day: "2-digit", month: "short" });
}
