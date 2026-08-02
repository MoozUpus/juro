# Staging 0066 — in-app task-reminder delivery

Date: 2026-08-02

## Scope

The existing five-minute Worker schedule now delivers due, active `in_app` task
reminders to the existing authenticated notification inbox. This is a code-only
change: it creates no Cloudflare resource and applies no D1 migration.

## Deployment evidence

- Environment: `staging`
- Worker: `juro-platform-staging`
- Worker version: `0375c5ad-860b-4116-a03c-05d7b1c6cf03`
- D1 binding: `juro-staging`
- Schedule: `*/5 * * * *`
- Deploy command: `npm run deploy:staging`
- Result: successful build, artifact validation, Worker upload, trigger deploy,
  and staging-only binding inventory.

## Behaviour verified locally

`dispatchDueTaskReminders` is contract-tested with a synthetic Uzbek task:

1. a due pending reminder creates exactly one `deadline_reminder` notification;
2. the reminder becomes `sent` with its timestamp;
3. retrying the dispatcher produces no second notification;
4. the selection and final update reject completed, cancelled, or archived work;
5. scheduler logs expose counts only and never task title or notification text.

The complete locally executed gate passed:

- `npm run type-check`
- `npm run lint`
- `npm test` — 379 platform tests and 91 Cloudflare/Worker tests
- `npm run build:staging`
- `npm run validate:artifact -- --environment staging`

## Rollback

No schema rollback is required. Roll back the staging Worker to version
`0375c5ad-860b-4116-a03c-05d7b1c6cf03`'s immediate predecessor through the
Cloudflare deployment history if a runtime issue is detected. Existing pending
reminders are durable and will remain pending until a compatible scheduler runs.

## Deliberate limits

This evidence does not claim an authenticated browser click-through because
Cloudflare Access remains enabled and the browser-control runtime is unavailable
in this environment. It also does not claim email delivery: task reminders use
the in-app inbox only until an explicit provider-backed email dispatch contract
is implemented and tested.
