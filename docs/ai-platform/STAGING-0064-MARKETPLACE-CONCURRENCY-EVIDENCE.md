# Staging 0064 — marketplace payment-attempt concurrency fence

Date: 2026-08-03

Environment: staging only (`juro-platform-staging`, D1 `juro-staging`).

## Change

Migration `0064_marketplace_open_payment_attempt.sql` adds a partial unique index:

`payment_attempts_order_open_uidx` on `payment_attempts(order_id)` when
`internal_status = 'client_action_required'`.

It prevents two independently retried confirmation requests from creating two
simultaneously open sandbox checkout attempts for one order. A completed
idempotency replay remains safe; a distinct concurrent request receives the
application conflict path.

## Backup and restore evidence

Before migration, a full D1 export plus separate schema and data exports were
stored in the private `juro-staging-backups` bucket under the dated
`d1/juro-staging/` backup prefix. The full export was `1,148,750` bytes and its
SHA-256 was:

`db54a1cc22a10fd2fa60715a87a852076c635ff0dbc197708e769843ac241688`

The export was downloaded from R2 and its SHA-256 matched. An isolated local
restore completed with `quick_check=ok`, zero foreign-key violations, 168
tables, 334 indexes, 126 triggers and 64 pre-existing migration records. No
signed R2 URL is retained in this document.

## Applied and verified

- `npx wrangler d1 migrations apply juro-staging --remote --env staging` applied
  the authorized migration.
- `npx wrangler d1 migrations list juro-staging --remote --env staging` reports
  `No migrations to apply!`.
- A remote query of `sqlite_master` returned
  `payment_attempts_order_open_uidx`.
- `PRAGMA foreign_key_check;` on remote staging returned an empty result set.

## Deployment

- `npm run deploy:staging` completed successfully after the migration.
- Active Worker version: `adde6374-cbec-4e20-918d-e6c303ac75e9` (100%).
- The Worker retained its staging-only D1, R2, Queue and Vectorize bindings.
- Anonymous `HEAD https://staging.app.juro.uz/` returned `302` to Cloudflare
  Access, which confirms the staging route remains access-protected. It is not
  an authenticated marketplace-flow test.

## Remaining verification

An authenticated synthetic browser flow must still confirm that two rapid
distinct checkout confirmations produce one active attempt and one controlled
conflict, while a retry with the same idempotency key returns the existing
attempt. Cross-workspace denial remains part of that protected E2E pass.
