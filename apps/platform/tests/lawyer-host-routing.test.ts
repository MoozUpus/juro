import assert from "node:assert/strict";
import test from "node:test";

import { lawyerHostTarget } from "../worker/lawyer-host-router";

test("lawyer host maps every clean professional route for RU, UZ, and EN", () => {
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

  for (const locale of ["ru", "uz", "en"] as const) {
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
  assert.equal(root?.searchParams.get("reauth"), null);

  const register = lawyerHostTarget(new URL("https://lawyer.juro.uz/ru/register"));
  assert.equal(register?.pathname, "/ru/auth/register");
  assert.equal(register?.searchParams.get("accountType"), "lawyer");

  const login = lawyerHostTarget(new URL("https://lawyer.juro.uz/uz/login"));
  assert.equal(login?.pathname, "/uz/auth/login");
  assert.equal(login?.searchParams.get("accountType"), "lawyer");

  const englishLogin = lawyerHostTarget(new URL("https://lawyer.juro.uz/en/login"));
  assert.equal(englishLogin?.pathname, "/en/auth/login");
  assert.equal(englishLogin?.searchParams.get("accountType"), "lawyer");

  const englishRegister = lawyerHostTarget(
    new URL("https://lawyer.juro.uz/en/auth/register?returnTo=%2Fen%2Fdashboard"),
  );
  assert.equal(englishRegister?.pathname, "/en/auth/register");
  assert.equal(englishRegister?.searchParams.get("accountType"), "lawyer");
  assert.equal(englishRegister?.searchParams.get("returnTo"), "/en/dashboard");

  const unprefixedRegister = lawyerHostTarget(new URL("https://lawyer.juro.uz/register"));
  assert.equal(unprefixedRegister?.pathname, "/ru/auth/register");
  assert.equal(unprefixedRegister?.searchParams.get("accountType"), "lawyer");

  const verify = lawyerHostTarget(new URL("https://lawyer.juro.uz/verify"));
  assert.equal(verify?.pathname, "/ru/auth/login");
  assert.equal(verify?.searchParams.get("accountType"), "lawyer");

  const onboarding = lawyerHostTarget(new URL("https://lawyer.juro.uz/onboarding"));
  assert.equal(onboarding?.pathname, "/ru/onboarding");
  const englishOnboarding = lawyerHostTarget(
    new URL("https://lawyer.juro.uz/en/onboarding"),
  );
  assert.equal(englishOnboarding?.pathname, "/en/onboarding");

  for (const locale of ["ru", "uz", "en"] as const) {
    const staleIndividualDashboard = lawyerHostTarget(
      new URL(`https://lawyer.juro.uz/${locale}/individual/dashboard?source=legacy-link`),
    );
    assert.equal(staleIndividualDashboard?.pathname, `/${locale}/lawyer/dashboard`);
    assert.equal(staleIndividualDashboard?.searchParams.get("source"), "legacy-link");
  }

  assert.equal(lawyerHostTarget(new URL("https://lawyer.juro.uz/ru/not-a-module")), null);
  assert.equal(lawyerHostTarget(new URL("https://lawyer.juro.uz/not-a-module")), null);
  assert.equal(lawyerHostTarget(new URL("https://lawyer.juro.uz/ru/individual/documents")), null);
  assert.equal(
    lawyerHostTarget(new URL("https://lawyer.juro.uz/en/dashboard"))?.pathname,
    "/en/lawyer/dashboard",
  );
  assert.equal(
    lawyerHostTarget(new URL("https://lawyer.juro.uz/en/lawyer/settings"))?.pathname,
    "/en/lawyer/settings",
  );
});
