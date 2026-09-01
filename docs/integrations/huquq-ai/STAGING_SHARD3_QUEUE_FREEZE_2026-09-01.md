# Staging shard-3 queue-freeze evidence — 2026-09-01

This is an interim, staging-only evidence record. It does not claim the JURO
legal-corpus release gate, a federated snapshot, legal evaluation, or a
production rollout.

## Scope and deployment

- Database: `juro-staging-corpus-shard-3`
- Database ID: `ccf1f18e-66cf-4358-a7aa-f1d725b7653c`
- Worker: `juro-legal-corpus-shard-staging`
- Queue-freeze deployment: `89d588fd-da54-4b3a-a1a3-01b2b55b85a0`
- Application commits: `ce603425` (queue flag), `c41fb072` (CPU-safe quality
  boundary), `dc705efb` (staging cron disabled)
- Staging values: `LEGAL_CORPUS_QUEUE_PROCESSING_ENABLED=false`,
  `LEGAL_CORPUS_AUTO_INGEST_ENABLED=false`, `LEGAL_CORPUS_LIVE_LEXUZ_ENABLED=false`
- Staging cron triggers: `[]`

No production binding, migration, DNS record, or production feature flag was
changed.

## Read-only quality capture

The guarded capture completed at `2026-09-01T20:15:38.673Z` with
`rows_written=0`:

- 3,313 canonical documents;
- 33,084 exact unique current provisions;
- 97,470 current chunks, of which 93,097 are indexed;
- 44/44 checkpoints completed and aligned;
- 19/19 core-code targets indexed;
- 0 failed jobs, 0 dead-letter jobs, 0 unresolved retry/terminal jobs;
- 23,713 queued jobs (5,404 release-relevant non-catalogue jobs), 0 running;
- D1 size `9,997,344,768` bytes (the release reserve is 8,000,000,000 bytes);
- failure ledger: 17 `technically_unavailable` records, all attached to
  completed fetch jobs and not retryable.

The 17 technical records are retained and classified, not re-labelled as
success. Their codes are 12 official-text unavailable, 2 language-text
unavailable, 1 upstream unavailable (HTTP 404), 1 invalid attachment, and 1
attachment text unavailable.

Independent table probes also found 20,867 chunks with a dense vector,
1,413,980 chunks without one, and 1,430,474 rows with `indexed_at`; these are
not a Qdrant parity proof and must not be used as release evidence.

## Later read-only recheck

The point-in-time capture above is not a current ledger snapshot. A sequential
read-only recheck at `2026-09-01T22:44:17.162Z` (see
`STAGING_SHARD3_READONLY_RECHECK_2026-09-02.json`) found the same frozen
job-state boundary—0 failed/dead-letter jobs, 0 scheduled locks and 44 completed
checkpoints—but the failure ledger then contained 342 historical `retrying`
rows and 17 `technically_unavailable` rows. No retry or failure row was
rewritten; these rows keep the release gate closed.

## Guard and failed probes

- `scheduled_locks` is empty.
- The latest scheduler row is historical `D1_ERROR` (`20:12:58.114Z` to
  `20:13:51.682Z`) after the queue freeze; it created no failed/dead-letter
  ingestion job.
- A prior quality boundary query hit Cloudflare D1 CPU limit 7429. The
  boundary query was made CPU-safe by ordering the append-only scheduler table
  by `rowid`; the guarded capture then passed.
- A later capture correctly rejected an unsafe window because the next cron
  boundary had passed. Cron triggers were then disabled so no new scheduled run
  can race the capture.

## Gates still open

The release gate remains closed because the queue contains deferred jobs, D1 is
above the 8 GB release reserve, shard-3 is not a formal frozen partition, dense
Qdrant parity/snapshot has not been proven, cross-database IDs are not disjoint,
the current indexed 314-scenario evaluation is absent, and D1 backup/restore
verification remains open. Historical `technically_unavailable` records are
not silently removed.
