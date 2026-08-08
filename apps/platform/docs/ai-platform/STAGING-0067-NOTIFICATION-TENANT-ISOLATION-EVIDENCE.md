# Staging 0067 — notification tenant isolation

Date: 2026-08-02

## Security correction

Canonical notification pages reuse the historical builder notification client.
The read and acknowledgement backend previously constrained records only by the
authenticated user. The corrected endpoint obtains the active member workspace
server-side and includes `workspace_id` in list, unread-count, individual-read,
and mark-all-read predicates.

## Deployment evidence

- Environment: `staging`
- Worker: `juro-platform-staging`
- Worker version: `40dcdbfb-46c4-4ff6-81c1-5efd416f05bd`
- D1 binding: `juro-staging`
- Deployment command: `npm run deploy:staging`
- Schema/resources: unchanged

The Wrangler deployment output confirmed the Worker and triggers deployed using
only the existing staging D1, private R2 buckets, queues, Vectorize indexes, and
staging variables. Production was not targeted.

## Verification

- `npm run type-check` — passed
- `npm run lint` — passed
- `npm test` — passed: 379 platform tests and 91 Cloudflare/Worker tests
- `npm run build:staging` — passed
- `npm run validate:artifact -- --environment staging` — passed
- Static regression contract asserts that list, unread count, item-read, and
  mark-all-read queries all require a workspace key.

## Remaining verification limit

The authenticated staging browser test cannot be asserted in this environment:
Cloudflare Access remains enabled and the available browser-control runtime fails
before connection. No Access bypass was attempted. The server-side tenant scope,
artifact validation, and staging deployment are evidenced above; browser QA
remains an explicit release gate.
