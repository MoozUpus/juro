# Authorized staging federation rebuild — 2026-09-02

At `2026-09-02T20:06:30.011Z` the authorized staging-only ownership-index rebuild completed with run `ownership-20260902200630`.

The script read the five existing source databases sequentially and rebuilt the projection in `juro-staging-corpus-shard-4` using `sha256(canonical_document_id) modulo 4`; duplicate source rows were retained in the source databases and one deterministic representative was selected by official source class and newest update. The source set contained 12,333 document rows, 7,152 unique canonical IDs and 5,181 duplicate rows. The four deterministic partition counts were 1,812 / 1,728 / 1,806 / 1,806.

Post-write verification returned 7,152 ownership rows, 7,152 distinct IDs, four partitions and occurrence sum 12,333. The source-row and failure-ledger mutation counters were both zero. This is a logical ownership projection, not proof of physical disjointness: source IDs still overlap and no legal-corpus text, versions, chunks or Qdrant points were copied into shard-4.

Queue handling stayed fail-closed. The legacy and v2 databases are at the 10 GB D1 ceiling, and shard-3 has only 106,496 bytes of headroom with seven existing terminal/dead-letter jobs. Resuming ingestion would risk capacity failures and create new ledger rows, so no queue mutation was issued. The legacy language-family job remains pending the protected named-staff staging action with fresh MFA/TOTP; this technical run cannot impersonate that assertion or substitute a success record.

The release gate remains closed. Snapshot, indexed 314-scenario evaluation, Qdrant/D1 restore gates, CI and production approval are not implied by this rebuild. Production was not changed.
