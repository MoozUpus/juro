# Staging 0073 — resilient notification read acknowledgements

Date: 2026-08-02

## Deployed change

The existing D1-backed notification inbox now accepts a read acknowledgement
only as one strict, bounded JSON mutation: a UUID `id` or `{ "all": true }`.
Ambiguous, unknown, non-JSON, and oversized payloads are rejected before the
D1 update. Workspace and authenticated-user constraints remain in the update
query.

The RU/UZ notification client now exposes loading, busy, recoverable error,
retry, and live success states. It disables conflicting acknowledgement actions
until the request resolves. No notification content is sent to analytics and no
schema migration was needed.

## Deployment evidence

- Environment: `staging`
- Worker: `juro-platform-staging`
- Worker version: `a88c1f4c-0373-4b3e-83be-8e13f8fa6953`
- Routes: `/:locale/:accountType/notifications` and
  `/:locale/business/:workspaceId/notifications`
- Data boundary: existing private staging D1 `juro-staging`

## Verification

- Type-check — passed
- Lint — passed
- Full platform suite — passed: 386 tests
- Cloudflare/migration/job suite — passed: 91 tests
- Staging build and artifact validation — passed
- Static contract test covers strict mutation schema and resilient client states
- Cloudflare deployment list reports 100% traffic on the version above
- Anonymous notification-route request is redirected by Cloudflare Access with
  `302` and `no-store`

Authenticated UI traversal is still an Access-protected browser gate, so no
notification was read or generated against staging data for this checkpoint.
Production remains unchanged.
