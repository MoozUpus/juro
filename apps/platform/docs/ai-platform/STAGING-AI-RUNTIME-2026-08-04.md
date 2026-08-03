# Staging AI runtime checkpoint — 2026-08-04

Environment: owner-only Access-protected staging. Production is unchanged.

## Read-only control-plane state

- Worker: `juro-platform-staging`.
- Active version: `adde6374-cbec-4e20-918d-e6c303ac75e9`, 100% traffic.
- D1: `juro-staging` (`bb716a96-b2fb-4823-90d6-6c228fed181a`).
- Applied migration ledger: through `0064_marketplace_open_payment_attempt.sql`.
- Sole pending migration: `0065_guest_ai_sessions.sql`.

## Provider evidence

The query selected only provider, model, status, token/latency counters, bounded
error code and timestamps. It did not select user, workspace, conversation,
message, prompt, answer, source excerpt, provider body or secret data.

- Closed probe `staging-openai-legal-chat-v26`: `succeeded`, model
  `gpt-5.6-sol`, 2,038 input tokens, 295 output tokens, 6,493 ms, no error.
- Closed probe `staging-anthropic-legal-chat-v23`: `succeeded`, model
  `claude-sonnet-4-6`, 2,197 input tokens, 455 output tokens, 7,563 ms, no error.
- Aggregated `ai_runs` metadata currently contains two completed OpenAI runs
  (latest `2026-08-03T18:45:09.229Z`) and three completed Anthropic runs
  (latest `2026-08-03T18:47:09.126Z`), all without an error code.
- Seven earlier OpenAI `PROVIDER_UNAVAILABLE` runs are retained as immutable
  failure evidence; their latest timestamp is `2026-08-03T07:06:30.603Z`,
  before the successful probe and completed-run evidence.

The closed probe flag is disabled after use. This proves current staging
provider transport and structured-response persistence, not legal accuracy,
verified-citation quality, an authenticated browser journey, or production
availability. Those gates remain open.
