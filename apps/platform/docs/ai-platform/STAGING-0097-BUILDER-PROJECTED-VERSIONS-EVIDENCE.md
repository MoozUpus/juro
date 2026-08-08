# Staging 0097 — projected Builder versions

Date: 2026-08-05

Commit: `16964b7130bfbc15bdd824286642736abcdf6df5`

PR: `MoozUpus/juro#3`

Worker: `juro-platform-staging`

Worker version: `6b035237-0eef-4a3e-b0a4-11005f58b09b` at 100%

## Private backup and restore

Before migration, remote `juro-staging` full/schema/data exports were uploaded
to private bucket `juro-staging-backups` under
`d1/juro-staging/20260805-183738-0097-pre/`. Independent downloads matched:

| Export | SHA-256 |
|---|---|
| full | `3c0ccc90b76e802626b885e8fb126fb56c988dc30b4c7a0efae5652c29e4440d` |
| schema | `2b0c6e2a6dc678555ba0c9eb311fc4c08b23dbf9b461ea9d684c993516bfafc0` |
| data | `0090aa4f5e24050abef29b0d4aeed6d6338eebe87592316e57069f6dd0ac2170` |

The isolated schema/data restore passed `quick_check=ok`, zero foreign-key
violations, 212 application tables, 472 indexes, 277 triggers and 97 migration
rows. Temporary plaintext exports, downloads and restore SQLite were removed
after verification; the private R2 objects remain.

## Migration and deployment

- The exact detached worktree exposed only
  `0097_builder_document_version_object_writes.sql` as pending; Wrangler applied
  17 additive commands and ledger row 98 now names `0097`.
- Read-only postflight found the metadata-only intent table and the expected
  insert/projected-write/attach guards. The new table was empty after migration.
- A combined remote `PRAGMA quick_check; PRAGMA foreign_key_check` request hit
  Cloudflare D1 `SQLITE_NOMEM`; smaller ledger/schema queries passed. Integrity
  evidence therefore comes from the successful pre-migration isolated restore,
  migration transaction and bounded postflight, not a claimed remote PRAGMA.
- Exact-commit type-check, lint, staging build, artifact validation and deploy
  dry-run passed. The self-guarded deploy script verified target/name/APP_ENV as
  staging before upload.
- A combined environment-matrix run exposed an existing shared-artifact race:
  its development validator observed the staging artifact, and a Wrangler type
  check hit a Windows libuv assertion. Those two checks are not reported as
  passing; isolated staging checks and deployment passed.
- GitHub CI `validate (apps/platform)` and `validate (apps/website)` passed for
  PR head `16964b7`.
- Anonymous root, canonical Document Builder and AI Lawyer probes returned
  Cloudflare Access `302`, not application `404`.

## Open gate

Access-boundary smoke proves protected routing, not authenticated product
behavior. A synthetic owner/collaborator must still execute proposal apply,
idempotent replay, corrected Analysis return and orphan reconciliation behind
Access. Production was not migrated or deployed.
