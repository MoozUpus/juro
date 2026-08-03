# Cloudflare resource inventory

Current read-only verification: 2026-08-04. Staging resources below were queried directly through Wrangler; production was not mutated or re-inventoried during this checkpoint.

## Staging

- Worker: `juro-platform-staging`; active deployment version before the next release is `6c94e0ab-680e-446c-85c1-ebe22fbb2b3b` at 100% traffic.
- D1: `juro-staging`, ID `bb716a96-b2fb-4823-90d6-6c228fed181a`, EEUR, 170 tables after migration `0065`.
- Private R2: `juro-staging-files` (18 objects at verification), `juro-staging-backups` (74 objects), `juro-staging-quarantine` (0 objects). Object counts are operational observations, not application invariants.
- Vectorize: `staging-lex-uz`, `staging-advice-uz`, `staging-internal-legal-materials`, and `staging-user-documents`; each exists with 1,536 dimensions and cosine distance.
- Analytics Engine dataset: `juro-platform-staging` is present in the validated Worker binding artifact.

Queue and DLQ resources exist for document analysis, OCR, document export, email notifications, legal-source sync, data-retention cleanup and notifications. The six processing queues have a staging producer and consumer. `staging-notifications` currently has a producer but no consumer; the application contract deliberately rejects its unimplemented handler, so notification queue processing is not release-complete and must not be represented as working.

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
