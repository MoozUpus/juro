# Staging federation read-only cycle — 2026-09-02 12:29Z

After clearing a local npm-cache `ENOSPC` condition, the six staging D1 sources
were queried sequentially with bounded `SELECT` statements. All probes returned
`rows_written=0` and `changed_db=false`; remote D1 state was not changed by the
local disk-space failure or its cleanup. No new terminal failure appeared.

The current aggregate remains 94,934 open jobs, 8 terminal/dead-letter rows and
220 completed checkpoint rows. Queue processing remains fail-closed because the
legacy/v2 databases are at the 10 GB ceiling and shard-3 is near capacity with
seven terminal jobs. The legacy recovery job still needs the protected named
staff fresh-MFA admin action. Release gate and production state are unchanged.
