# Staging 0063 Marketplace Payment Evidence

Date: 2026-08-03  
Environment: `staging` only  
Worker: `juro-platform-staging`  
D1: `juro-staging` (`bb716a96-b2fb-4823-90d6-6c228fed181a`)

## Scope

This record covers the additive marketplace legal-service payment foundation.
Production D1, production Worker, and production payment configuration were not
changed. Production payment approval remains disabled.

## Migration and seed

- Applied in order: `0062_nervous_shinko_yamashiro.sql`, then
  `0063_marketplace_service_payments.sql`.
- Post-apply migration listing reported no pending migrations.
- `PRAGMA foreign_key_check` returned no rows.
- The staging-only seed created one approved
  `marketplace_service_standard` pricing policy and one approved version.
- At verification time the staging database had no lawyer profiles, so the seed
  intentionally created no lawyer tax profiles, legal-service orders,
  settlement allocations, or payables.

## Backup and recovery evidence

Pre-migration full export was stored in the private `juro-staging-backups`
bucket under `d1/juro-staging/20260803T221821Z/pre-0062-0063-full.sql`.

- SHA-256: `73e6764a7b08b5f12024464c885d9d1acc39a3caef94294209f26b0da69018f2`
- Local restore verification: `quick_check = ok`; no foreign-key violations.

Post-migration full export was stored in the same private bucket under
`d1/juro-staging/20260803T225011Z/post-0062-0063-full.sql`.

- SHA-256: `06d659c0d8aec9ae491f471916b00181f3550f45890946e8cbfded25f47ff5bc`
- The object was downloaded from the private bucket and matched the recorded
  SHA-256 and byte length (`1,105,307`).

No signed export URL is retained in this document.

## Artifact and deployment evidence

The clean committed artifact passed:

```text
npm run type-check
npm run lint
npm run test:cloudflare     # 98/98
npm run build:staging
npm run validate:artifact -- --environment staging
```

The initial marketplace artifact was deployed as Worker version
`bcd03042-5628-4ebd-a742-7623890ba38b`. A follow-up ledger correctness fix was
deployed as `6cd53a3e-2794-4108-83fd-8a443d59b8cb`; the Cloudflare deployment
listing recorded the Git-uploaded version
`9fa6926a-5c67-4e61-a311-b7782818b0c5` at 100% traffic. The marketplace UI
integration was deployed as Worker version
`5f2e688d-2637-4bf9-b6bc-2f8f22e0d7c0`. The business-workspace isolation
hardening was then uploaded as `cbf16608-9611-43c3-812a-2019a0a0d8f5`.
Cloudflare subsequently recorded `9fc20ed9-207c-4281-b285-2a7aec9e0275` as
the 100%-traffic secret-change deployment based on that current Worker.

`https://staging.app.juro.uz/` returned Cloudflare Access's expected `302`
response to an unauthenticated smoke request.

## Marketplace lifecycle validation

`tests/marketplace-service-lifecycle.test.ts` uses the full migration journal
with an in-memory D1-compatible fixture. It proves one client-owned accepted
proposal can create a priced legal-service order, one payment attempt, and,
after a verified sandbox funding event, exactly one payment, posted balanced
ledger transaction, settlement allocation, and pending lawyer payable. Replayed
webhooks do not duplicate those records.

The test initially exposed a real unbalanced ledger condition: lawyer VAT was
both included in `LAWYER_PAYABLE` and posted as JURO's VAT liability. The fix
credits only JURO's VAT component to `VAT_PAYABLE`; the independent lawyer's
VAT remains part of the payable owed to that lawyer. The full platform test
suite and the lifecycle test passed after the fix.

The same lifecycle test now also proves confirm-checkout replay: sending the
same client idempotency key twice returns the original payment attempt and
does not create a second attempt. The proposal-acceptance endpoint likewise
returns a safe replay only for the same accepted agreement version; it rejects
a mismatched later version and never mutates the immutable acceptance row.

## Authenticated UI coverage in the deployed artifact

The deployment now exposes the same protected flow to both personal and
business workspaces:

- a lawyer with an active case access grant can submit RU/UZ service scope,
  duration, and UZS price through the proposal endpoint;
- the case owner can load only their tenant-scoped proposals, explicitly accept
  the agreement, and create a checkout;
- the checkout hand-off works for both
  `/:locale/:accountType/cases/:caseId/proposals/:proposalId/checkout` and
  `/:locale/business/:workspaceId/cases/:caseId/proposals/:proposalId/checkout`;
- every write uses the existing CSRF and server-side session/workspace checks.

For a business route, the browser forwards its workspace ID only as route
context. The proposal list, agreement acceptance, and checkout endpoints each
resolve that ID with `workspaceForUserById`, require membership again on the
server, and still constrain the case/proposal query by both workspace and
client owner. A mismatched or inaccessible workspace receives the neutral
`WORKSPACE_UNAVAILABLE` / unavailable-object response and does not grant
cross-tenant access.

The UI contract is covered by `migration-0063-marketplace-service.test.ts` and
the full platform suite was rerun after its addition.

## Remaining staging gate

Authenticated UI E2E remains pending because staging currently has neither a
synthetic lawyer profile nor an approved test client/lawyer pair. It must cover:

1. lawyer access grant and service proposal;
2. client acceptance and checkout;
3. signed sandbox payment confirmation;
4. active order, proposal `FUNDED`, immutable ledger, allocation and payable;
5. replay and cross-tenant denial checks.

This limitation is intentionally recorded rather than represented as a passed
browser test.
