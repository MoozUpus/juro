# Authorized staging federation recheck — 2026-09-03 06:33Z

This is a sequential, read-only post-handoff probe. Every Wrangler D1 query
returned `rows_written=0` and `changed_db=false`; no source, queue,
checkpoint, document, chunk or failure-ledger row was changed.

The six databases contain 12,333 physical document rows, 5,419,932 provision
rows and 5,412,044 chunk rows. The logical ownership projection contains
7,152 unique canonical IDs and 5,181 duplicate source occurrences across four
deterministic partitions. This is a verified logical index, not proof of
physical disjointness or chunk parity.

There are 94,934 open jobs, eight dead-letter jobs and eight terminal failure
rows. Shard-3 is `frozen`; shard-4 is `handoff_prepared` with 23,706 handoff
jobs but zero legal-corpus rows. Activation and queue drain were not started
because the target worker binding is not deployed and the queue-processing
flag is disabled.

The protected legacy target remains `legal-corpus:07aa10e095f0c77b28e6ada80fc8`
(`lexuz:8411573`). Recovery requires the named-staff staging admin action with
fresh MFA/TOTP; no technical token or ledger substitution was used.

The release gate remains closed. Snapshot, indexed 314-scenario evaluation,
Qdrant benchmark/restore, federated D1 backup/restore, legal review and
production approval are not claimed. Production and DNS are unchanged.

Machine-readable evidence: [STAGING_FEDERATION_AUTHORIZED_RECHECK_2026-09-03T0633Z.json](STAGING_FEDERATION_AUTHORIZED_RECHECK_2026-09-03T0633Z.json).
