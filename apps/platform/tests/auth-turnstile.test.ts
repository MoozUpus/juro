import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  turnstileClientFailure,
  turnstileClientRetryMode,
} from "../lib/auth/turnstile-client";
import {
  authTurnstileActions,
  validateAuthTurnstile,
  validateTurnstile,
} from "../lib/auth/turnstile";

const authStyles = fs.readFileSync("app/_auth/auth.css", "utf8");
const turnstileWidget = fs.readFileSync(
  "app/_auth/TurnstileWidget.tsx",
  "utf8",
);

test("Turnstile delegates cross-origin messaging to the official explicit-render client", () => {
  assert.match(
    turnstileWidget,
    /https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit/,
  );
  assert.doesNotMatch(turnstileWidget, /\.postMessage\s*\(/);
  assert.match(turnstileWidget, /turnstileWindow\.turnstile\.render\(/);
  assert.match(turnstileWidget, /turnstileWindow\.turnstile\.remove\(/);
});

test("Turnstile never passes Cloudflare an unsupported Uzbek language code", () => {
  assert.match(
    turnstileWidget,
    /return locale === "uz" \? "auto" : locale;/,
  );
  assert.match(
    turnstileWidget,
    /language: turnstileLanguage\(locale\)/,
  );
  assert.doesNotMatch(turnstileWidget, /language: locale,/);
});

test("Turnstile reserves its challenge height before the provider renders", () => {
  assert.match(
    authStyles,
    /\.auth-turnstile\s*>\s*div:first-child,[\s\S]*?min-height:\s*65px\s*!important;/,
  );
  assert.match(
    authStyles,
    /@media\s*\(max-width:\s*840px\)[\s\S]*?\.auth-page\s*\{[^}]*grid-template-rows:\s*auto auto;[^}]*align-content:\s*start;/,
  );
});

test("auth utilities stay in document flow and retain accessible touch targets", () => {
  assert.match(
    authStyles,
    /\.auth-utilities\s*\{[^}]*display:\s*flex;[^}]*min-height:\s*44px;[^}]*margin-bottom:\s*34px;/s,
  );
  assert.match(
    authStyles,
    /\.auth-language a\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s,
  );
  assert.doesNotMatch(authStyles, /\.auth-(?:language|theme)\s*\{[^}]*position:\s*absolute/s);
});

test("Turnstile client failures are bounded and distinguish configuration errors", () => {
  assert.equal(turnstileClientRetryMode, "never");
  assert.deepEqual(turnstileClientFailure("110200", "ru"), {
    code: "110200",
    retryable: false,
    message:
      "Проверка безопасности временно недоступна из-за настройки сервиса. Обновите страницу позже или обратитесь в поддержку.",
  });
  assert.deepEqual(turnstileClientFailure("200500", "uz"), {
    code: "200500",
    retryable: true,
    message:
      "Xavfsizlik tekshiruvi yakunlanmadi. Tekshiruvni takrorlang.",
  });
  assert.deepEqual(turnstileClientFailure("unsafe-code", "ru"), {
    code: null,
    retryable: true,
    message: "Проверка безопасности не завершилась. Повторите проверку.",
  });
});

test("Turnstile verification binds token, IP, action, and hostname", async () => {
  let requestBody: Record<string, unknown> | null = null;
  const result = await validateAuthTurnstile({
    secretKey: "server-secret",
    token: "single-use-token",
    remoteIp: "203.0.113.9",
    expectedHostname: "app.juro.uz",
    expectedActions: [authTurnstileActions.passwordLogin],
    fetcher: async (input, init) => {
      assert.equal(
        input,
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      );
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        success: true,
        action: "auth_password_login",
        hostname: "app.juro.uz",
      });
    },
  });
  assert.deepEqual(result, { status: "verified" });
  const captured = requestBody as unknown as Record<string, unknown>;
  assert.equal(captured.secret, "server-secret");
  assert.equal(captured.response, "single-use-token");
  assert.equal(captured.remoteip, "203.0.113.9");
  assert.match(String(captured.idempotency_key), /^[0-9a-f-]{36}$/i);
});

