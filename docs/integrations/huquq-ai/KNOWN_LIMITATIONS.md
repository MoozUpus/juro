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
- Staging source discovery and metadata seeding remain disabled. A bounded
  queue-processing attempt was authorized, but two valid `*/4` ticks on
  shard-3 produced sanitized `LEGAL_CORPUS_INGESTION_FAILED` outcomes while
  the D1 file was 9,999,892,480 bytes against its 9,999,998,976-byte ceiling.
  Queue processing is now disabled again (`crons=[]`). Shard-3 had 23,702
  queued, 4 retrying and 7 dead-letter jobs; those queued/retrying jobs were
  moved through the audited handoff ledger to shard-4, making shard-3 frozen.
  Shard-4 is prepared but not bound, deployed or activated, so its 23,706 jobs
  remain held and no crawl was started. The source's 408 failure-ledger rows
  remain append-only; no failure row was rewritten. The read-only federated
  runtime routes all five existing D1 sources, including shard-3, with deterministic logical
  evidence-key deduplication. The underlying stores still overlap physically,
  so the formal disjoint-partition release gate, federated snapshot, indexed
  314-scenario benchmark and full-corpus Qdrant evidence remain unproven.
  Details are recorded in `STAGING_FEDERATED_RUNTIME_2026-09-02.md`,
  `STAGING_SHARD3_QUEUE_DRAIN_FAILURE_2026-09-02T0712Z.json` and the existing
  read-only identity probes.
- The authorized shard-3 → shard-4 handoff completed on 2026-09-03 with
  manifest `8a2d7192d0023c1ba1f667729e03aa705638c520990e1c4e4ad13f278d6b698d`.
  Target verification found 44 checkpoints, 27,900 discovery rows, 23,706
  jobs, 23,706 handoff rows and 14 copied failure rows. The target contains no
  document/provision/chunk content and remains `handoff_prepared` pending a
  separately reviewed staging deployment. This closes queue handoff safety for
  shard-3 only; it does not close the physical disjointness, snapshot, Qdrant,
  evaluation, legal-review or production gates. See
  `STAGING_FEDERATION_HANDOFF_SHARD3_TO_SHARD4_2026-09-03.{json,md}`.
- A 2026-09-02 read-only recheck found one historical legacy dead-letter fetch
  (`lexuz:8411573`, `LEGAL_CORPUS_LANGUAGE_FAMILY_CONFLICT`) and its terminal
  ledger row, plus two expired audit lock rows. The guard intentionally fails
  closed when language aliases map to multiple document IDs. The original
  source payload is not retained, so no deterministic repair or status rewrite
  is safe; details are recorded in
  `STAGING_LEGACY_FAILURE_RECHECK_2026-09-02T2329Z.json`.
- A staging-only logical ownership projection was built in the existing empty
  `juro-staging-corpus-shard-4` (`0143_staging_federation_ownership_index.sql`).
  It contains 7,152 canonical identifiers assigned to four deterministic,
  disjoint buckets and preserves the 5,181 observed duplicate source rows as
  metadata. It does not copy article text, versions, chunks or Qdrant points,
  and it does not prove physical source disjointness or close the release gate.
  Evidence is recorded in
  `STAGING_LOGICAL_DISJOINT_OWNERSHIP_INDEX_2026-09-02.{json,md}`.
- The legacy dead-letter URL `https://lex.uz/en/docs/8411573` is already
  available in shard-1 and shard-3 under canonical family ID
  `lexuz-family:8407544` (all four language variants). This read-only
  federated alias resolution keeps chat retrieval usable without rewriting the
  legacy failure ledger; a named-staff MFA-bound retry is still required to
  claim the legacy job itself recovered. Evidence is in
  `STAGING_LEGACY_FEDERATED_ALIAS_RECOVERY_2026-09-02.{json,md}`.
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
- The post-authorization sequential recheck is recorded in
  `STAGING_FEDERATION_QUEUE_AUTHORIZATION_RECHECK_2026-09-02.json`. It
  confirms that the five-source logical federation and shard-4 ownership
  projection remain stable, but it does not convert overlapping physical
  rows into a disjoint snapshot, drain a near-capacity queue, or alter the
  preserved failure ledger.
- The authorized action run and its exact sequential queue observation are
  recorded in
  `STAGING_FEDERATION_ACTION_RUN_2026-09-02.{json,md}`. Alias resolution is
  available, but the legacy job itself still requires a named-staff fresh-MFA
  retry through the protected staging admin flow.
- A 2026-09-02 read-only discovery found three newer
  `juro-legal-catalog-staging*` D1 databases. `green2-20260831` has a separate
  normalized frozen snapshot (6,895 source documents and 160,978 canonical
  chunks), but its search release remains `draft` with `qualificationPending`
  and it has no current Worker binding. The other two lack the legacy
  `legal_corpus_documents`/variants/provisions contract. They are held as
  candidates and are not silently merged into the five-source federation.
  The ownership/queue/recovery decision is captured in
  `STAGING_FEDERATION_AUTHORIZED_ACTION_2026-09-02.{json,md}`.
- The 2026-09-02 12:17Z safety recheck revalidated all six staging D1 bindings:
  the source rows and failure ledger remain unchanged, no new terminal failure
  appeared, and queue processing remains fail-closed because the legacy/v2
  databases are at the 10 GB ceiling while shard-3 has only 106,496 bytes of
  headroom. The exact legacy recovery job is still pending the protected
  named-staff fresh-MFA action. See
  `STAGING_FEDERATION_SAFE_QUEUE_RECHECK_2026-09-02T1217Z.{json,md}` and the
  refreshed ownership evidence
  `STAGING_FEDERATION_OWNERSHIP_REBUILD_2026-09-02T1207Z.{json,md}`.
- The frozen v2 source now has a completed read-only full export and isolated
  local restore: `PRAGMA quick_check=ok`, zero foreign-key violations and
  migration ledger count 142. This closes only the v2 export/restore integrity
  check; it is not a federated snapshot or release approval. See
  `STAGING_D1_V2_EXPORT_RESTORE_2026-09-02.{json,md}`.
- A 2026-09-03 sequential read-only probe confirms all five source databases
  still report 44/44 checkpoints and no new terminal failures. The aggregate
  immutable ledger remains eight terminal/dead-letter rows, and queue work is
  held fail-closed. The source overlap and physical disjointness limitation
  remain unchanged. See
  `STAGING_FEDERATION_READONLY_RECHECK_2026-09-03T0439Z.{json,md}`.
- On 2026-09-03 the authorized shard-3 → shard-4 handoff completed with source
  `frozen` and target `handoff_prepared`: 23,706 queued/retrying jobs,
  27,900 discovery rows and 14 associated failure rows were transferred via
  the immutable handoff ledger. The target has no document/provision/chunk
  content and no worker binding, so queue draining remains disabled. The
  logical ownership projection was rebuilt and verified at 7,152 unique IDs;
  physical disjointness, legacy fresh-MFA recovery, snapshot, Qdrant, indexed
  evaluation and release approval remain open. Evidence:
  `STAGING_FEDERATION_HANDOFF_SHARD3_TO_SHARD4_2026-09-03.{json,md}` and
  `STAGING_FEDERATION_OWNERSHIP_REBUILD_2026-09-03.{json,md}`.
