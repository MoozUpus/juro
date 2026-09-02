# Staging logical ownership rebuild — 2026-09-02

The authorized staging action rebuilt only the ownership projection in
`juro-staging-corpus-shard-4` at `2026-09-02T11:23:41.675Z`.

The sequential source reads observed 12,333 physical rows and 7,152 unique
canonical IDs (5,181 duplicate occurrences). The projection verifies 7,152
rows, four deterministic partitions, and occurrence sum 12,333. Source rows
and all existing failure-ledger rows were unchanged.

This is a logical disjoint ownership index, not physical disjointness: the
source databases still overlap and no corpus text was copied into shard-4.
Queue processing and legacy recovery remain fail-closed while the release gate
is closed. No production deployment, migration, feature-flag or DNS action
was performed.

Machine-readable evidence: [STAGING_FEDERATION_OWNERSHIP_REBUILD_2026-09-02T1124Z.json](STAGING_FEDERATION_OWNERSHIP_REBUILD_2026-09-02T1124Z.json).
