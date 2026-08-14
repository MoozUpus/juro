const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CALENDAR_WINDOW_DAYS = 367;

function fromUtcDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function tashkentToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

export function addCalendarDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtcDate(date);
}

export function monthStart(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

export function nextMonthStart(value: string): string {
  const [year, month] = monthStart(value).split("-").map(Number);
  return fromUtcDate(new Date(Date.UTC(year, month, 1)));
}

export function previousMonthStart(value: string): string {
  const [year, month] = monthStart(value).split("-").map(Number);
  return fromUtcDate(new Date(Date.UTC(year, month - 2, 1)));
}

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && fromUtcDate(parsed) === value;
}

export type CalendarRange = { from: string; to: string; today: string };

export function calendarRangeFromSearch(search: URLSearchParams, now = new Date()): CalendarRange {
  const today = tashkentToday(now);
  const defaultFrom = monthStart(today);
  const defaultTo = nextMonthStart(today);
  const from = search.get("from") ?? defaultFrom;
  const to = search.get("to") ?? defaultTo;
  if (!isValidIsoDate(from) || !isValidIsoDate(to)) throw new Error("INVALID_CALENDAR_RANGE");
  const days = Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000);
  if (days < 1 || days > MAX_CALENDAR_WINDOW_DAYS) throw new Error("INVALID_CALENDAR_RANGE");
  return { from, to, today };
}
