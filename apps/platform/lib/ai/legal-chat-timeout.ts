import {
  AI_INTERACTIVE_FINALIZATION_RESERVE_MS,
  allocateAiProviderBudget,
  type AiExecutionBudget,
} from "./execution-budget";
import { aiReasoningProfile, type AiReasoningMode } from "./reasoning-mode";

/** The short interactive response has room for validation and persistence. */
export const FAST_LEGAL_CHAT_PROVIDER_TIMEOUT_MS = aiReasoningProfile("fast").providerTimeoutMs;
/** Balanced mode uses the chat model and remains capped by the shared route deadline. */
export const BALANCED_LEGAL_CHAT_PROVIDER_TIMEOUT_MS = aiReasoningProfile("balanced").providerTimeoutMs;
/** Deep mode still shares the route's 30-second absolute request deadline. */
export const DEEP_LEGAL_CHAT_PROVIDER_TIMEOUT_MS = aiReasoningProfile("deep").providerTimeoutMs;
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
 * A primary call without an explicit window reserves enough of the one
 * request deadline for validation, atomic persistence, and the terminal
 * response. `null` means that starting an AI provider call would be unable to
 * complete safely, so the caller must fail without consuming usage.
 */
export function legalChatProviderTimeoutMs(input: {
  reasoningMode: AiReasoningMode;
  budget?: AiExecutionBudget;
  providerTimeoutMs?: number;
}): number | null {
  const requestedTimeoutMs = positiveTimeout(
    input.providerTimeoutMs ?? aiReasoningProfile(input.reasoningMode).providerTimeoutMs,
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
