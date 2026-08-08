# STAGING-0057 — lawyer offer terms

Date: 2026-08-01
Environment: protected staging only
Worker: `juro-platform-staging`, version `ad482923-41bc-4a59-a846-54b16e4dcbb1`
D1: `juro-staging` (`bb716a96-b2fb-4823-90d6-6c228fed181a`)
Migration: `0052_narrow_christian_walker.sql`

## Implemented workflow

- A public-approved lawyer with a non-revoked, non-expired case grant can persist one proposed scope, price description, and duration description for an assigned request.
- The request owner can view the latest offer only inside the owning workspace and explicitly accept or decline it.
- A declined offer may be replaced; an accepted offer cannot be overwritten by this workflow.
- Every proposal and owner response is recorded as a workspace audit event. Platform payment is intentionally not implemented or implied.
- The assigned-lawyer response hides offer and case data unless the access grant is active.

## Recovery checkpoint before migration

- Private R2 object key: `d1/juro-staging/20260801T021500Z/pre-0052-full.sql`
- Bytes: 600,007
- SHA-256: `b92410cd536080f4dca18b0658ceaa8d60791023620f3c28fd733483e84a9f3d`
- Remote private-bucket download checksum: identical.

The backup URL and database content are deliberately not recorded.

## Remote postflight

- Wrangler 4.92.0 applied four additive SQL commands.
- Migration ledger records `0052_narrow_christian_walker.sql` as ID 53.
- `PRAGMA quick_check`: `ok`.
- `PRAGMA foreign_key_check`: no rows.
- Table `lawyer_offers` and both expected indexes are present.
- Staging worker deployment lists staging-only D1, R2, Queue, Vectorize, and analytics bindings.
- Anonymous request to the consultations route received Cloudflare Access redirect (HTTP 302); protected authenticated traversal is not claimed.

## Code checks

- `npm run type-check` — pass.
- `npm run lint` — pass.
- `npm test` — 87/87 Cloudflare and migration tests pass.
- `npm run build:staging` — pass.
- `npm run cf:types:check` — pass.
- `npm run deploy:staging -- --dry-run` — staging binding guard pass.
- `npm run deploy:staging` — pass, version listed above.

## Limits

This is a staged offer/decision boundary only. Payment, invoices, lawyer messaging, reviews, and authenticated browser E2E remain separate uncompleted work. Production was not changed.