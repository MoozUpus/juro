/**
 * A request-scoped, content-free deadline coordinator for interactive AI work.
 *
 * All timings are relative to a monotonic clock. Do not put prompts, document
 * data, model output, or user identifiers in stage names: the returned stage
 * records are intended to be safe operational telemetry.
 */

export const DEFAULT_AI_EXECUTION_BUDGET_MS = 30_000;
export const DEFAULT_AI_FALLBACK_MINIMUM_BUDGET_MS = 4_000;
/**
 * Time that an interactive legal-chat provider must leave for strict
 * validation, the atomic completion batch, and the terminal response.
 *
 * This is deliberately part of the one shared request deadline rather than a
 * second timer. A late model result is less useful than a result we can prove
 * was validated, saved, and charged correctly.
 */
export const AI_INTERACTIVE_FINALIZATION_RESERVE_MS = 2_000;

const STAGE_NAME_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;

export type AiExecutionBudgetAbortReason =
  | "caller"
  | "overall_timeout"
  | "stage_timeout"
  | "disposed";

export type AiExecutionStageOutcome = "completed" | "failed" | "aborted";

export interface AiExecutionStageTiming {
  /** A stable implementation-owned identifier, never request content. */
  stage: string;
  /** Milliseconds since the budget began. */
  startedAtMs: number;
  /** Milliseconds since the budget began. */
  endedAtMs: number;
  elapsedMs: number;
  outcome: AiExecutionStageOutcome;
  abortReason?: AiExecutionBudgetAbortReason;
}

export interface AiExecutionBudgetSnapshot {
  totalBudgetMs: number;
  elapsedMs: number;
  remainingMs: number;
  aborted: boolean;
  abortReason?: AiExecutionBudgetAbortReason;
  stages: readonly AiExecutionStageTiming[];
}

export interface AiExecutionBudgetTimers {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface AiExecutionBudgetOptions {
  /** Defaults to the interactive AI SLO of 30 seconds. */
  totalBudgetMs?: number;
  /** Request cancellation from the framework/client. */
  callerSignal?: AbortSignal;
  /** Injectable for deterministic tests; defaults to performance.now(). */
  now?: () => number;
  /** Injectable for deterministic tests; defaults to platform timers. */
  timers?: AiExecutionBudgetTimers;
}

export interface AiExecutionStageOptions {
  /** A stage-local timeout. The overall deadline is always authoritative. */
  timeoutMs?: number;
}

export interface AiFallbackBudgetOptions {
  /** Maximum time a provider call may receive. */
  requestedTimeoutMs: number;
  /** Time reserved for validation and persistence after the fallback. */
  reserveMs?: number;
  /** Minimum usable provider time required before attempting fallback. */
  minimumAttemptMs?: number;
}

export interface AiFallbackBudget {
  /** Remaining request budget before reserving post-provider work. */
  remainingMs: number;
  /** Provider timeout capped to the common absolute request deadline. */
  timeoutMs: number;
}

export class AiExecutionBudgetAbortError extends Error {
  constructor(readonly reason: AiExecutionBudgetAbortReason) {
    super(reason);
    this.name = "AiExecutionBudgetAbortError";
  }
}

function positiveDuration(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive finite number.`);
  }
  const duration = Math.floor(value);
  if (duration <= 0) {
    throw new TypeError(`${name} must resolve to at least one millisecond.`);
  }
  return duration;
}

function nonNegativeDuration(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative finite number.`);
  }
  return Math.floor(value);
}

