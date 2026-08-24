import assert from "node:assert/strict";
import test from "node:test";

import { lawyerHostTarget } from "../worker/lawyer-host-router";

test("lawyer host maps every clean professional route for RU and UZ", () => {
  const routes = [
    ["dashboard", "dashboard", null],
    ["ai-chat", "ai-chat", null],
    ["document-builder", "document-builder", null],
    ["document-review", "document-review", null],
    ["monitoring", "monitoring", null],
    ["requests", "consultations", "requests"],
    ["consultations", "consultations", "schedule"],
    ["clients", "consultations", "clients"],
    ["matters", "consultations", "matters"],
    ["calendar", "calendar", null],
    ["messages", "consultations", "messages"],
    ["documents", "consultations", "documents"],
    ["tasks", "consultations", "tasks"],
    ["knowledge", "knowledge", null],
    ["billing", "billing", null],
    ["demo-payments", "demo-payments", null],
    ["application", "profile", null],
    ["status", "profile", null],
    ["profile", "profile", null],
    ["security", "security", null],
    ["help", "help", null],
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
  assert.equal(root?.searchParams.get("reauth"), null);

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

test("lawyer host maps clean document-builder category and template deep links", () => {
  const category = lawyerHostTarget(
    new URL("https://lawyer.juro.uz/ru/document-builder/debt-receipts?caseId=case-1"),
  );
  assert.equal(category?.pathname, "/ru/lawyer/document-builder/debt-receipts");
  assert.equal(category?.search, "?caseId=case-1");

  const template = lawyerHostTarget(
    new URL("https://lawyer.juro.uz/uz/document-builder/debt-receipts/0602001?resume=1"),
  );
  assert.equal(template?.pathname, "/uz/lawyer/document-builder/debt-receipts/0602001");
  assert.equal(template?.search, "?resume=1");

  const unprefixed = lawyerHostTarget(
    new URL("https://lawyer.juro.uz/document-builder/debt-receipts/0602001"),
  );
  assert.equal(unprefixed?.pathname, "/ru/lawyer/document-builder/debt-receipts/0602001");

  assert.equal(
    lawyerHostTarget(new URL("https://lawyer.juro.uz/ru/document-builder/../admin")),
    null,
  );
});

test("lawyer host keeps known nested lawyer aliases on their real modules", () => {
  for (const locale of ["ru", "uz"] as const) {
    const requests = lawyerHostTarget(
      new URL(`https://lawyer.juro.uz/${locale}/lawyer/requests?source=legacy`),
    );
    assert.equal(requests?.pathname, `/${locale}/lawyer/consultations`);
    assert.equal(requests?.searchParams.get("view"), "requests");
    assert.equal(requests?.searchParams.get("source"), "legacy");

    const clients = lawyerHostTarget(
      new URL(`https://lawyer.juro.uz/${locale}/lawyer/clients`),
    );
    assert.equal(clients?.pathname, `/${locale}/lawyer/consultations`);
    assert.equal(clients?.searchParams.get("view"), "clients");

    const dashboard = lawyerHostTarget(
      new URL(`https://lawyer.juro.uz/${locale}/lawyer/dashboard`),
    );
    assert.equal(dashboard?.pathname, `/${locale}/lawyer/dashboard`);
    assert.equal(dashboard?.searchParams.get("view"), null);
  }

  const deepBuilder = lawyerHostTarget(
    new URL("https://lawyer.juro.uz/ru/lawyer/document-builder/debt-receipts/0602001"),
  );
  assert.equal(
    deepBuilder?.pathname,
    "/ru/lawyer/document-builder/debt-receipts/0602001",
  );
});

test("lawyer host preserves only the historical requests call-room deep alias", () => {
  const consultationId = "1d3bcda6-0d69-451d-829e-86a4d32db2f9";
  for (const locale of ["ru", "uz"] as const) {
    const legacyCall = lawyerHostTarget(
      new URL(`https://lawyer.juro.uz/${locale}/lawyer/requests/call/${consultationId}?source=legacy`),
    );
    assert.equal(
      legacyCall?.pathname,
      `/${locale}/lawyer/consultations/call/${consultationId}`,
    );
    assert.equal(legacyCall?.searchParams.get("source"), "legacy");
  }

  const unrelatedDeepAlias = lawyerHostTarget(
    new URL(`https://lawyer.juro.uz/ru/lawyer/clients/call/${consultationId}`),
  );
  assert.equal(
    unrelatedDeepAlias?.pathname,
    `/ru/lawyer/clients/call/${consultationId}`,
  );
});
