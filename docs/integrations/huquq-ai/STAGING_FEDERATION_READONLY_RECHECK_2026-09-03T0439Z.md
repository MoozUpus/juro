# Staging federation read-only recheck — 2026-09-03

At `2026-09-03T04:39:44.4288538Z`, the five source D1 databases were queried
sequentially with read-only `wrangler d1 execute --remote --json` requests.
The shard-4 ownership projection was queried separately. Every query reported
`rows_written=0`; no database, queue or failure-ledger row was changed.

The source totals remain 12,333 raw document rows, 5,419,932 summed
provisions and 5,412,044 summed chunks (the sums intentionally include source
overlap). The immutable ledger has eight terminal rows and eight dead-letter
job rows: one in legacy and seven in shard-3; no new terminal row appeared.
All five source databases report 44/44 discovery checkpoints. The ownership
projection remains 7,152 distinct IDs across four logical partitions.

Queue work remains held fail-closed because legacy and v2 are at the D1 10 GB
ceiling and shard-3 has existing terminal/dead-letter work. The protected
legacy recovery job remains pending a named-staff fresh-MFA/TOTP action; no
technical bypass or failure-ledger substitution was used.

This recheck does not prove physical disjointness, a frozen federated
snapshot, indexed evaluation, Qdrant parity, legal review or production
approval. Production, DNS, migrations and feature flags remain unchanged.
