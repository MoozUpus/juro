import { z } from "zod";

import { recordProviderUsage } from "../ai/provider-usage";
import { assertProviderCallAllowed } from "../ai/provider-cost-control";

export const LEGAL_CORPUS_EMBEDDING_DIMENSIONS = 1_536;
const DEFAULT_MODEL = "text-embedding-3-large";
const MAX_BATCH = 64;
// Corpus imports occasionally contain a large schedule in one source chunk.
// Keep a hard pre-normalization memory bound even though the provider packet
// below is reduced much further.
const MAX_RAW_INPUT_CHARS = 100_000;
// The embedding API limits tokens, not JavaScript characters. Bounding UTF-8
// bytes is tokenizer-independent because a BPE token always represents at
// least one input byte. Leave headroom below the provider's 8,192-token cap.
const MAX_INPUT_UTF8_BYTES = 7_500;
const TRUNCATION_MARKER = "\n…\n";
const utf8Encoder = new TextEncoder();
const REQUEST_TIMEOUT_MS = 20_000;
const RESPONSE_LIMIT_BYTES = 2_500_000;

export type LegalCorpusEmbeddingEnv = {
  APP_ENV: "development" | "staging" | "production";
  DB: D1Database;
  OPENAI_API_KEY?: string;
  EMBEDDING_MODEL?: string;
  LEGAL_CORPUS_EMBEDDING_SERVICE?: Fetcher;
};

export interface LegalCorpusEmbeddingProvider {
  embed(
    inputs: readonly string[],
    usage: {
      feature: "legal_corpus_indexing" | "legal_corpus_retrieval";
      signal?: AbortSignal;
      timeoutMs?: number;
    },
  ): Promise<number[][]>;
}

const responseSchema = z.object({
  object: z.literal("list"),
  model: z.string().trim().min(1).max(120),
  data: z.array(z.object({
    object: z.literal("embedding").optional(),
    index: z.number().int().nonnegative(),
    embedding: z.array(z.number().finite()).length(LEGAL_CORPUS_EMBEDDING_DIMENSIONS),
  })).min(1).max(MAX_BATCH),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
  }).strict(),
}).strict();

export class LegalCorpusEmbeddingError extends Error {
  constructor(
    readonly code:
      | "LEGAL_CORPUS_EMBEDDING_CONFIGURATION_REJECTED"
      | "LEGAL_CORPUS_EMBEDDING_REQUEST_FAILED"
      | "LEGAL_CORPUS_EMBEDDING_RESPONSE_REJECTED"
      | "LEGAL_CORPUS_EMBEDDING_USAGE_FAILED",
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = "LegalCorpusEmbeddingError";
  }
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function utf8Prefix(input: string, byteBudget: number): string {
  let used = 0;
  let result = "";
  for (const character of input) {
    const bytes = utf8Encoder.encode(character).byteLength;
    if (used + bytes > byteBudget) break;
    result += character;
    used += bytes;
  }
  return result;
}

function utf8Suffix(input: string, byteBudget: number): string {
  let used = 0;
  const result: string[] = [];
  const characters = [...input];
  for (let index = characters.length - 1; index >= 0; index -= 1) {
    const character = characters[index]!;
    const bytes = utf8Encoder.encode(character).byteLength;
    if (used + bytes > byteBudget) break;
    result.push(character);
    used += bytes;
  }
  return result.reverse().join("");
}

function boundedEmbeddingInput(input: string): string {
  if (utf8Encoder.encode(input).byteLength <= MAX_INPUT_UTF8_BYTES) return input;
  const markerBytes = utf8Encoder.encode(TRUNCATION_MARKER).byteLength;
  const contentBudget = MAX_INPUT_UTF8_BYTES - markerBytes;
  const headBudget = Math.floor(contentBudget * 2 / 3);
  return `${utf8Prefix(input, headBudget)}${TRUNCATION_MARKER}${utf8Suffix(
    input,
    contentBudget - headBudget,
  )}`;
}

async function limitedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > RESPONSE_LIMIT_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new LegalCorpusEmbeddingError("LEGAL_CORPUS_EMBEDDING_RESPONSE_REJECTED", false);
  }
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    if (total > RESPONSE_LIMIT_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new LegalCorpusEmbeddingError("LEGAL_CORPUS_EMBEDDING_RESPONSE_REJECTED", false);
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new LegalCorpusEmbeddingError("LEGAL_CORPUS_EMBEDDING_RESPONSE_REJECTED", false);
  }
}

