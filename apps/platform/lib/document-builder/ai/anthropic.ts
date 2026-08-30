import { anthropicCompatibleJsonSchema } from "../../ai/anthropic-schema";
import { runtimeEnv } from "../storage/runtime";
import { resolveAiRuntimeSettings } from "../../ai/runtime-settings";
import {
  ProviderRequestAbortError,
  runProviderRequestWithTimeouts,
} from "../../ai/provider-request-timeout";
import {
  AiUnavailableError,
  type AiProviderUsage,
  type AiStructuredResult,
} from "./openai";

interface AnthropicMessagesPayload {
  id?: string;
  model?: string;
  content?: Array<{ type?: string; text?: string; name?: string; input?: unknown }>;
  stop_reason?: string | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
  };
  error?: { type?: string; message?: string };
  request_id?: string;
}

function anthropicProviderRequestId(response: Response, payload: AnthropicMessagesPayload): string | null {
  const candidate = response.headers.get("request-id") || payload.request_id;
  return candidate && /^req_[A-Za-z0-9]{8,128}$/u.test(candidate) ? candidate : null;
}

export function hasAnthropicConfiguration(): boolean {
  return Boolean(runtimeEnv().ANTHROPIC_API_KEY);
}

export async function probeAnthropicConnectivity(options: {
  model?: string;
  timeoutMs?: number;
  deadlineAt?: number;
  signal?: AbortSignal;
} = {}): Promise<{ providerResponseId: string | null }> {
  const configuration = runtimeEnv();
  const apiKey = configuration.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AiUnavailableError("Резервный AI-провайдер не подключён: отсутствует серверный ключ.");
  }
  const model = options.model || (await resolveAiRuntimeSettings({
    db: configuration.DB,
    env: configuration,
  })).anthropicChatFallbackModel;
  const timeoutMs = options.timeoutMs ?? 5_000;

  try {
    const { response, payload } = await runProviderRequestWithTimeouts({
      firstByteTimeoutMs: timeoutMs,
      totalResponseTimeoutMs: timeoutMs,
      deadlineAt: options.deadlineAt,
      callerSignal: options.signal,
      start: (signal) => fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1,
          messages: [{ role: "user", content: "Reply OK." }],
        }),
        signal,
      }),
      consume: async (response) => ({
        response,
        payload: await response.json().catch(() => ({})) as AnthropicMessagesPayload,
      }),
    });
    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 409
        || response.status === 429 || response.status >= 500;
      throw new AiUnavailableError(
        "Резервный AI-провайдер не прошёл проверку соединения.",
        "PROVIDER_UNAVAILABLE",
        retryable,
        response.status,
        payload.error?.type ?? null,
        anthropicProviderRequestId(response, payload),
      );
    }
    return {
      providerResponseId: payload.id || anthropicProviderRequestId(response, payload),
    };
  } catch (error) {
    if (error instanceof AiUnavailableError) throw error;
    if (error instanceof ProviderRequestAbortError) {
      if (error.reason === "caller") {
        throw new AiUnavailableError("AI-запрос отменён пользователем.", "AI_CANCELLED", false);
      }
      throw new AiUnavailableError(
        error.reason === "first_byte_timeout"
          ? "Резервный AI-провайдер не начал проверочный ответ в допустимое время."
          : "Проверка соединения с резервным AI-провайдером превысила допустимое время.",
        "PROVIDER_TIMEOUT",
        true,
        null,
        error.reason,
      );
    }
    throw new AiUnavailableError(
      "Резервный AI-провайдер временно недоступен.",
      "PROVIDER_UNAVAILABLE",
      true,
    );
  }
}

const anthropicJsonEnvelopeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["payload_json"],
  properties: {
    payload_json: {
      type: "string",
      description: "A JSON string containing the complete JURO result.",
    },
  },
} as const;

export function parseAnthropicJsonEnvelope(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Anthropic tool input must be an object.");
  }
  const payloadJson = (input as { payload_json?: unknown }).payload_json;
  if (typeof payloadJson !== "string") {
    throw new TypeError("Anthropic tool input must contain payload_json.");
  }
  return JSON.parse(payloadJson);
}

