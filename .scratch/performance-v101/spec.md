# v101 public scroll performance

## Goal

Remove synchronous layout reads from the public homepage scroll and pointer hot paths while preserving the existing motion, localization, accessibility, and reduced-motion behavior.

## Evidence baseline

- The v99 website production build succeeds with Vinext 1.0.0-beta.8.
- `JuroMotionDirector` currently calls `getBoundingClientRect()` for chapters, story steps, the footer, and animated sections during every scheduled scroll frame.
- The existing Cloudflare Web Performance evidence records a forced-reflow risk on the cinematic landing page, but a fresh Chrome trace is still required before making a production performance claim.

## Constraints

- No legislation database or corpus work.
- No new Chrome session without explicit user permission.
- Keep the browser scroll callback limited to cached arithmetic and DOM writes.
- Re-measure after viewport, root-size, and web-font layout changes.
- Preserve the reduced-motion path and IntersectionObserver reveal behavior.

## Release gates

- Website type-check, lint, build, and full website tests pass.
- Regression test proves that the hot scroll function contains no geometry or document-height reads.
- Static emitted asset comparison does not regress materially.
- Live Chrome trace, Core Web Vitals, network, and accessibility verification remain required before production deployment.
