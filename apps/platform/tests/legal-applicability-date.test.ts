import assert from "node:assert/strict";
import test from "node:test";

import {
  parseLegalApplicabilityDate,
  uzbekistanCalendarDate,
} from "../lib/legal/applicability-date";

test("legal applicability date accepts a real Uzbekistan date and rejects invalid or future values", () => {
  const now = new Date("2026-08-05T12:00:00.000Z");
  assert.equal(
    parseLegalApplicabilityDate("2020-02-29", now)?.toISOString(),
    "2020-02-28T19:00:00.000Z",
  );
  assert.equal(parseLegalApplicabilityDate("2021-02-29", now), null);
  assert.equal(parseLegalApplicabilityDate("2026-08-07", now), null);
  assert.equal(parseLegalApplicabilityDate("05.08.2026", now), null);
  assert.equal(parseLegalApplicabilityDate(undefined, now), null);
  assert.equal(uzbekistanCalendarDate(new Date("2026-08-04T20:30:00.000Z")), "2026-08-05");
});
