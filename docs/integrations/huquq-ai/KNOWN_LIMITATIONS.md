# Known limitations

- Production migration `0121` and authenticated browser QA completed on
  2026-08-14. The staging-only evidence schema migrations `0122` and `0123`
  intentionally remain absent from production.
- The current Windows runner lacks `bash`, so root website lint/type-check are blocked.
- Legal answer quality has no publishable metric until lawyer-reviewed fixtures and a
  reproducible run exist.
- Advice.uz and court-practice retrieval remain unavailable unless separately verified;
  they must not be presented as official APIs.
- Qdrant is not deployed or configured. The checked-in REST adapter, dense+sparse
  indexer and D1 rehydration path are tested, but dense retrieval remains disabled;
  activation still needs a reproducible benchmark, a private compatible collection,
  server-side secrets and controlled staging evidence. Bounded sparse corpus
  acquisition is enabled only in staging; production corpus flags remain disabled.
- The owner-material promotion path is implemented, regression-tested and
  enabled only in staging. No owner document had been promoted as of
  2026-08-15 14:11 +05:00. Its first use still requires a real completed
  analysis, the actor's explicit rights confirmation, a current administrator
  or legal-reviewer assignment, fresh MFA, malware/OCR/R2 integrity checks and
  post-action audit.
- Owner materials are intentionally excluded from official Lex citations and
  do not affect legal-answer freshness. A non-official materials UX/provider
  remains a separate evaluated product decision.
- Staging corpus acquisition is still in progress. At 2026-08-15 14:36 +05:00
  it had 65 official canonical documents, 103 language variants, 107 versions,
  8,026 provisions and 8,038 chunks; this is not evidence that the release
  coverage thresholds are satisfied.
- The new source-card and full-article modal passed type-check, focused boundary
  tests and staging artifact/deployment checks. Authenticated desktop QA passed
  for the AI-chat light/dark empty state and caught one dark-history contrast
  regression that was fixed and reverified. A real source-bearing answer is
  still required before claiming visual QA of the full-article modal.
- `status.juro.uz` now resolves and is attached to the production Worker. Its
  status-host fence still needs to be preserved in every future routing change.
