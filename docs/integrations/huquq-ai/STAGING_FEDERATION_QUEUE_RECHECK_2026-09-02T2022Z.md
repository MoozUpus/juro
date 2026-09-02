# Staging federation queue recheck — 2026-09-02

At `2026-09-02T20:22:28.0212954Z` I ran the queue and failure-ledger observations sequentially against all six staging D1 databases. Every query returned `rows_written=0` and `changed_db=false`. The latest terminal timestamps remain unchanged: legacy `2026-08-29T21:22:47.872Z` and shard-3 `2026-09-02T07:07:45.368Z`; no new terminal failure was created by this cycle.

The source job queues are still: legacy 43,539 queued plus one dead-letter; v2 27,686 queued, one retrying and two running; shard-1 and shard-2 completed-only; shard-3 23,702 queued, four retrying and seven dead-letter. The aggregate is 94,934 open jobs, eight dead-letter job rows and 220 completed checkpoints. The immutable failure ledger additionally retains 102 retrying / 269 technically-unavailable / 1 terminal rows in legacy, 28 retrying / 5 technically-unavailable rows in v2, and 384 retrying / 17 technically-unavailable / 7 terminal rows in shard-3. These rows were not rewritten, deleted or reclassified.

Queue work remains held fail-closed: legacy and v2 are at the 10 GB D1 ceiling, while shard-3 has only 106,496 bytes of headroom and existing terminal/dead-letter jobs. Starting a drain would risk `SQLITE_FULL`/`SQLITE_NOMEM` and append more failure rows. This is the safe queue decision under the authorization; it is not a claim that queues are drained or frozen.

The exact legacy job `legal-corpus:07aa10e095f0c77b28e6ada80fc8` (`lexuz:8411573`) remains pending. Its recovery is intentionally limited to the protected staging admin action with a named staff session and fresh MFA/TOTP. A technical shell or Wrangler token cannot impersonate that assertion, so no recovery success was recorded and the original failure ledger remains intact.

The release gate remains closed. Production bindings, flags, migrations and DNS were not changed.
