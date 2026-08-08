# Staging 0066 — voice recordings and deployment

Date: 2026-08-04

Environment: staging only (`juro-platform-staging`, D1 `juro-staging`, database ID `bb716a96-b2fb-4823-90d6-6c228fed181a`). Production was not changed.

## Backup and restore evidence

Immediately before migration `0066`, full, schema-only and data-only exports were stored in the private `juro-staging-backups` bucket under:

`d1/juro-staging/20260803-203732/`

The full export was `1,184,295` bytes with SHA-256:

`04ca84e33ee6553b1cd0e233937439cfab872cea64811b4b80f0e62bf9e18683`

The independently downloaded R2 object had the same SHA-256. The schema export was `254,578` bytes (`75b4b166e3e093d02235bcb88bda0c501e079727420ab63c0d884bd5f4fe8ae7`) and the data export was `929,749` bytes (`8653f495fc3b40ad89e81aedf2a3016296e9129705810ed3f5222a5f9f1e4ed5`).

An isolated SQLite restore completed with `quick_check=ok`, zero foreign-key violations, 170 tables, 341 non-system indexes, 126 triggers and 66 pre-existing migration records. Temporary local copies were removed only after the private R2 round trip and restore had passed. Temporary signed D1 export URLs are not retained.

## Migration result

- Wrangler applied only `0066_voice_recordings.sql`; all six commands succeeded.
- The remote migration ledger records it as id `67`, applied at `2026-08-03 20:38:31` UTC.
- The remote schema contains `voice_recordings` and its four declared indexes.
- `PRAGMA foreign_key_check` returned no rows.
- Wrangler reports no pending staging migrations.
- D1 reports 171 tables and 3,964,928 bytes after migration.

## Deployment result

The repository-controlled `npm run deploy:staging` command rebuilt the staging artifact, validated its environment and deployed only `juro-platform-staging`.

- Active Worker version: `d22705e4-446a-47f1-825e-b77f1135504d`.
- Traffic: 100% to that version.
- Worker startup time reported by Wrangler: 173 ms.
- Bound resources include staging D1, all three private staging R2 buckets, four staging Vectorize indexes, Analytics Engine, Images, Workers AI and seven staging queue producers.
- Six processing queues have both producer and consumer. `staging-notifications` still has no consumer and is not release-complete.
- Anonymous requests to AI-lawyer, document-builder, voice API and cinematic prototype routes returned Cloudflare Access `302`; this proves the boundary remains protected, not that authenticated application flows passed.

## Regression evidence

- `npm run type-check`: passed.
- `npm run lint`: passed.
- Platform rendered/core tests: 437 passed, 0 failed.
- Cloudflare tests: 101 passed, 0 failed.
- `npm run cf:types:check`: passed.
- `npm run validate:artifact`: passed.
- `npm run smoke:document-builder`: passed after replacing a five-day-old local Vite process with a fresh workspace server; 34 scenarios completed and DOCX, PDF and ZIP signatures were verified.
- GitHub checks at the pre-deploy commit: platform and website validation passed.

## Unverified release gates

This checkpoint does not claim an authenticated end-to-end voice run. The local browser-control runtime failed before navigation because its generated Node kernel was treated as ESM by a user-level package configuration. No Access bypass or substitute anonymous assertion was used.

The remaining staging checks are microphone permission denial, real upload/finalize/transcription, transcript edit and confirmation, AI send, TTS playback/stop, early delete, scheduled 30-day purge, RU/UZ human review, mobile keyboard, reduced motion and text-only fallback. Uzbek TTS requires human language QA. Realtime voice, lip sync and the 3D avatar remain disabled or absent as documented.
