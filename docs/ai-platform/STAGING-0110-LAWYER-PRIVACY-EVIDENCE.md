# Staging 0111 — lawyer marketplace visibility boundary

Date: 2026-08-07

## Deployment

- Commit: `174f6ba` (`feat(marketplace): publish safe lawyer catalogue projections`)
- Environment: protected staging only
- Worker version: `37e9945a-a998-4393-9e37-0fcfc337a08d`
- D1 migrations: none; this is application-only
- Production: not read, deployed, or otherwise changed

## Staging fixture and deployment update

- Commit: `d4ec1ef` (`feat(staging): seed auditable lawyer handoff fixtures`)
- Worker version: `4f44481f-feec-4356-9ca3-e90e4aae7f87`
- Remote private R2: one existing JURO logo was stored under the synthetic
  staging-only profile-image key, with the checked file size and SHA-256 from
  the local source asset. No personal image or customer document was uploaded.
- Remote D1: the idempotent `scripts/staging-lawyer-handoff-seed.sql` created
  one clearly labelled approved fixture and one clearly labelled pending-review
  fixture. It creates no session, OTP, case, request, order or payment.
- The approved state was derived by the existing immutable
  `lawyer_profile_moderation` trigger; the fixture records its beta-only,
  owner-authorized moderation reason rather than claiming production
  accreditation.

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
- Authenticated in-app browser smoke after the fixture seed: the directory
  rendered two profiles; its approved fixture exposed `Выбрать для заявки`,
  while its pending-review fixture exposed only the disabled review state.
- The approved profile detail now exposes the same case-linked handoff CTA.
  Its destination preselected that profile in the existing handoff form, which
  still requires an anonymized summary and explicit consent before a request
  can be created.
- `npm run type-check`, targeted marketplace/fixture tests (6/6), `npm run
  lint`, staging build and artifact validation passed before deployment.
- A complete post-fixture `npm test` regression run passed **576/576**. The
  run initially exposed a test-fixture defect: an assertion intended to inspect
  a public review used `reviewCount: 1`, below JURO's documented minimum of
  three moderated reviews, and therefore inspected an empty list. The fixture
  now uses the threshold and proves that a pending lawyer reply projects as
  `null`, never as reply content. The focused reply suite passed 4/4 before the
  complete run.

## Explicit limitation

This record replaces 0110's overly restrictive pending-profile treatment.
The former staging Worker version remains historical evidence only. A fresh
public-API response smoke remains open: the browser extension blocks direct
JSON navigation with `ERR_BLOCKED_BY_CLIENT`; it does not affect the
authenticated directory's same-origin request. Public juro.uz deployment is
also deliberately pending separate production approval.

The browser smoke intentionally stopped before submitting a handoff request:
creating even a synthetic request is an auditable data write. The existing
server-side handoff lifecycle is covered by its regression suite; a full
interactive request → conflict check → consented grant requires a separately
authenticated synthetic lawyer session and an explicit write confirmation.
