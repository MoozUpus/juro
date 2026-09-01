# JURO AI model routing

Status: **VERIFIED in source; live provider health is separate**

Evidence cutoff: **2026-09-01**

## Routing result

| Workload | Primary | Fallback | Source |
| --- | --- | --- | --- |
| Legal chat, fast | OpenAI `OPENAI_CHAT_MODEL` | Anthropic `ANTHROPIC_FALLBACK_MODEL` on eligible failure | `lib/ai/provider.ts` |
| Legal chat, deep | OpenAI `OPENAI_DEEP_MODEL` | Anthropic `ANTHROPIC_FALLBACK_MODEL` on eligible failure | `lib/ai/provider.ts` |
| Document analysis | Anthropic `ANTHROPIC_DOCUMENT_MODEL` | OpenAI document fallback | document-analysis/provider modules |
| Retrieval understanding/reranking/web discovery | OpenAI with bounded budgets | deterministic or unavailable state | AI route and legal-retrieval modules |

Checked-in production configuration selects `gpt-5.6-terra` for chat, `gpt-5.6-sol` for deep reasoning, and `claude-sonnet-4-6` for Anthropic document and chat fallback. Runtime versioned settings may select only allowlisted configured models.

## Fallback policy

OpenAI is the legal-chat primary. Anthropic fallback is eligible for provider unavailability, an open cost-control circuit, invalid structured output, or another explicitly retryable provider failure. Refusals are not converted into cross-provider retries. A single request budget bounds the primary, retry, fallback, retrieval, and finalization path.

Every provider call passes the operational feature gate and cost-control circuit before transmission. Provider calls, usage, model, attempt, and bounded error codes are recorded without logging the legal question, source excerpts, credentials, or provider response body.

## Non-claims

- Configuration does not prove that either provider currently has credit or is operational.
- A fallback route does not prove answer quality or citation correctness.
- No Grok provider is part of this routing contract.

See [`model-evaluation.md`](./model-evaluation.md), [`cost-control.md`](./cost-control.md), and [`legal-answer-pipeline.md`](./legal-answer-pipeline.md).
