# Staging entitlement repair evidence

Date: 2026-08-06
Environment: `juro-staging` / `staging.app.juro.uz`
Scope: synthetic staging subscription data only

## Incident and cause

A completed staging sandbox payment correctly persisted its order, payment and
ledger records, but a later consultation-route reload treated the same account
as Free. The cause was a test-fixture mismatch:

- the synthetic plan and active subscription used `staging_individual`;
- `lib/billing/entitlements.ts` deliberately accepts the canonical paid plan
  codes `individual`, `business` and `legal_team`;
- an unknown plan code resolves to Free as a safe default.

This was a fixture-integration defect, not an authorization bypass and not a
production billing failure.

## Recovery and verification

1. Before modifying staging data, a full D1 export was uploaded to the private
   `juro-staging-backups` bucket at
   `d1/juro-staging/20260806T165059Z/pre-entitlement-plan-code-repair-full.sql`.
2. The export checksum is
   `d52e195b000cd4d292f8faf1063cf3765bb37ec624c1f0d0a2756f6dfbe0e2e7`.
   A downloaded round-trip and isolated SQLite restore completed with
   `quick_check=ok` and zero foreign-key violations.
3. The staging-only seed was corrected to insert `individual`. A targeted test
   asserts that exact canonical code.
4. The one active synthetic subscription and its matching synthetic plan were
   updated to `individual`. A direct D1 transaction wrapper was not used:
   Cloudflare D1 CLI rejects `BEGIN IMMEDIATE`; the two deterministic updates
   completed separately and the post-change foreign-key check was empty.
5. Post-change data read: one active `individual` subscription and one
   `individual` plan.
6. Authenticated browser regression:
   - route: `/ru/individual/consultations`;
   - no Free-plan restriction displayed;
   - request textarea enabled;
   - no specialists/slots were invented;
   - browser console errors and warnings: none.

## Guardrails preserved

- The fixture is explicitly staging-only and must never run against production.
- No payment-provider call, card input, external charge or production record was
  created.
- No production database, Worker or Sites deployment was changed.
- No synthetic lawyer, availability or reviewer approval was created to make a
  test appear complete.

## Regression

`tests/migration-0061-billing-foundation.test.ts` and
`tests/checkout-service.test.ts`: **15 passed, 0 failed**.
