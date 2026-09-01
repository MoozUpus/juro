# Cache public motion geometry

Status: claimed

## Problem

The public homepage batches layout reads before writes, but it still performs those layout reads during every animation frame scheduled by scrolling. That keeps forced layout work in the highest-frequency interaction path.

## Acceptance criteria

- Cache page-relative geometry outside the scroll handler.
- Refresh cached geometry when the viewport, root size, or loaded fonts can change layout.
- Use IntersectionObserver for reveal and footer visibility state.
- Preserve chapter, story, document, continuity, handoff, progress, and pointer effects.
- Add a regression test for zero layout reads inside `updateScrollStory`.
- Pass the v101 release gates in the feature spec.

## Comments

- 2026-09-01: Claimed after production provider recovery was verified and static performance triage selected the public scroll path as the next non-legislation goal item.
- 2026-09-01: The first full suite exposed two source-contract assertions tied to the previous live-rectangle formulas. They were updated to assert the equivalent cached page-relative formulas; no product behavior was relaxed.
- 2026-09-01: Type-check, lint, production build/artifact validation, and all 45 website tests pass. Final raw client JavaScript increased by 714 bytes (0.11%) while CSS stayed unchanged. The ticket remains claimed until the required Chrome trace and interaction check are allowed and complete.
- 2026-09-01: Post-validation review bounded zero-size hero geometry and prevents the web-font promise from scheduling measurement after effect cleanup.
