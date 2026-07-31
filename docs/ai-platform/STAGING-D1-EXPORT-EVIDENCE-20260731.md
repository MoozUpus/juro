
## Restore rehearsal result

A local isolated import rehearsal was attempted with the remote snapshot through `wrangler d1 execute --env staging --local --persist-to`. It failed before any restored table was available with `no such table: main.workspaces`; retrying with a temporary `PRAGMA foreign_keys=OFF` preamble produced the same local Wrangler/SQLite failure. The export is structurally valid, but this CLI path is not accepted as a restore proof. Temporary SQL and local state were deleted after the attempt. Staging and production received no write.

The restore gate remains open and requires an approved Cloudflare-supported restore flow or a controlled disposable D1 restore target.