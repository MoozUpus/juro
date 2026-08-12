import assert from "node:assert/strict";
import test from "node:test";

import { createAiExecutionBudget, type AiExecutionBudgetTimers } from "../lib/ai/execution-budget";
import {
  DEEP_LEGAL_CHAT_PROVIDER_TIMEOUT_MS,
  FAST_LEGAL_CHAT_PROVIDER_TIMEOUT_MS,
  legalChatProviderTimeoutMs,
} from "../lib/ai/legal-chat-timeout";

class ManualTimers implements AiExecutionBudgetTimers {
  now = 0;
  private nextId = 0;
  private readonly timers = new Map<number, { dueAt: number; callback: () => void }>();

  setTimeout(callback: () => void, delayMs: number): unknown {
    const id = this.nextId;
    this.nextId += 1;
    this.timers.set(id, { callback, dueAt: this.now + delayMs });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.timers.delete(handle as number);
  }

  advanceBy(milliseconds: number): void {
    this.now += milliseconds;
    while (true) {
      const next = [...this.timers.entries()]
        .filter(([, timer]) => timer.dueAt <= this.now)
        .sort(([, left], [, right]) => left.dueAt - right.dueAt)[0];
      if (!next) return;
      this.timers.delete(next[0]);
      next[1].callback();
    }
  }
}

function budget() {
  const timers = new ManualTimers();
  return {
    timers,
    budget: createAiExecutionBudget({
      totalBudgetMs: 30_000,
      now: () => timers.now,
      timers,
    }),
  };
}

test("primary legal-chat providers leave a finalization reserve inside the shared 30-second deadline", () => {
  const { budget: execution, timers } = budget();

  assert.equal(FAST_LEGAL_CHAT_PROVIDER_TIMEOUT_MS, 25_500);
  assert.equal(DEEP_LEGAL_CHAT_PROVIDER_TIMEOUT_MS, 120_000);
  assert.equal(legalChatProviderTimeoutMs({ reasoningMode: "fast", budget: execution }), 25_500);
  assert.equal(legalChatProviderTimeoutMs({ reasoningMode: "deep", budget: execution }), 28_000);

  timers.advanceBy(4_000);
  // The original 25.5s fast cap is now trimmed by the common deadline and a
  // 2s finalization reserve; it cannot create a second 30-second window.
  assert.equal(legalChatProviderTimeoutMs({ reasoningMode: "fast", budget: execution }), 24_000);

  execution.dispose();
});

test("fallback/provider overrides use only the remaining common deadline without reserving twice", () => {
  const { budget: execution, timers } = budget();

  // Resilient fallback and staging probe callers allocate this cap before
  // entering the provider adapter, including their own post-provider reserve.
  assert.equal(legalChatProviderTimeoutMs({
    reasoningMode: "fast",
    budget: execution,
    providerTimeoutMs: 8_000,
  }), 8_000);

  timers.advanceBy(23_500);
  assert.equal(legalChatProviderTimeoutMs({
    reasoningMode: "fast",
    budget: execution,
    providerTimeoutMs: 8_000,
  }), 6_500);

  execution.dispose();
});

test("a primary provider is not started when it cannot receive a useful attempt plus finalization", () => {
  const { budget: execution, timers } = budget();

  timers.advanceBy(24_001);
  assert.equal(legalChatProviderTimeoutMs({ reasoningMode: "fast", budget: execution }), null);

  execution.dispose();
});
