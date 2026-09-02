# Staging federation read-only recheck — 2026-09-02

At `2026-09-02T11:15:55.7594861Z` the five corpus databases were queried
sequentially with read-only D1 `SELECT` statements. The aggregate is 12,333
physical document rows, 7,152 unique canonical IDs, 155,487 unique current
provisions, 431,991 indexed chunks, 94,932 open jobs, two running jobs, eight
dead-letter jobs and eight terminal failure rows. Every source reports 44/44
completed discovery checkpoints.

The logical ownership projection in `juro-staging-corpus-shard-4` remains
verified (`ownership-20260902103236`): 7,152 rows, four deterministic
partitions and occurrence sum 12,333. The source rows and failure ledger were
unchanged. This projection is not physical disjointness; source IDs overlap
and no physical partition snapshot or restore has been claimed.

Queue processing remains held fail-closed while the release gate is closed.
The legacy dead-letter recovery was not invoked because it requires the
protected named-staff action with fresh MFA/TOTP. No queue row, source row or
failure-ledger row was mutated. Production deployment, migration, flags and
DNS remain unchanged.

The CI rerun for commit `8dc1827a` passed both platform and website jobs:
[run 33622571667](https://github.com/MoozUpus/juro/actions/runs/33622571667).

Machine-readable evidence: [STAGING_FEDERATION_READONLY_RECHECK_2026-09-02T1116Z.json](STAGING_FEDERATION_READONLY_RECHECK_2026-09-02T1116Z.json).
