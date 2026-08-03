# OpenAI integration

Updated: 2026-08-03

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
- strict output: Responses API `text.format` with the server-owned `LegalChatResponse` JSON Schema; draft metadata and provider-incompatible validation annotations are removed only from the provider grammar while the unchanged Zod schema remains the server validation boundary;
- response validation: JSON parse followed by strict Zod validation;
- source boundary: only server-retrieved, verified source IDs with non-empty excerpts may support confirmed findings, risks, deadlines, or citations;
- no verified excerpt: the result is canonicalized to `clarification_required`, legal claims are removed, and the reserved answer cycle is released;
- retry: at most two attempts for provider/network conditions;
- refusal: `AI_REFUSED` is returned as a non-fallback safety result;
- timeout and invalid output: typed failures, no raw provider body returned to the browser;
- audit: provider, actual model, provider response ID, token usage, latency, attempts, instruction hash, source-version hash, and correlation ID are stored server-side.

The implementation does not send a user-provided URL as legislation. User text and document text are marked as untrusted data in provider instructions.

## Current staging evidence

On 2026-08-03, the closed one-time probe `staging-openai-legal-chat-v25` exercised the real staging `OPENAI_API_KEY`, Responses API, `gpt-5.6-sol`, the complete legal-chat structure, unchanged Zod parser, no-source clarification rule, and source boundary. The D1 technical record completed with `status=succeeded`, `input_tokens=799`, `output_tokens=165`, `latency_ms=4702`, and no error code. No prompt, model output, provider body, or secret value was persisted. The probe flag was immediately returned to `false`; all 45 Worker bindings remained present.

The live fix is staging Worker version `c8aff902-c151-4a6b-a5dd-2ce5480236d5` from commit `35b3cd0`. The preceding v24 record failed with bounded code `PROBE_OPENAI_HTTP_400_INVALID_JSON_SCHEMA`, proving that transport and authentication reached OpenAI but Zod's raw draft-7 schema was rejected before generation. Provider-schema normalization removed that failure without weakening application validation.

The required gate is an authenticated RU and UZ request, D1 run/ledger verification, a no-source clarification test, a verified-source citation test, an invalid-output test, and a provider-outage fallback test. The key must never be pasted into chat, Git, logs, screenshots, or client configuration.
## Verification and remaining work

- local transport, source-boundary, and usage-ledger tests cover split SSE frames, malformed events, terminal structured JSON, and cancellation without charge;
- the full platform regression, environment matrix, staging artifact, and protected staging deployment postflight passed;
- the exact RU legal-chat provider contract and no-source safety boundary are verified by the real staging probe;
- an authenticated end-user RU/UZ stream, stop/disconnect trace, usage-ledger proof, verified-source citation flow, and retry/fallback trace remain to be verified through the protected UI/API flow;
- reconnect and resumable partial recovery are not implemented;
- edit/regenerate/branch history;
- hybrid Vectorize retrieval and reranking;
- memory and entitlement service integration;
- live provider cost verification;
- production binding or deployment.

