# Staging 0064 — action-plan task confirmation idempotency

Date: 2026-08-02  
Environment: protected staging only (`juro-platform-staging`)  
Worker version: `f0c0fca7-bcfa-4cff-a50b-eb5d66be9fd7`

## Change

`POST /api/platform/cases/:caseId/tasks` now creates the append-only
`tasks_created` event with the deterministic primary key
`action-plan-tasks:<case>:<plan>:<revision>`. Repeating a confirmation for the
same action-plan revision is safe: task rows and reminders already use
`INSERT OR IGNORE`, and the case audit event now does as well.

No migration was required. The change does not alter task data, plan revisions,
authorization, Cloudflare resources, or production.

## Evidence

- `npm run type-check` — passed.
- `npm run lint` — passed.
- `npm test` — passed: 378 platform tests and 90 Cloudflare tests.
- `npm run validate:artifact -- --environment staging` — passed.
- `npm run deploy:staging` — passed; staging-only Worker version above.

The staging environment remains protected by Cloudflare Access. An authenticated
browser test must use an owner-authorized staging account; no Access control was
bypassed and no user data was used for this deployment.

## Rollback

Re-deploy the prior protected staging Worker version
`436fdea3-a5d9-41cd-9beb-24b43630bf57`. The change has no schema migration and
requires no D1 or R2 rollback.
