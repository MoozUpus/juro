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
  2026-08-15 17:33 +05:00 had 292 ready canonical documents, 396 language
  variants, 410 versions, 18,156 provisions and 18,194 indexed chunks. There
  were 2,217 queued/retrying jobs, no running job at the instant of the query,
  406 completed jobs and zero terminal technical
  failures. This is below the 1,283 / 20,296 / 22,513 release floor and is not
  evidence that coverage is complete.
- The new source-card and full-article modal passed type-check, focused boundary
  tests and staging artifact/deployment checks. Authenticated desktop QA passed
  for the AI-chat light/dark empty state and caught one dark-history contrast
  regression that was fixed and reverified. A real source-bearing answer is
  still required before claiming visual QA of the full-article modal.
- Private-document grounded chat, its private source card and the authenticated
  R2-backed full-document branch are implemented, regression-tested and passed
  one authenticated staging browser scenario on 2026-08-15. The scenario
  proved exact factual grounding, an explicit no-legal-coverage warning, a
  protected full-document modal and no Lex.uz link on the private source. This
  single scenario is not a broad document-quality or retrieval benchmark.
- `status.juro.uz` now resolves and is attached to the production Worker. Its
  status-host fence still needs to be preserved in every future routing change.
