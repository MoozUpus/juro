import { z } from "zod";

import { recordProviderUsage } from "../ai/provider-usage";
import { assertProviderCallAllowed } from "../ai/provider-cost-control";

export const LEGAL_CORPUS_EMBEDDING_DIMENSIONS = 1_536;
const DEFAULT_MODEL = "text-embedding-3-large";
const MAX_BATCH = 32;
const MAX_INPUT_CHARS = 24_000;
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
    usage: { feature: "legal_corpus_indexing" | "legal_corpus_retrieval" },
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
    usage: { feature: "legal_corpus_indexing" | "legal_corpus_retrieval" },
  ): Promise<number[][]> {
    const normalized = inputs.map((input) => input.normalize("NFKC").trim());
    if (
      (!this.env.OPENAI_API_KEY?.trim() && !this.env.LEGAL_CORPUS_EMBEDDING_SERVICE)
      || normalized.length < 1
      || normalized.length > MAX_BATCH
      || normalized.some((input) => input.length < 1 || input.length > MAX_INPUT_CHARS)
    ) {
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
      } catch {
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
        redirect: "error",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
      if (this.env.LEGAL_CORPUS_EMBEDDING_SERVICE) {
        // AbortSignal is not transferable across Worker service bindings in
        // every runtime. Keep the bounded timeout locally while forwarding a
        // signal-free URL + init request to the private relay.
        const serviceInit = { ...init };
        delete serviceInit.signal;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          response = await Promise.race([
            this.env.LEGAL_CORPUS_EMBEDDING_SERVICE.fetch(endpoint, serviceInit),
            new Promise<Response>((_, reject) => {
              timer = setTimeout(() => reject(new Error("embedding_service_timeout")), REQUEST_TIMEOUT_MS);
            }),
          ]);
        } finally {
          if (timer !== undefined) clearTimeout(timer);
        }
      } else {
        response = await this.fetchImpl(endpoint, init);
      }
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
    } catch {
      throw new LegalCorpusEmbeddingError("LEGAL_CORPUS_EMBEDDING_USAGE_FAILED", true);
    }
    return parsed.data.map((item) => item.embedding);
  }
}
