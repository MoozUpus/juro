# Staging 0068 — tenant-scoped calendar

Date: 2026-08-02

## Deployed change

The calendar at canonical `/:locale/:accountType/calendar` and
`/:locale/business/:workspaceId/calendar` projects active due action-plan steps
and their confirmed tasks. It does not introduce a second deadline table or a
D1 migration. The legacy business route redirects through the existing active
workspace resolver.

## Deployment evidence

- Environment: `staging`
- URL: `https://staging.app.juro.uz/ru/individual/calendar`
- Worker: `juro-platform-staging`
- Worker version: `25a0440c-b9bb-4238-aa92-2a8f230df453`
- D1 binding: existing `juro-staging` (schema unchanged)
- Deployment command: `npm run deploy:staging`

Wrangler confirmed the staging Worker was deployed with the existing staging
D1, private R2 buckets, queues, Vectorize indexes and staging-only variables.
No production Worker, production D1, or production route was targeted.

## Verification

- `npm --prefix apps/platform run type-check` — passed
- `npm --prefix apps/platform run lint` — passed
- `npm --prefix apps/platform test` — passed, including calendar date-window
  and tenant-scope regression contracts
- `npm --prefix apps/platform run build:staging` — passed
- `npm --prefix apps/platform run validate:artifact -- --environment staging` — passed
- `npx wrangler deployments list --env staging` — confirms 100% traffic on the
  version above
- Unauthenticated HTTP smoke request to the staging calendar returned `302` to
  the configured Cloudflare Access login, confirming the protected route is
  deployed without bypassing Access.

## Remaining verification limit

The current environment has no authenticated Cloudflare Access browser session;
full interactive calendar UI and cross-workspace browser QA are still release
gates. Server-side workspace predicates, bounded API range validation, build,
artifact validation and deployment are evidenced above.
