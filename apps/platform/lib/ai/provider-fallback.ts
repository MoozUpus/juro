/**
 * A primary-provider configuration or entitlement failure is not recoverable
 * by retrying that same provider, but it is a valid reason to try the already
 * configured secondary provider. Refusals are intentionally excluded.
 */
export function shouldUseAnthropicFallback(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; retryable?: unknown };
  return candidate.code === "PROVIDER_UNAVAILABLE"
    || candidate.code === "PROVIDER_CIRCUIT_OPEN"
    || candidate.code === "INVALID_AI_OUTPUT"
    || candidate.retryable === true;
}
