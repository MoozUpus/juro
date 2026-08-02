# Staging 0083 — honest checkout availability state

Date: 2026-08-02

- Payment-provider credentials and an implemented checkout are represented as
  different server states. A configured secret no longer makes the billing UI
  claim that purchase is available.
- `checkoutAvailable` is currently false because no approved checkout adapter and
  webhook contract exist. Plan-selection controls are disabled and labelled
  `Скоро` / `Tez kunda`; the UI does not send a request that can only return 501.
- No payment, subscription, entitlement, D1 migration, or secret was created or
  modified by this slice. Provider selection remains an owner decision.

Verification:

- `npm run type-check` — passed.
- `npm run lint` — passed.
- `npm test` — passed; Cloudflare suite 91/91.
- `npm run build:staging` — passed.
- `npm run validate:artifact -- --environment staging` — passed.
- `git diff --check` — passed.

Protected staging Worker `juro-platform-staging` uploaded version
`001a5bdb-2093-46d8-83e5-29fc5f0fd202`; deployment
`10dcabe0-4ea8-450c-995e-a8b6ef28b8e0` assigns that version 100% of staging
traffic. Cloudflare Access prevents an anonymous browser claim. Production is
unchanged.
