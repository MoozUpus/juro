# Staging logical disjoint ownership index — 2026-09-02

The staging-only ownership projection was built in the existing empty
`juro-staging-corpus-shard-4` database. It reads the five existing staging
sources sequentially and assigns each canonical document ID to exactly one of
four deterministic partition buckets using
`sha256(canonical_document_id) modulo 4`. When duplicate source rows exist, the
representative is selected by official source class, then newest `updated_at`,
then stable source name.

The run observed 12,333 physical document rows, 7,152 unique canonical IDs and
5,181 duplicate rows. The target table contains 7,152 rows with a one-to-one
primary-key mapping and partition counts 1,812 / 1,728 / 1,806 / 1,806. A
read-only post-seed query confirmed the row count, four buckets and occurrence
sum; no source row or failure-ledger row was written.

This is a confirmed **logical ownership index**, not a claim that the five
source D1 databases are physically disjoint. The formal federated release gate
therefore remains closed until chunk ID sets, point-in-time snapshots, Qdrant
parity/restore, indexed 314-scenario evaluation, D1 backup/restore, and all
other release evidence are independently proven. The browser/runtime continues
to use the existing server-side five-source federation with deterministic
result-level deduplication.

Machine-readable evidence: [STAGING_LOGICAL_DISJOINT_OWNERSHIP_INDEX_2026-09-02.json](STAGING_LOGICAL_DISJOINT_OWNERSHIP_INDEX_2026-09-02.json).

The projection was rebuilt again on 2026-09-02 at 10:32:36Z
(`ownership-20260902103236`) from commit
`ef97fc8f41392299cc5ccfc659ebb4752567fff6`. The post-seed verification again
returned 7,152 ownership rows, four partitions, occurrence sum 12,333, and
zero source/failure-ledger writes. The target ledger retains the verified run
history; the latest machine-readable action record is
[STAGING_FEDERATION_AUTHORIZED_ACTION_2026-09-02T1032Z.json](STAGING_FEDERATION_AUTHORIZED_ACTION_2026-09-02T1032Z.json).