export async function callAnthropicStructured<T>(options: {
  instructions: string;
  input: unknown;
  schema: Record<string, unknown>;
  parse: (value: unknown) => T;
  timeoutMs?: number;
  firstByteTimeoutMs?: number;
  totalResponseTimeoutMs?: number;
  /** Absolute request deadline shared with caller orchestration. */
  deadlineAt?: number;
  requestId?: string;
  model?: string;
  maxAttempts?: 1 | 2;
  signal?: AbortSignal;
  strictOutput?: boolean;
  /** Keep interactive structured results bounded without affecting document analysis. */
  maxTokens?: number;
}): Promise<AiStructuredResult<T>> {
  const configuration = runtimeEnv();
  const apiKey = configuration.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AiUnavailableError("Резервный AI-провайдер не подключён: отсутствует серверный ключ.");
  }
  const model = options.model || (await resolveAiRuntimeSettings({
    db: configuration.DB,
    env: configuration,
  })).anthropicChatFallbackModel;
  const startedAt = Date.now();
  const totalUsage: AiProviderUsage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
  const maxAttempts = options.maxAttempts ?? 2;
  const legacyTimeoutMs = options.timeoutMs ?? 45_000;
  const firstByteTimeoutMs = options.firstByteTimeoutMs ?? legacyTimeoutMs;
  const totalResponseTimeoutMs = options.totalResponseTimeoutMs ?? legacyTimeoutMs;
  const providerSchema = anthropicCompatibleJsonSchema(options.schema);
  const systemInstructions = options.strictOutput === false
    ? `${options.instructions}\n\nCall emit_result exactly once. Its payload_json field must be a JSON string matching this schema: ${JSON.stringify(providerSchema)}`
    : options.instructions;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (options.signal?.aborted) {
      throw new AiUnavailableError("AI-запрос отменён пользователем.", "AI_CANCELLED", false);
    }
    try {
      const { response, payload } = await runProviderRequestWithTimeouts({
        firstByteTimeoutMs,
        totalResponseTimeoutMs,
        deadlineAt: options.deadlineAt,
        callerSignal: options.signal,
        start: (signal) => fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model,
            max_tokens: options.maxTokens ?? 8_192,
            system: systemInstructions,
            messages: [{
              role: "user",
              content: typeof options.input === "string" ? options.input : JSON.stringify(options.input),
            }],
            ...(options.strictOutput === false ? {
              tools: [{
                name: "emit_result",
                description: "Return the complete validated JURO result.",
                input_schema: anthropicJsonEnvelopeSchema,
              }],
              tool_choice: { type: "tool", name: "emit_result" },
            } : { output_config: {
              format: {
                type: "json_schema",
                schema: providerSchema,
              },
            } }),
          }),
          signal,
        }),
        consume: async (response) => ({
          response,
          payload: await response.json().catch(() => ({})) as AnthropicMessagesPayload,
        }),
      });
      totalUsage.inputTokens += payload.usage?.input_tokens ?? 0;
      totalUsage.outputTokens += payload.usage?.output_tokens ?? 0;
      totalUsage.cachedInputTokens += payload.usage?.cache_read_input_tokens ?? 0;

      if (!response.ok) {
        const retryable = response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500;
        if (retryable && attempt < maxAttempts) continue;
        throw new AiUnavailableError(
          `Резервная AI-проверка недоступна: ${payload.error?.message || `HTTP ${response.status}`}`,
          "PROVIDER_UNAVAILABLE",
          retryable,
          response.status,
          payload.error?.type ?? null,
          anthropicProviderRequestId(response, payload),
        );
      }
      if (payload.stop_reason === "refusal") {
        throw new AiUnavailableError("AI-провайдер отказался обрабатывать запрос.", "AI_REFUSED", false);
      }
      if (payload.stop_reason === "max_tokens") {
        if (attempt < maxAttempts) continue;
        throw new AiUnavailableError(
          "Резервный AI-ответ превысил допустимый размер.",
          "INVALID_AI_OUTPUT",
          false,
          null,
          "anthropic_output_max_tokens",
        );
      }
      if (payload.stop_reason && payload.stop_reason !== "end_turn" && payload.stop_reason !== "stop_sequence"
        && !(options.strictOutput === false && payload.stop_reason === "tool_use")) {
        throw new AiUnavailableError(`Резервная AI-проверка не завершена: ${payload.stop_reason}.`, "PROVIDER_UNAVAILABLE", true);
      }
      const toolInput = options.strictOutput === false
        ? payload.content?.find((item) => item.type === "tool_use" && item.name === "emit_result")?.input
        : undefined;
      const text = payload.content?.find((item) => item.type === "text" && item.text)?.text;
      if (options.strictOutput === false ? toolInput === undefined : !text) {
        if (attempt < maxAttempts) continue;
        throw new AiUnavailableError(
          "Резервная AI-проверка не вернула структурированный результат.",
          "INVALID_AI_OUTPUT",
          false,
          null,
          options.strictOutput === false ? "anthropic_tool_result_missing" : "anthropic_text_result_missing",
        );
      }
      let structuredPayload: unknown;
      try {
        structuredPayload = options.strictOutput === false ? parseAnthropicJsonEnvelope(toolInput) : JSON.parse(text!);
      } catch {
        if (attempt < maxAttempts) continue;
        throw new AiUnavailableError(
          "Резервная AI-проверка вернула некорректный структурированный JSON.",
          "INVALID_AI_OUTPUT",
          false,
          null,
          options.strictOutput === false ? "anthropic_envelope_json_invalid" : "anthropic_json_invalid",
        );
      }
      try {
        return {
          data: options.parse(structuredPayload),
          provider: "anthropic",
          model: payload.model || model,
          providerResponseId: payload.id || response.headers.get("request-id"),
          attempts: attempt,
          latencyMs: Date.now() - startedAt,
          usage: totalUsage,
          fallbackFromProvider: null,
        };
      } catch {
        if (attempt < maxAttempts) continue;
        throw new AiUnavailableError(
          "Резервная AI-проверка вернула результат вне структурированного контракта.",
          "INVALID_AI_OUTPUT",
          false,
          null,
          options.strictOutput === false ? "anthropic_envelope_schema_invalid" : "anthropic_schema_invalid",
        );
      }
    } catch (error) {
      if (error instanceof AiUnavailableError) {
        if (error.retryable && attempt < maxAttempts) continue;
        throw error;
      }
      if (error instanceof ProviderRequestAbortError) {
        if (error.reason === "caller") {
          throw new AiUnavailableError("AI-запрос отменён пользователем.", "AI_CANCELLED", false);
        }
        if (attempt < maxAttempts) continue;
        throw new AiUnavailableError(
          error.reason === "first_byte_timeout"
            ? "Резервный AI-провайдер не начал ответ в допустимое время."
            : "Резервная AI-проверка превысила допустимое полное время ответа.",
          "PROVIDER_TIMEOUT",
          true,
          null,
          error.reason,
        );
      }
      if (attempt >= maxAttempts) {
        throw new AiUnavailableError("Резервная AI-проверка временно недоступна.", "PROVIDER_UNAVAILABLE", true);
      }
    }
  }
  throw new AiUnavailableError("Резервная AI-проверка временно недоступна.", "PROVIDER_UNAVAILABLE", true);
}
