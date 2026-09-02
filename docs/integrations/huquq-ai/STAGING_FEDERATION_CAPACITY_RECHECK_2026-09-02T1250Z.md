# Staging federation capacity recheck — 2026-09-02 12:50Z

Sequential `wrangler d1 info` metadata probes recorded the current staging
database sizes without changing source rows. `juro-staging` and
`juro-staging-corpus-v2` are at the 10 GB ceiling; `juro-staging-corpus-shard-3`
has 106,496 bytes of headroom. Shard-1 and shard-2 have usable reserve, while
shard-4 is the small ownership-projection target.

Because three sources are full or nearly full and shard-3 has seven historical
terminal/dead-letter jobs, queue processing remains held fail-closed. Starting
a drain would risk another terminal failure or capacity corruption. The prior
sequential D1 SELECT probe returned zero writes and no new terminal failures;
this capacity observation does not alter that ledger.

The artifact is capacity evidence only. It is not a corpus export, physical
disjointness proof, snapshot/restore, Qdrant parity result, legal review,
evaluation or production approval.

Machine-readable evidence: [STAGING_FEDERATION_CAPACITY_RECHECK_2026-09-02T1250Z.json](STAGING_FEDERATION_CAPACITY_RECHECK_2026-09-02T1250Z.json).
