# JURO Accessibility Audit

Status: **partial; WCAG 2.2 AA is the target, not a completed claim**

## Automated and source-level evidence

- skip links, semantic landmarks, visible focus, dialog focus handling, reduced-motion rules, live status regions, form labels, and mobile navigation have regression coverage;
- the application owns Legal Answer headings and status copy, preventing provider text from selecting the page hierarchy;
- new security-boundary work in v99 did not change presentation or keyboard behavior;
- current platform, Worker, rendered-route, lint, and type checks pass.

## Manual gates

- complete keyboard traversal for Client, Business, Lawyer, Pending Lawyer, and Staff/Admin;
- NVDA or equivalent screen-reader verification of AI streaming, dialogs, tables, errors, and progress;
- 200% and 400% zoom/reflow where applicable;
- contrast confirmation on every semantic state, not only token samples;
- touch-target and focus-order checks at all required narrow widths;
- RU/UZ text expansion, date/number pronunciation, and language switching;
- reduced-motion and forced-colors behavior in current production.

Automated tests may prevent regressions but cannot close these manual gates. Detailed historical contracts are in [`ACCESSIBILITY.md`](../../apps/platform/docs/ai-platform/ACCESSIBILITY.md).
