# Security audit delta — 2026-08-07

## Resolved locally; staging deployment pending

**S-2026-08-07-01 — pending lawyer-profile media had a public delivery path.**

The public photo endpoint accepted `pending_review` profiles. Although a
pending professional could not receive a request, an unauthenticated caller
with a profile UUID could retrieve the associated photo. The platform directory
also displayed pending-review records to regular authenticated users.

The local fix now:

- serves public photos only when `status='public_approved'` and
  `public_approved_at` is populated;
- limits the requestable directory to that same approved state;
- provides the profile owner an authenticated private image endpoint for their
  own upload/preview;
- adds regression assertions for both query boundaries.

This is an application-only, fail-closed change. It awaits build, staging
deployment and an authenticated/unauthenticated endpoint smoke before it can
be marked deployed.

## Open release gates

- full external/independent legal review remains distinct from beta acceptance;
- separate admin hostname, isolated bundle/session and current-MFA proof;
- public website marketplace read API and privacy review;
- complete mobile, screen-reader, reduced-motion and performance matrix.
