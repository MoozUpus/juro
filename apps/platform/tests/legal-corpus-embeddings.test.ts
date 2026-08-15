import assert from "node:assert/strict";
import test from "node:test";

import {
  LegalCorpusEmbeddingError,
  OpenAiLegalCorpusEmbeddingProvider,
} from "../lib/legal-corpus/embeddings";
import { sqliteD1Fixture } from "./helpers/sqlite-d1";

test("legal corpus embedding provider rejects missing server credentials before fetch", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  let calls = 0;
  try {
    const provider = new OpenAiLegalCorpusEmbeddingProvider({
      APP_ENV: "staging", DB: d1,
    }, async () => {
      calls += 1;
      return new Response();
    });
    await assert.rejects(
      () => provider.embed(["legal query"], { feature: "legal_corpus_retrieval" }),
      (error: unknown) => error instanceof LegalCorpusEmbeddingError
        && error.code === "LEGAL_CORPUS_EMBEDDING_CONFIGURATION_REJECTED",
    );
    assert.equal(calls, 0);
  } finally {
    sqlite.close();
  }
});

test("legal corpus embeddings obey the existing provider cost circuit before fetch", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  let calls = 0;
  const now = "2026-08-15T00:00:00.000Z";
  try {
    sqlite.prepare(`INSERT INTO ai_provider_circuit_states (
      environment,provider,state,reason,current_event_id,observed_value,threshold_value,
      opened_at,closed_at,updated_by_user_id,updated_at
    ) VALUES ('staging','openai','open','daily_cost_limit','cost-event',100,100,?,NULL,NULL,?)`).run(now, now);
    const provider = new OpenAiLegalCorpusEmbeddingProvider({
      APP_ENV: "staging", DB: d1, OPENAI_API_KEY: "server-secret",
    }, async () => {
      calls += 1;
      return new Response();
    });
    await assert.rejects(
      () => provider.embed(["legal query"], { feature: "legal_corpus_retrieval" }),
      (error: unknown) => error instanceof LegalCorpusEmbeddingError
        && error.code === "LEGAL_CORPUS_EMBEDDING_REQUEST_FAILED"
        && error.retryable === false,
    );
    assert.equal(calls, 0);
  } finally {
    sqlite.close();
  }
});

test("legal corpus embedding provider validates dimensions and records system usage", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const requests: Array<{ url: string; init: RequestInit }> = [];
  try {
    const provider = new OpenAiLegalCorpusEmbeddingProvider({
      APP_ENV: "staging", DB: d1, OPENAI_API_KEY: "server-secret",
    }, async (input, init) => {
      requests.push({ url: String(input), init: init ?? {} });
      return Response.json({
        object: "list",
        model: "text-embedding-3-large",
        data: [{ object: "embedding", index: 0, embedding: Array.from({ length: 1536 }, () => 0.01) }],
        usage: { prompt_tokens: 4, total_tokens: 4 },
      }, { headers: { "x-request-id": "req_test" } });
    });
    const vectors = await provider.embed(["  Меҳнат ҳуқуқи  "], { feature: "legal_corpus_retrieval" });
    assert.equal(vectors.length, 1);
    assert.equal(vectors[0]?.length, 1536);
    assert.equal(requests[0]?.url, "https://api.openai.com/v1/embeddings");
    assert.equal(new Headers(requests[0]?.init.headers).get("authorization"), "Bearer server-secret");
    const body = JSON.parse(String(requests[0]?.init.body)) as {
      input: string[]; dimensions: number; encoding_format: string;
    };
    assert.deepEqual(body.input, ["Меҳнат ҳуқуқи"]);
    assert.equal(body.dimensions, 1536);
    assert.equal(body.encoding_format, "float");
    assert.doesNotMatch(String(requests[0]?.init.body), /server-secret/u);
    const usage = sqlite.prepare(`SELECT workspace_id AS workspaceId,user_id AS userId,feature,operation,
      provider,model,input_tokens AS inputTokens,item_count AS itemCount,dimensions,status
      FROM ai_provider_usage_events`).get() as Record<string, unknown>;
    assert.deepEqual({ ...usage }, {
      workspaceId: null,
      userId: null,
      feature: "legal_corpus_retrieval",
      operation: "embeddings",
      provider: "openai",
      model: "text-embedding-3-large",
      inputTokens: 4,
      itemCount: 1,
      dimensions: 1536,
      status: "succeeded",
    });
  } finally {
    sqlite.close();
  }
});

test("isolated corpus Worker can relay embeddings without receiving the OpenAI secret", async () => {
  const { sqlite, d1 } = sqliteD1Fixture();
  const requests: Request[] = [];
  let directCalls = 0;
  try {
    const service = {
      async fetch(input: RequestInfo | URL, init?: RequestInit) {
        const request = input instanceof Request ? input : new Request(input, init);
        requests.push(request);
        return Response.json({
          object: "list",
          model: "text-embedding-3-large",
          data: [{ object: "embedding", index: 0, embedding: Array.from({ length: 1536 }, () => 0.02) }],
          usage: { prompt_tokens: 3, total_tokens: 3 },
        });
      },
    } as unknown as Fetcher;
    const provider = new OpenAiLegalCorpusEmbeddingProvider({
      APP_ENV: "staging",
      DB: d1,
      EMBEDDING_MODEL: "text-embedding-3-large",
      LEGAL_CORPUS_EMBEDDING_SERVICE: service,
    }, async () => {
      directCalls += 1;
      return new Response();
    });
    const vectors = await provider.embed(["Mehnat kodeksi"], { feature: "legal_corpus_indexing" });
    assert.equal(vectors[0]?.length, 1536);
    assert.equal(directCalls, 0);
    assert.equal(requests[0]?.url, "https://embeddings.internal/v1/embeddings");
    assert.equal(requests[0]?.headers.get("authorization"), null);
    assert.doesNotMatch(await requests[0]!.clone().text(), /secret|api[_-]?key/iu);
    assert.equal(Number((sqlite.prepare(
      "SELECT count(*) AS count FROM ai_provider_usage_events WHERE feature='legal_corpus_indexing' AND status='succeeded'",
    ).get() as { count: number }).count), 1);
  } finally {
    sqlite.close();
  }
});
