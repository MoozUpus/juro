# AI model routing

**Implementation verified on the release candidate on 2026-08-29. Production remains on the previously published configuration until an explicitly authorized deployment.**

JURO uses OpenAI and Anthropic only. The provider is selected by workload and
failure class; provider-authored URLs, excerpts, or legal conclusions are never
accepted as application truth.

| Workload | Primary | Fallback | Boundary |
| --- | --- | --- | --- |
| Legal chat, fast | OpenAI chat model (`gpt-5.6-terra` in the verified configuration), low reasoning | Anthropic `claude-sonnet-4-6` | Compact 1,000/1,400-token output and the shortest bounded provider/fallback windows. |
| Legal chat, balanced (default) | OpenAI chat model (`gpt-5.6-terra` in the verified configuration), medium reasoning | Anthropic `claude-sonnet-4-6` | Ordinary analysis stays on the lower-cost chat model; output and fallback budgets sit between fast and deep. |
| Legal chat, deep | OpenAI deep model (`gpt-5.6-sol` in the verified configuration), high reasoning | Anthropic `claude-sonnet-4-6` | Highest output allowance. Refusal and user cancellation do not trigger a second provider. |
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

The three user-facing modes are `Быстрый`, `Сбалансированный`, and `Глубокий`
in Russian and `Tezkor`, `Muvozanatli`, and `Chuqur` in Uzbek. Missing or
unrecognized mode input is normalized to `balanced`; guest and synthetic probe
flows that explicitly request `fast` remain fast. All three modes share the
same absolute request deadline and provider-cost circuit.

## Admin routing transparency

The protected AI settings console derives its read-only Fast/Balanced/Deep
summary from the same `aiReasoningRuntimeRoute` contract used by primary
provider execution, Anthropic fallback and run reservation. Each localized
card exposes the active primary and fallback models, default-mode marker,
reasoning effort, attempt windows, first-content cap and compact/detailed
output limits. It also states the shared 30-second absolute request deadline,
which clips any longer per-attempt value to the time remaining.

The editable chat-model field is explicitly labelled as shared by Fast and
Balanced; Deep has its own model field. Version history records the chat, Deep
and Anthropic fallback model identifiers so an operator can compare a saved
configuration with the active one without inferring routing from a generic
"chat model" label.
