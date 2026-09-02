# Staging logical ownership rebuild — 2026-09-02 11:49Z

The authorized staging-only rebuild refreshed the ownership projection in
`juro-staging-corpus-shard-4` from application commit
`723e2b019c57d3318bdbee3bb36e54e753c258a3`.

- five source D1s were read sequentially;
- 12,333 physical document rows reconciled to 7,152 unique canonical IDs;
- 5,181 duplicate source occurrences were retained as provenance;
- deterministic buckets contain 1,812 / 1,728 / 1,806 / 1,806 IDs;
- the projection verified 7,152 rows and occurrence sum 12,333;
- source rows and all existing failure-ledger rows were unchanged.

This is a logical disjoint ownership index for federated retrieval. It is not a
physical disjoint D1 partition, a corpus snapshot/restore, a Qdrant index, or
release approval. Physical source overlap remains a release-gate blocker.

Queue processing and legacy recovery remain fail-closed. The legacy job still
requires the protected named-staff staging action with fresh MFA/TOTP; no
technical access or user message can substitute for that evidence.

Machine-readable evidence: [STAGING_FEDERATION_OWNERSHIP_REBUILD_2026-09-02T1149Z.json](STAGING_FEDERATION_OWNERSHIP_REBUILD_2026-09-02T1149Z.json).
