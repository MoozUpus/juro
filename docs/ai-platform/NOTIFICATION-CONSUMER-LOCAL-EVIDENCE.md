# Notification consumer local evidence

Date: 2026-08-04

Status: locally verified deployment candidate; not yet deployed to staging.

## Implemented boundary

- The five-minute scheduler selects due in-app task reminders only for active
  workspace members and inserts versioned, idempotent jobs into `job_outbox`.
- Queue bodies contain opaque identifiers only. Task titles and notification copy
  are loaded and produced inside the tenant-authorized consumer.
- The consumer re-checks reminder, task, case, workspace and active membership.
- A workspace substitution returns `NOTIFICATION_SOURCE_NOT_FOUND` and neither
  reveals nor mutates the real tenant row.
- Deterministic notification IDs, versioned subjects, durable `job_runs` and a
  conditional D1 batch make retries and redelivery safe.
- Stale, cancelled, archived, completed and inactive-member states do not deliver.

## Local evidence

- `npm run lint`: passed.
- `npm run type-check`: passed.
- `npm run test:cloudflare`: 102/102 passed.
- `npm test`: passed, including development build and the complete rendered/core
  test set.
- `npm run cf:types:check`: passed.
- `npm run build:staging`: passed.
- `npm run validate:artifact -- --environment staging`: passed.
- `npm run smoke:document-builder`: 34 scenarios passed against a temporary local
  Vite runtime; generated DOCX/PDF/ZIP artifacts were non-empty and port 4180 was
  released afterward. Local AI review remained unavailable because provider secrets
  are intentionally not copied into the local process.
- Staging artifact declares `staging-notifications` with batch 5, five retries,
  30-second retry delay, concurrency 2 and `staging-notifications-dlq`.

## Remaining remote gate

The active staging Worker has not been changed by this checkpoint. Deployment must
use `npm run deploy:staging`, after which the Worker version, queue consumer list,
DLQ policy and one synthetic identifiers-only delivery must be verified before the
consumer is described as working in staging.
