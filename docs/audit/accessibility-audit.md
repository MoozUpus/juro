# Accessibility audit

## Current implementation evidence

- The product shell has a keyboard-visible skip link. Every public
  `#main-content` target is programmatically focusable, and the built-site
  Chrome runner now fails unless activating the link transfers focus to it.
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
- The public website now pins `@axe-core/playwright` 4.13.0 and
  `playwright-core` 1.62.1. Its release test starts the exact built Worker and
  assets, launches the installed Google Chrome channel, and fails on automated
  WCAG 2.0/2.1 A/AA or WCAG 2.2 AA violations.
- The current local matrix passed all 16 route/profile combinations: desktop
  light and mobile light for RU/UZ/EN home plus RU Trust and Lawyers; desktop
  dark and mobile dark for RU home, Trust and Lawyers. Each page completed 26
  or 29 automated checks with zero violation; two additional rule classes per
  page remain explicitly marked for manual review.
- Contrast corrections now use theme-aware text and label colors on the public
  home, Trust and Lawyers surfaces. Motion-reduced content no longer becomes
  artificially low-contrast through inactive-state opacity. Header language
  choices in both the header and footer have an explicit 44×44 px floor on
  every desktop and mobile route.
- A manual Google Chrome pass against the exact locally built Worker covered
  RU home, Trust and Lawyers at `1280×900`, plus the RU home menu at
  `390×844`. The three representative routes retained one H1, one main target,
  no horizontal overflow and a working skip-focus transfer. Homepage tablists
  wrapped with Arrow/End keys and retained visible 2.4 px focus outlines.
- The mobile dialog moved focus to its close control, wrapped Shift+Tab/Tab
  between the first and last controls, closed on Escape and returned focus to
  the menu trigger. Its clickable scrim is now hidden and removed from the tab
  order, leaving one accessible `Close menu` control rather than two duplicate
  controls.

These are implementation signals, not a WCAG conformance statement.

## Open verification

A Lighthouse 13.4.1 snapshot of the deployed Worker 151 login passed all 33
checks and scored 100 for Accessibility, Best Practices, SEO and Agentic
Browsing. The new pinned axe/Chrome smoke closes the missing public-site
automation gate in source, but neither result is a WCAG conformance audit.
The bounded public-site Chrome sample is now retained for home, Trust and
Lawyers. Broader release QA still needs keyboard and accessibility-tree samples
for:

1. login/register/OTP errors;
2. AI composer, clarification, streaming/cancel, source cards and feedback;
3. document upload, analysis findings, comparison tabs and export actions;
4. case deadlines and lawyer request/consultation dialogs;
5. admin status/cost tables.

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
- P1: deploy the superseding saved Sites candidate only after action-time
  approval, then replay both the automated runner and the retained manual
  keyboard/accessibility-tree sample against that exact public artifact.
- P2: add a visual/semantic regression matrix for light/dark themes and RU/UZ/EN
  expansion.

No `WCAG AA passed` claim is made until automated and manual browser evidence is
recorded for the deployed artifact.
