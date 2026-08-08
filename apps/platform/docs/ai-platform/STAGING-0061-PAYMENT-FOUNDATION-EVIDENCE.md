# Staging evidence — Stage 1 payment foundation

Date: 2026-08-03
Environment: isolated Cloudflare-Access-protected staging only
Worker: `juro-platform-staging`
Worker version: `9051c167-8e1a-46c8-86f8-c7f6c9e75b82`
Git commit deployed: `1a6074b`
D1: `juro-staging` (`bb716a96-b2fb-4823-90d6-6c228fed181a`)

## Scope

This checkpoint activates the additive Stage 1 payment foundation only in
staging: subscription checkout/order records, immutable pricing snapshots,
invoices, idempotent payment events, entitlements, and balanced ledger
postings. It does not activate a real payment provider, marketplace settlement,
Uzum, payouts, refunds, or production billing.

The staging secret inventory contains the name
`PAYMENT_SANDBOX_WEBHOOK_SECRET`; its value was neither read, logged, exported,
nor committed.

## Private D1 recovery checkpoint

Pre-migration Time Travel bookmark:

`000005d8-00000000-000050bc-74cae1e96d76d598e72936f0637e3b7e`

The following artifacts were exported from remote `juro-staging`, written under
the private prefix `juro-staging-backups/d1/juro-staging/20260803T203514Z/`,
downloaded again, and compared by SHA-256:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `pre-0061-full.sql` | 1,039,524 | `6507943f6ab993a099c791ae70483ce49b7300b70d5f01b881564a18d358528c` |
| `pre-0061-schema.sql` | 213,849 | `d7f03d078c389371efec71f7093b4511185eb880e1c04af974321cdc09d32b37` |
| `pre-0061-data.sql` | 825,707 | `ba68a4ca4c9108ae2aa20ea93a41f381453e3fb6018733d89118336fa12e65bb` |

The downloaded schema/data pair was restored into an isolated local SQLite
database. The rehearsal reported 140 tables, 274 indexes, 107 triggers,
61 migration records, `quick_check=ok`, and zero foreign-key violations.
Representative tenant/domain row counts were read without recording content.

After migration and the explicit synthetic fixture, a second full export was
retained at `d1/juro-staging/20260803T203514Z/post-0061-full.sql`; its
1,066,372 bytes matched SHA-256
`f79a8585e6044cdeee2d474f0f76cea66ef898ac86831b9afdf7449df67fdb5c`
after a private R2 round trip. Temporary local SQL/SQLite copies are not
retained as source artifacts.

## Migration and synthetic fixture

An isolated detached checkout of commit `1a6074b` contained `0060` and exactly
one pending migration: `0061_cheerful_christian_walker.sql`. Wrangler 4.92.0
applied only that migration, executing 79 SQL commands.

Postflight against remote staging confirmed:

- ledger contains `0061_cheerful_christian_walker.sql` followed by `0060`;
- 17 Stage-1 billing tables and 14 financial immutability/balance guards exist;
- `PRAGMA quick_check` is `ok` and `PRAGMA foreign_key_check` has no rows.

The separately authorized fixture
`scripts/staging-payment-foundation-seed.sql` then created one idempotent,
synthetic plan: `staging_individual`, `1,000,000` UZS minor units, approved,
with zero tax and zero provider fee. It is explicitly marked test-only and is
not a tax, pricing, commission, fiscal-receipt, or provider-contract position.

## Validation and deployment

All commands ran from the isolated checkout of the deployed commit:

- `npm run type-check` — passed;
- `npm run lint` — passed;
- Stage-1 billing/checkout/migration tests — 19/19 passed;
- `npm test` — 418 core and 95 Cloudflare tests passed;
- `npm run build:staging` and staging artifact validation — passed;
- `npm run deploy:staging` — passed with only staging D1, R2, Queue,
  Vectorize, Analytics, and environment bindings.

Read-only control-plane verification confirms Worker version
`9051c167-8e1a-46c8-86f8-c7f6c9e75b82`, the secret name inventory, the
synthetic plan, and D1 integrity. Anonymous requests to the canonical document
builder, billing, and subscriptions-plan endpoints receive Cloudflare Access
authentication redirects; no unauthenticated account, billing data, or plan
data was exposed.

## Remaining Stage 1 gate and rollback

An Access-authorized owner session must still perform the real protected staging
flow: choose the synthetic plan, create a checkout, expressly confirm it, post
a correctly signed sandbox event, and verify one active subscription,
entitlement, invoice, audit event, and balanced ledger transaction. This is not
claimed by the anonymous smoke.

Routine rollback is application-first: restore the prior staging Worker version
or disable the staging-only payment foundation flag. `0061` is additive; no
destructive reverse migration is planned. Use the pre-migration bookmark and
private checkpoint only for proven D1 corruption. Production D1, Worker,
secrets, routes, and billing remain unchanged and unauthorized.
