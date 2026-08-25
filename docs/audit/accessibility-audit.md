# Accessibility audit

## Current implementation evidence

- The product shell has a keyboard-visible skip link and a main-content target.
- Shell, topbar and mobile navigation controls enforce 44 px targets in their
  compact modes.
- Native links, buttons, forms and `details/summary` disclosures are preferred
  over custom interaction roles.
- The TSX scan found 325 uses of labelled/live/current/expanded accessibility
  constructs; no image without an explicit `alt` attribute was found by the
  bounded static pattern.
- Focus-visible rules occur across 33 stylesheets, reduced-motion rules across
  38, and responsive rules across all 56 audited stylesheets.

These are implementation signals, not a WCAG conformance statement.

## Open verification

The repository has no installed axe/pa11y/lighthouse accessibility runner. Final
release QA therefore needs a Chrome keyboard and accessibility-tree sample for:

1. public home, navigation, consent and scenario tabs;
2. login/register/OTP errors;
3. AI composer, clarification, streaming/cancel, source cards and feedback;
4. document upload, analysis findings, comparison tabs and export actions;
5. case deadlines and lawyer request/consultation dialogs;
6. admin status/cost tables.

For each sample verify logical heading order, unique accessible names, focus
order, visible focus, dialog focus containment/return, live-status announcement,
form error association, link purpose, table semantics, 200% zoom, reflow at 320
CSS pixels, reduced motion, and color-independent meaning.

## Prioritized candidates

- P1: review the 165 CSS declarations matching 11 px or smaller; essential legal
  text and actionable metadata should meet the readable floor.
- P1: classify 63 possible sub-44 px minimum dimensions and fix those belonging
  to interactive controls; decorative/icon dimensions are not failures.
- P1: add a bounded automated accessibility smoke after selecting a Worker/Sites-
  compatible runner and pinning it through the normal dependency review.
- P2: add a visual/semantic regression matrix for light/dark themes and RU/UZ/EN
  expansion.

No `WCAG AA passed` claim is made until automated and manual browser evidence is
recorded for the deployed artifact.
