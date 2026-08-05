const ISO_CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function uzbekistanCalendarDate(value = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
}

/**
 * Converts an explicit Uzbekistan calendar date to a stable midday instant.
 * Midday avoids a date-boundary shift when comparing ISO timestamps while the
 * original YYYY-MM-DD remains the user-visible legal event date.
 */
export function parseLegalApplicabilityDate(
  value: unknown,
  now = new Date(),
): Date | null {
  if (typeof value !== "string" || !ISO_CALENDAR_DATE.test(value)) return null;
  const candidate = new Date(`${value}T12:00:00+05:00`);
  if (!Number.isFinite(candidate.getTime())) return null;
  const [year, month, day] = value.split("-").map(Number);
  const tashkent = uzbekistanCalendarDate(candidate);
  if (tashkent !== value || year! < 1900 || month! < 1 || day! < 1) return null;
  if (candidate.getTime() > now.getTime() + 24 * 60 * 60 * 1_000) return null;
  return candidate;
}
