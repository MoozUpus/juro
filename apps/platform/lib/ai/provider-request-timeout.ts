export type ProviderRequestAbortReason =
  | "caller"
  | "first_byte_timeout"
  | "total_response_timeout";

export class ProviderRequestAbortError extends Error {
  constructor(readonly reason: ProviderRequestAbortReason) {
    super(reason);
    this.name = "ProviderRequestAbortError";
  }
}

function positiveTimeout(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive finite number.`);
  }
  return value;
}

/**
 * Runs a provider request with independent deadlines for receiving response
 * headers and consuming the complete response body/stream.
 *
 * The total-response deadline starts with the request, while the first-byte
 * deadline is cleared as soon as fetch resolves with response headers.
 */
export async function runProviderRequestWithTimeouts<T>(input: {
  firstByteTimeoutMs: number;
  totalResponseTimeoutMs: number;
  callerSignal?: AbortSignal;
  start: (signal: AbortSignal) => Promise<Response>;
  consume: (response: Response, signal: AbortSignal) => Promise<T>;
}): Promise<T> {
  const firstByteTimeoutMs = positiveTimeout(input.firstByteTimeoutMs, "firstByteTimeoutMs");
  const totalResponseTimeoutMs = positiveTimeout(input.totalResponseTimeoutMs, "totalResponseTimeoutMs");
  const controller = new AbortController();
  let abortReason: ProviderRequestAbortReason | null = null;

  const abort = (reason: ProviderRequestAbortReason) => {
    if (controller.signal.aborted) return;
    abortReason = reason;
    controller.abort();
  };
  const cancelFromCaller = () => abort("caller");

  if (input.callerSignal?.aborted) {
    throw new ProviderRequestAbortError("caller");
  }
  input.callerSignal?.addEventListener("abort", cancelFromCaller, { once: true });

  const firstByteTimer = setTimeout(() => abort("first_byte_timeout"), firstByteTimeoutMs);
  const totalResponseTimer = setTimeout(() => abort("total_response_timeout"), totalResponseTimeoutMs);
  try {
    const response = await input.start(controller.signal);
    clearTimeout(firstByteTimer);
    return await input.consume(response, controller.signal);
  } catch (error) {
    if (abortReason || (error instanceof Error && error.name === "AbortError" && controller.signal.aborted)) {
      throw new ProviderRequestAbortError(abortReason ?? "total_response_timeout");
    }
    throw error;
  } finally {
    clearTimeout(firstByteTimer);
    clearTimeout(totalResponseTimer);
    input.callerSignal?.removeEventListener("abort", cancelFromCaller);
  }
}
