import assert from "node:assert/strict";
import test from "node:test";

import { ApiAuthError } from "../lib/auth/safe-write";
import { PlatformStaffAccessError } from "../lib/auth/staff-access";
import { withPlatformStaffErrors } from "../lib/auth/staff-http";

test("staff HTTP wrapper turns rejected writes into private no-store responses", async () => {
  const handler = withPlatformStaffErrors(async () => {
    throw new ApiAuthError("Request has no valid CSRF proof.", 403);
  });

  const response = await handler(new Request("https://app.juro.uz/api/platform/admin/handoff"));

  assert.equal(response.status, 403);
  assert.match(response.headers.get("cache-control") ?? "", /private, no-store/u);
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.deepEqual(await response.json(), {
    code: "REQUEST_REJECTED",
    error: "Запрос отклонён проверкой безопасности.",
  });
});

test("staff HTTP wrapper does not turn missing session errors into 500", async () => {
  const handler = withPlatformStaffErrors(async () => {
    throw new ApiAuthError();
  });

  const response = await handler(new Request("https://app.juro.uz/api/platform/admin/handoff?lang=uz"));

  assert.equal(response.status, 401);
  assert.match(response.headers.get("cache-control") ?? "", /private, no-store/u);
  assert.deepEqual(await response.json(), {
    code: "UNAUTHORIZED",
    error: "Bu amal uchun JURO hisobiga kiring.",
  });
});

test("staff HTTP wrapper returns English-safe authorization errors", async () => {
  const rejected = withPlatformStaffErrors(async () => {
    throw new ApiAuthError("Request has no valid CSRF proof.", 403);
  });
  const rejectedResponse = await rejected(new Request(
    "https://app.juro.uz/api/platform/admin/handoff?lang=en",
  ));
  assert.deepEqual(await rejectedResponse.json(), {
    code: "REQUEST_REJECTED",
    error: "The request was rejected by the security check.",
  });

  const denied = withPlatformStaffErrors(async () => {
    throw new PlatformStaffAccessError();
  });
  const deniedResponse = await denied(new Request(
    "https://app.juro.uz/api/platform/admin/handoff",
    { headers: { "x-juro-locale": "en" } },
  ));
  assert.equal(deniedResponse.status, 403);
  assert.deepEqual(await deniedResponse.json(), {
    code: "PLATFORM_STAFF_ACCESS_DENIED",
    error: "Your account does not have access to this area.",
  });
});
