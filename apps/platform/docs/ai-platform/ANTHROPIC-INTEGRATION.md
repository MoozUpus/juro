# Anthropic integration

Updated: 2026-07-31

## Implemented fallback boundary

Anthropic Messages API is implemented as a server-only legal-chat fallback. It uses `output_config.format` with the same server-owned JSON Schema and the same Zod/source boundary as OpenAI.

- staging model variable: `ANTHROPIC_FALLBACK_MODEL=claude-sonnet-4-20250514`;
- secret name: `ANTHROPIC_API_KEY`;
- API: `POST https://api.anthropic.com/v1/messages` with `anthropic-version: 2023-06-01`;
- structured output: `output_config.format.type=json_schema`;
- usage captured: input, output, and cache-read input tokens;
- bounded timeout and two-attempt retry;
- `refusal` is not used to bypass provider safety;
- `max_tokens`, missing text, and schema mismatch fail with typed errors;
- actual `provider=anthropic`, model, provider response ID, and `fallback_from_provider=openai` are persisted in `ai_runs`, `ai_usage_ledger`, and workspace audit metadata.

Fallback is allowed only when OpenAI fails with a retryable availability/timeout error or invalid structured output. An OpenAI safety refusal is never sent to Anthropic as a bypass. If OpenAI is absent but Anthropic is configured, the same provider boundary can run Anthropic directly and records it as the primary provider for that run.

## Current staging evidence

On 2026-07-31, `wrangler secret list --env staging` confirmed the `ANTHROPIC_API_KEY` secret name on `juro-platform-staging`; its value was not read, logged, or exported. No live Anthropic response or provider failover is claimed. Unit coverage proves that the completion transaction replaces the reserved provider/model with the actual fallback provider/model and records `fallback_from_provider` without double-charging.

A live fallback gate still requires a controlled OpenAI outage, one successful Anthropic structured response, one source-boundary rejection, one no-source clarification, usage-ledger verification, and confirmation that no prompt or legal content appears in logs.
Anthropic document analysis is a separate Phase 5 adapter and is not claimed by this legal-chat fallback.


## Document-analysis primary adapter

Phase 5 adds a separate Anthropic-primary document-analysis boundary:

- staging variable: `ANTHROPIC_DOCUMENT_MODEL=claude-sonnet-4-20250514`;
- this explicit environment selection is shared by the production-safe fallback constant and must be changed only after provider capability review and replay of contract/evaluation tests;
- the input contains bounded extracted document text and server-selected verified source excerpts, never the R2 object or a client-supplied system instruction;
- the output uses a dedicated JSON Schema plus Zod, verified-source, and exact-document-excerpt validation;
- retryable provider availability/timeout/invalid-output failures may use the OpenAI adapter; refusal is terminal;
- the actual provider/model/response ID, token usage, latency, attempts, normalized result, and cost-ledger metadata are persisted;
- raw provider output is not persisted by this path.

The deployed Worker has both provider secret names and model variables, but no live analysis or fallback is claimed. The upload boundary remains quarantined until a real malware scanner is connected; that fail-closed gate prevents document content from reaching either provider.

The default is environment configuration, not a secret. Future model changes must be capability-checked against official provider documentation and replay the contract/evaluation suite rather than silently changing a production route.
