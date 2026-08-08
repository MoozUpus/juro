import assert from "node:assert/strict";
import test from "node:test";

import { addCalendarDays, calendarRangeFromSearch, monthStart, nextMonthStart } from "../lib/platform/calendar";

test("calendar date helpers retain UTC calendar boundaries", () => {
  assert.equal(monthStart("2026-08-02"), "2026-08-01");
  assert.equal(nextMonthStart("2026-12-21"), "2027-01-01");
  assert.equal(addCalendarDays("2026-02-28", 1), "2026-03-01");
});

test("calendar API accepts a bounded ISO range only", () => {
  const range = calendarRangeFromSearch(new URLSearchParams("from=2026-08-01&to=2026-09-01"), new Date("2026-08-02T12:00:00Z"));
  assert.deepEqual(range, { from: "2026-08-01", to: "2026-09-01", today: "2026-08-02" });
  assert.throws(() => calendarRangeFromSearch(new URLSearchParams("from=2026-02-30&to=2026-03-01")));
  assert.throws(() => calendarRangeFromSearch(new URLSearchParams("from=2025-01-01&to=2027-01-02")));
});
