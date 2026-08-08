# Security audit delta — 2026-08-07

## Deployed to protected staging; endpoint smoke partly environment-blocked

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

This application-only, fail-closed change was deployed to protected staging as
Worker version `1721fec0-b8f6-451d-9e8a-4893204d8519`. The authenticated
directory smoke rendered the approved-only copy and no pending cards, with no
console errors or horizontal overflow. The local Chrome client blocked a direct
image URL with `ERR_BLOCKED_BY_CLIENT`, so the HTTP response for a known pending
profile is not claimed as browser-verified; the server query boundary remains
covered by a regression test.

## Open release gates

- full external/independent legal review remains distinct from beta acceptance;
- separate admin hostname, isolated bundle/session and current-MFA proof;
- public website marketplace read API and privacy review;
- complete mobile, screen-reader, reduced-motion and performance matrix.
