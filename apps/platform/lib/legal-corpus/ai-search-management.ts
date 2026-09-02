import { z } from "zod";

import { AI_SEARCH_TYPED_METADATA_SCHEMA } from "./legal-candidate-index";

export const AI_SEARCH_MANAGEMENT_PATH = "/internal/legal-corpus/ai-search/configure-candidate";
const candidateNames = {
  porter: "juro-cur-porter-v1",
  trigram: "juro-cur-trigram-v1",
} as const;

export function governedAiSearchInstanceUpdate(
  keywordTokenizer: "porter" | "trigram",
): Partial<AiSearchConfig> {
  return {
    paused: true,
    ai_gateway_id: "juro-ai-search-staging",
    rewrite_query: false,
    reranking: false,
    index_method: { vector: true, keyword: true },
    fusion_method: "rrf",
    indexing_options: { keyword_tokenizer: keywordTokenizer },
    retrieval_options: { keyword_match_mode: "or" },
    chunk: true,
    chunk_size: 4096,
    chunk_overlap: 0,
    score_threshold: 0,
    max_num_results: 50,
    cache: false,
    public_endpoint_params: {
      enabled: false,
      chat_completions_endpoint: { disabled: true },
      search_endpoint: { disabled: true },
      mcp: { disabled: true },
    },
    sync_interval: 86400,
    custom_metadata: [...AI_SEARCH_TYPED_METADATA_SCHEMA],
  };
}

export async function handleAiSearchManagementRequest(
  request: Request,
  env: {
    APP_ENV: string;
    LEGAL_AI_SEARCH_NAMESPACE?: AiSearchNamespace;
    LEGAL_AI_SEARCH_NAMESPACE_NAME?: string;
  },
): Promise<Response> {
  if (request.method !== "POST" || new URL(request.url).pathname !== AI_SEARCH_MANAGEMENT_PATH) {
    return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  }
  if (env.APP_ENV !== "staging" || env.LEGAL_AI_SEARCH_NAMESPACE_NAME !== "juro-legal-staging"
    || !env.LEGAL_AI_SEARCH_NAMESPACE) {
    return Response.json({ code: "AI_SEARCH_MANAGEMENT_TARGET_REJECTED" }, { status: 503 });
  }
  try {
    const { tokenizer } = z.object({ tokenizer: z.enum(["porter", "trigram"]) })
      .strict().parse(await request.json());
    const instanceId = candidateNames[tokenizer];
    const instance = env.LEGAL_AI_SEARCH_NAMESPACE.get(instanceId);
    await instance.update(governedAiSearchInstanceUpdate(tokenizer));
    const info = await instance.info();
    return Response.json({ result: {
      id: info.id,
      namespace: info.namespace,
      paused: info.paused,
      status: info.status,
      embeddingModel: info.embedding_model,
      gatewayId: info.ai_gateway_id,
      tokenizer: info.indexing_options?.keyword_tokenizer,
      sourcePrefix: info.source_params && typeof info.source_params === "object"
        ? (info.source_params as Record<string, unknown>).prefix : null,
      customMetadata: info.custom_metadata,
    } }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error(JSON.stringify({
      event: "legal_ai_search.candidate_configuration_failed",
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message.slice(0, 300) : "unknown",
    }));
    return Response.json({ code: "AI_SEARCH_CANDIDATE_CONFIGURATION_FAILED" }, { status: 503 });
  }
}
