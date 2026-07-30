# OpenAI integration

Updated: 2026-07-30

## Implemented boundary

OpenAI is the primary provider for `POST /api/platform/ai`. Calls are made only from the Worker through the Responses API. The browser never receives a provider key.

- staging model variables: `OPENAI_CHAT_MODEL=gpt-5.6-sol` and `OPENAI_DEEP_MODEL=gpt-5.6-sol`;
- secret name: `OPENAI_API_KEY`;
- strict output: Responses API `text.format` with the server-owned `LegalChatResponse` JSON Schema;
- response validation: JSON parse followed by strict Zod validation;
- source boundary: only server-retrieved, verified source IDs with non-empty excerpts may support confirmed findings, risks, deadlines, or citations;
- no verified excerpt: the result is canonicalized to `clarification_required`, legal claims are removed, and the reserved answer cycle is released;
- retry: at most two attempts for provider/network conditions;
- refusal: `AI_REFUSED` is returned as a non-fallback safety result;
- timeout and invalid output: typed failures, no raw provider body returned to the browser;
- audit: provider, actual model, provider response ID, token usage, latency, attempts, instruction hash, source-version hash, and correlation ID are stored server-side.

The implementation does not send a user-provided URL as legislation. User text and document text are marked as untrusted data in provider instructions.

## Current staging evidence

The deployed staging Worker did not expose an `OPENAI_API_KEY` binding when inspected by `wrangler secret list` on 2026-07-30. Therefore no live OpenAI answer is claimed. The API intentionally returns a localized, no-store `503 AI_PROVIDER_UNAVAILABLE` before reserving or persisting a successful answer.

The owner must add the key through protected Cloudflare controls; it must never be pasted into chat, Git, logs, screenshots, or client configuration. After the binding exists, the required gate is an authenticated RU and UZ request, D1 run/ledger verification, a no-source clarification test, a verified-source citation test, an invalid-output test, and a provider-outage fallback test.

## Not implemented yet

- SSE token streaming, stop generation, reconnect, and partial recovery;
- edit/regenerate/branch history;
- hybrid Vectorize retrieval and reranking;
- memory and entitlement service integration;
- live provider cost verification;
- production binding or deployment.

