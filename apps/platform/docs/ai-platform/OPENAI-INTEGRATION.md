# OpenAI integration

Updated: 2026-07-31

## Implemented boundary

OpenAI is the primary provider for `POST /api/platform/ai`. Calls are made only from the Worker through the Responses API. The browser never receives a provider key.

- staging model variables: `OPENAI_CHAT_MODEL=gpt-5.6-sol` and `OPENAI_DEEP_MODEL=gpt-5.6-sol`;
- secret name: `OPENAI_API_KEY`;
- transport: the Worker requests Responses API SSE and parses semantic `response.output_text.delta` and terminal events across arbitrary network-chunk boundaries;
- browser stream: JURO sends only bounded status metadata while generation is in progress; unvalidated legal text is never rendered as a partial answer;
- terminal gate: the final answer is emitted only after JSON parse, strict Zod validation, verified-source enforcement, persistence, and usage-ledger completion;
- stop: the browser aborts the JURO stream, the Worker aborts the provider request, and the reserved usage ledger is released with `AI_CANCELLED`;
- privacy: a one-way, domain-separated hash of the internal user identifier is sent as `safety_identifier`; email, name, question text, and workspace identifier are not used for that field;
- model controls: fast/deep map to explicit reasoning effort and short/detailed map to explicit response verbosity;
- disconnect cleanup: request/response cancellation removes abort listeners and prevents terminal writes to a closed stream;
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

On 2026-07-31, `wrangler secret list --env staging` confirmed the presence of the `OPENAI_API_KEY` secret name on `juro-platform-staging`; the value was not read, logged, or exported. Secret presence is not evidence of a successful provider call. No live OpenAI answer or stream is claimed until an authenticated synthetic RU/UZ flow proves structured output, safe persistence, and release of failed runs.

The required gate is an authenticated RU and UZ request, D1 run/ledger verification, a no-source clarification test, a verified-source citation test, an invalid-output test, and a provider-outage fallback test. The key must never be pasted into chat, Git, logs, screenshots, or client configuration.
## Verification and remaining work

- local transport, source-boundary, and usage-ledger tests cover split SSE frames, malformed events, terminal structured JSON, and cancellation without charge;
- the full platform regression, environment matrix, staging artifact, and protected staging deployment postflight passed;
- a live authenticated RU/UZ provider stream, stop/disconnect trace, D1 ledger proof, and retry/fallback trace remain unverified; the staging secret is present but no synthetic provider flow has been run;
- reconnect and resumable partial recovery are not implemented;
- edit/regenerate/branch history;
- hybrid Vectorize retrieval and reranking;
- memory and entitlement service integration;
- live provider cost verification;
- production binding or deployment.

