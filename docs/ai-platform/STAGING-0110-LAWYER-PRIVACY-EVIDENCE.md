# Staging 0111 — lawyer marketplace visibility boundary

Date: 2026-08-07

## Deployment

- Commit: `174f6ba` (`feat(marketplace): publish safe lawyer catalogue projections`)
- Environment: protected staging only
- Worker version: `37e9945a-a998-4393-9e37-0fcfc337a08d`
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
- Authenticated Chrome staging smoke: `/ru/individual/lawyers` loaded the
  corrected review-state explanation and completed with `Найдено специалистов:
  0`, with no error UI. The zero is a truthful staging-data state, not mock data.

## Explicit limitation

This record replaces 0110's overly restrictive pending-profile treatment.
The former staging Worker version remains historical evidence only. A fresh
public-API response smoke remains open: the browser extension blocks direct
JSON navigation with `ERR_BLOCKED_BY_CLIENT`; it does not affect the
authenticated directory's same-origin request. Public juro.uz deployment is
also deliberately pending separate production approval.
