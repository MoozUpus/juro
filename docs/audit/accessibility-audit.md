# JURO accessibility audit

Status: **PARTIAL**

Evidence cutoff: **2026-09-01**

## Result

The source establishes labelled controls, keyboard-aware shell behavior, focus styles, live status announcements, reduced-motion handling, responsive targets, and noindex/private boundaries. Automated and selected Chrome checks are positive, but full WCAG conformance is not claimed.

## Verified evidence

- Platform shell contracts and tests: `apps/platform/tests/platform-shell-accessibility.test.ts`.
- Rendered landmarks and HTML checks: `apps/platform/tests/rendered-html.test.mjs`.
- Theme contrast/state resilience: `apps/platform/tests/ui-theme-resilience.test.ts` and `ai-chat-theme.test.ts`.
- Motion and reduced-motion contracts: `apps/platform/tests/platform-shell-motion.test.ts`.
- Detailed historical checklist: [`apps/platform/docs/ai-platform/ACCESSIBILITY.md`](../../apps/platform/docs/ai-platform/ACCESSIBILITY.md).
- Public and login Lighthouse evidence: [`performance-audit.md`](./performance-audit.md).

## Open manual gates

- Full keyboard journey for every role and modal/drawer/menu state.
- NVDA or another approved screen-reader pass in Russian and Uzbek.
- 200%/400% zoom, forced-colors, text-spacing, error recovery, and long-content review.
- Authenticated Chrome pass on the exact production candidate.

Automated checks and a Lighthouse score do not certify full accessibility.