function defaultNow(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

const platformTimers: AiExecutionBudgetTimers = {
  setTimeout(callback, delayMs) {
    return globalThis.setTimeout(callback, delayMs);
  },
  clearTimeout(handle) {
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

/**
 * A single absolute deadline shared by retrieval, primary provider, fallback,
 * validation, and persistence. It deliberately contains no request content.
 */
export class AiExecutionBudget {
  readonly totalBudgetMs: number;
  readonly signal: AbortSignal;

  private readonly controller = new AbortController();
  private readonly startedAt: number;
  private lastObservedAt: number;
  private readonly now: () => number;
  private readonly timers: AiExecutionBudgetTimers;
  private readonly callerSignal?: AbortSignal;
  private readonly callerAbortListener?: () => void;
  private readonly stageTimings: AiExecutionStageTiming[] = [];
  private readonly activeStages = new Set<AiExecutionStage>();
  private overallTimer: unknown | undefined;
  private closed = false;
  private currentAbortReason: AiExecutionBudgetAbortReason | undefined;

  constructor(options: AiExecutionBudgetOptions = {}) {
    this.totalBudgetMs = positiveDuration(
      options.totalBudgetMs ?? DEFAULT_AI_EXECUTION_BUDGET_MS,
      "totalBudgetMs",
    );
    this.now = options.now ?? defaultNow;
    this.timers = options.timers ?? platformTimers;
    this.startedAt = this.readClock();
    this.lastObservedAt = this.startedAt;
    this.signal = this.controller.signal;
    this.callerSignal = options.callerSignal;

    this.overallTimer = this.timers.setTimeout(() => {
      this.abort("overall_timeout");
    }, this.totalBudgetMs);

    if (this.callerSignal) {
      const cancelFromCaller = () => this.abort("caller");
      this.callerAbortListener = cancelFromCaller;
      if (this.callerSignal.aborted) {
        cancelFromCaller();
      } else {
        this.callerSignal.addEventListener("abort", cancelFromCaller, { once: true });
      }
    }
  }

  get abortReason(): AiExecutionBudgetAbortReason | undefined {
    return this.currentAbortReason;
  }

  get elapsedMs(): number {
    return this.readElapsedMs();
  }

  get remainingMs(): number {
    this.expireIfNeeded();
    return Math.max(0, this.totalBudgetMs - this.readElapsedMs());
  }

  get isClosed(): boolean {
    return this.closed;
  }

  /** Starts a named stage with a signal bound to both stage and global limits. */
  beginStage(name: string, options: AiExecutionStageOptions = {}): AiExecutionStage {
    if (!STAGE_NAME_PATTERN.test(name)) {
      throw new TypeError(
        "stage name must be a stable lowercase telemetry identifier (a-z, 0-9, .,_,-; max 64 chars).",
      );
    }
    if (this.closed) {
      throw new AiExecutionBudgetAbortError(this.currentAbortReason ?? "disposed");
    }
    this.expireIfNeeded();
    const stage = new AiExecutionStage(this, name, options);
    if (!stage.isFinalized) {
      this.activeStages.add(stage);
    }
    return stage;
  }

  /** Returns a safe copy suitable for telemetry or status aggregation. */
  snapshot(): AiExecutionBudgetSnapshot {
    return {
      totalBudgetMs: this.totalBudgetMs,
      elapsedMs: this.elapsedMs,
      remainingMs: this.remainingMs,
      aborted: this.signal.aborted,
      ...(this.currentAbortReason ? { abortReason: this.currentAbortReason } : {}),
      stages: this.stageTimings.map((timing) => ({ ...timing })),
    };
  }

  /**
   * Cancels all active stages and removes timers/listeners. Call from a request
   * finally block; it is idempotent and never retains caller signal listeners.
   */
  dispose(): void {
    this.abort("disposed");
  }

  /** @internal */
  registerTiming(timing: AiExecutionStageTiming): void {
    this.stageTimings.push(timing);
  }

  /** @internal */
  releaseStage(stage: AiExecutionStage): void {
    this.activeStages.delete(stage);
  }

  /** @internal */
  stageStartedAtMs(): number {
    return this.readElapsedMs();
  }

  /** @internal */
  ensureActive(): void {
    this.expireIfNeeded();
  }

  /** @internal */
  createStageTimer(callback: () => void, timeoutMs: number): unknown {
    return this.timers.setTimeout(callback, timeoutMs);
  }

  /** @internal */
  clearStageTimer(handle: unknown | undefined): void {
    if (handle !== undefined) {
      this.timers.clearTimeout(handle);
    }
  }

  private readClock(): number {
    const value = this.now();
    if (!Number.isFinite(value)) {
      throw new TypeError("now() must return a finite number.");
    }
    return value;
  }

  private readElapsedMs(): number {
    const current = this.readClock();
    this.lastObservedAt = Math.max(this.lastObservedAt, current);
    return Math.min(this.totalBudgetMs, Math.max(0, this.lastObservedAt - this.startedAt));
  }

  private expireIfNeeded(): void {
    if (!this.signal.aborted && this.readElapsedMs() >= this.totalBudgetMs) {
      this.abort("overall_timeout");
    }
  }

  private abort(reason: AiExecutionBudgetAbortReason): void {
    if (this.signal.aborted) {
      return;
    }
    this.currentAbortReason = reason;
    this.controller.abort(new AiExecutionBudgetAbortError(reason));
    this.cleanup();
  }

  private cleanup(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.clearStageTimer(this.overallTimer);
    this.overallTimer = undefined;
    if (this.callerSignal && this.callerAbortListener) {
      this.callerSignal.removeEventListener("abort", this.callerAbortListener);
    }
  }
}

export class AiExecutionStage {
  readonly signal: AbortSignal;

  private readonly controller = new AbortController();
  private readonly startedAtMs: number;
  private timer: unknown | undefined;
  private finalized = false;
  private timing: AiExecutionStageTiming | undefined;
  private readonly budgetAbortListener: () => void;

  /** @internal */
  constructor(
    private readonly budget: AiExecutionBudget,
    readonly name: string,
    options: AiExecutionStageOptions,
  ) {
    this.signal = this.controller.signal;
    this.startedAtMs = budget.stageStartedAtMs();
    this.budgetAbortListener = () => {
      this.abort(budget.abortReason ?? "overall_timeout");
    };
    budget.signal.addEventListener("abort", this.budgetAbortListener, { once: true });

    if (budget.signal.aborted) {
      this.abort(budget.abortReason ?? "overall_timeout");
      return;
    }

    if (options.timeoutMs !== undefined) {
      const timeoutMs = positiveDuration(options.timeoutMs, "stage timeoutMs");
      const remainingMs = budget.remainingMs;
      // Let the one absolute timer win when the requested stage timeout reaches
      // the global deadline. This avoids reporting a misleading stage timeout.
      if (timeoutMs < remainingMs) {
        this.timer = budget.createStageTimer(() => this.abort("stage_timeout"), timeoutMs);
      }
    }
  }

  get isFinalized(): boolean {
    return this.finalized;
  }

  get result(): AiExecutionStageTiming | undefined {
    return this.timing ? { ...this.timing } : undefined;
  }

  complete(): AiExecutionStageTiming {
    this.budget.ensureActive();
    if (this.signal.aborted) {
      return this.finalize("aborted", this.abortReasonFromSignal());
    }
    return this.finalize("completed");
  }

  fail(): AiExecutionStageTiming {
    this.budget.ensureActive();
    if (this.signal.aborted) {
      return this.finalize("aborted", this.abortReasonFromSignal());
    }
    return this.finalize("failed");
  }

  private abort(reason: AiExecutionBudgetAbortReason): AiExecutionStageTiming {
    if (!this.signal.aborted) {
      this.controller.abort(new AiExecutionBudgetAbortError(reason));
    }
    return this.finalize("aborted", reason);
  }

  private abortReasonFromSignal(): AiExecutionBudgetAbortReason {
    const reason = this.signal.reason;
    if (reason instanceof AiExecutionBudgetAbortError) {
      return reason.reason;
    }
    return this.budget.abortReason ?? "stage_timeout";
  }

  private finalize(
    outcome: AiExecutionStageOutcome,
    abortReason?: AiExecutionBudgetAbortReason,
  ): AiExecutionStageTiming {
    if (this.timing) {
      return { ...this.timing };
    }
    this.finalized = true;
    this.budget.clearStageTimer(this.timer);
    this.timer = undefined;
    this.budget.signal.removeEventListener("abort", this.budgetAbortListener);
    const endedAtMs = this.budget.elapsedMs;
    const timing: AiExecutionStageTiming = {
      stage: this.name,
      startedAtMs: this.startedAtMs,
      endedAtMs,
      elapsedMs: Math.max(0, endedAtMs - this.startedAtMs),
      outcome,
      ...(abortReason ? { abortReason } : {}),
    };
    this.timing = timing;
    this.budget.registerTiming(timing);
    this.budget.releaseStage(this);
    return { ...timing };
  }
}

export function createAiExecutionBudget(options?: AiExecutionBudgetOptions): AiExecutionBudget {
  return new AiExecutionBudget(options);
}

/** True only when a fallback can still finish inside the common request budget. */
export function hasAiFallbackBudget(
  budget: AiExecutionBudget,
  minimumAttemptMs = DEFAULT_AI_FALLBACK_MINIMUM_BUDGET_MS,
  reserveMs = 0,
): boolean {
  return allocateAiFallbackBudget(budget, {
    requestedTimeoutMs: Number.MAX_SAFE_INTEGER,
    minimumAttemptMs,
    reserveMs,
  }) !== null;
}

/**
 * Caps a provider attempt to the shared request deadline and reserves time for
 * the validation/persistence stages that follow it. This is safe for either a
 * primary call or a fallback: callers decide whether an earlier attempt has
 * already failed. Null means do not start a provider call, because it cannot
 * receive enough useful time.
 */
export function allocateAiProviderBudget(
  budget: AiExecutionBudget,
  options: AiFallbackBudgetOptions,
): AiFallbackBudget | null {
  const requestedTimeoutMs = positiveDuration(options.requestedTimeoutMs, "requestedTimeoutMs");
  const reserveMs = nonNegativeDuration(options.reserveMs ?? 0, "reserveMs");
  const minimumAttemptMs = positiveDuration(
    options.minimumAttemptMs ?? DEFAULT_AI_FALLBACK_MINIMUM_BUDGET_MS,
    "minimumAttemptMs",
  );
  const remainingMs = budget.remainingMs;
  const usableMs = Math.max(0, remainingMs - reserveMs);
  if (budget.signal.aborted || usableMs < minimumAttemptMs) {
    return null;
  }
  return {
    remainingMs,
    timeoutMs: Math.min(requestedTimeoutMs, usableMs),
  };
}

/**
 * Backward-compatible name for the fallback call site. Keep the calculation
 * centralized so both primary and fallback providers share the same absolute
 * deadline and finalization reserve.
 */
export function allocateAiFallbackBudget(
  budget: AiExecutionBudget,
  options: AiFallbackBudgetOptions,
): AiFallbackBudget | null {
  return allocateAiProviderBudget(budget, options);
}
