# Staging 0082 — server-enforced AI answer-cycle entitlements

Date: 2026-08-02

- The AI-chat route now resolves `workspaceEntitlements` after authenticated
  workspace resolution and before reserving an `ai_usage_ledger` cycle.
- The free workspace limit remains 20 cycles per UTC month. Active verified paid
  plans receive the server policy limit for their plan (`individual` 120,
  `business` 300, `legal_team` 600); no value is accepted from the browser.
- The private AI usage response uses that same resolved entitlement, so the UI
  cannot display a different limit than the reservation boundary.
- No D1 migration, R2 operation, secret mutation, or production change occurred.

Verification completed before deployment:

- `npm run type-check` — passed.
- `npm run lint` — passed.
- `npm test` — passed; Cloudflare suite 91/91.
- `npm run build:staging` — passed.
- `npm run validate:artifact -- --environment staging` — passed.
- `git diff --check` — passed.

Protected staging Worker `juro-platform-staging` uploaded version
`5da01e38-7846-4885-8cbc-c3b1e2916b1a`; Cloudflare deployment
`caade13e-6477-4319-9acd-4fb3421a57b9` assigns that version 100% of staging
traffic. The staging application remains Cloudflare Access-protected; anonymous
or authenticated browser traversal and a paid subscription test fixture are not
claimed by this evidence. Production is unchanged.
