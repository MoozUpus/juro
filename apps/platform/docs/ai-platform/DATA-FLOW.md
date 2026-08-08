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
