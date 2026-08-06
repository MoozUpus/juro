# Staging 0111 — lawyer marketplace visibility boundary

Date: 2026-08-07

## Deployment

- Commit: pending (application-only lifecycle correction)
- Environment: protected staging only
- Worker version: pending staging deployment
- D1 migrations: none; this is application-only
- Production: not read, deployed, or otherwise changed

## Boundary implemented

- An incomplete profile is never projected into the public directory.
- A completed profile in `pending_review` is publicly visible with a clear
  review label, but `canReceiveRequests=false` and its action is disabled.
- `/api/public/lawyers` and `/api/public/lawyers/:profileId` use a fixed
  field allowlist: public professional information only. They do not select
  identity, consent, access-grant or moderation-record fields.
- Public profile-image delivery follows the same completed-pending or approved
  boundary. The owner-only preview endpoint remains authenticated.
- Public ratings and review excerpts appear only after three moderated reviews;
  the threshold is centralized as `MINIMUM_PUBLISHED_LAWYER_REVIEWS`.

## Checks

- `npm run type-check`: passed.
- targeted marketplace and platform-core tests: 82/82 passed.
- `npm run build:staging`: passed, including staging artifact validation.
- Website type-check, lint and production build: passed. The website linter has
  no errors; it reports existing and intentional direct-image warnings.

## Explicit limitation

This record replaces 0110's overly restrictive pending-profile treatment.
The former staging Worker version remains historical evidence only. A fresh
authenticated staging smoke is required after this application-only deploy.
