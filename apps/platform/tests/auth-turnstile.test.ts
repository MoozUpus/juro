import assert from "node:assert/strict";
import test from "node:test";
import {
  turnstileClientFailure,
  turnstileClientLanguage,
  turnstileClientRetryMode,
  turnstileClientSize,
} from "../lib/auth/turnstile-client";
import { validateAuthTurnstile, validateTurnstile } from "../lib/auth/turnstile";

test("Turnstile client failures are bounded and distinguish configuration errors", () => {
  assert.equal(turnstileClientRetryMode, "never");
  assert.equal(turnstileClientLanguage("ru"), "ru");
  assert.equal(turnstileClientLanguage("uz"), "auto");
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

test("Turnstile uses the provider's compact widget below the flexible 300px floor", () => {
  assert.equal(turnstileClientSize(299), "compact");
  assert.equal(turnstileClientSize(300), "flexible");
  assert.equal(turnstileClientSize(460), "flexible");
});

test("Turnstile verification binds token, IP, action, and hostname", async () => {
  let requestBody: Record<string, unknown> | null = null;
  const result = await validateAuthTurnstile({
    secretKey: "server-secret",
    token: "single-use-token",
    remoteIp: "203.0.113.9",
    expectedHostname: "app.juro.uz",
    fetcher: async (input, init) => {
      assert.equal(
        input,
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      );
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        success: true,
        action: "auth_otp",
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
      action: "auth_otp",
      hostname: "app.juro.uz",
      "error-codes": ["timeout-or-duplicate"],
    },
    { success: true, action: "different_action", hostname: "app.juro.uz" },
    { success: true, action: "auth_otp", hostname: "lookalike.test" },
  ]) {
    const result = await validateAuthTurnstile({
      secretKey: "server-secret",
      token: "single-use-token",
      remoteIp: null,
      expectedHostname: "app.juro.uz",
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
      fetcher: async () => {
        fetchCalls += 1;
        return Response.json({ success: true });
      },
    });
    assert.deepEqual(result, { status: "invalid" });
  }
  assert.equal(fetchCalls, 0);
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
