# Staging 0069 — case workspace

Date: 2026-08-02

## Deployed change

Canonical personal and business `cases/:caseId` routes now open a real case
workspace instead of rendering the workspace-wide plan client. The surface
loads the single server-scoped case, its confirmed tasks, active plan summary,
and links to the existing plan and calendar routes. It does not fabricate tabs
for domains that are not wired to a case yet.

## Deployment evidence

- Environment: `staging`
- Worker: `juro-platform-staging`
- Worker version: `830bb3d7-19d5-4454-b34c-70623ae8462b`
- D1 binding: existing `juro-staging` (schema unchanged)
- Deployment command: `npm run deploy:staging`

## Verification

- `npm --prefix apps/platform run type-check` — passed
- `npm --prefix apps/platform run lint` — passed
- `npm --prefix apps/platform test` — passed; case-detail contract covers both
  canonical routes, the selected-case query, and task API
- `npm --prefix apps/platform run build:staging` — passed
- `npm --prefix apps/platform run validate:artifact -- --environment staging` — passed

Authenticated browser/Access QA remains a release gate; no bypass was used.
Production remains unchanged.
