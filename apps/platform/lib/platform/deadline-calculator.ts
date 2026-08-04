import { z } from "zod";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Invalid calendar date");

export const deadlineCalculationInputSchema = z.object({
  sourceDate: isoDateSchema,
  daysCount: z.number().int().min(0).max(3650),
  dayType: z.enum(["calendar_days", "business_days"]),
  includeSourceDate: z.boolean(),
  rollRule: z.enum(["none", "next_business_day", "previous_business_day"]),
  holidays: z.array(isoDateSchema).max(400).default([]),
  holidayCalendarVersion: z.string().trim().min(1).max(120).nullable().default(null),
  safeMarginBusinessDays: z.number().int().min(0).max(30).default(1),
  legalBasis: z.string().trim().min(1).max(500).nullable().default(null),
}).strict();

export type DeadlineCalculationInput = z.infer<typeof deadlineCalculationInputSchema>;

export type DeadlineCalculationResult = {
  sourceDate: string;
  daysCount: number;
  dayType: "calendar_days" | "business_days";
  includeSourceDate: boolean;
  rollRule: "none" | "next_business_day" | "previous_business_day";
  rawDueDate: string;
  dueDate: string;
  safeEarlierDate: string;
  weekendDates: string[];
  suppliedHolidayDates: string[];
  holidayDates: string[];
  rolled: boolean;
  holidayCalendarVersion: string | null;
  legalBasis: string | null;
  confidence: "preliminary";
  warnings: Array<
    "HOLIDAY_CALENDAR_UNVERIFIED"
    | "LEGAL_BASIS_UNCONFIRMED"
    | "NON_WORKING_DUE_DATE"
  >;
  calculationMethod: string;
};

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isWeekend(value: Date): boolean {
  return value.getUTCDay() === 0 || value.getUTCDay() === 6;
}

function isBusinessDay(value: Date, holidays: Set<string>): boolean {
  return !isWeekend(value) && !holidays.has(formatDate(value));
}

function moveToBusinessDay(
  value: Date,
  direction: 1 | -1,
  holidays: Set<string>,
): Date {
  let cursor = new Date(value);
  while (!isBusinessDay(cursor, holidays)) cursor = addDays(cursor, direction);
  return cursor;
}

function subtractBusinessDays(value: Date, days: number, holidays: Set<string>): Date {
  let cursor = new Date(value);
  let remaining = days;
  while (remaining > 0) {
    cursor = addDays(cursor, -1);
    if (isBusinessDay(cursor, holidays)) remaining -= 1;
  }
  return cursor;
}

function datesBetween(from: Date, to: Date): Date[] {
  const direction = from.getTime() <= to.getTime() ? 1 : -1;
  const dates: Date[] = [];
  let cursor = new Date(from);
  while (direction === 1 ? cursor <= to : cursor >= to) {
    dates.push(cursor);
    cursor = addDays(cursor, direction);
  }
  return dates;
}

export function calculateDeadline(rawInput: DeadlineCalculationInput): DeadlineCalculationResult {
  const input = deadlineCalculationInputSchema.parse(rawInput);
  const holidays = new Set(input.holidays);
  const source = parseDate(input.sourceDate);
  let rawDue: Date;

  if (input.daysCount === 0) {
    rawDue = source;
  } else if (input.dayType === "calendar_days") {
    rawDue = addDays(source, input.daysCount - (input.includeSourceDate ? 1 : 0));
  } else {
    let cursor = input.includeSourceDate ? source : addDays(source, 1);
    let remaining = input.daysCount;
    while (remaining > 0) {
      if (isBusinessDay(cursor, holidays)) remaining -= 1;
      if (remaining > 0) cursor = addDays(cursor, 1);
    }
    rawDue = cursor;
  }

  let due = new Date(rawDue);
  if (input.rollRule === "next_business_day") {
    due = moveToBusinessDay(due, 1, holidays);
  } else if (input.rollRule === "previous_business_day") {
    due = moveToBusinessDay(due, -1, holidays);
  }

  const countedDates = datesBetween(source, due);
  const weekendDates = countedDates.filter(isWeekend).map(formatDate);
  const holidayDates = countedDates
    .filter((date) => holidays.has(formatDate(date)))
    .map(formatDate);
  const warnings: DeadlineCalculationResult["warnings"] = [];
  const reliesOnBusinessCalendar = input.dayType === "business_days" || input.rollRule !== "none";
  if (reliesOnBusinessCalendar) {
    warnings.push("HOLIDAY_CALENDAR_UNVERIFIED");
  }
  if (!input.legalBasis) warnings.push("LEGAL_BASIS_UNCONFIRMED");
  if (input.rollRule === "none" && !isBusinessDay(due, holidays)) {
    warnings.push("NON_WORKING_DUE_DATE");
  }

  const methodParts = [
    input.dayType,
    input.includeSourceDate ? "source_included" : "source_excluded",
    input.rollRule,
    `safe_margin_${input.safeMarginBusinessDays}_business_days`,
  ];
  return {
    sourceDate: input.sourceDate,
    daysCount: input.daysCount,
    dayType: input.dayType,
    includeSourceDate: input.includeSourceDate,
    rollRule: input.rollRule,
    rawDueDate: formatDate(rawDue),
    dueDate: formatDate(due),
    safeEarlierDate: formatDate(subtractBusinessDays(due, input.safeMarginBusinessDays, holidays)),
    weekendDates,
    suppliedHolidayDates: [...holidays].sort(),
    holidayDates,
    rolled: rawDue.getTime() !== due.getTime(),
    holidayCalendarVersion: input.holidayCalendarVersion,
    legalBasis: input.legalBasis,
    confidence: "preliminary",
    warnings,
    calculationMethod: methodParts.join(";"),
  };
}
