# JURO AI Model Routing

Status: **implemented and contract-tested; authenticated production user journeys remain partial**
Providers allowed by product policy: **OpenAI and Anthropic only**.

## Production model configuration

| Function | Primary | Fallback |
| --- | --- | --- |
| fast Legal Answer | OpenAI `gpt-5.6-terra` | Anthropic `claude-sonnet-4-6` |
| deep Legal Answer | OpenAI `gpt-5.6-sol` | Anthropic `claude-sonnet-4-6` |
| quick document analysis | OpenAI low-reasoning structured output | Anthropic structured output within the shared deadline |
| full/expert document analysis | configured Anthropic document model | OpenAI deep model when the error is fallback-eligible and budget remains |
| embeddings | OpenAI `text-embedding-3-large` | no invented cross-provider embedding fallback |
| transcription/TTS | OpenAI configured speech models | feature-specific failure handling |

Configuration names are public runtime settings; provider keys remain server-only secrets.

## Legal Answer route

1. deterministic input and intent handling selects fast/deep mode;
2. OpenAI receives the server-owned structured schema and validated source packet;
3. bounded retry behavior occurs inside the OpenAI adapter for eligible transport/provider failures;
4. Anthropic fallback is permitted only for eligible unavailability, timeout, or invalid structured output;
5. refusal is terminal and cannot be bypassed by fallback;
6. the actual provider, model, response identifier, usage, latency, attempts, and `fallback_from_provider` are persisted.

Operator feature controls can independently disable the OpenAI primary or Anthropic fallback. Budget allocation may refuse to start a fallback that cannot finish inside the shared deadline.

## Production health evidence

At the 2026-09-01 cutoff, five consecutive isolated OpenAI probes were operational at 2,844–3,591 ms, five consecutive Anthropic probes were operational at 6,288–7,875 ms, and five routed document-analysis probes were operational at 3,743–5,735 ms. These records prove current transport and structured contracts, not legal correctness or an authenticated user journey.

## Source pointers

- `apps/platform/lib/ai/provider.ts`
- `apps/platform/lib/ai/anthropic-provider.ts`
- `apps/platform/lib/ai/runtime-settings.ts`
- `apps/platform/lib/document-analysis/provider.ts`
- `apps/platform/worker/production-dependency-probes.ts`
- [`OPENAI-INTEGRATION.md`](../../apps/platform/docs/ai-platform/OPENAI-INTEGRATION.md)
- [`ANTHROPIC-INTEGRATION.md`](../../apps/platform/docs/ai-platform/ANTHROPIC-INTEGRATION.md)
