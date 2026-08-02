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
    && (error instanceof AiRetryableRequestError || error instanceof TypeError);
}
