# Staging federation read-only recheck — 2026-09-02 20:49Z

This sequential read-only D1 cycle queried all five source databases and the
staging-only shard-4 ownership projection. Every query returned
`rows_written=0` and `changed_db=false`. The latest terminal failure timestamps
and counts are unchanged from the previous observation; no new terminal row
was created.

The source totals are 12,333 physical document rows, 7,152 logical canonical
IDs in the ownership projection, 5,419,932 summed provisions and 5,412,044
summed chunks. The latter two sums are not unique corpus counts because source
IDs overlap. The projection remains a four-bucket logical ownership index.

The queue remains held fail-closed: 94,934 open jobs are observed, including
legacy/v2 queues at the 10 GB D1 ceiling and shard-3 with 106,496 bytes of
headroom plus seven existing terminal/dead-letter jobs. No queue work was
started and the immutable failure ledger was not edited. The legacy recovery
job for `lexuz:8411573` remains behind the named-staff fresh-MFA staging action.

This record does not claim physical disjointness, a frozen release snapshot,
indexed 314-scenario evaluation, Qdrant or D1 restore, legal review, or
production approval. Production, DNS and production feature flags are
unchanged.

Machine-readable evidence: [STAGING_FEDERATION_READONLY_RECHECK_2026-09-02T2049Z.json](STAGING_FEDERATION_READONLY_RECHECK_2026-09-02T2049Z.json).
