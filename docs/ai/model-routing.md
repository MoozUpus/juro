# AI model routing

**Verified against the production configuration and implementation on 2026-08-25.**

JURO uses OpenAI and Anthropic only. The provider is selected by workload and
failure class; provider-authored URLs, excerpts, or legal conclusions are never
accepted as application truth.

| Workload | Primary | Fallback | Boundary |
| --- | --- | --- | --- |
| Legal chat, fast | OpenAI `gpt-5.6-terra` | Anthropic `claude-sonnet-4-6` | One shared response budget; fallback only for eligible provider, timeout, circuit, retryable, or invalid-output failures. |
| Legal chat, deep | OpenAI `gpt-5.6-sol` | Anthropic `claude-sonnet-4-6` | Refusal and user cancellation do not trigger a second provider. |
| Document analysis, quick | OpenAI structured output | Anthropic, bounded fallback | OpenAI has an 80 s budget; fallback is bounded to 30 s; total budget is 110 s. |
| Document analysis, full/expert | Anthropic `claude-sonnet-4-6` | OpenAI deep model | One attempt per provider; mode budgets are 120/150 s. |
| Document comparison | Deterministic diff, then OpenAI legal enrichment | No model-generated diff | Exact textual changes remain deterministic even if legal enrichment is unavailable. |
| Embeddings | OpenAI `text-embedding-3-large` | Lexical retrieval | Production dense/indexed-corpus retrieval is disabled. |

The central OpenAI Responses adapter sends `store: false`. JURO persists its own
minimum operational records; it does not ask OpenAI to retain response objects as
provider-side application state.

## Production feature state

- `LEGAL_DIRECT_RETRIEVAL_ENABLED=true`.
- Lex ingestion and metadata monitoring are enabled.
- `LEGAL_CORPUS_ENABLED=false`, live local-corpus access is false, auto-ingest is
  false, multilingual indexed corpus is false, and dense retrieval is false.
- Advice ingestion and Advice sitemap discovery are false.
- Payment production approval remains false; the demo surface is not evidence of
  a live production payment rail.

Changing a model, provider, prompt contract, timeout, or retrieval mode requires
the focused suites, current price configuration, a new evaluation comparison,
and release evidence. A configuration value is not by itself proof of answer
quality.
