# Staging 0091 — verified corpus freshness evidence

Date: 2026-08-05
Functional commit: `81de7bb77df7ddd133f5cd112aa38d5c1aee8b8e`
Pull request: `MoozUpus/juro#3`
Staging Worker: `juro-platform-staging`
Worker version: `3625c4b0-5bd9-4220-94b0-81ee3480acec`
Deployment: `27856a9d-52ad-465a-bb60-00838da3be93`

## Scope

Only commit `81de7bb` was pushed and deployed. Later local commits
`a583c37`, `309e328` and `3acd2a7` were deliberately excluded. Migration
`0091_verified_corpus_freshness.sql` was the only pending migration and the
only migration applied. Production was not migrated or deployed.

The migration replaces the existing `source_sync_runs` insert/update guards
and adds a delete guard. A full corpus run may be `success` only when the run
discovered at least one item, fetched and verified every discovered item,
observed no changed pending-review item and recorded no error. Terminal rows
remain immutable and cannot be deleted.

## Private pre-migration backup

D1 `juro-staging` (`bb716a96-b2fb-4823-90d6-6c228fed181a`) was exported before
the migration. All three objects were uploaded to private bucket
`juro-staging-backups` under
`d1/juro-staging/20260805-115908-0091/`, downloaded independently and compared
byte-for-byte by SHA-256:

| Object | Bytes | SHA-256 |
| --- | ---: | --- |
| `full.sql` | 1,601,402 | `112064191f29d939f4a9e92ea633315a4de3d2b816d249f808516c4e045e5c08` |
| `schema.sql` | 383,882 | `490c2a7617b83bd2776b2fcfc55d23f8c169ee4babc413d91f654ef68009b9f0` |
| `data.sql` | 1,217,552 | `580f7bb51d90def1b841f76cbfc1ef31df4b16def49c1ca488606b83ce65f12b` |

The independently downloaded full export restored into disposable SQLite with
`quick_check=ok`, zero foreign-key violations, 207 application tables, 447
indexes, 256 triggers and 91 migration rows. The restored database was
5,062,656 bytes. No signed export URL or secret value is retained here.

## Migration and integrity postflight

Wrangler listed only `0091_verified_corpus_freshness.sql` before application
and no pending migration afterwards. The remote ledger contains 92 rows with
latest id 92. Read-only trigger inspection confirmed the new
`LEGAL_CORPUS_SUCCESS_UNVERIFIED` predicate in both insert and update guards,
plus the delete guard.

A combined remote `quick_check`/foreign-key/schema query exceeded the D1 query
memory ceiling with `SQLITE_NOMEM`. It is not claimed as successful. Instead, a
fresh post-migration full export (1,604,096 bytes, SHA-256
`1b0dc6b41a9810461a98caaf834551719ed39ad79cbb6ad74787f5124a76056a`)
was restored independently. It passed `quick_check=ok`, zero foreign-key
violations, 207 tables, 447 indexes, 257 triggers and 92 migration rows. The
restored database was 5,066,752 bytes.

## Build, deploy and boundary evidence

- GitHub Actions `validate (apps/platform)` and `validate (apps/website)` both
  passed for PR head `81de7bb`.
- The exact detached worktree built and deployed successfully with Wrangler
  4.92.0. Version `3625c4b0-5bd9-4220-94b0-81ee3480acec` receives 100% of
  staging traffic; the script exposes `fetch`, `queue` and `scheduled` handlers.
- Readback confirmed staging D1, private file/backup/quarantine R2 buckets,
  seven Queue bindings, four Vectorize indexes, Analytics Engine, assets,
  Images and Workers AI.
- Secret inventory was read by name only. OpenAI, Anthropic, Resend, Turnstile,
  identity and payment-webhook secret bindings remained present; no value was
  read or logged.
- Anonymous probes for `/`, AI-lawyer entry, the canonical document-builder
  route, legal-source review and `/ru/status` each returned the expected
  Cloudflare Access `302` boundary.

## Remaining gates

Access redirects prove routing and protection, not an authenticated RU/UZ user
or reviewer journey. No controlled full corpus run, pending-review transition,
Queue/DLQ trace, Resend receipt or named legal review was performed in this
checkpoint. Those remain separate staging gates. Production and the public
website were unchanged.
