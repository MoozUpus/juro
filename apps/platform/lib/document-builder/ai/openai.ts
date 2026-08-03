import { runtimeEnv } from "../storage/runtime";
import { readResponsesSse, ResponsesSseError } from "../../ai/responses-sse";

export type AiProviderErrorCode =
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_TIMEOUT"
  | "INVALID_AI_OUTPUT"
  | "AI_REFUSED"
  | "AI_CANCELLED"
  | "ANTHROPIC_PREFLIGHT_FAILED"
  | "ANTHROPIC_REQUEST_FAILED"
  | "ANTHROPIC_POSTPROCESS_FAILED";

export class AiUnavailableError extends Error {
  readonly code: AiProviderErrorCode;
  readonly retryable: boolean;
  readonly providerStatus: number | null;
  readonly providerErrorType: string | null;

  constructor(
    message: string,
    code: AiProviderErrorCode = "PROVIDER_UNAVAILABLE",
    retryable = true,
    providerStatus: number | null = null,
    providerErrorType: string | null = null,
  ) {
    super(message);
    this.name = "AiUnavailableError";
    this.code = code;
    this.retryable = retryable;
    this.providerStatus = providerStatus;
    this.providerErrorType = providerErrorType;
  }
}

interface ResponsesApiPayload {
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
  error?: { message?: string; type?: string; code?: string };
}

export type AiProviderUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
};

export type AiStructuredResult<T> = {
  data: T;
  provider: "openai" | "anthropic";
  model: string;
  providerResponseId: string | null;
  attempts: number;
  latencyMs: number;
  usage: AiProviderUsage;
  fallbackFromProvider: "openai" | "anthropic" | null;
};
export type AiStructuredProgress =
  | { stage: "provider_started"; provider: "openai"; model: string }
  | { stage: "provider_delta"; receivedCharacters: number };


export function hasAiConfiguration(): boolean {
  const configuration = runtimeEnv();
  return Boolean(configuration.OPENAI_API_KEY || (configuration.AI_PROVIDER === "openai" && configuration.AI_PROVIDER_API_KEY));
}

export async function callOpenAiJson<T>(options: {
  instructions: string;
  input: unknown;
  schemaName: string;
  schema: Record<string, unknown>;
  timeoutMs?: number;
  rawInput?: boolean;
}): Promise<T> {
  const result = await callOpenAiStructured<T>({
    ...options,
    parse: (value) => value as T,
  });
  return result.data;
}

