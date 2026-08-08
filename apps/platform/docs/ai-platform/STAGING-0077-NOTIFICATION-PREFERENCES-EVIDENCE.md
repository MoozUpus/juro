# Staging 0077 — optional email notification preferences

Date: 2026-08-02

## Delivered slice

The authenticated Settings page now includes a RU/UZ control for five optional
email categories: marketing, weekly case summaries, unfinished documents,
comments, and lawyer-request updates. The panel explicitly states that login
codes, security notices, lawyer-access notices, analysis notices, and critical
deadline notices are not controlled here.

`GET` and `PUT /api/platform/notification-preferences` are server-authenticated.
Writes require the existing CSRF guard, validate an exact bounded Zod shape,
append consent evidence, revoke only the user's prior active optional consent,
and write a workspace audit event. No email contents, email address, provider
secret, or notification payload is exposed by this endpoint.

## Deployment evidence

- Environment: protected `staging`
- Worker: `juro-platform-staging`
- Worker version: `be2c958f-9581-44a8-89a3-6f6525f7798b`
- Owner route: `https://staging.app.juro.uz/ru/individual/settings`
- D1 migration: none; this slice reuses the existing append-only `consents`
  table and `workspace_audit_events`.
- Production Worker, production D1/R2, Sites deployment, and `apps/website`:
  unchanged.

## Verification

- `npm run type-check` — passed
- `npm run lint` — passed
- `npm test` — passed (full platform and Cloudflare suites; 91 Cloudflare tests)
- `npm run build` — passed
- `npm run build:staging` and `npm run validate:artifact -- --environment staging`
  — passed
- diff check and changed-file secret-pattern check — passed
- `npm run deploy:staging` — passed; deployment lists only staging D1, R2,
  Queues, Vectorize, Analytics Engine and assets bindings
- The final deployed revision orders equal-time consent rows by `rowid DESC`,
  so a revoke-and-regrant in the same timestamp is read deterministically.
- Anonymous `HEAD` of the owner route — `302` to Cloudflare Access with
  `Cache-Control: no-store`; no Access boundary was bypassed.

## Remaining verification boundary

The authenticated browser runtime available to this task is not connected to
the owner-only Access session. Therefore this record does not claim that a
human user clicked Save in staging or that a future optional email job consumes
these preferences. The preference read/write API, persisted consent boundary,
CSRF guard, audit boundary, UI localization, and static regression contracts
are verified; delivery consumers must consult these persisted preferences when
each optional sender is enabled.
