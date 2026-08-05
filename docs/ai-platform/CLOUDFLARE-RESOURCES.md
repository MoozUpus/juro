# Cloudflare resource inventory

Current read-only verification: 2026-08-05. Staging resources below were queried directly through Wrangler; production was not mutated or re-inventoried during this checkpoint.

## Staging

- Worker: `juro-platform-staging`; deployed version `3625c4b0-5bd9-4220-94b0-81ee3480acec` was published from exact commit `81de7bb`.
- D1: `juro-staging`, ID `bb716a96-b2fb-4823-90d6-6c228fed181a`, through additive migration `0091`; postflight contains 207 tables, 447 non-system indexes and 257 triggers with `quick_check=ok` and zero foreign-key violations.
- Private R2: `juro-staging-files`, `juro-staging-backups` and `juro-staging-quarantine`. The 2026-08-05 D1 checkpoint was round-trip verified under private prefix `d1/juro-staging/20260805-115908-0091/`; mutable object counts are not treated as application invariants.
- Vectorize: `staging-lex-uz`, `staging-advice-uz`, `staging-internal-legal-materials`, and `staging-user-documents`; each exists with 1,536 dimensions and cosine distance.
- Analytics Engine dataset: `juro-platform-staging` is present in the validated Worker binding artifact.

Queue and DLQ resources exist for document analysis, OCR, document export, email notifications, legal-source sync, data-retention cleanup and notifications. All seven processing queues have a staging producer and consumer. The `staging-notifications` consumer is `cdde599b2b904a6b8d9cfb7bb6e17706`; Cloudflare reports batch size 5, five retries, 5-second batch wait, concurrency 2, a 30-second retry delay and `staging-notifications-dlq`.

An identifiers-only synthetic message reached `notification.dispatch` and was
durably rejected with the expected neutral `NOTIFICATION_SOURCE_NOT_FOUND` code for
a missing reminder. The temporary synthetic workspace and `job_runs` row were then
deleted and remote D1 returned zero remaining probe rows. This proves delivery and
handler attachment without creating a user notification or using user content.

The validated staging artifact binds exactly:

- `staging-document-analysis`
- `staging-ocr-processing`
- `staging-document-export`
- `staging-email-notifications`
- `staging-legal-sources-sync`
- `staging-data-retention-cleanup`
- `staging-notifications`

The objective also names malware scanning as conditional. No malware queue is attached because no real privacy-approved scanner is available; upload paths that require scanning must remain fail-closed rather than simulate success.

## Environment safety

The generated staging artifact has `APP_ENV=staging` and the repository validator confirms its D1/R2/Queue/Vectorize bindings and packaged migrations. Deployment must use `npm run deploy:staging`; direct deployment from a stale `dist` directory is prohibited. Anonymous staging routes are protected by Cloudflare Access. Production deployment and production UI replacement remain separate owner approvals.

The full backup, restore, migration, CI, deployment and boundary evidence for the current checkpoint is in `STAGING-0091-VERIFIED-CORPUS-FRESHNESS-EVIDENCE.md`. Authenticated operator behavior is still a distinct gate.
