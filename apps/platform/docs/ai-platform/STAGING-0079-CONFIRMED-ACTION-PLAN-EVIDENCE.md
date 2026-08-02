# Staging 0079 — confirmed action-plan changes

Date: 2026-08-02

## Delivered slice

- `PATCH /api/platform/cases/:caseId/plan` accepts a bounded, Zod-validated list of step changes only after an authenticated, CSRF-protected request.
- The handler resolves the active workspace on the server, verifies every step belongs to the case plan, and uses the current plan revision as an optimistic concurrency guard.
- A successful batch updates all requested steps, any already-created linked tasks/reminders, case deadline metadata, one immutable `action_plan_versions` snapshot, and one case audit event.
- The action-plan screen now stages date/status changes locally, renders a RU/UZ diff, and requires the user to explicitly select **Confirm and apply** before persisting one new plan version.
- A conflict returns `VERSION_CONFLICT`; the client discards only the unpersisted draft and reloads server state. No plan mutation occurs before the confirmation request.

## Safety boundaries

- Existing D1 tables and the immutable `action_plan_versions` trigger are reused; this release has no migration.
- The existing per-step route is retained for compatible callers. The application UI uses the confirmed batch route.
- No legal deadline is calculated or represented as a verified legal conclusion by this slice. Dates remain user-controlled calendar dates pending legal-source review.
- Production was not deployed or changed.

## Verification executed locally

```text
npm run type-check                         PASS
npm run lint                               PASS
npm test                                   PASS
npm run build:staging                      PASS
npm run validate:artifact -- --environment staging   PASS
git diff --check                           PASS
```

The route is included in the staging Worker build. A protected authenticated browser interaction remains pending Cloudflare Access access; an anonymous request cannot validate a private user flow and is not treated as evidence of the flow.

## Staging deployment

- Worker: `juro-platform-staging`
- Worker version: `3d9f261b-fa7e-4408-a12f-3d167656918a`
- Deployment command: `npm run deploy:staging` — PASS
- Bound storage shown by Wrangler: staging D1 `juro-staging`, private R2 `juro-staging-files`, backup R2 `juro-staging-backups`, quarantine R2 `juro-staging-quarantine`; no production binding was deployed.
