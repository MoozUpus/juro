# Staging 0061 payment authenticated E2E evidence

Date: 2026-08-03
Environment: `staging` only
Worker: `juro-platform-staging`
Worker version: `9051c167-8e1a-46c8-86f8-c7f6c9e75b82`

## Owner-observed flow

The owner completed the synthetic staging checkout and reached the Russian payment
confirmation screen. It displayed a payment of `10 000 сум`, the paid state, and
the message that activation occurs only after a verified server event.

## Server-side verification

A read-only query against staging D1 verified the resulting records for that
synthetic invoice:

| Check | Result |
| --- | --- |
| Invoice | `paid` |
| Marketplace order | `ACTIVE` |
| Subscription | `active` |
| Subscription entitlements | exactly 1 |
| Payment attempts | exactly 1 |
| Processed provider events | exactly 1 |
| Posted ledger transactions | exactly 1 |
| Ledger entries | exactly 2 (one debit, one credit) |
| Posted debit total | `1,000,000` minor UZS |
| Posted credit total | `1,000,000` minor UZS |

The two totals agree, and the read-only check made no database changes. The
amount corresponds to `10 000 сум` under the seeded UZS currency exponent.

## Scope and limitations

This proves the internal sandbox payment foundation in staging: server-event
verification, idempotent finalization, subscription activation, entitlement
creation, invoice state, and double-entry ledger posting. It does not prove a
live third-party acquiring transaction and does not authorize or change
production.
