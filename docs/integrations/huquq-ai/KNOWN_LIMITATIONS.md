# Known limitations

- Production migration `0121` and authenticated browser QA completed on
  2026-08-14. The staging-only evidence schema migrations `0122` and `0123`
  intentionally remain absent from production.
- The current Windows runner lacks `bash`, so root website lint/type-check are blocked.
- Legal answer quality has no publishable metric until lawyer-reviewed fixtures and a
  reproducible run exist.
- Advice.uz and court-practice retrieval remain unavailable unless separately verified;
  they must not be presented as official APIs.
- A pinned Qdrant 1.18.2 container and private service-binding proxy are deployed
  only in staging. The separate corpus Worker reaches Qdrant and the platform-owned
  OpenAI embedding credential through private bindings; neither service has a public
  route and the credential is not copied into the corpus Worker. Dense retrieval is
  still disabled, so the container is dormant and no full-corpus collection has been
  created or backfilled. Activation still requires the frozen-corpus benchmark,
  point-count parity, a retained snapshot and a proved restore. The application
  now implements checksum-verified private-R2 snapshot persistence and cold
  restore for the Container's ephemeral disk, but no full-corpus staging snapshot
  exists while dense remains disabled. Production has no Qdrant binding and every
  corpus flag remains disabled.
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
- Staging corpus acquisition is intentionally stopped for the current release
  evidence phase. The read-only federated runtime routes the frozen legacy,
  v2, shard-1 and shard-2 bindings; shard-3 remains excluded because its
  acquisition control row is still active. Per-database totals, queue
  reconciliation, duplicate identity findings and the remaining release gates
  are recorded in `STAGING_FEDERATED_RETRIEVAL_2026-08-28.md`. These totals are
  not summed as a unique-corpus metric: cross-source overlap requires a formal
  partition/deduplication manifest. The isolated shard-1 D1 export/restore now
  has a verified local `quick_check=ok` and zero foreign-key violations, but
  no federated snapshot, indexed 314-scenario benchmark or full-corpus Qdrant
  evidence has been claimed.
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
