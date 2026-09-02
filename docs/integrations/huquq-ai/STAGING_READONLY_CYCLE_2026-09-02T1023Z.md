# Staging read-only cycle — 2026-09-02 10:23Z

Five legacy corpus D1 databases were queried sequentially with bounded
read-only `SELECT` statements. Counts are unchanged from the authorized
ownership-index run: 12,333 physical document rows, 7,152 unique canonical IDs,
8 terminal failures (one legacy and seven shard-3), and 220 completed
checkpoints. No new terminal failure appeared and every successful probe
reported `rows_written=0`.

The normalized `green2-20260831` catalog remains stable at 6,895 source
documents, 165,852 snapshot provisions and 160,978 canonical chunks. Its
snapshot is frozen, but its search release is still `draft` with 9,748
ineligible capability rows, so it remains held outside the current Worker
federation.

Queue processing and legacy recovery remain unstarted. The capacity/failure
guard blocks queue work, while legacy recovery requires the protected named
staff fresh-MFA action. The append-only failure ledger was not changed. The
release gate remains closed and production remains unchanged.

Machine-readable evidence: [STAGING_READONLY_CYCLE_2026-09-02T1023Z.json](STAGING_READONLY_CYCLE_2026-09-02T1023Z.json).
