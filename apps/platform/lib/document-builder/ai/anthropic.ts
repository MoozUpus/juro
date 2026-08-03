import { DEFAULT_ANTHROPIC_MODEL } from "../../ai/provider-models";
import { anthropicCompatibleJsonSchema } from "../../ai/anthropic-schema";
import { runtimeEnv } from "../storage/runtime";
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
}

export function hasAnthropicConfiguration(): boolean {
  return Boolean(runtimeEnv().ANTHROPIC_API_KEY);
}

export async function callAnthropicStructured<T>(options: {
  instructions: string;
  input: unknown;
  schema: Record<string, unknown>;
  parse: (value: unknown) => T;
  timeoutMs?: number;
  requestId?: string;
  model?: string;
  maxAttempts?: 1 | 2;
  signal?: AbortSignal;
  strictOutput?: boolean;
}): Promise<AiStructuredResult<T>> {
  const configuration = runtimeEnv();
  const apiKey = configuration.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AiUnavailableError("Резервный AI-провайдер не подключён: отсутствует серверный ключ.");
  }
  const model = options.model || configuration.ANTHROPIC_FALLBACK_MODEL || DEFAULT_ANTHROPIC_MODEL;
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
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          ...(options.requestId ? { "x-client-request-id": options.requestId } : {}),
        },
        body: JSON.stringify({
          model,
          max_tokens: 8_192,
          system: options.instructions,
          messages: [{
            role: "user",
            content: typeof options.input === "string" ? options.input : JSON.stringify(options.input),
          }],
          ...(options.strictOutput === false ? {
            tools: [{
              name: "emit_result",
              description: "Return the complete validated JURO result.",
              input_schema: anthropicCompatibleJsonSchema(options.schema),
            }],
            tool_choice: { type: "tool", name: "emit_result" },
          } : { output_config: {
            format: {
              type: "json_schema",
              schema: anthropicCompatibleJsonSchema(options.schema),
            },
          } }),
        }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({})) as AnthropicMessagesPayload;
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
        );
      }
      if (payload.stop_reason === "refusal") {
        throw new AiUnavailableError("AI-провайдер отказался обрабатывать запрос.", "AI_REFUSED", false);
      }
      if (payload.stop_reason === "max_tokens") {
        if (attempt < maxAttempts) continue;
        throw new AiUnavailableError("Резервный AI-ответ превысил допустимый размер.", "INVALID_AI_OUTPUT", false);
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
        throw new AiUnavailableError("Резервная AI-проверка не вернула структурированный результат.", "INVALID_AI_OUTPUT", false);
      }
      try {
        return {
          data: options.parse(options.strictOutput === false ? toolInput : JSON.parse(text!)),
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
        throw new AiUnavailableError("Резервная AI-проверка вернула результат вне контракта.", "INVALID_AI_OUTPUT", false);
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
        throw new AiUnavailableError("Резервная AI-проверка превысила время ожидания.", "PROVIDER_TIMEOUT", true);
      }
      if (attempt >= maxAttempts) {
        throw new AiUnavailableError("Резервная AI-проверка временно недоступна.", "PROVIDER_UNAVAILABLE", true);
      }
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", cancelFromCaller);
    }
  }
  throw new AiUnavailableError("Резервная AI-проверка временно недоступна.", "PROVIDER_UNAVAILABLE", true);
}
