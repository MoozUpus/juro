# Staging federation authorized action — 2026-09-02 12:42Z

The authorized staging action rebuilt the existing logical ownership projection
in `juro-staging-corpus-shard-4` at `2026-09-02T12:42:48.649Z` from application
commit `a593d3764be57fe0c8d9909a2b5162e78c07695a`.

The projection reconciles 12,333 source document rows to 7,152 unique
canonical IDs and 5,181 duplicate occurrences. Deterministic ownership buckets
contain 1,812 / 1,728 / 1,806 / 1,806 IDs. Post-write verification returned
7,152 ownership rows, 7,152 distinct IDs, four partitions and occurrence sum
12,333. The source tables and append-only failure ledger were unchanged.

A sequential read-only post-action probe at `2026-09-02T12:47:06.0102879Z`
returned `rows_written=0` and `changed_db=false` for all six staging D1s. The
aggregate remains 94,934 open jobs, eight terminal/dead-letter rows and 220
completed checkpoint rows; no new terminal failure appeared. Queue processing
remains held fail-closed because legacy/v2 are at the 10 GB ceiling and shard-3
has only 106,496 bytes of headroom with seven terminal jobs.

The legacy job `legal-corpus:07aa10e095f0c77b28e6ada80fc8` remains
`dead_letter` after five attempts and five immutable failure-ledger rows. Its
recovery still requires the protected staging admin action with a named staff
session and fresh MFA/TOTP. Technical permission does not impersonate that
audit principal, so no direct D1, shell or service-token bypass was used.

This is a confirmed logical ownership/deduplication index, not physical
disjointness: source canonical IDs still overlap and no corpus text was copied
into shard-4. The release gate, snapshots/restores, Qdrant parity, legal
review/evaluation and production state remain unchanged.

Machine-readable evidence: [STAGING_FEDERATION_AUTHORIZED_ACTION_2026-09-02T1242Z.json](STAGING_FEDERATION_AUTHORIZED_ACTION_2026-09-02T1242Z.json).
