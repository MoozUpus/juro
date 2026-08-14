export type ResponsesSsePayload = {
  id?: string;
  model?: string;
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string; refusal?: string }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
  };
  error?: { message?: string };
};

export class ResponsesSseError extends Error {
  constructor(
    message: string,
    readonly code: "PROVIDER_UNAVAILABLE" | "INVALID_AI_OUTPUT" | "AI_REFUSED",
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ResponsesSseError";
  }
}

export type ResponsesSseFirstDeltaTiming = {
  /** Epoch time at which the Responses stream parser was entered. */
  startedAt: number;
  /** Epoch time at which the first non-empty provider delta was received. */
  firstDeltaAt: number;
  /** Time elapsed to the first actual delta, never inferred from response headers. */
  elapsedMs: number;
  /** Number of output characters available after applying that first delta. */
  receivedCharacters: number;
};

export type ResponsesSseOptions = {
  /** Start time of the provider request. Defaults to when this parser begins. */
  startedAt?: number;
  /** Injectable clock for deterministic timing tests. */
  now?: () => number;
  /**
   * Invoked once for the first non-empty `response.output_text.delta` event.
   * This is intentionally independent from progress throttling and HTTP
   * headers so callers can measure actual provider output timing.
   */
  onFirstDelta?: (timing: ResponsesSseFirstDeltaTiming) => void | Promise<void>;
  /**
   * Server-internal observer for the accumulated structured output. Callers
   * must validate any extracted value before exposing it outside the Worker.
   */
  onOutputTextBuffer?: (text: string) => void | Promise<void>;
};

export async function readResponsesSse(
  response: Response,
  onProgress: (event: { stage: "provider_delta"; receivedCharacters: number }) => void | Promise<void>,
  options: ResponsesSseOptions = {},
): Promise<ResponsesSsePayload> {
  if (!response.body) {
    throw new ResponsesSseError("AI-провайдер не вернул поток ответа.", "PROVIDER_UNAVAILABLE", true);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let outputText = "";
  let refusal = "";
  let finalResponse: ResponsesSsePayload | null = null;
  let lastReported = 0;
  let firstDeltaRecorded = false;
  const now = options.now ?? Date.now;
  const startedAt = options.startedAt ?? now();

  const processFrame = async (frame: string) => {
    const data = frame.split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return;
    let event: {
      type?: string;
      delta?: string;
      response?: ResponsesSsePayload;
      error?: { message?: string };
    };
    try {
      event = JSON.parse(data) as typeof event;
    } catch {
      throw new ResponsesSseError("AI-провайдер вернул некорректное событие потока.", "INVALID_AI_OUTPUT", false);
    }
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
      if (event.delta && !firstDeltaRecorded) {
        firstDeltaRecorded = true;
        const firstDeltaAt = now();
        try {
          await options.onFirstDelta?.({
            startedAt,
            firstDeltaAt,
            elapsedMs: Math.max(0, firstDeltaAt - startedAt),
            receivedCharacters: outputText.length + event.delta.length,
          });
        } catch {
          // Timing observers are diagnostic-only. A failed metric must not
          // discard a valid, schema-constrained provider response.
        }
      }
      outputText += event.delta;
      try {
        await options.onOutputTextBuffer?.(outputText);
      } catch {
        // An optional early-output observer must never invalidate or interrupt
        // the authoritative final structured response.
      }
      if (outputText.length - lastReported >= 128) {
        lastReported = outputText.length;
        await onProgress({ stage: "provider_delta", receivedCharacters: outputText.length });
      }
      if (outputText.length > 512_000) {
        throw new ResponsesSseError("AI-ответ превысил допустимый размер.", "INVALID_AI_OUTPUT", false);
      }
    } else if (event.type === "response.refusal.delta" && typeof event.delta === "string") {
      refusal += event.delta;
    } else if (event.type === "response.completed" && event.response) {
      finalResponse = event.response;
    } else if (event.type === "response.failed") {
      finalResponse = event.response ?? null;
    } else if (event.type === "error" || event.type === "response.error") {
      throw new ResponsesSseError(event.error?.message || "AI-поток завершился ошибкой.", "PROVIDER_UNAVAILABLE", true);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer = (buffer + decoder.decode(value, { stream: !done })).replace(/\r\n/g, "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      await processFrame(frame);
      boundary = buffer.indexOf("\n\n");
    }
    if (done) break;
  }
  if (buffer.trim()) await processFrame(buffer);
  if (refusal) {
    throw new ResponsesSseError("AI-провайдер отказался обрабатывать запрос.", "AI_REFUSED", false);
  }
  const completed = finalResponse as ResponsesSsePayload | null;
  if (!completed) {
    throw new ResponsesSseError("AI-поток завершился без финального ответа.", "INVALID_AI_OUTPUT", false);
  }
  if (outputText && !(completed.output?.flatMap((item) => item.content ?? []) ?? []).some((item) => item.type === "output_text" && item.text)) {
    completed.output = [{ type: "message", content: [{ type: "output_text", text: outputText }] }];
  }
  return completed;
}
