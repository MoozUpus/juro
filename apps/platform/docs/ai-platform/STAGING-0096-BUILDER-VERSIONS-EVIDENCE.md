# Staging 0096 — immutable Builder versions

Date: 2026-08-05

Commit: `8433b94769f3537c6096dee839957526579603bc`

PR: `MoozUpus/juro#3`

Worker: `juro-platform-staging`

Worker version: `f7bc9745-1641-449b-9e34-d6ffdd1d23cf`

Deployment: `0ee15da6-c6c5-43e8-b489-9d9315349857` at 100%

## Private D1 backup and restore

Before migration, full/schema/data exports of `juro-staging` were uploaded to
private bucket `juro-staging-backups` under
`d1/juro-staging/20260805-205801-0096-pre/`. Independent downloads matched:

| Export | Bytes | SHA-256 |
| --- | ---: | --- |
| full | 1,885,698 | `760ddf9276bcfe19c57f0632deaf8ff3e6115a5e3c875a9cb4111ad0decbdd48` |
| schema | 412,035 | `8261f2e6b4009d873f812f46726e38de9084d1b1bc69778f7c6bedcd8a2cc8e1` |
| data | 1,473,695 | `4e89b30cbc3bfefd00052fd2abc5621f7ec3ba16e90779111be87fc7af25e124` |

The isolated restore passed `quick_check=ok`, zero foreign-key violations, 210
application tables, 464 indexes, 272 triggers and 96 migration rows.

After migration, the same round trip under
`d1/juro-staging/20260805-205954-0096-post/` matched:

| Export | Bytes | SHA-256 |
| --- | ---: | --- |
| full | 1,893,237 | `7a4993fd0a2243403dfdfdd3de5ddf39633e12641ad1ac5c0b6e54c8529285c3` |
| schema | 419,448 | `2b0c6e2a6dc678555ba0c9eb311fc4c08b23dbf9b461ea9d684c993516bfafc0` |
| data | 1,473,821 | `dbe1d0cdf258b9374a464f8b82b6246c9cd77b3498d4d7e02ce0c557bbd3838b` |

The post-restore passed `quick_check=ok`, zero foreign-key violations, 212
application tables, 472 indexes, 277 triggers and 97 migration rows. Temporary
local plaintext exports and disposable SQLite restores were deleted after both
private round trips passed.

## Migration, deployment and checks

- Wrangler applied only `0096_builder_document_versions.sql`; ledger id 97 is
  recorded and no migration is pending.
- Remote schema inspection found both metadata/evidence tables, eight indexes,
  five guard/immutability triggers and no `foreign_key_check` rows.
- Exact-commit type-check, lint, mandatory test runner, staging build, artifact
  validation and generated Cloudflare type check passed. A first concurrent
  `wrangler types --check` process hit a Windows libuv assertion; isolated retry
  passed and regeneration produced no semantic git diff.
- GitHub CI `validate (apps/platform)` and `validate (apps/website)` passed for
  exact head `8433b94`.
- Anonymous `/`, canonical Document Builder, AI Lawyer, Builder versions API
  and status probes returned Cloudflare Access `302`, not application `404`.
- Worker read-back lists the expected D1/R2/Queues/Vectorize/AI bindings and
  secret names only. No secret value was read or recorded.

## Open gate

Access-boundary probes prove protection and routing, not authenticated product
behavior. An owner must still run a synthetic RU/UZ
create/list/restore/idempotent-replay flow behind Cloudflare Access. The later
automatic lifecycle-checkpoint edits are not part of deployed commit `8433b94`.
Production was not migrated or deployed.
