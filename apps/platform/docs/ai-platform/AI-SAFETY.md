# JURO AI safety

Updated: 2026-08-13

Scope: current local release candidate. This file does not claim the 2026-08-13
changes are live in staging until the separate deployment and authenticated QA
gates are recorded.

## Implemented boundaries

- Provider calls are server-only; provider keys are never client configuration.
- Legal chat and document analysis accept only strict Zod-normalized output.
- Legal source text enters a prompt only after a request-scoped direct live
  Lex.uz fetch passes exact canonical-host/path, SSRF, redirect, robots,
  content-type, parser, locale, structure, noise and SHA-256 gates.
- Legal-chat and document-analysis citations must use an allowed retrieved ID,
  be unique, and form a complete reference from every legal claim to a source
  exposed in the response. Confirmed findings/deadlines and legal-compliance
  findings cannot be citation-free.
- Provider-authored citation titles, excerpts, URLs, dates, and verification
  metadata are discarded and rebuilt from the server-retrieved source before
  persistence. Any mismatch or incomplete citation is `INVALID_AI_OUTPUT`.
- Advice.uz, local legal-corpus reads, Vectorize and embeddings are excluded
  from interactive legal answers. Foundational act identifiers are discovery
  metadata only and the exact Lex.uz page must still be re-fetched live.
- `unavailable` sources cannot produce confirmed legal findings or citations.
  Chat becomes a non-chargeable clarification state; document analysis retains
  only structural findings and marks legal compliance unverified.
- `stale` sources move confirmed findings to assumptions, mark deadlines
  preliminary, lower legal-compliance confidence, show an RU/UZ warning, and
  recommend lawyer review.
- All document-controlled fields (file name, MIME metadata, OCR warnings,
  declared side and extracted text) are supplied under an explicit
  `untrustedDocument` boundary. They remain evidence for analysis but cannot
  change system instructions, source policy, authorization, or tool behavior.
- Actual provider/model, instruction hash, source-evidence hash, freshness, and
  safe usage metadata are persisted without logging document or chat bodies.
- If an SSE connection breaks after request submission, the UI retains the
  exact idempotency key and immutable payload. It offers a retry only for an
  uncertain network/stream failure or an existing processing run; provider and
  validation failures remain ordinary errors, so the UI never presents a retry
  that would be stuck on a failed idempotency record.
- Conversation messages, source links, proposed facts, audit evidence, and the
  completion/release of the AI usage reservation are committed in one D1 batch.
  A failed conversation write therefore cannot leave a visible answer with an
  incomplete AI-run or a consumed usage record.

## Open release gates

- The 314-scenario bilingual corpus, deterministic metrics and fail-closed
  regression gate are implemented, but a passing real staging run still
  requires all persisted outputs and named human legal reviews.
- Claim-to-span enforcement validates exact server-fetched span IDs, hashes,
  numeric tokens and material term overlap. Human review remains necessary for
  legal correctness and nuanced entailment.
- Current p50/p95 latency and cost must be measured after staging deployment;
  local live-Lex timings are diagnostics, not fleet percentiles.
- A real private ClamAV scanner is deployed only in staging. Its tested EICAR
  path is fail-closed: an infected upload remains unavailable and cannot reach
  an AI provider. Production does not yet have this binding or a scanner-safe
  document-analysis journey.

These limits are fail-closed and do not authorize a production deployment.
## Stale reservation recovery

An unfinished AI request is not retried by silently reusing its idempotency key.
After fifteen minutes without an update, only a still-`reserved` run may be
closed as `AI_RUN_EXPIRED`; its reserved usage is released. A provider result
must first claim `finalizing`, which prevents that cleanup from racing the
atomic message/ledger finalization. The UI receives an explicit RU/UZ response
and creates a new request only when the user sends again.
