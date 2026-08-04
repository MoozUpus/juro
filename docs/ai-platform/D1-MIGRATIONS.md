# D1 migration checkpoint

## 0082 — provider cost circuit breaker

Status: additive local candidate; staging remains through `0068`; production is
unchanged.

`0082_provider_cost_circuit_breaker.sql` adds versioned cost-guard policies,
one provider circuit state per environment/provider, immutable transition
events and operational-alert delivery evidence. It does not alter or drop an
existing table and stores no prompt, answer, document text, email recipient or
provider secret. SQLite lifecycle tests cover automatic daily-cost and
failure-spike opening, duplicate evaluation, manual close, immutability and
foreign-key integrity.

Before staging application: export `juro-staging` into the private
`juro-staging-backups` bucket, verify a full-object SHA-256 round trip and restore
the export into an isolated D1 database. Apply pending migrations in ledger
order only after that restore passes `quick_check` and `foreign_key_check`.
Postflight must verify migration ledger, new tables/indexes, empty FK violations,
Worker artifact identity and protected HTTP boundaries.

Rollback is application-first: disable automatic policies or roll back the
Worker to the previous version. Because `0082` is expand-only, its unused tables
may remain during incident recovery. Do not drop them in the same release; any
contract migration requires a new backup and separate review.

## 0066 — voice recordings

Status: additive migration applied and schema-verified in staging on 2026-08-04; not applied to production.

`0066_voice_recordings.sql` adds one tenant-scoped table with five foreign keys, bounded audio metadata, idempotency evidence, non-PII R2 keys, encrypted transcript fields and a 30-day retention index. It adds no destructive statement and does not modify existing document-builder data.

Staging evidence:

1. A fresh pre-0066 export was stored under private prefix `d1/juro-staging/20260803-203732/`; the full-object round-trip SHA-256 is `04ca84e33ee6553b1cd0e233937439cfab872cea64811b4b80f0e62bf9e18683`.
2. The isolated restore passed `quick_check`, foreign-key verification and schema counts.
3. Wrangler applied `0066` as remote ledger id 67 and now reports no pending staging migrations.
4. The remote table and four indexes exist, and `PRAGMA foreign_key_check` is empty.
5. Worker version `d22705e4-446a-47f1-825e-b77f1135504d` was deployed with the repository staging script. Anonymous Access-boundary smokes passed; authenticated voice E2E remains a separate gate.

Rollback is application-first: disable or roll back the Worker to the previous version. Because `0066` is expand-only, the unused table may remain safely during incident recovery. Do not drop it in the same release; data removal requires a later reviewed contract migration and a fresh backup.
