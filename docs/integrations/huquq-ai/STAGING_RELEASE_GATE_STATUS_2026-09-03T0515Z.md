# Staging release-gate status — 2026-09-03

This status consolidates the sequential read-only probe at
`2026-09-03T05:15:05.6839132Z`. The five source D1 totals exceed the numeric
document, provision and chunk thresholds when summed, and every source has
44/44 completed checkpoints. Those sums are not release-qualified unique
totals: 5,181 duplicate source rows are recorded, including 1,335 known
canonical-ID overlaps between shard-1 and shard-2. Cross-source provision and
chunk identity/parity is not proven.

The release gate therefore remains closed. The immutable failure ledger has
eight terminal rows and the job tables have eight dead-letter rows; 94,934
jobs remain open, so ingestion is held fail-closed. A logical shard-4
ownership projection exists (7,152 IDs in four buckets), but it is not a
physical disjoint snapshot.

The v2 and shard-1 isolated D1 restore checks, sequential read-only
reconciliation and exact-head CI are supporting gates only. The frozen
federated snapshot, indexed 314-scenario evaluation and Qdrant benchmark/
snapshot-restore remain blocked until the release preconditions are proven.
No production, DNS, migration, queue or failure-ledger mutation occurred.
