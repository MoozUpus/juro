# Staging D1 export evidence — 2026-07-31

- Database: juro-staging (b716a96-b2fb-4823-90d6-6c228fed181a)
- Operation: wrangler d1 export --remote
- Export result: successfully downloaded locally for validation.
- Size: $bytes bytes.
- SHA-256: $hash.
- Validation: SQL begins with D1 schema statements and contains $migrationCount recorded migration entries.
- Handling: the local export was not committed, uploaded, or retained after checksum/schema validation. The signed one-hour download URL is intentionally omitted from this document and from Git.

This proves creation and structural validation of a staging backup snapshot. It is not a production backup or a full restore rehearsal; restore remains a release gate.

## Restore rehearsal result

A local isolated import rehearsal was attempted with the remote snapshot through wrangler d1 execute --env staging --local --persist-to. It failed before any restored table was available with 
o such table: main.workspaces; retrying with a temporary PRAGMA foreign_keys=OFF preamble produced the same local Wrangler/SQLite failure. The export is structurally valid, but this CLI path is not accepted as restore proof. Temporary SQL and local state were deleted after the attempt. Staging and production received no write.

The restore gate remains open and requires an approved Cloudflare-supported restore flow or controlled disposable D1 restore target.


## Successful isolated SQLite restore rehearsal

The staging export was restored into a disposable local SQLite database with foreign keys disabled for schema import and verified afterward. Results: 51 migration rows, 2 workspace rows, and PRAGMA foreign_key_check returned 0 rows. Export SHA-256: 1a0e493cffade1e7f93b01d9c784313ad08c40dd9649a56d61f4ec7f6b56e38e; size: 578326 bytes. This validates snapshot contents and relational integrity in an isolated local restore target; it did not write staging or production. Temporary SQL and SQLite files were deleted after verification.
