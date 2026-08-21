import assert from "node:assert/strict";
import test from "node:test";

import { lawyerHostTarget } from "../worker/lawyer-host-router";

test("lawyer host maps every clean professional route for RU and UZ", () => {
  const routes = [
    ["dashboard", "dashboard", null],
    ["requests", "consultations", "requests"],
    ["consultations", "consultations", "schedule"],
    ["clients", "consultations", "clients"],
    ["matters", "consultations", "matters"],
    ["calendar", "calendar", null],
    ["messages", "consultations", "messages"],
    ["documents", "consultations", "documents"],
    ["tasks", "consultations", "tasks"],
    ["application", "profile", null],
    ["status", "profile", null],
    ["profile", "profile", null],
    ["settings", "settings", null],
  ] as const;

  for (const locale of ["ru", "uz"] as const) {
    for (const [path, module, view] of routes) {
      const target = lawyerHostTarget(
        new URL(`https://lawyer.juro.uz/${locale}/${path}`),
      );
      assert.equal(target?.pathname, `/${locale}/lawyer/${module}`);
      assert.equal(target?.searchParams.get("view"), view);
    }
  }

  for (const [path, module, view] of routes) {
    const target = lawyerHostTarget(
      new URL(`https://lawyer.juro.uz/${path}`),
    );
    assert.equal(target?.pathname, `/ru/lawyer/${module}`);
    assert.equal(target?.searchParams.get("view"), view);
  }
});

test("lawyer host fixes registration persona and rejects unknown product pages", () => {
  const root = lawyerHostTarget(new URL("https://lawyer.juro.uz/"));
  assert.equal(root?.pathname, "/ru/auth/login");
  assert.equal(root?.searchParams.get("accountType"), "lawyer");
  assert.equal(root?.searchParams.get("reauth"), "1");

  const register = lawyerHostTarget(new URL("https://lawyer.juro.uz/ru/register"));
  assert.equal(register?.pathname, "/ru/auth/register");
  assert.equal(register?.searchParams.get("accountType"), "lawyer");

  const login = lawyerHostTarget(new URL("https://lawyer.juro.uz/uz/login"));
  assert.equal(login?.pathname, "/uz/auth/login");
  assert.equal(login?.searchParams.get("accountType"), "lawyer");

  const unprefixedRegister = lawyerHostTarget(new URL("https://lawyer.juro.uz/register"));
  assert.equal(unprefixedRegister?.pathname, "/ru/auth/register");
  assert.equal(unprefixedRegister?.searchParams.get("accountType"), "lawyer");

  const verify = lawyerHostTarget(new URL("https://lawyer.juro.uz/verify"));
  assert.equal(verify?.pathname, "/ru/auth/login");
  assert.equal(verify?.searchParams.get("accountType"), "lawyer");

  const onboarding = lawyerHostTarget(new URL("https://lawyer.juro.uz/onboarding"));
  assert.equal(onboarding?.pathname, "/ru/onboarding");

  assert.equal(lawyerHostTarget(new URL("https://lawyer.juro.uz/ru/not-a-module")), null);
  assert.equal(lawyerHostTarget(new URL("https://lawyer.juro.uz/not-a-module")), null);
});
