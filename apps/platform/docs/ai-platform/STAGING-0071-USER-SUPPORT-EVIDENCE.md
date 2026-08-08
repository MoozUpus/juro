# Staging 0071 — user support workflow

Date: 2026-08-02

## Deployed change

The existing Help workspace now submits a user-selected support category and
severity through the already strict, tenant-scoped support-ticket API. The
initial ticket history loads from the authenticated API, each ticket opens its
persisted message thread, and RU/UZ labels map category, severity, and status
values instead of exposing storage enums. The client announces loading/detail
changes politely and retains visible keyboard focus and 44px controls.

No ticket, message, audit, authorization, or D1 schema contract changed. The
server still binds tickets to the active workspace and requester; writes require
the existing same-origin CSRF header.

## Deployment evidence

- Environment: `staging`
- Worker: `juro-platform-staging`
- Worker version: `5ba650e9-efd1-491a-aa7d-c4fedfd23538`
- Route: `https://staging.app.juro.uz/ru/individual/help`
- D1 binding: existing `juro-staging` (schema unchanged)

## Verification

- `npm --prefix apps/platform run type-check` — passed
- `npm --prefix apps/platform run lint` — passed after correcting the initial
  effect to defer the client state transition
- `npm --prefix apps/platform test` — passed, including static support-form
  category, severity, localization, initial-history, and accessible-status checks
- `npm --prefix apps/platform run build:staging` — passed
- `npm --prefix apps/platform run validate:artifact -- --environment staging` — passed
- `npx wrangler deployments list --env staging` — 100% traffic on the version above
- unauthenticated `HEAD` — `302` to Cloudflare Access with `no-store`

Browser interaction remains an explicit protected-environment gate; no Access
policy was bypassed. Production remains unchanged.
