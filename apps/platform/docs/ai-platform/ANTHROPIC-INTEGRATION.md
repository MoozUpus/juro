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

