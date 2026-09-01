# JURO mobile audit

Status: **PARTIAL; Chrome-only**

Evidence cutoff: **2026-09-01**

## Result

The current product-metrics surface was checked at 390 × 844 CSS pixels in Chrome without horizontal overflow; its grid contracts from four to two to one column and interactive controls retain a 44-pixel minimum target. Earlier public and authenticated audits also cover selected narrow layouts. This is not a complete device certification.

## Evidence

- Responsive shell and navigation: `apps/platform/app/_platform/PlatformShell.tsx` and related CSS.
- Staff metrics layout: `apps/platform/app/_staff/ProductMetricsConsole.tsx` and `apps/platform/app/_staff/legal-source-reviews.css`.
- Automated structure: `apps/platform/tests/rendered-html.test.mjs`, `platform-shell-accessibility.test.ts`, and `platform-shell-motion.test.ts`.
- Earlier detailed matrix: [`PRODUCT-UX-AUDIT-2026-08-19.md`](../ai-platform/PRODUCT-UX-AUDIT-2026-08-19.md).

## Viewport status

| Viewport | Evidence | Status |
| --- | --- | --- |
| 390 × 844 | v112 product-metrics Chrome QA | VERIFIED for that surface |
| 1100 × 900 | v112 product-metrics Chrome QA | VERIFIED for that surface |
| 1440 × 900 | v112 product-metrics Chrome QA | VERIFIED for that surface |
| Other target widths and orientations | no complete current-revision matrix | OPEN |

## Limitations

No Edge, Firefox, Safari/WebKit, physical iPhone/iPad, or physical Android device was used. Keyboard overlays, safe areas, dynamic viewport units, landscape mode, high zoom, slow-network recovery, and every authenticated role remain open.
