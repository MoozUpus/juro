# Staging federation queue safety recheck — 2026-09-02 12:17Z

This recheck applies the owner's authorization to handle queues safely while
preserving the immutable failure ledger. The six staging D1 sources were
queried sequentially with bounded `SELECT` statements. Every query reported
zero writes; no source row, job, checkpoint or failure row was changed.

The safe decision is to keep queue processing fail-closed. `juro-staging` and
`juro-staging-corpus-v2` are at the 10 GB ceiling; shard-3 has only 106,496
bytes of headroom and seven existing terminal/dead-letter jobs. A drain could
turn a known capacity risk into new terminal failures. No new terminal failure
appeared during this cycle.

The approved legacy recovery remains pending. Job
`legal-corpus:07aa10e095f0c77b28e6ada80fc8` is still `dead_letter` at attempt 5
with five immutable failure rows (one terminal), and can only be retried by the
protected staging admin action after a named legal-corpus staff session with
fresh MFA/TOTP. The browser session available to the runner is currently at the
Cloudflare Access sign-in page, so no technical bypass was attempted.

The logical ownership index remains verified in shard-4, but it does not prove
physical disjointness, snapshot/restore, Qdrant parity, legal review or release
approval. Production configuration and traffic were not changed.
