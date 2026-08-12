import assert from "node:assert/strict";
import test from "node:test";

import {
  AiExecutionBudgetAbortError,
  allocateAiFallbackBudget,
  createAiExecutionBudget,
  hasAiFallbackBudget,
  type AiExecutionBudgetTimers,
} from "../lib/ai/execution-budget";

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
      if (!next) {
        return;
      }
      this.timers.delete(next[0]);
      next[1].callback();
    }
  }

  get pendingCount(): number {
    return this.timers.size;
  }
}

function createBudget(totalBudgetMs = 30_000) {
  const timers = new ManualTimers();
  const budget = createAiExecutionBudget({
    totalBudgetMs,
    now: () => timers.now,
    timers,
  });
  return { budget, timers };
}

test("records monotonic, content-free stage timing against a configurable absolute deadline", () => {
  const { budget, timers } = createBudget();
  const stage = budget.beginStage("auth_context", { timeoutMs: 3_000 });

  timers.advanceBy(1_250);
  const timing = stage.complete();
  timers.now = 800; // A non-monotonic injected clock must not reduce elapsed time.

  assert.deepEqual(timing, {
    stage: "auth_context",
    startedAtMs: 0,
    endedAtMs: 1_250,
    elapsedMs: 1_250,
    outcome: "completed",
  });
  assert.equal(budget.elapsedMs, 1_250);
  assert.equal(budget.remainingMs, 28_750);
  assert.deepEqual(budget.snapshot().stages, [timing]);
  assert.throws(() => budget.beginStage("Question from a user"), /stage name/);

  budget.dispose();
  assert.equal(timers.pendingCount, 0);
});

test("aborts only the stage when its deadline is shorter than the overall budget", () => {
  const { budget, timers } = createBudget();
  const stage = budget.beginStage("verified_retrieval", { timeoutMs: 2_000 });

  timers.advanceBy(2_000);

  assert.equal(stage.signal.aborted, true);
  assert.equal(budget.signal.aborted, false);
  assert.equal((stage.signal.reason as AiExecutionBudgetAbortError).reason, "stage_timeout");
  assert.deepEqual(stage.result, {
    stage: "verified_retrieval",
    startedAtMs: 0,
    endedAtMs: 2_000,
    elapsedMs: 2_000,
    outcome: "aborted",
    abortReason: "stage_timeout",
  });

  budget.dispose();
  assert.equal(timers.pendingCount, 0);
});

test("enforces the absolute overall deadline even when a stage asks for longer", () => {
  const { budget, timers } = createBudget(3_000);
  const stage = budget.beginStage("primary_provider", { timeoutMs: 9_000 });

  timers.advanceBy(3_000);

  assert.equal(budget.signal.aborted, true);
  assert.equal(budget.abortReason, "overall_timeout");
  assert.equal(stage.signal.aborted, true);
  assert.equal((budget.signal.reason as AiExecutionBudgetAbortError).reason, "overall_timeout");
  assert.equal(stage.result?.abortReason, "overall_timeout");
  assert.equal(timers.pendingCount, 0);
});

test("propagates caller cancellation and cleans all deadline timers", () => {
  const caller = new AbortController();
  const timers = new ManualTimers();
  const budget = createAiExecutionBudget({
    callerSignal: caller.signal,
    now: () => timers.now,
    timers,
  });
  const stage = budget.beginStage("validation", { timeoutMs: 2_000 });

  assert.equal(timers.pendingCount, 2);
  caller.abort();

  assert.equal(budget.signal.aborted, true);
  assert.equal(budget.abortReason, "caller");
  assert.equal(stage.signal.aborted, true);
  assert.equal(stage.result?.abortReason, "caller");
  assert.equal(timers.pendingCount, 0);

  budget.dispose();
  assert.equal(timers.pendingCount, 0);
});

test("allocates fallback only from the remaining common deadline", () => {
  const { budget, timers } = createBudget();

  assert.equal(hasAiFallbackBudget(budget, 4_000, 2_000), true);
  assert.deepEqual(
    allocateAiFallbackBudget(budget, {
      requestedTimeoutMs: 12_000,
      minimumAttemptMs: 4_000,
      reserveMs: 2_000,
    }),
    { remainingMs: 30_000, timeoutMs: 12_000 },
  );

  timers.advanceBy(25_000);
  assert.equal(hasAiFallbackBudget(budget, 4_000, 2_000), false);
  assert.equal(
    allocateAiFallbackBudget(budget, {
      requestedTimeoutMs: 12_000,
      minimumAttemptMs: 4_000,
      reserveMs: 2_000,
    }),
    null,
  );
  assert.deepEqual(
    allocateAiFallbackBudget(budget, {
      requestedTimeoutMs: 12_000,
      minimumAttemptMs: 2_000,
      reserveMs: 2_000,
    }),
    { remainingMs: 5_000, timeoutMs: 3_000 },
  );

  budget.dispose();
  assert.equal(timers.pendingCount, 0);
});
