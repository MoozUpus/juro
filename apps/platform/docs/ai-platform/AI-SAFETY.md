# JURO AI safety

Updated: 2026-07-31

Scope: implemented integration-branch controls. This file does not claim live OpenAI or Anthropic execution in staging: both secret names are present, but no authenticated synthetic provider run has been verified.

## Implemented boundaries

- Provider calls are server-only; provider keys are never client configuration.
- Legal chat and document analysis accept only strict Zod-normalized output.
- Legal source text enters a prompt only after exact official-host trust,
  current publication/lifecycle activation, content-hash, effective-date, and
  complete reading-row replay validation.
- Legal-chat and document-analysis citations must use an allowed retrieved ID,
  be unique, and form a complete reference from every legal claim to a source
  exposed in the response. Confirmed findings/deadlines and legal-compliance
  findings cannot be citation-free.
- Provider-authored citation titles, excerpts, URLs, dates, and verification
  metadata are discarded and rebuilt from the server-retrieved source before
  persistence. Any mismatch or incomplete citation is `INVALID_AI_OUTPUT`.
- Full database freshness requires successful corpus runs for both Lex and
  Advice. Page-level acquisition never establishes freshness.
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

## Open release gates

- Staging has no complete dual-source corpus run and therefore remains
  `unavailable` by design.
- Live OpenAI/Anthropic execution and fallback are not proven. The staging secret names are present, but an authenticated synthetic provider/ledger test has not run.
- Claim-to-fragment semantic entailment is not yet independently verified.
- Hybrid Vectorize retrieval, citation semantic validation, 250+50 legal
  scenarios, 100 document packages, 30 comparisons, and human legal review
  thresholds remain incomplete.
- Real malware scanning is absent; uploaded files remain quarantined and never
  reach an AI provider.

These limits are fail-closed and do not authorize a production deployment.
