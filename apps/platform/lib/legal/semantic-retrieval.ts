import { z } from "zod";

export type LegalSemanticSearchEnv = {
  APP_ENV?: "development" | "staging" | "production";
  OPENAI_API_KEY?: string;
  EMBEDDING_MODEL?: string;
  LEX_UZ_INDEX?: VectorizeIndex;
};

export type LegalSemanticSearchResult = {
  status: "used" | "unavailable" | "failed";
  vectorRanks: ReadonlyMap<string, number>;
};

const EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-large";
const MAX_VECTOR_RESULTS_PER_INDEX = 24;
const vectorIdSchema = z.string().regex(/^vec_[A-Za-z0-9:_-]{1,180}$/);
const embeddingPayloadSchema = z.object({
  data: z.array(z.object({
    index: z.literal(0),
    embedding: z.array(z.number().finite()).length(EMBEDDING_DIMENSIONS),
  })).length(1),
}).strict();

function configured(env: LegalSemanticSearchEnv): env is Required<Pick<
  LegalSemanticSearchEnv,
  "APP_ENV" | "OPENAI_API_KEY" | "LEX_UZ_INDEX"
>> & LegalSemanticSearchEnv {
  return Boolean(
    env.APP_ENV
    && env.OPENAI_API_KEY
    && env.LEX_UZ_INDEX,
  );
}

async function embedQuery(
  env: LegalSemanticSearchEnv,
  query: string,
): Promise<number[] | null> {
  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
        input: [query],
        dimensions: EMBEDDING_DIMENSIONS,
        encoding_format: "float",
      }),
    });
    if (!response.ok) return null;
    return embeddingPayloadSchema.parse(await response.json()).data[0]!.embedding;
  } catch {
    return null;
  }
}

/**
 * Returns only deterministic vector ids. Callers must still use D1 to reload
 * and cryptographically revalidate current publication evidence before a
 * result enters a legal prompt.
 */
export async function semanticLegalChunkRanks(
  env: LegalSemanticSearchEnv | undefined,
  query: string,
  locale: "ru" | "uz",
): Promise<LegalSemanticSearchResult> {
  if (!env || !configured(env) || query.trim().length < 5) {
    return { status: "unavailable", vectorRanks: new Map() };
  }
  const embedding = await embedQuery(env, query);
  if (!embedding) return { status: "failed", vectorRanks: new Map() };
  try {
    const filter = { environment: env.APP_ENV, language: locale };
    const results = [await env.LEX_UZ_INDEX.query(embedding, {
      topK: MAX_VECTOR_RESULTS_PER_INDEX,
      returnMetadata: "indexed",
      filter,
    })];
    const ranks = new Map<string, number>();
    let rank = 0;
    for (const result of results) {
      for (const match of result.matches) {
        const id = vectorIdSchema.safeParse(match.id);
        if (!id.success || ranks.has(id.data)) continue;
        ranks.set(id.data, rank++);
      }
    }
    return { status: "used", vectorRanks: ranks };
  } catch {
    return { status: "failed", vectorRanks: new Map() };
  }
}
