import assert from "node:assert/strict";
import test from "node:test";

import { lawyerHostTarget } from "../worker/lawyer-host-router";

test("lawyer host exposes clean RU and UZ module paths", () => {
  const requests = lawyerHostTarget(new URL("https://lawyer.juro.uz/ru/requests"));
  assert.equal(requests?.pathname, "/ru/lawyer/consultations");
  assert.equal(requests?.searchParams.get("view"), "requests");

  const clients = lawyerHostTarget(new URL("https://lawyer.juro.uz/uz/clients"));
  assert.equal(clients?.pathname, "/uz/lawyer/consultations");
  assert.equal(clients?.searchParams.get("view"), "clients");
});

test("lawyer host fixes registration persona and rejects unknown product pages", () => {
  const register = lawyerHostTarget(new URL("https://lawyer.juro.uz/ru/register"));
  assert.equal(register?.pathname, "/ru/auth/register");
  assert.equal(register?.searchParams.get("accountType"), "lawyer");
  assert.equal(lawyerHostTarget(new URL("https://lawyer.juro.uz/ru/not-a-module")), null);
});
