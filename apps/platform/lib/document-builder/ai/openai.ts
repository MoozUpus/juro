import { runtimeEnv } from "../storage/runtime";

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

interface ResponsesApiPayload {
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string };
}

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
  const configuration = runtimeEnv();
  const apiKey = configuration.OPENAI_API_KEY || (configuration.AI_PROVIDER === "openai" ? configuration.AI_PROVIDER_API_KEY : undefined);
  if (!apiKey) {
    throw new AiUnavailableError("AI-модель не подключена: отсутствует серверный ключ провайдера.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 45_000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: configuration.OPENAI_MODEL || "gpt-5.6-sol",
        instructions: options.instructions,
        input: options.rawInput ? options.input : typeof options.input === "string" ? options.input : JSON.stringify(options.input),
        text: {
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
    const payload = await response.json() as ResponsesApiPayload;
    if (!response.ok) throw new AiUnavailableError(`AI-проверка недоступна: ${payload.error?.message || `HTTP ${response.status}`}`);
    const text = payload.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === "output_text" && item.text)?.text;
    if (!text) throw new AiUnavailableError("AI-проверка не вернула структурированный результат.");
    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof AiUnavailableError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AiUnavailableError("AI-проверка превысила допустимое время ожидания.");
    }
    throw new AiUnavailableError("AI-проверка временно недоступна. Выполнена детерминированная проверка.");
  } finally {
    clearTimeout(timeout);
  }
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
