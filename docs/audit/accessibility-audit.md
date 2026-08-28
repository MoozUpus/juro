# Accessibility audit

## Current implementation evidence

- Worker 170 closes the authenticated Client shell findings from the fresh
  Chrome sample. The closed global-search trigger no longer points at a dialog
  that is absent from the DOM; while open it exposes the exact dialog target,
  moves focus to the input, wraps Shift+Tab/Tab through the close control and
  returns focus to the trigger on Escape. Explicit 10–11 px Client shell,
  dashboard and search labels now use the project 12 px floor. At `390×844`
  and `320×844`, the signed-in production dashboard retained one H1, one main
  landmark, zero horizontal overflow, zero exposed sub-44 px controls and no
  visible text below 12 px. The mobile menu now exposes one accessible close
  control; its pointer scrim is `aria-hidden` and removed from the tab order.
  The skip-link → `main#main-content` → labelled composer keyboard path and
  visible focus outlines passed after release. No form was submitted and no
  private account content or screenshot was retained. This is a bounded Chrome
  sample, not a screen-reader test or WCAG conformance claim.
- Worker 168 closes the confirmed Client dashboard composer focus defect. On
  Worker 167, a signed-in Chrome keyboard sample found that the skip link was
  first, visibly focused and transferred focus to `main#main-content`, but the
  next focusable control, the labelled AI-composer textarea, had no outline,
  border or shadow even though `:focus-visible` matched. After release, the
  same Tab/Enter/Tab sequence reached the same textarea with a solid visible
  focus outline in the shared focus color. The field retained its associated
  label and the desktop document retained zero horizontal overflow. The exact
  production CSS asset contains the dedicated `3px`/`3px` source rule. This is
  a bounded keyboard sample, not a blanket assistive-technology or WCAG claim.
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
- Worker 156 closes the remaining confirmed comparison-workflow target defect.
  Before release, the compact refresh control shrank to about `19.6×42` px at
  320 px and `23.4×42` px at 390 px. The corrected production control is
  exactly `44×44` px at both widths, with no horizontal overflow or Chrome
  console errors. The same source guard covers comparison file actions, recent
  actions, metadata links, case controls, filters, change decisions, source
  links and compact version buttons. This bounded Chrome evidence is not a
  screen-reader or blanket WCAG conformance claim.
- Worker 157 closes the source-level Lawyer professional-workflow target set.
  Offer, message, AI-assist, internal-note, consultation, schedule, knowledge,
  time-tool and source-link controls now retain a 44 px interaction floor, with
  an 11/11 regression contract. The exact production CSS asset contains both
  target groups. Anonymous access still fails closed with `401`, while an
  existing Client session reaches the dedicated Lawyer re-authentication page
  with one H1, one main landmark and no horizontal overflow. A signed-in Lawyer
  render remains open because no production Lawyer identity was fabricated.
- Worker 158 closes the confirmed non-corpus Admin source-level target subset.
  Shared retry buttons, Knowledge Base header and fieldset actions, and the Cost
  console checkbox label now retain a 44 px interaction floor. The focused
  accessibility contract passed 12/12, and the exact production CSS asset
  contains the selector group. In isolated Chrome, anonymous Admin requests
  failed closed at the protected re-authentication screen with one H1/main, no
  overflow, no console warnings/errors and no staff-data disclosure. Signed-in
  Admin rendering remains open; legal-source review controls were excluded from
  this iteration as requested.
- A fresh production Chrome replay on 2026-08-28 reconfirmed the original
  misplaced `lawyer.juro.uz/ru/individual/dashboard` URL against the current
  release. It reached the authenticated Client dashboard on `app.juro.uz`,
  rendered the complete desktop shell without `Not Found`, overflow, a role
  alert or warning/error log, and retained one H1, one main landmark, loaded
  fonts and private `noindex` metadata. Attempts by the same Individual
  session to open RU and UZ Business dashboards returned to the matching
  localized Individual dashboard without exposing Business-only signals.
- The production login reserves the Turnstile widget before the provider loads,
  uses its compact layout below the 300 px flexible floor and observes later
  breakpoint changes. At 320x800 the live document had zero horizontal
  overflow, a 150 px compact widget, LCP 248 ms and CLS 0.00. The desktop trace
  recorded LCP 521 ms and CLS 0.02.
