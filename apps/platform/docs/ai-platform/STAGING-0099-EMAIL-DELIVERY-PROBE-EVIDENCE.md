# Staging 0099 — Resend delivery acceptance probe

Date: 2026-08-06 Asia/Tashkent

Commit: recorded in the associated `feature/juro-ai-platform` change set

PR: `MoozUpus/juro#3`

Worker: `juro-platform-staging`

## Scope and privacy boundary

Migration `0099_staging_email_delivery_probe.sql` adds an immutable,
content-free staging-only receipt. The table has no recipient, email, subject,
HTML, user, workspace, case, document, request, or provider response-body
column. The protected operations recipient is resolved only from the existing
server-side staging variable at send time.

The probe is impossible unless `APP_ENV=staging` and the explicit
`STAGING_SYNTHETIC_PROBES_ENABLED=true` switch are both present. No HTTP route
exists for it and production cannot enter this path.

## Private backup and restore

Before migration, a full/schema/data export of D1 `juro-staging`
(`bb716a96-b2fb-4823-90d6-6c228fed181a`) was uploaded to private
`juro-staging-backups` under:

`d1/juro-staging/20260805-194800-0099-pre/`

Independent downloads matched the exported SHA-256 values:

| Export | SHA-256 |
|---|---|
| full | `19fc59d2286e99d6b81d0e8fc8d07f89bce7778a704beeb8b86f4304b89df1e4` |
| schema | `0d32f7946db2c3361911c611b2f3fc808f13caaedba6ace0bd61f4cfea1c8258` |
| data | `7a0b3881067b034ae0481e7e64ad69210b5f3f2f7ed075d45c757df571f64f09` |

The isolated schema/data restore passed `quick_check=ok`, zero foreign-key
violations, 214 application tables, 481 indexes, 289 triggers and 99 prior
migration rows. Temporary local plaintext exports, R2 round-trip copies and
the restore SQLite database are removed after this evidence is committed; the
private R2 recovery objects remain.

## Migration and staging result

- exactly `0099_staging_email_delivery_probe.sql` was pending and applied;
- `d1_migrations` ledger row `100` names `0099`;
- the receipt table and both immutable/transition trigger guards are present;
- remote `foreign_key_check` returned no rows;
- the direct remote `quick_check` query returned Cloudflare D1
  `SQLITE_NOMEM`; it is therefore **not** claimed as a remote pass. Integrity
  is evidenced by the isolated restore and bounded remote postflight.

Worker `c208af0c-74e8-4071-b546-79303a3c748c` temporarily carried the explicit
staging flag for one existing five-minute cron. At `2026-08-05T20:05:36.558Z`,
Resend accepted exactly one fixed content-free technical message; its D1
receipt has `status=sent`, one attempt and no error code. The next cron run was
completed with no scheduler error.

This proves Resend API acceptance and idempotent provider receipt persistence.
It does **not** prove inbox placement, mailbox rendering, user interaction, or
delivery of a real user deadline reminder.

The final Worker `bd6e6725-f74e-48fb-bcc8-ffcca7a4cddc` restored
`STAGING_SYNTHETIC_PROBES_ENABLED=false` at 100% traffic. Production Worker
`juro`, production D1 and production R2 were not changed.
