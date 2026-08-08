/**
 * A browser retry must replay the exact idempotency key and payload. The
 * server then either returns the persisted answer or reports the existing run
 * as processing instead of opening a second billable AI cycle.
 */
export type AiRetryRequest<TPayload> = Readonly<{
  idempotencyKey: string;
  payload: TPayload;
}>;

export class AiRetryableRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiRetryableRequestError";
  }
}

export class AiRestartableRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiRestartableRequestError";
  }
}

export function createAiRetryRequest<TPayload>(
  payload: TPayload,
  createIdempotencyKey: () => string,
): AiRetryRequest<TPayload> {
  return Object.freeze({ idempotencyKey: createIdempotencyKey(), payload });
}

export function isUserCancelledAiRequest(error: unknown) {
  return Boolean(
    error
      && typeof error === "object"
      && "name" in error
      && (error as { name?: unknown }).name === "AbortError",
  );
}

export function shouldOfferAiRetry(error: unknown) {
  return !isUserCancelledAiRequest(error)
    && (error instanceof AiRetryableRequestError || error instanceof AiRestartableRequestError || error instanceof TypeError);
}

export function shouldUseFreshAiRetry(error: unknown) {
  return error instanceof AiRestartableRequestError;
}

export function isRestartableAiTerminal(status: number, code: unknown) {
  return typeof code === "string"
    && ["AI_RUN_FAILED", "INVALID_AI_OUTPUT", "PROVIDER_TIMEOUT", "PROVIDER_UNAVAILABLE"].includes(code)
    && [409, 422, 503, 504].includes(status);
}
