import assert from "node:assert/strict";
import test from "node:test";
import { POST as passwordLogin } from "../app/api/auth/password-login/route";
import { POST as requestOtp } from "../app/api/auth/request-otp/route";
import { POST as resetPassword } from "../app/api/auth/reset-password/route";
import { POST as verifyMfa } from "../app/api/auth/verify-mfa/route";
import { POST as verifyOtp } from "../app/api/auth/verify-otp/route";
import {
  authLocaleFromRequest,
  localizedRequestFormatError,
  type RequestAuthLocale,
} from "../lib/auth/request-locale";

const handlers = [
  ["password-login", passwordLogin],
  ["request-otp", requestOtp],
  ["reset-password", resetPassword],
  ["verify-otp", verifyOtp],
  ["verify-mfa", verifyMfa],
] as const;

function malformedRequest(route: string, locale: RequestAuthLocale): Request {
  return new Request(`https://app.juro.uz/api/auth/${route}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://app.juro.uz",
      "sec-fetch-site": "same-origin",
      "x-juro-csrf": "1",
      "x-juro-locale": locale,
    },
    body: "{",
  });
}

test("auth request locale uses explicit, route, referrer and browser signals safely", () => {
  assert.equal(authLocaleFromRequest(new Request("https://app.juro.uz/api?lang=en")), "en");
  assert.equal(authLocaleFromRequest(new Request("https://app.juro.uz/api", {
    headers: {
      "x-juro-locale": "uz",
      referer: "https://app.juro.uz/en/auth/login",
      "accept-language": "ru-RU,ru;q=0.9",
    },
  })), "uz");
  assert.equal(authLocaleFromRequest(new Request("https://app.juro.uz/api", {
    headers: { referer: "https://app.juro.uz/en/auth/register" },
  })), "en");
  assert.equal(authLocaleFromRequest(new Request("https://app.juro.uz/api", {
    headers: {
      referer: "https://attacker.example/uz/auth/login",
      "accept-language": "en-US,en;q=0.9",
    },
  })), "en");
  assert.equal(authLocaleFromRequest(new Request("https://app.juro.uz/api")), "ru");
});

test("all auth endpoints localize malformed payload errors from the request locale", async () => {
  const messages = {
    ru: "Проверьте формат запроса.",
    uz: "So‘rov formatini tekshiring.",
    en: "Check the request format.",
  } as const;
  for (const locale of ["ru", "uz", "en"] as const) {
    for (const [route, handler] of handlers) {
      const request = malformedRequest(route, locale);
      assert.equal(localizedRequestFormatError(request), messages[locale]);
      const response = await handler(request);
      assert.equal(response.status, 400, `${route}:${locale}`);
      assert.deepEqual(await response.json(), {
        code: "INVALID_JSON",
        error: messages[locale],
      }, `${route}:${locale}`);
    }
  }
});
