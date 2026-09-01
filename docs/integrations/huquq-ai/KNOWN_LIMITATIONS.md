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
  only in staging. The separate shard-3 Worker reaches Qdrant and the
  platform-owned OpenAI embedding credential through private bindings; neither
  service has a public route and the credential is not copied into the corpus
  Worker. Dense retrieval is explicitly enabled only for the approved sequential
  shard-3 backfill while source acquisition and live Lex remain disabled. The
  backfill is resumable through deterministic D1 point IDs and is not a release
  benchmark: it still requires completion, point-count parity, a retained
  checksum-verified snapshot and a proved restore. The application implements
  private-R2 snapshot persistence and cold restore for the Container's ephemeral
  disk. Production has no Qdrant binding and every production corpus flag remains
  disabled.
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
- Staging source discovery and metadata seeding remain disabled. Under the
  owner's explicit queue-processing approval, the shard Worker now uses the
  staging-only `LEGAL_CORPUS_QUEUE_PROCESSING_ENABLED=true` path while keeping
  `LEGAL_CORPUS_AUTO_INGEST_ENABLED=false` and live Lex disabled. It drains only
  already-materialized durable `fetch/version` jobs through the existing
  single-stream robots pacer and lock; it does not start new catalog discovery.
  The shard-3 control row remains `active` and queued jobs are not deleted or
  rewritten, so the ingestion queue is not yet a release-frozen queue. The
  read-only federated
  runtime routes the frozen legacy, v2, shard-1 and shard-2 bindings; shard-3
  remains outside that release set. Per-database totals, queue reconciliation,
  duplicate identity findings and the remaining release gates are recorded in
  `STAGING_FEDERATED_RETRIEVAL_2026-08-28.md` and
  `STAGING_ACQUISITION_FREEZE_2026-08-28.json`. These totals are not summed as
  a unique-corpus metric: cross-source overlap requires a formal
  partition/deduplication manifest. Isolated shard-1, shard-2, v2 and shard-3
  D1 export/restore rehearsals now have verified local `quick_check=ok` and zero
  foreign-key violations, but no federated snapshot, indexed 314-scenario
  benchmark or full-corpus Qdrant evidence has been claimed.
- A 2026-09-02 read-only recheck found one historical legacy dead-letter fetch
  (`lexuz:8411573`, `LEGAL_CORPUS_LANGUAGE_FAMILY_CONFLICT`) and its terminal
  ledger row, plus two expired audit lock rows. The guard intentionally fails
  closed when language aliases map to multiple document IDs. The original
  source payload is not retained, so no deterministic repair or status rewrite
  is safe; details are recorded in
  `STAGING_LEGACY_FAILURE_RECHECK_2026-09-02T2329Z.json`.
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
