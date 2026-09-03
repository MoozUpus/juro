# Staging target-bound deployment — 2026-09-03 07:35Z

The staging corpus Worker was deployed with the `DB` binding set to
`juro-staging-corpus-shard-4` (`7c6dba67-5561-473f-aaa8-a0f6ed6e9bf2`) and
Qdrant collection `juro_legal_staging_shard_4`.

Deployment ID: `2428dd34-cd14-4b51-986c-85c5399696cc`  
Version ID: `8932797e-e37f-4d1f-97f9-bee1e4de74c1`  
Created: `2026-09-03T07:35:28.038396Z`

The deployment was performed from the staging-only shard configuration after
the handoff ledger was created at `2026-09-03T05:28:52.013Z` (target ledger)
and `2026-09-03T05:38:46.908Z` (source ledger). Wrangler dry-run confirmed the
target D1 binding, and `wrangler versions view` confirmed the same D1 UUID in
the deployed version.

`LEGAL_CORPUS_QUEUE_PROCESSING_ENABLED=false`,
`LEGAL_CORPUS_AUTO_INGEST_ENABLED=false`, and staging cron triggers remain
empty. The deployment therefore does not activate the prepared handoff or
start a crawl/drain.

The protected legacy recovery is still not evidenced: job
`legal-corpus:07aa10e095f0c77b28e6ada80fc8` remains `dead_letter` with
`LEGAL_CORPUS_LANGUAGE_FAMILY_CONFLICT`, and no matching
`legal_corpus_admin_events` row exists. Activation and queue processing remain
blocked until that named-staff fresh-MFA action and the separate queue approval
are recorded.

No production Worker, migration, DNS record, or production flag was changed.

Machine-readable evidence: [STAGING_FEDERATION_TARGET_DEPLOYMENT_2026-09-03T0735Z.json](STAGING_FEDERATION_TARGET_DEPLOYMENT_2026-09-03T0735Z.json).
