# Data flow

Identity: email OTP -> server session -> optional MFA -> tenant-scoped routes. Legal source: allowlisted URL -> private snapshot -> manual review -> verified publication -> optional Vectorize indexing -> server-side retrieval. Document: authorized direct private upload -> quarantine -> scanner gate -> extraction/OCR -> structured analysis -> normalized D1/R2 records. The scanner gate is currently fail-closed in staging.

No provider key, session secret, or raw user content is sent to analytics. See `PRIVACY-DATA-MAP.md` and `R2-STORAGE.md`.