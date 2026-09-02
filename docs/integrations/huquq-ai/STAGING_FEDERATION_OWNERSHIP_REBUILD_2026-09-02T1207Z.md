# Staging logical ownership rebuild — 2026-09-02 12:07Z

The authorized staging-only rebuild refreshed the ownership projection in
`juro-staging-corpus-shard-4` from application commit `d15830046c459e12e87275d922437a66d404736b`.

- five source D1s were read sequentially;
- 12,333 physical document rows reconciled to 7,152 unique canonical IDs;
- 5,181 duplicate source occurrences were retained as provenance;
- deterministic buckets contain 1,812 / 1,728 / 1,806 / 1,806 IDs;
- the projection verified 7,152 rows and occurrence sum 12,333;
- source rows and all existing failure-ledger rows were unchanged.

This is a logical disjoint ownership index for federated retrieval. It is not a
physical disjoint D1 partition, a corpus snapshot/restore, a Qdrant index, or
release approval. Physical source overlap remains a release-gate blocker.

Queue processing remains held fail-closed because the legacy and v2 databases
are at their D1 ceiling and shard-3 has open work plus existing terminal/dead-
letter rows. The approved legacy recovery cannot be invoked from the shell: it
requires the named legal-corpus staff session with fresh MFA/TOTP through the
protected staging admin action. No technical access or user message substitutes
for that cryptographic evidence.

Machine-readable evidence: [STAGING_FEDERATION_OWNERSHIP_REBUILD_2026-09-02T1207Z.json](STAGING_FEDERATION_OWNERSHIP_REBUILD_2026-09-02T1207Z.json).
