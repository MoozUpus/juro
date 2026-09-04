import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  resolveThemePreference,
  themePreferenceCookie,
  themePreferenceForUser,
} from "../lib/platform/theme-preference";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

test("account theme resolves legacy system values before authentication redirects", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const now = "2026-09-04T12:00:00.000Z";
  try {
    sqlite.prepare(
      `INSERT INTO user_profiles (
         id,email,locale,theme_preference,created_at,updated_at
       ) VALUES (?,?,'ru','system',?,?)`,
    ).run("theme-system", "system@example.test", now, now);
    sqlite.prepare(
      `INSERT INTO user_profiles (
         id,email,locale,theme_preference,created_at,updated_at
       ) VALUES (?,?,'ru','dark',?,?)`,
    ).run("theme-dark", "dark@example.test", now, now);
    assert.equal(await themePreferenceForUser(d1, "theme-system"), "light");
    assert.equal(await themePreferenceForUser(d1, "theme-dark"), "dark");
    assert.equal(resolveThemePreference("unexpected"), "light");
  } finally {
    sqlite.close();
  }
});

test("theme cookie is shared only by secure JURO hosts", () => {
  assert.equal(
    themePreferenceCookie("dark", new URL("https://app.juro.uz/login")),
    "juro_theme=dark; Path=/; Max-Age=31536000; SameSite=Lax; Domain=.juro.uz; Secure",
  );
  assert.equal(
    themePreferenceCookie("light", new URL("http://localhost:3000/login")),
    "juro_theme=light; Path=/; Max-Age=31536000; SameSite=Lax",
  );
});

test("password, OTP, and MFA success paths return and set the resolved theme", () => {
  const sources = [
    "../app/api/auth/password-login/route.ts",
    "../app/api/auth/verify-otp/route.ts",
    "../app/api/auth/verify-mfa/route.ts",
  ].map(path => readFileSync(new URL(path, import.meta.url), "utf8"));
  for (const source of sources) {
    assert.match(source, /themePreference/u);
    assert.match(source, /themePreferenceCookie/u);
  }
  const mfaService = readFileSync(
    new URL("../lib/auth/mfa-service.ts", import.meta.url),
    "utf8",
  );
  assert.match(mfaService, /u\.theme_preference AS themePreference/u);
  assert.match(mfaService, /themePreference: challenge\.themePreference/u);
});
