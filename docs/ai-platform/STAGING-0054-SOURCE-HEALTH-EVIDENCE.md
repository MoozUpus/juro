# Staging 0054 — protected legal-source health

Date: 2026-08-01
Environment: staging only (`juro-platform-staging`)

## Delivered

- `GET /api/platform/legal-sources/health` is a private, no-store staff endpoint.
- It requires the existing legal-source-review permission, an active session, and fresh MFA (15 minutes).
- It also requires same-origin browser context and `x-juro-csrf: 1`.
- It returns only safe operational metadata: legal corpus freshness, latest run status/time/error count, pending manual-review count, and pending fetch count. It returns no source text, URLs, legal conclusions, or user content.
- The existing protected review route displays that health state in RU and UZ with an accessible refresh action, loading state, and non-destructive error state.

## Staging deployment

- Worker: `juro-platform-staging`.
- Deployment: `c98eaa6c-e0cb-4f18-b36b-176f901c35b0`.
- Active version: `0c1216fc-7bae-4817-8d9a-452080cea9f6` at 100%.
- `wrangler versions view` verified fetch, queue, and scheduled handlers; staging-only D1/R2/Queue/Vectorize bindings remain intact.
- The worker intentionally has `workers_dev: false` and no public routes, so an anonymous HTTP smoke URL does not exist. Authenticated UI verification remains bound to the protected staging application.

## Evidence before deploy

- `npx tsx --test tests/legal-source-health.test.ts`: passed (1/1).
- `npm run type-check`: passed.
- `npm run lint`: passed.
- `npm run build:staging`: passed.
- `node scripts/platform-tasks.mjs artifact --environment staging`: passed.

## Bounds

This is a staff-only operational read-model. It does not send alert emails, mutate corpus data, bypass review, or make a legal source verified. Alert delivery remains pending until a configured, tested operational notification policy is available.