import assert from "node:assert/strict";
import test from "node:test";
import {
  AiRetryableRequestError,
  createAiRetryRequest,
  isUserCancelledAiRequest,
  shouldOfferAiRetry,
} from "../lib/ai/client-retry";

test("AI retry retains one immutable idempotency key and payload", () => {
  const payload = { question: "Проверьте срок по договору", conversationId: "conversation-1" };
  const pending = createAiRetryRequest(payload, () => "ai-request-0001");

  assert.equal(pending.idempotencyKey, "ai-request-0001");
  assert.equal(pending.payload, payload);
  assert.equal(Object.isFrozen(pending), true);
});

test("AI retry is not offered after an explicit user cancellation", () => {
  const cancellation = { name: "AbortError" };
  assert.equal(isUserCancelledAiRequest(cancellation), true);
  assert.equal(shouldOfferAiRetry(cancellation), false);
  assert.equal(shouldOfferAiRetry(new AiRetryableRequestError("STREAM_TERMINAL_EVENT_MISSING")), true);
  assert.equal(shouldOfferAiRetry(new TypeError("network unavailable")), true);
  assert.equal(shouldOfferAiRetry(new Error("PROVIDER_UNAVAILABLE")), false);
});
