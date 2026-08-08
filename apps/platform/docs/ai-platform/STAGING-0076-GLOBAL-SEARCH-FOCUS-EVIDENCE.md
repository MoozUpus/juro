# Staging 0076 — global-search focus restoration

Date: 2026-08-02

## Deployed change

The authenticated global-search dialog restores focus to its trigger after
closing with Escape, the backdrop, the close control, or a selected result.
The dialog retains its existing modal focus trap and input autofocus. Opening a
verified external source through keyboard selection also closes the dialog.

## Deployment evidence

- Environment: `staging`
- Worker: `juro-platform-staging`
- Worker version: `0c20fc24-9792-4808-b6c3-ffce7782b2e7`
- Surface: application-shell global search

## Verification

- Type-check — passed
- Lint — passed
- Full platform suite — passed: 386 tests
- Cloudflare/migration/job suite — passed: 91 tests
- Staging build and artifact validation — passed
- Static contract covers trigger ref, open-state transition, and focus restore
- No migration, provider call, production change, or content seed

Authenticated interactive browser validation remains an Access-protected
staging gate.