test("Turnstile fails closed on provider denial or context mismatch", async () => {
  for (const payload of [
    {
      success: false,
      action: "auth_password_login",
      hostname: "app.juro.uz",
      "error-codes": ["timeout-or-duplicate"],
    },
    { success: true, action: "different_action", hostname: "app.juro.uz" },
    { success: true, action: "auth_password_login", hostname: "lookalike.test" },
  ]) {
    const result = await validateAuthTurnstile({
      secretKey: "server-secret",
      token: "single-use-token",
      remoteIp: null,
      expectedHostname: "app.juro.uz",
      expectedActions: [authTurnstileActions.passwordLogin],
      fetcher: async () => Response.json(payload),
    });
    assert.deepEqual(result, { status: "invalid" });
  }
});

test("Turnstile treats transport and malformed provider output as unavailable", async () => {
  const transport = await validateAuthTurnstile({
    secretKey: "server-secret",
    token: "single-use-token",
    remoteIp: null,
    expectedHostname: "app.juro.uz",
    expectedActions: [authTurnstileActions.passwordLogin],
    fetcher: async () => {
      throw new Error("network unavailable");
    },
  });
  assert.deepEqual(transport, { status: "unavailable" });

  const malformed = await validateAuthTurnstile({
    secretKey: "server-secret",
    token: "single-use-token",
    remoteIp: null,
    expectedHostname: "app.juro.uz",
    expectedActions: [authTurnstileActions.passwordLogin],
    fetcher: async () => Response.json({ success: "yes" }),
  });
  assert.deepEqual(malformed, { status: "unavailable" });
});

test("Turnstile rejects empty or oversized inputs before network access", async () => {
  let fetchCalls = 0;
  for (const token of ["", "x".repeat(2_049)]) {
    const result = await validateAuthTurnstile({
      secretKey: "server-secret",
      token,
      remoteIp: null,
      expectedHostname: "app.juro.uz",
      expectedActions: [authTurnstileActions.passwordLogin],
      fetcher: async () => {
        fetchCalls += 1;
        return Response.json({ success: true });
      },
    });
    assert.deepEqual(result, { status: "invalid" });
  }
  assert.equal(fetchCalls, 0);
});

test("auth Turnstile accepts only the actions assigned to the current endpoint", async () => {
  const validate = (action: string) => validateAuthTurnstile({
    secretKey: "server-secret",
    token: "single-use-token",
    remoteIp: null,
    expectedHostname: "app.juro.uz",
    expectedActions: [
      authTurnstileActions.registration,
      authTurnstileActions.registrationResend,
    ],
    fetcher: async () => Response.json({
      success: true,
      action,
      hostname: "app.juro.uz",
    }),
  });

  assert.deepEqual(
    await validate(authTurnstileActions.registrationResend),
    { status: "verified" },
  );
  assert.deepEqual(
    await validate(authTurnstileActions.passwordReset),
    { status: "invalid" },
  );
});

test("Turnstile supports an isolated guest AI action without weakening the auth action", async () => {
  const result = await validateTurnstile({
    secretKey: "server-secret",
    token: "single-use-guest-token",
    remoteIp: "203.0.113.12",
    expectedHostname: "app.juro.uz",
    expectedAction: "guest_ai",
    fetcher: async () => Response.json({
      success: true,
      action: "guest_ai",
      hostname: "app.juro.uz",
    }),
  });
  assert.deepEqual(result, { status: "verified" });
  assert.deepEqual(await validateTurnstile({
    secretKey: "server-secret",
    token: "single-use-guest-token",
    remoteIp: null,
    expectedHostname: "app.juro.uz",
    expectedAction: "auth_otp",
    fetcher: async () => Response.json({
      success: true,
      action: "guest_ai",
      hostname: "app.juro.uz",
    }),
  }), { status: "invalid" });
});
