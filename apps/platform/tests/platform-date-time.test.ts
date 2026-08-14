import assert from "node:assert/strict";
import test from "node:test";

import {
  PLATFORM_TIME_ZONE,
  formatPlatformDate,
  formatPlatformDateTime,
  platformDate,
  platformIntlLocale,
} from "../lib/platform/date-time";

test("platform date formatting uses Uzbek Latin and the product timezone", () => {
  assert.equal(platformIntlLocale("ru"), "ru-RU");
  assert.equal(platformIntlLocale("uz"), "uz-Latn-UZ");

  const options = { day: "2-digit", month: "2-digit", year: "numeric" } as const;
  const uzbek = formatPlatformDate("2026-08-12", "uz", options);
  const russian = formatPlatformDate("2026-08-12", "ru", options);
  assert.match(uzbek, /12/);
  assert.match(uzbek, /2026/);
  assert.match(russian, /12/);
  assert.match(russian, /2026/);

  assert.equal(platformDate("2026-08-12")?.toISOString(), "2026-08-12T12:00:00.000Z");
  assert.equal(PLATFORM_TIME_ZONE, "Asia/Tashkent");
});

test("platform date helpers preserve a calendar date and reject invalid input safely", () => {
  assert.equal(platformDate("not a date"), null);
  assert.equal(formatPlatformDate("not a date", "uz"), "");
  assert.match(formatPlatformDateTime("2026-08-12T20:30:00.000Z", "uz"), /13/);
});