export class OpenAiLegalCorpusEmbeddingProvider implements LegalCorpusEmbeddingProvider {
  constructor(
    private readonly env: LegalCorpusEmbeddingEnv,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async embed(
    inputs: readonly string[],
    usage: {
      feature: "legal_corpus_indexing" | "legal_corpus_retrieval";
      signal?: AbortSignal;
      timeoutMs?: number;
    },
  ): Promise<number[][]> {
    if (
      (!this.env.OPENAI_API_KEY?.trim() && !this.env.LEGAL_CORPUS_EMBEDDING_SERVICE)
      || inputs.length < 1
      || inputs.length > MAX_BATCH
      || inputs.some((input) => input.length < 1 || input.length > MAX_RAW_INPUT_CHARS)
    ) {
      throw new LegalCorpusEmbeddingError("LEGAL_CORPUS_EMBEDDING_CONFIGURATION_REJECTED", false);
    }
    const normalized = inputs.map((input) => boundedEmbeddingInput(input.normalize("NFKC").trim()));
    if (normalized.some((input) => input.length < 1)) {
      throw new LegalCorpusEmbeddingError("LEGAL_CORPUS_EMBEDDING_CONFIGURATION_REJECTED", false);
    }
    const model = this.env.EMBEDDING_MODEL?.trim() || DEFAULT_MODEL;
    if (!/^[A-Za-z0-9._:-]{1,120}$/u.test(model)) {
      throw new LegalCorpusEmbeddingError("LEGAL_CORPUS_EMBEDDING_CONFIGURATION_REJECTED", false);
    }
    try {
      await assertProviderCallAllowed({
        db: this.env.DB,
        environment: this.env.APP_ENV,
        provider: "openai",
      });
    } catch {
      throw new LegalCorpusEmbeddingError("LEGAL_CORPUS_EMBEDDING_REQUEST_FAILED", false);
    }
    const startedAt = new Date().toISOString();
    const recordFailure = async (errorCode: string): Promise<void> => {
      try {
        await recordProviderUsage({
          db: this.env.DB,
          environment: this.env.APP_ENV,
          workspaceId: null,
          userId: null,
          feature: usage.feature,
          operation: "embeddings",
          provider: "openai",
          model,
          inputTokens: 0,
          itemCount: normalized.length,
          dimensions: LEGAL_CORPUS_EMBEDDING_DIMENSIONS,
          status: "failed",
          errorCode,
          startedAt,
          completedAt: new Date().toISOString(),
        });
      } catch (error) {
        if (this.env.APP_ENV !== "production") {
          const cause = (error as { code?: unknown } | null)?.code;
          console.error(JSON.stringify({
            event: "legal_corpus.embedding_usage_failed",
            environment: this.env.APP_ENV,
            feature: usage.feature,
            itemCount: normalized.length,
            code: typeof cause === "string" && /^[A-Z][A-Z0-9_]{2,80}$/u.test(cause)
              ? cause
              : "PROVIDER_USAGE_FAILED",
          }));
        }
        throw new LegalCorpusEmbeddingError("LEGAL_CORPUS_EMBEDDING_USAGE_FAILED", true);
      }
    };

    let response: Response;
    try {
      const endpoint = this.env.LEGAL_CORPUS_EMBEDDING_SERVICE
        ? "https://embeddings.internal/v1/embeddings"
        : "https://api.openai.com/v1/embeddings";
      const init: RequestInit = {
        method: "POST",
        // Cloudflare service bindings reject `redirect: "error"`. Manual mode
        // keeps redirects visible and the non-OK branch below rejects them.
        redirect: "manual",
        signal: usage.signal
          ? AbortSignal.any([
            usage.signal,
            AbortSignal.timeout(Math.max(1, Math.min(
              usage.timeoutMs ?? REQUEST_TIMEOUT_MS,
              REQUEST_TIMEOUT_MS,
            ))),
          ])
          : AbortSignal.timeout(Math.max(1, Math.min(
            usage.timeoutMs ?? REQUEST_TIMEOUT_MS,
            REQUEST_TIMEOUT_MS,
          ))),
        headers: {
          ...(!this.env.LEGAL_CORPUS_EMBEDDING_SERVICE && this.env.OPENAI_API_KEY
            ? { authorization: `Bearer ${this.env.OPENAI_API_KEY}` }
            : {}),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: normalized,
          dimensions: LEGAL_CORPUS_EMBEDDING_DIMENSIONS,
          encoding_format: "float",
        }),
      };
      response = this.env.LEGAL_CORPUS_EMBEDDING_SERVICE
        ? await this.env.LEGAL_CORPUS_EMBEDDING_SERVICE.fetch(new Request(endpoint, init))
        : await this.fetchImpl(endpoint, init);
    } catch {
      await recordFailure("PROVIDER_NETWORK_ERROR");
      throw new LegalCorpusEmbeddingError("LEGAL_CORPUS_EMBEDDING_REQUEST_FAILED", true);
    }
    if (!response.ok) {
      const status = response.status;
      await response.body?.cancel().catch(() => undefined);
      await recordFailure(`PROVIDER_HTTP_${status}`);
      throw new LegalCorpusEmbeddingError(
        "LEGAL_CORPUS_EMBEDDING_REQUEST_FAILED",
        retryableStatus(status),
      );
    }

    let parsed: z.infer<typeof responseSchema>;
    try {
      parsed = responseSchema.parse(await limitedJson(response));
    } catch {
      await recordFailure("PROVIDER_RESPONSE_INVALID");
      throw new LegalCorpusEmbeddingError("LEGAL_CORPUS_EMBEDDING_RESPONSE_REJECTED", false);
    }
    if (
      parsed.data.length !== normalized.length
      || parsed.data.some((item, index) => item.index !== index)
      || parsed.usage.total_tokens < parsed.usage.prompt_tokens
      || parsed.model !== model
    ) {
      await recordFailure("PROVIDER_RESPONSE_INVALID");
      throw new LegalCorpusEmbeddingError("LEGAL_CORPUS_EMBEDDING_RESPONSE_REJECTED", false);
    }
    try {
      await recordProviderUsage({
        db: this.env.DB,
        environment: this.env.APP_ENV,
        workspaceId: null,
        userId: null,
        feature: usage.feature,
        operation: "embeddings",
        provider: "openai",
        model: parsed.model,
        providerRequestId: response.headers.get("x-request-id"),
        inputTokens: parsed.usage.prompt_tokens,
        itemCount: normalized.length,
        dimensions: LEGAL_CORPUS_EMBEDDING_DIMENSIONS,
        status: "succeeded",
        startedAt,
        completedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (this.env.APP_ENV !== "production") {
        const cause = (error as { code?: unknown } | null)?.code;
        console.error(JSON.stringify({
          event: "legal_corpus.embedding_usage_failed",
          environment: this.env.APP_ENV,
          feature: usage.feature,
          itemCount: normalized.length,
          code: typeof cause === "string" && /^[A-Z][A-Z0-9_]{2,80}$/u.test(cause)
            ? cause
            : "PROVIDER_USAGE_FAILED",
        }));
      }
      throw new LegalCorpusEmbeddingError("LEGAL_CORPUS_EMBEDDING_USAGE_FAILED", true);
    }
    return parsed.data.map((item) => item.embedding);
  }
}
