# Staging federation gate recheck — 2026-09-03 06:14Z

This is a sequential read-only recheck after the authorized shard-3 → shard-4
handoff. Physical source rows sum to 12,333 documents, 5,419,932 provisions
and 5,412,044 chunks, with 94,934 open jobs. Those sums are not unique legal
coverage: the logical ownership index still reports 7,152 unique canonical IDs
and 5,181 duplicate source rows, and chunk/provision parity has not been proven.

Shard-3 is frozen and shard-4 is `handoff_prepared` with 23,706 held jobs and
no document/provision/chunk content. Legacy and v2 remain at their D1 ceilings
with open queues. The immutable terminal/dead-letter totals remain 8/8; no new
failure rows were created and no source failure row was rewritten.

The release gate remains **closed**. Numeric floors and 44/44 checkpoints are
observed, but zero terminal/dead-letter failures, a frozen queue, physical
disjointness, a federated snapshot, indexed evaluation, Qdrant/D1 restore and
legacy fresh-MFA recovery are still unproven. Production and DNS are unchanged.
