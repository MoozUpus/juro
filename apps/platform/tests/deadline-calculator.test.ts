import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateDeadline,
  deadlineCalculationInputSchema,
} from "../lib/platform/deadline-calculator";

test("calendar-day deadline distinguishes inclusive and exclusive source dates", () => {
  const baseInput = {
    sourceDate: "2026-08-01",
    daysCount: 10,
    dayType: "calendar_days" as const,
    includeSourceDate: false,
    rollRule: "none" as const,
    holidays: [],
    holidayCalendarVersion: null,
    safeMarginBusinessDays: 1,
    legalBasis: null,
  };
  const exclusive = calculateDeadline(baseInput);
  const inclusive = calculateDeadline({
    ...baseInput,
    includeSourceDate: true,
  });

  assert.equal(exclusive.dueDate, "2026-08-11");
  assert.equal(inclusive.dueDate, "2026-08-10");
  assert.equal(exclusive.safeEarlierDate, "2026-08-10");
  assert.deepEqual(exclusive.warnings, ["LEGAL_BASIS_UNCONFIRMED"]);
});

test("business-day deadline skips weekends and supplied official-calendar dates", () => {
  const result = calculateDeadline({
    sourceDate: "2026-08-07",
    daysCount: 3,
    dayType: "business_days",
    includeSourceDate: false,
    rollRule: "next_business_day",
    holidays: ["2026-08-10"],
    holidayCalendarVersion: "owner-reviewed-2026-v1",
    safeMarginBusinessDays: 2,
    legalBasis: "Срок требует проверки по применимой норме.",
  });

  assert.equal(result.rawDueDate, "2026-08-13");
  assert.equal(result.dueDate, "2026-08-13");
  assert.equal(result.safeEarlierDate, "2026-08-11");
  assert.deepEqual(result.suppliedHolidayDates, ["2026-08-10"]);
  assert.deepEqual(result.holidayDates, ["2026-08-10"]);
  assert.deepEqual(result.weekendDates, ["2026-08-08", "2026-08-09"]);
  assert.deepEqual(result.warnings, ["HOLIDAY_CALENDAR_UNVERIFIED"]);
});

test("roll rule visibly moves a non-working raw date", () => {
  const result = calculateDeadline({
    sourceDate: "2026-08-01",
    daysCount: 0,
    dayType: "calendar_days",
    includeSourceDate: false,
    rollRule: "next_business_day",
    holidays: ["2026-08-03"],
    holidayCalendarVersion: "owner-reviewed-2026-v1",
    safeMarginBusinessDays: 0,
    legalBasis: null,
  });

  assert.equal(result.rawDueDate, "2026-08-01");
  assert.equal(result.dueDate, "2026-08-04");
  assert.equal(result.rolled, true);
  assert.deepEqual(result.weekendDates, ["2026-08-01", "2026-08-02"]);
  assert.deepEqual(result.holidayDates, ["2026-08-03"]);
});

test("business-calendar calculations remain preliminary without a calendar version", () => {
  const result = calculateDeadline({
    sourceDate: "2026-08-04",
    daysCount: 5,
    dayType: "business_days",
    includeSourceDate: false,
    rollRule: "none",
    holidays: [],
    holidayCalendarVersion: null,
    safeMarginBusinessDays: 1,
    legalBasis: null,
  });

  assert.equal(result.confidence, "preliminary");
  assert.deepEqual(result.warnings, [
    "HOLIDAY_CALENDAR_UNVERIFIED",
    "LEGAL_BASIS_UNCONFIRMED",
  ]);
});

test("deadline input rejects impossible dates and unbounded periods", () => {
  assert.equal(deadlineCalculationInputSchema.safeParse({
    sourceDate: "2026-02-30",
    daysCount: 5,
    dayType: "calendar_days",
    includeSourceDate: false,
    rollRule: "none",
  }).success, false);
  assert.equal(deadlineCalculationInputSchema.safeParse({
    sourceDate: "2026-08-01",
    daysCount: 3651,
    dayType: "calendar_days",
    includeSourceDate: false,
    rollRule: "none",
  }).success, false);
});
