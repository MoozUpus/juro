import {
  AI_INTERACTIVE_FINALIZATION_RESERVE_MS,
  allocateAiProviderBudget,
  type AiExecutionBudget,
} from "./execution-budget";

/** Fast-chat provider watchdog; independent retrieval stages have smaller caps. */
export const FAST_LEGAL_CHAT_PROVIDER_TIMEOUT_MS = 25_500;
/** Deep-chat provider watchdog used when the upstream endpoint does not finish. */
export const DEEP_LEGAL_CHAT_PROVIDER_TIMEOUT_MS = 120_000;
export const MINIMUM_LEGAL_CHAT_PROVIDER_ATTEMPT_MS = 4_000;

function positiveTimeout(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive finite number.`);
  }
  return Math.max(1, Math.floor(value));
}

/**
 * Returns the only provider window an interactive legal-chat call may use.
 *
 * When the caller supplies `providerTimeoutMs`, it has already allocated a
 * post-provider reserve (the resilient fallback and staging probes do this).
 * A primary call without an explicit window keeps its provider-specific cap.
 * Consumers that enable an overall execution deadline also reserve enough of
 * that shared deadline for validation, atomic persistence, and the terminal
 * response. `null` means the call cannot be started safely.
 */
export function legalChatProviderTimeoutMs(input: {
  reasoningMode: "fast" | "deep";
  budget?: AiExecutionBudget;
  providerTimeoutMs?: number;
}): number | null {
  const requestedTimeoutMs = positiveTimeout(
    input.providerTimeoutMs ?? (
      input.reasoningMode === "fast"
        ? FAST_LEGAL_CHAT_PROVIDER_TIMEOUT_MS
        : DEEP_LEGAL_CHAT_PROVIDER_TIMEOUT_MS
    ),
    "providerTimeoutMs",
  );

  if (!input.budget) return requestedTimeoutMs;
  if (input.budget.signal.aborted || input.budget.remainingMs < 1) return null;

  if (input.providerTimeoutMs !== undefined) {
    // The explicit timeout came from an earlier shared-budget allocation. Do
    // not reserve twice, but never let it outlive the common deadline.
    return Math.max(1, Math.min(requestedTimeoutMs, input.budget.remainingMs));
  }

  return allocateAiProviderBudget(input.budget, {
    requestedTimeoutMs,
    minimumAttemptMs: MINIMUM_LEGAL_CHAT_PROVIDER_ATTEMPT_MS,
    reserveMs: AI_INTERACTIVE_FINALIZATION_RESERVE_MS,
  })?.timeoutMs ?? null;
}
