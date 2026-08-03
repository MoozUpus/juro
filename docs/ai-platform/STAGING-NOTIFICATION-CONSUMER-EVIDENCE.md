# Staging notification consumer evidence

Date: 2026-08-04

Status: locally and remotely verified in staging. Production was not changed.

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
- GitHub `validate (apps/platform)` and `validate (apps/website)` passed for commit
  `50fa3dc`.

## Remote evidence

- Worker: `juro-platform-staging`.
- Active version: `eef56269-2980-42b8-bc76-9a348f6d187b` at 100%.
- Queue: `staging-notifications`, ID `d438df684a584891ac46a706bd8dc708`.
- Consumer: `cdde599b2b904a6b8d9cfb7bb6e17706`.
- Consumer settings: batch 5, wait 5 seconds, retries 5, concurrency 2, retry delay
  30 seconds, DLQ `staging-notifications-dlq`.
- DLQ ID: `7ccbd9d4b02c41309af92a6692624a4d`.
- A synthetic identifiers-only message was accepted by the queue API, consumed by
  the staging Worker and persisted as `rejected` with
  `NOTIFICATION_SOURCE_NOT_FOUND`, proving that the handler—not merely the binding—
  ran. This terminal rejection was acknowledged and did not enter the DLQ.
- The synthetic `job_runs` row and workspace were deleted after verification;
  remote D1 returned `job_count=0` and `workspace_count=0`.

## Scope

This checkpoint does not claim that browser notification rendering, email delivery
or every end-user reminder flow has passed authenticated staging E2E. It proves the
server-side task-reminder queue boundary, tenant fencing, idempotency contract,
remote consumer attachment and safe message delivery. Production consumers remain
unchanged and require the separate production authorization defined by the project.
