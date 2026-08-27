# Accessibility audit

## Current implementation evidence

- The product shell has a keyboard-visible skip link and a main-content target.
- Shell, topbar and mobile navigation controls enforce 44 px targets in their
  compact modes.
- Worker 151 extends the 44 px floor to Client scenario pills, case-plan
  actions, history controls, profile navigation, security-session actions,
  case links and notification actions. A live post-deploy Chrome replay of
  Cases, Action plan, History, Profile, Security and Notifications found no
  undersized exposed interactive target; the one 21 px search input remains
  contained by its 44 px label target.
- The production login reserves the Turnstile widget before the provider loads,
  uses its compact layout below the 300 px flexible floor and observes later
  breakpoint changes. At 320x800 the live document had zero horizontal
  overflow, a 150 px compact widget, LCP 248 ms and CLS 0.00. The desktop trace
  recorded LCP 521 ms and CLS 0.02.
- Native links, buttons, forms and `details/summary` disclosures are preferred
  over custom interaction roles.
- The TSX scan found 325 uses of labelled/live/current/expanded accessibility
  constructs; no image without an explicit `alt` attribute was found by the
  bounded static pattern.
- Focus-visible rules occur across 33 stylesheets, reduced-motion rules across
  38, and responsive rules across all 56 audited stylesheets.

These are implementation signals, not a WCAG conformance statement.

## Open verification

A Lighthouse 13.4.1 snapshot of the deployed Worker 151 login passed all 33
checks and scored 100 for Accessibility, Best Practices, SEO and Agentic
Browsing. This is a bounded automated snapshot, not a WCAG conformance audit;
the repository still has no pinned axe/pa11y accessibility runner. Broader
release QA still needs Chrome keyboard and accessibility-tree samples for:

1. public home, navigation, consent and scenario tabs;
2. login/register/OTP errors;
3. AI composer, clarification, streaming/cancel, source cards and feedback;
4. document upload, analysis findings, comparison tabs and export actions;
5. case deadlines and lawyer request/consultation dialogs;
6. admin status/cost tables.

For each sample verify logical heading order, unique accessible names, focus
order, visible focus, dialog focus containment/return, live-status announcement,
form error association, link purpose, table semantics, reflow at 320 CSS pixels,
reduced motion, and color-independent meaning. Native 200% browser zoom remains
explicitly excluded by the current user QA boundary and is not inferred from
viewport emulation.

## Prioritized candidates

- P1: review the 165 CSS declarations matching 11 px or smaller; essential legal
  text and actionable metadata should meet the readable floor.
- P1: finish the bounded target classification on the two Client routes whose
  direct navigation was blocked by browser control and on authenticated Lawyer
  and Admin surfaces after those protected Chrome sessions are established.
- P1: add a bounded automated accessibility smoke after selecting a Worker/Sites-
  compatible runner and pinning it through the normal dependency review.
- P2: add a visual/semantic regression matrix for light/dark themes and RU/UZ/EN
  expansion.

No `WCAG AA passed` claim is made until automated and manual browser evidence is
recorded for the deployed artifact.
