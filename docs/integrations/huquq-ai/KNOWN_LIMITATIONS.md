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
- Owner materials remain intentionally excluded from official Lex citations
  and do not affect legal-answer freshness. User-upload factual grounding now
  has a separate private provider path; it does not promote owner material into
  global law or make a private document an official source.
- Staging corpus acquisition is still in progress. The read-only snapshot at
  2026-08-15 16:00 +05:00 had 178 ready canonical documents, 256 language
  variants, 260 versions, 13,517 provisions and 13,552 indexed chunks. There
  were 1,372 queued/retrying jobs, one running job and zero terminal technical
  failures. This is below the 1,283 / 20,296 / 22,513 release floor and is not
  evidence that coverage is complete.
- The new source-card and full-article modal passed type-check, focused boundary
  tests and staging artifact/deployment checks. Authenticated desktop QA passed
  for the AI-chat light/dark empty state and caught one dark-history contrast
  regression that was fixed and reverified. A real source-bearing answer is
  still required before claiming visual QA of the full-article modal.
- Private-document grounded chat, its private source card and the authenticated
  R2-backed full-document branch are implemented and locally regression-tested.
  They are not yet claimed as staging browser evidence until a completed,
  indexed staging user document produces a real answer under an authenticated
  owner session.
- `status.juro.uz` now resolves and is attached to the production Worker. Its
  status-host fence still needs to be preserved in every future routing change.
