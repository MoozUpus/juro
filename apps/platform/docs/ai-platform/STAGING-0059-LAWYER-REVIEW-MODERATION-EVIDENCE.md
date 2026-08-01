# Staging evidence — lawyer review moderation

Date: 2026-08-02
Environment: staging only
Worker: `juro-platform-staging`
Worker version: `eeddad25-04ab-4cae-a205-71b87f03904f`

## Backup

A fresh remote D1 export was stored in private `juro-staging-backups` under `d1/juro-staging/20260801T204115Z/pre-0055-0056-full.sql`. The retrieved object matched the source SHA-256 `aa1b8e3fab1250160ca2380b3fff251395e55f18bd425d726beab7afcae43c3e` and was 734247 bytes. Temporary local copies were removed after verification.

## Migration result

- Applied remotely: `0055_lowly_shadow_king.sql`, `0056_zippy_winter_soldier.sql`.
- `PRAGMA quick_check`: `ok`.
- `PRAGMA foreign_key_check`: no rows.
- `d1_migrations`: 57 rows.
- `lawyer_review_moderation`: present.
- Present triggers: immutable update, immutable delete, and terminal-status application after moderation insert.
- Existing review and moderation row counts were both zero at the check.

## Deployment result

`npm run deploy:staging` performed its bounded staging build and artifact validation, then deployed only `juro-platform-staging`. The deployment lists staging D1, R2, Queue, Vectorize and analytics bindings, with `APP_ENV=staging`.

## Deliberate limits

Cloudflare Access blocks anonymous testing, and no authenticated staff browser/MFA traversal was performed in this run. No public review, rating aggregation, or production resource was changed.
