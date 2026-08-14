import assert from "node:assert/strict";
import test from "node:test";
import { semanticLegalChunkRanks } from "../lib/legal/semantic-retrieval";

function embedding(): number[] {
  return Array.from({ length: 1536 }, () => 0.01);
}

test("semantic legal retrieval stays disabled without its required Lex binding", async () => {
  const result = await semanticLegalChunkRanks(undefined, "проверить трудовой договор", "ru");
  assert.equal(result.status, "unavailable");
  assert.equal(result.vectorRanks.size, 0);
});

test("semantic legal retrieval queries only Lex and returns deterministic ids", async () => {
  const originalFetch = globalThis.fetch;
  const observedFilters: unknown[] = [];
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://api.openai.com/v1/embeddings");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer synthetic-key");
    const body = JSON.parse(String(init?.body)) as { dimensions: number; input: string[] };
    assert.equal(body.dimensions, 1536);
    assert.deepEqual(body.input, ["проверить трудовой договор"]);
    return Response.json({ data: [{ index: 0, embedding: embedding() }] });
  };
  const index = (matches: string[]) => ({
    query: async (_vector: number[], options?: VectorizeQueryOptions) => {
      observedFilters.push(options?.filter);
      return { count: matches.length, matches: matches.map((id, position) => ({ id, score: 1 - position / 10 })) };
    },
  }) as unknown as VectorizeIndex;
  try {
    const result = await semanticLegalChunkRanks({
      APP_ENV: "staging",
      OPENAI_API_KEY: "synthetic-key",
      LEX_UZ_INDEX: index(["vec_lex_chunk", "bad id"]),
    }, "проверить трудовой договор", "ru");
    assert.equal(result.status, "used");
    assert.deepEqual([...result.vectorRanks.keys()], ["vec_lex_chunk"]);
    assert.deepEqual(observedFilters, [
      { environment: "staging", language: "ru" },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("embedding or Vectorize failure cannot manufacture a semantic result", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  const emptyIndex = { query: async () => ({ count: 0, matches: [] }) } as unknown as VectorizeIndex;
  try {
    const result = await semanticLegalChunkRanks({
      APP_ENV: "staging",
      OPENAI_API_KEY: "synthetic-key",
      LEX_UZ_INDEX: emptyIndex,
    }, "проверить трудовой договор", "ru");
    assert.equal(result.status, "failed");
    assert.equal(result.vectorRanks.size, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
