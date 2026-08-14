# Data flow

Identity: email OTP -> server session -> optional MFA -> tenant-scoped routes. Legal source: allowlisted URL -> private snapshot -> manual review -> verified publication -> optional Vectorize indexing -> server-side retrieval. Document: authorized direct private upload -> quarantine -> scanner gate -> extraction/OCR -> structured analysis -> normalized D1/R2 records. The scanner gate is currently fail-closed in staging.

Public document link: authenticated same-origin intent -> canonical credential-free
HTTPS URL -> public DNS/IP validation -> bounded manual fetch/redirect -> DNS recheck
-> streamed temporary private R2 object -> size/SHA/magic/archive validation ->
existing tenant quarantine record -> malware gate. The canonical URL is reduced to
origin plus a SHA-256 audit value and is never treated as verified legislation.

After a safe verdict, PDF extraction begins with bounded structural preflight:
password/corruption -> terminal failure; timeout -> retry; page count above 500
-> terminal capacity failure; accepted count -> Workers AI conversion. Package
PDF counts and image pages are accumulated before any provider batch.

No provider key, session secret, or raw user content is sent to analytics. See `PRIVACY-DATA-MAP.md` and `R2-STORAGE.md`.

Interactive legal chat: authenticated/guest request -> one 30-second absolute
budget -> bounded D1-only verified retrieval -> optional source-bound SSE
preliminary state -> primary provider / remaining-budget fallback -> strict
source/schema validation -> durable completion and usage reconciliation ->
content-free SLO evidence. Live Lex/Advice fetching is excluded from this
interactive path. A failure or expired deadline releases the reservation; it
does not create a late successful charge. This contract is deployed to the
2026-08-12 staging checkpoint, not production. The latest OpenAI and Anthropic
observations are individually within their documented request budgets, but the
sample count remains insufficient for p50/p95 certification. See
[AI-RELIABILITY-SLO.md](./AI-RELIABILITY-SLO.md).
