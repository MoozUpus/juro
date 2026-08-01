# Staging evidence — lawyer review rating guard

Date: 2026-08-02
Environment: staging only
Worker: `juro-platform-staging`
Worker version: `1dd5a064-e6d5-48cc-b63a-dd0f41c30992`

## Backup and migration

A fresh private remote export was saved in `juro-staging-backups` at `d1/juro-staging/20260801T210352Z/pre-0057-full.sql`. Remote download matched source SHA-256 `0b331b4a542d22e19bcb0150f08b15ff68f65b547453b8fdd53de4f252e1e087`; temporary files were removed after verification.

Only `0057_calm_rating_guard.sql` was applied to `juro-staging`. Postflight confirms `quick_check=ok`, no foreign-key errors, 58 migrations, and both `lawyer_reviews_rating_range_insert` and `lawyer_reviews_rating_range_update` triggers.

## Worker deployment

`npm run deploy:staging` rebuilt and validated the staging artifact, then deployed only `juro-platform-staging`. The deployment keeps the existing isolated staging bindings and does not modify production.

## Limit

Cloudflare Access blocks anonymous traversal. No authenticated browser/MFA review-submission or moderation run is claimed.
