# Staging federated corpus runtime — 2026-09-02

This record documents the staging-only, read-only federation now used by the
JURO platform Worker. It is an implementation and verification record; it is
not a production release approval, a legal-coverage claim, or a substitute for
the federated release evidence gate.

## Runtime configuration

- Platform Worker deployment: `5de1b204-a53b-48ed-8c95-e4e140263efe`
- Admin Worker deployment: `0e558828-af23-4828-a8be-31143a0fb35f`
- `LEGAL_CORPUS_ENABLED=true` (staging only)
- `LEGAL_CORPUS_FEDERATED_ENABLED=true` (staging only)
- `LEGAL_CORPUS_FEDERATED_SOURCE_SET=all-staging-d1`
- `LEGAL_CORPUS_AUTO_INGEST_ENABLED=false`
- `LEGAL_CORPUS_LIVE_LEXUZ_ENABLED=false`
- `LEGAL_CORPUS_SHADOW_MODE=false`
- `LEGAL_CORPUS_QUEUE_PROCESSING_ENABLED=false` after the bounded recovery
  attempt encountered capacity-correlated ingestion failures; the shard-3
  Worker is now fail-closed with `crons=[]` and no scheduler or bulk
  acquisition is enabled.

The source set is explicit and server-side. The browser receives neither D1
bindings nor service credentials. Production bindings, flags, migrations and
DNS were not changed.

## 2026-09-02 post-attempt recheck

The queue-processing revision was stopped after two valid `*/4` ticks failed
with the sanitized `LEGAL_CORPUS_INGESTION_FAILED` code. Shard-3 now has no
running jobs or scheduler lock, but retains 23,702 queued jobs, 4 retrying
jobs, 7 dead-letter jobs and 7 terminal failure-ledger rows. Its D1 file is
9,999,892,480 bytes against the 9,999,998,976-byte ceiling, leaving 106,496
bytes of headroom. The failure rows were not edited or replaced.

An empty `juro-staging-corpus-shard-4` was created and migrated through
`0142_legal_corpus_shard_handoffs.sql` as a staging-only rollover target. It
is not yet bound, deployed, seeded, or included in the federation source set;
the source shard must remain immutable until a handoff can pass its durable
ledger and capacity checks.

## Federated sources

The read path queries these five D1 bindings and then applies deterministic
evidence-key ownership before RRF output:

1. `juro-staging` (`LEGAL_CORPUS_LEGACY_DB`)
2. `juro-staging-corpus-v2` (`LEGAL_CORPUS_V2_DB`)
3. `juro-staging-corpus-shard-1` (`LEGAL_CORPUS_SHARD_1_DB`)
4. `juro-staging-corpus-shard-2` (`LEGAL_CORPUS_SHARD_2_DB`)
5. `juro-staging-corpus-shard-3` (`LEGAL_CORPUS_SHARD_3_DB`)

The ownership key is `(source_class, canonical source URL or document ID,
language, article number)`. For one key, the representative ordering is
active, then unknown, historical, repealed; then newest version date,
`fetched_at`, and finally stable chunk ID. A duplicate key contributes at most
one sparse and one dense contribution, so adding an overlapping database
cannot improve a result merely by repeating it.

## Disjointness assessment

The federation is logically disjoint at the retrieval result boundary, but the
underlying D1 stores are not physically disjoint. The sequential read-only
identity probe (`STAGING_CANONICAL_ID_OVERLAP_RECHECK_2026-09-02.json`) found
12,333 physical document rows, 7,152 IDs in the union and 5,181 repeated rows.
Therefore the physical partition fields required by
`federated-release-gate.ts` are intentionally **not** asserted as passed.

The pairwise overlap counts are retained in the machine-readable probe. They
are evidence for the deterministic ownership/deduplication path, not a reason
to sum physical counters as unique legal coverage.

## Verification performed

- Federated retrieval and shard-boundary regression tests: 187/187 passed in
  the platform Cloudflare suite; the shard-3 binding and five-source route are
  covered.
- The federation rejects an incomplete shard, invalid sequence, or any sparse
  shard failure instead of returning an unmarked partial packet.
- Read-only source queries preserve provider, article, quote, status, validity
  dates, version date, language, URL and content hash.
- The formal physical disjoint-partition release gate remains closed until a
  point-in-time partition manifest, snapshot/restore proof, indexed 314-run,
  Qdrant benchmark/restore and D1 backup/restore are independently verified.

## Safety and rollback

No cross-database merge, destructive cleanup, corpus write, production
deployment, or DNS operation was performed. To roll back the federation, set
the staging federation flag off and keep the existing direct Lex fallback;
this does not alter any D1 rows. The bounded legacy recovery is a separate,
single-job action and must preserve every immutable failure-ledger row.