- The production auth release now keeps each asynchronous error associated with the
  control that failed. Email, OTP and MFA inputs expose both `aria-invalid`
  and a stable `aria-errormessage`/`aria-describedby` relationship while the
  retry action owns resend failures; terminal OTP/MFA challenges return the
  relationship to the newly focused email field. The alert remains atomic.
  A focused two-test contract, the 1094-test core suite and the 201-test
  Cloudflare/infrastructure suite passed the source candidate; the exact
  production Worker 157 auth asset contains the same ARIA contract. No OTP or
  MFA was submitted, so live assistive-technology error announcement remains
  open.
- Worker 155 corrects status-document language and first-party icon metadata.
  Chrome verified the bare UZ and explicit RU status surfaces with matching
  `html`/`main` language, localized title and H1, one main landmark, loaded
  fonts, private noindex, no overflow, same-origin icon links and an empty
  warning/error/issue log.
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
- The current local matrix passed all 56 route/profile combinations. Desktop
  and mobile light each cover the same seven public page types in RU, UZ and
  EN: home, Trust, Lawyers, Legal Center, a legal document, a knowledge article
  and video. Desktop and mobile dark cover the seven representative RU
  surfaces. Each page completed 23–29 automated checks with zero violation;
  two additional rule classes per page remain explicitly marked for manual
  review, while video retains three.
- The same built-site runner now fails when any visible public text falls below
  12 CSS px. A static source test independently rejects explicit `px` or `rem`
  declarations below the same floor. Seventy-seven legacy declarations across
  12 public stylesheets were raised, including action copy, legal-basis/risk/
  next-step labels, data-route explanations, status metadata and decorative
  indices. Relative headline subcopy remains safe through its computed-size
  runtime check rather than an invalid source-only inference.
- Contrast corrections now use theme-aware text and label colors on the public
  home, Trust and Lawyers surfaces. Motion-reduced content no longer becomes
  artificially low-contrast through inactive-state opacity. Header language
  choices in both the header and footer have an explicit 44×44 px floor on
  every desktop and mobile route.
- A manual Google Chrome pass against the exact locally built Worker covered
  RU home, Trust and Lawyers at `1280×900`, plus the RU home menu at
  `390×844`. The three representative routes retained one H1, one main target,
  no horizontal overflow and no visible interactive text below 12 px. The
  open mobile menu exposed 18 text-bearing action elements with a 12 px
  minimum. The prior pass also confirmed working skip-focus transfer; homepage
  tablists wrapped with Arrow/End keys and retained visible 2.4 px focus
  outlines.
- A second exact-build Chrome pass covered the dark Legal Center, privacy
  policy and knowledge article at `1280×900` and `390×844`. Each retained one
  H1, one main target, zero horizontal overflow and no sub-12 px action. The
  dark palette was visually checked for headings, metadata, tables, print and
  source actions, breadcrumbs and the cookie banner.
- A third exact-build Chrome pass covered the revised RU home at `1280×900`
  and EN home plus UZ Trust at `390×844`. The dense decision-map and handoff
  labels rendered at 12 px without clipping; all samples retained the correct
  document language, one H1, one main target and zero horizontal overflow.
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

1. live login/register/OTP/MFA error announcement and focus behavior after an
   authorized real asynchronous error is produced;
2. AI composer, clarification, streaming/cancel, source cards and feedback; the
   dashboard composer label and visible-focus defect are covered on Worker 168,
   but the rest of this workflow remains open;
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

- P1: finish rendered target classification on authenticated Lawyer and Admin
  surfaces after those protected Chrome sessions are established. The Client
  set, Lawyer source contract, non-corpus Admin source contract and current
  direct-navigation boundaries are covered; signed-in Lawyer and Admin
  rendering is not inferred from source.
- P1: deploy the superseding saved Sites candidate only after action-time
  approval, then replay both the automated runner and the retained manual
  keyboard/accessibility-tree sample against that exact public artifact.
- P2: add retained visual snapshots for the full localized matrix if future
  regressions require pixel-level comparison; the current gate is semantic,
  contrast, focus-transfer, visible-text and overflow evidence.

No `WCAG AA passed` claim is made until automated and manual browser evidence is
recorded for the deployed artifact.
