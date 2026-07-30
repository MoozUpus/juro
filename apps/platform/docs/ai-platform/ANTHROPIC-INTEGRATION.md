# Anthropic integration

Updated: 2026-07-30

## Implemented fallback boundary

Anthropic Messages API is implemented as a server-only legal-chat fallback. It uses `output_config.format` with the same server-owned JSON Schema and the same Zod/source boundary as OpenAI.

- staging model variable: `ANTHROPIC_FALLBACK_MODEL=claude-sonnet-4-6`;
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

The staging Worker did not expose an `ANTHROPIC_API_KEY` binding when inspected on 2026-07-30. No live Anthropic response or provider failover is claimed. Unit coverage proves that the completion transaction replaces the reserved provider/model with the actual fallback provider/model and records `fallback_from_provider` without double-charging.

The owner must add the secret through protected Cloudflare controls. A live fallback gate requires a controlled OpenAI outage, one successful Anthropic structured response, one source-boundary rejection, one no-source clarification, usage-ledger verification, and confirmation that no prompt or legal content appears in logs.

Anthropic document analysis is a separate Phase 5 adapter and is not claimed by this legal-chat fallback.


## Document-analysis primary adapter

Phase 5 adds a separate Anthropic-primary document-analysis boundary:

- staging variable: `ANTHROPIC_DOCUMENT_MODEL=claude-fable-5`;
- the model selection was rechecked against Anthropic's official current model overview on 2026-07-30;
- the input contains bounded extracted document text and server-selected verified source excerpts, never the R2 object or a client-supplied system instruction;
- the output uses a dedicated JSON Schema plus Zod, verified-source, and exact-document-excerpt validation;
- retryable provider availability/timeout/invalid-output failures may use the OpenAI adapter; refusal is terminal;
- the actual provider/model/response ID, token usage, latency, attempts, normalized result, and cost-ledger metadata are persisted;
- raw provider output is not persisted by this path.

The deployed Worker has the model variable but does not expose `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`. No live analysis or fallback is claimed. The upload boundary also remains quarantined until a real malware scanner is connected.

The default is environment configuration, not a secret. Future model changes must be capability-checked against official provider documentation and replay the contract/evaluation suite rather than silently changing a production route.
