# Cloudflare resource inventory

Current read-only verification: 2026-08-04. Staging resources below were queried directly through Wrangler; production was not mutated or re-inventoried during this checkpoint.

## Staging

- Worker: `juro-platform-staging`; active deployment version `eef56269-2980-42b8-bc76-9a348f6d187b` receives 100% of staging traffic.
- D1: `juro-staging`, ID `bb716a96-b2fb-4823-90d6-6c228fed181a`, EEUR, 171 tables and 3,964,928 bytes after additive migration `0066`.
- Private R2: `juro-staging-files` (18 objects at verification), `juro-staging-backups` (77 objects), `juro-staging-quarantine` (0 objects). Object counts are operational observations, not application invariants.
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
