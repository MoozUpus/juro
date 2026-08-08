import assert from "node:assert/strict";
import test from "node:test";
import { shouldUseAnthropicFallback } from "../lib/ai/provider-fallback";

test("OpenAI entitlement or model-configuration failures use the configured Anthropic fallback", () => {
  assert.equal(shouldUseAnthropicFallback({ code: "PROVIDER_UNAVAILABLE", retryable: false }), true);
  assert.equal(shouldUseAnthropicFallback({ code: "PROVIDER_TIMEOUT", retryable: true }), true);
  assert.equal(shouldUseAnthropicFallback({ code: "INVALID_AI_OUTPUT", retryable: false }), true);
  assert.equal(shouldUseAnthropicFallback({ code: "AI_REFUSED", retryable: false }), false);
  assert.equal(shouldUseAnthropicFallback({ code: "AI_CANCELLED", retryable: false }), false);
  assert.equal(shouldUseAnthropicFallback(null), false);
});
