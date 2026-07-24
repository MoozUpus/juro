import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { normalizeEmail, randomOtp } from "../lib/auth/crypto";
import { isAccountType, isLocale, isPlatformModule, platformPath } from "../lib/platform/routing";

test("OTP values are six decimal digits and email normalization is stable", () => {
  for (let index=0; index<200; index++) assert.match(randomOtp(), /^\d{6}$/);
  assert.equal(normalizeEmail("  User@Example.COM "), "user@example.com");
});

test("session cookies are HttpOnly, secure and revocable", async () => {
  const source=await readFile(new URL("../lib/auth/session.ts",import.meta.url),"utf8");
  assert.match(source,/HttpOnly/);assert.match(source,/Secure/);assert.match(source,/SameSite=Lax/);assert.match(source,/Max-Age=0/);assert.doesNotMatch(source,/Domain=/);
});

test("canonical platform route classifier is stable", () => {
  assert.ok(isLocale("ru"));assert.ok(isLocale("uz"));assert.ok(!isLocale("en"));
  assert.ok(isAccountType("individual"));assert.ok(isAccountType("business"));assert.ok(!isAccountType("admin"));
  assert.ok(isPlatformModule("action-plan"));assert.ok(!isPlatformModule("document-builder-test"));
  assert.equal(platformPath("uz","business","document-builder"),"/uz/business/document-builder");
});

test("production migration creates a data snapshot before account and workflow changes", async () => {
  const sql=await readFile(new URL("../drizzle/0004_secure_sandstone.sql",import.meta.url),"utf8");
  const backup=sql.indexOf("CREATE TABLE `__backup_20260724_user_profiles`");
  const alter=sql.indexOf("ALTER TABLE `user_profiles` ADD `locale`");
  assert.ok(backup>=0&&alter>backup);
  for(const table of ["auth_otp_challenges","auth_sessions","cases","action_plans","action_plan_steps","consultation_slots","consultation_bookings"]) assert.ok(sql.includes("CREATE TABLE `" + table + "`"));
});