export async function callOpenAiStructured<T>(options: {
  instructions: string;
  input: unknown;
  schemaName: string;
  schema: Record<string, unknown>;
  parse: (value: unknown) => T;
  timeoutMs?: number;
  rawInput?: boolean;
  requestId?: string;
  model?: string;
  maxAttempts?: 1 | 2;
  signal?: AbortSignal;
  onProgress?: (event: AiStructuredProgress) => void | Promise<void>;
  safetyIdentifier?: string;
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh" | "max";
  textVerbosity?: "low" | "medium" | "high";
}): Promise<AiStructuredResult<T>> {
  const configuration = runtimeEnv();
  const apiKey = configuration.OPENAI_API_KEY || (configuration.AI_PROVIDER === "openai" ? configuration.AI_PROVIDER_API_KEY : undefined);
  if (!apiKey) {
    throw new AiUnavailableError("AI-модель не подключена: отсутствует серверный ключ провайдера.");
  }
  const model = options.model || configuration.OPENAI_CHAT_MODEL || configuration.OPENAI_MODEL || "gpt-5.6-sol";
  const startedAt = Date.now();
  const totalUsage: AiProviderUsage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
  const maxAttempts = options.maxAttempts ?? 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const cancelFromCaller = () => controller.abort();
    if (options.signal?.aborted) {
      throw new AiUnavailableError("AI-запрос отменён пользователем.", "AI_CANCELLED", false);
    }
    options.signal?.addEventListener("abort", cancelFromCaller, { once: true });
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 45_000);
    try {
      await options.onProgress?.({ stage: "provider_started", provider: "openai", model });
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          ...(options.requestId ? { "x-client-request-id": options.requestId } : {}),
        },
        body: JSON.stringify({
          model,
          instructions: options.instructions,
          input: options.rawInput ? options.input : typeof options.input === "string" ? options.input : JSON.stringify(options.input),
          ...(options.safetyIdentifier ? { safety_identifier: options.safetyIdentifier } : {}),
          ...(options.reasoningEffort ? { reasoning: { effort: options.reasoningEffort } } : {}),
          stream: Boolean(options.onProgress),
          text: {
            ...(options.textVerbosity ? { verbosity: options.textVerbosity } : {}),
            format: {
              type: "json_schema",
              name: options.schemaName,
              strict: true,
              schema: options.schema,
            },
          },
        }),
        signal: controller.signal,
      });
      const payload = options.onProgress && response.ok
        ? await readOpenAiEventStream(response, options.onProgress)
        : await response.json().catch(() => ({})) as ResponsesApiPayload;
      totalUsage.inputTokens += payload.usage?.input_tokens ?? 0;
      totalUsage.outputTokens += payload.usage?.output_tokens ?? 0;
      totalUsage.cachedInputTokens += payload.usage?.input_tokens_details?.cached_tokens ?? 0;

      if (!response.ok) {
        const retryable = response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500;
        if (retryable && attempt < maxAttempts) continue;
        throw new AiUnavailableError(
          `AI-проверка недоступна: ${payload.error?.message || `HTTP ${response.status}`}`,
          "PROVIDER_UNAVAILABLE",
          retryable,
          response.status,
          payload.error?.code || payload.error?.type || null,
        );
      }

      const content = payload.output?.flatMap((item) => item.content ?? []) ?? [];
      const refusal = content.find((item) => item.type === "refusal" && item.refusal)?.refusal;
      if (refusal) {
        throw new AiUnavailableError("AI-провайдер отказался обрабатывать запрос.", "AI_REFUSED", false);
      }
      if (payload.status && payload.status !== "completed") {
        const reason = payload.incomplete_details?.reason || payload.status;
        throw new AiUnavailableError(`AI-проверка не завершена: ${reason}.`, "PROVIDER_UNAVAILABLE", true);
      }
      const text = content.find((item) => item.type === "output_text" && item.text)?.text;
      if (!text) {
        if (attempt < maxAttempts) continue;
        throw new AiUnavailableError("AI-проверка не вернула структурированный результат.", "INVALID_AI_OUTPUT", false);
      }
      try {
        const data = options.parse(JSON.parse(text));
        return {
          data,
          provider: "openai",
          model: payload.model || model,
          providerResponseId: payload.id || null,
          attempts: attempt,
          latencyMs: Date.now() - startedAt,
          usage: totalUsage,
          fallbackFromProvider: null,
        };
      } catch {
        if (attempt < maxAttempts) continue;
        throw new AiUnavailableError("AI-проверка вернула результат, не соответствующий контракту.", "INVALID_AI_OUTPUT", false);
      }
    } catch (error) {
      if (error instanceof AiUnavailableError) {
        if (error.retryable && attempt < maxAttempts) continue;
        throw error;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        if (options.signal?.aborted) {
          throw new AiUnavailableError("AI-запрос отменён пользователем.", "AI_CANCELLED", false);
        }
        if (attempt < maxAttempts) continue;
        throw new AiUnavailableError("AI-проверка превысила допустимое время ожидания.", "PROVIDER_TIMEOUT", true);
      }
      if (attempt >= maxAttempts) {
        throw new AiUnavailableError("AI-проверка временно недоступна.", "PROVIDER_UNAVAILABLE", true);
      }
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", cancelFromCaller);
    }
  }
  throw new AiUnavailableError("AI-проверка временно недоступна.", "PROVIDER_UNAVAILABLE", true);
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunk, bytes.length)));

  }
  return btoa(binary);
}
async function readOpenAiEventStream(
  response: Response,
  onProgress: (event: AiStructuredProgress) => void | Promise<void>,
): Promise<ResponsesApiPayload> {
  try {
    return await readResponsesSse(response, onProgress) as ResponsesApiPayload;
  } catch (error) {
    if (error instanceof ResponsesSseError) {
      throw new AiUnavailableError(error.message, error.code, error.retryable);
    }
    throw error;
  }
}
