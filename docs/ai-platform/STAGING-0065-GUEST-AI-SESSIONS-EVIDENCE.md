# Staging 0065 — guest AI sessions

Date: 2026-08-04

Environment: staging only (`juro-platform-staging`, D1 `juro-staging`, database ID `bb716a96-b2fb-4823-90d6-6c228fed181a`).

## Backup and restore evidence

Before migration, full, schema-only and data-only exports were stored in the private `juro-staging-backups` bucket under:

`d1/juro-staging/20260804-011400/`

The full export was `1,177,898` bytes with SHA-256:

`8cd40bb7565d98ae24482c8a70e96689ab09ab1ad58c62c8dfc7c43cd9229e5d`

Downloading the private R2 object produced the same hash. An isolated in-memory restore completed with `quick_check=ok`, zero foreign-key violations, 169 tables, 478 indexes, 126 triggers and 65 pre-existing migration records. Temporary signed export URLs are not retained.

## Applied and verified

- Only the explicitly authorized `0065_guest_ai_sessions.sql` migration was exposed to the Wrangler migration command.
- Wrangler reported all nine statements applied successfully.
- The remote `d1_migrations` ledger contains `0065_guest_ai_sessions.sql` and does not contain `0066_voice_recordings.sql`.
- Remote `PRAGMA foreign_key_check` returned no rows.
- Wrangler reports only `0066_voice_recordings.sql` as pending.

## Deployment state

No Worker deployment was performed at this checkpoint. Commit `d3f957c` contains the voice-message routes and requires additive migration `0066`; deploying it before `0066` would knowingly expose an incomplete feature. The existing authorization named only `0065`, so staging deployment remains paused until the owner explicitly includes `0066`.

The unchanged active staging deployment remains Worker version `6c94e0ab-680e-446c-85c1-ebe22fbb2b3b` at 100% traffic. Anonymous requests to both `/ru/individual/ai-lawyer/new` and the protected regression route `/ru/individual/document-builder` returned Cloudflare Access `302` responses; this proves the routes remain access-protected, not that their authenticated flows have passed.
