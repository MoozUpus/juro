# JURO authenticated platform product and UX audit

Date: 2026-08-19  
Scope: `app.juro.uz` authenticated personal workspace and its shared application shell  
Release state: validated release candidate; not deployed to production

## A. Executive Summary

JURO already had a credible LegalTech foundation: a guarded application shell, bilingual routes, tenant-scoped workflows, visible Lex.uz trust language, document creation and analysis, cases, action plans, and lawyer handoff. The largest product-quality defects were caused by composition rather than missing features: a desktop rail remained active on 820 px tablets, the dashboard stayed in a two-column hero after its usable canvas became too narrow, the mobile AI composer could end under the fixed navigation, the review surface nested a second `main`, the document registry rendered 48 cards at once, and the history page exposed internal action vocabulary and opaque identifiers.

The release candidate fixes those defects without changing APIs, data models, entitlements, legal rules, provider routing, or production bindings. The result is materially more coherent across laptop, tablet, and mobile widths. It is not yet a production-complete release because the changes have not been deployed and no standalone Chrome, Edge, Firefox, Safari, WebKit, iPhone, Lighthouse, or Core Web Vitals trace was available in this run.

## B. Application Map

The application follows the product model **Ask → Analyze → Create → Act → Lawyer**:

| Product stage | Primary routes | Supporting routes |
| --- | --- | --- |
| Ask | AI chat, AI lawyer, voice | conversations, memory, feedback, citations |
| Analyze | document review | comparison, analysis versions, corrections, exports |
| Create | document builder | registry, drafts, contacts, collaboration, signed files |
| Act | dashboard, cases, action plans | calendar, tasks, deadlines, history, archive, notifications |
| Lawyer | lawyers, consultations | conflict check, grants, offers, messages, phone consent, reviews |
| Account and trust | profile, settings, security | sessions, MFA, privacy, billing, team, help, monitoring |

The same shared product modules are available through personal and canonical business-workspace route families. This audit exercised the personal workspace in-browser and verified business-route parity through the full build and test suite.

## C. Current UX Problems

Production baseline findings:

- 820 px tablet: a 230 px permanent sidebar left only 574.8 px for the application canvas.
- 1280 px laptop: the dashboard hero remained two-column, squeezing the question field and product route preview.
- 1440 px AI workspace: 250 px conversations + 310 px context left 608 px for the legal dialog.
- 375 × 812 AI workspace: the composer ended at 812 px while the fixed navigation began at 744 px.
- Document library: 48 cards rendered initially and the page was 8278 px high.
- Document review: two nested `main` landmarks.
- History: raw actions such as `ai_chat_completed` and opaque entity UUIDs were visible.
- “All tools” duplicated Create and Review, and opened automatically on their primary routes.

Remaining release-candidate limitations are listed in section M.

## D. P0 Issues

| Issue | Resolution | Evidence |
| --- | --- | --- |
| Mobile AI composer competed with the fixed bottom navigation | The dialog now owns the exact available dynamic viewport height, its answer stream scrolls internally, and the workspace retains bottom clearance | composer bottom 744 px; navigation top 744 px at 375 × 812 |
| Document review exposed nested main landmarks | Replaced the result landmark with an explicitly labelled `section` | browser count changed from 2 `main` elements to 1 |

## E. P1 Issues

| Issue | Resolution | Evidence |
| --- | --- | --- |
| Tablet shell starved product content | Off-canvas shell and mobile navigation now activate through 900 px | content width 574.8 → 804.8 px at 820 px |
| Laptop dashboard composition broke before its mobile breakpoint | Hero becomes one column at 1380 px; quick actions use balanced grids | the 1280 px question field is no longer squeezed |
| Document registry was too long to scan | Initial and subsequent batches are 12 with an announced visible/total count | 48 → 12 initial cards; 8278 → 3594 px page height |
| Navigation duplicated primary tasks | Removed duplicate Create/Review links from “All tools” | 13 → 11 secondary links; group stays closed on builder/review |
| History exposed implementation language and identifiers | Added RU/UZ event and entity labels; unknown events fail to a neutral system label | opaque entity IDs are no longer rendered |

## F. P2 Polish

- Balanced four quick actions at wide desktop and two at laptop widths.
- Increased AI answer, heading, context, fact, and conversation typography.
- Rebalanced the 1440 px AI workspace from 250/608/310 to 230/658/280 px.
- Moved AI context below the dialog when the usable canvas cannot support three readable columns.
- Replaced the history “AUDIT” eyebrow and engineering copy with localized user-facing chronology language.
- Preserved 44 px shell and review action targets, visible focus, reduced-motion behavior, and safe-area spacing.

## G. P3 Opportunities

These are intentionally not presented as shipped features:

1. Turn the dashboard hero into a short interactive legal scenario: question → facts → risk → source → action, using real anonymized evidence.
2. Put advanced AI controls behind a compact mobile disclosure after validating the default model with users.
3. Add route-aware “resume work” intelligence that prioritizes an actual deadline, pending review, or lawyer reply without decorative data.
4. Run cold-load traces and optimize only measured request chains, CSS, fonts, or route chunks.
5. Complete standalone browser and real-device passes before publishing compatibility claims.

## H. Cross-Browser Matrix

| Browser | Desktop | Tablet | Mobile | Status |
| --- | --- | --- | --- | --- |
| Chrome | Chromium-compatible in-app run | simulated viewport only | simulated viewport only | PARTIAL |
| Edge | not run | not run | not applicable | NOT TESTED |
| Firefox | not run | not run | not run | NOT TESTED |
| Safari | not run | not run | not run | NOT TESTED |
| WebKit | not run | not run | not run | NOT TESTED |

No row in this matrix represents a real iPhone or iPad.

## I. Responsive Matrix

| Viewport | Type | Routes exercised | Result |
| --- | --- | --- | --- |
| 1440 × 900 | simulated desktop viewport | 20 primary product/account routes | VERIFIED |
| 1280 × 720 | simulated laptop viewport | dashboard, AI, builder | VERIFIED |
| 820 × 900 | simulated tablet viewport | shell, dashboard, navigation | VERIFIED |
| 375 × 812 | simulated mobile viewport | 20 primary product/account routes | VERIFIED |

Across the 20-route desktop and mobile sweeps: every loaded page had one `main`, one visible `h1` after asynchronous hydration, and no horizontal document overflow. The AI route was given its longer real hydration window.

## J. User Journey Findings

| Journey | Finding | Release-candidate state |
| --- | --- | --- |
| Ask a legal question | Trust copy and provider-unavailable state are honest; desktop density and mobile composer access needed repair | improved and validated locally |
| Review a document | The workflow is feature-complete but its landmark hierarchy was invalid | landmark fixed; workflow regression suite green |
| Create a document | The 623-template registry is credible but the 48-card first load was hard to scan | progressive 12-card batches |
| Open a case and plan action | Dashboard, cases, plan, and calendar form a coherent action layer | no new functional defect found |
| Move to a lawyer | Directory, grants, offers, messages, phone consent, and review paths remain present and tested | unchanged logic; full suite green |
| Manage trust and account | Sessions, privacy, settings, notifications, billing, help, and monitoring use honest unavailable/empty states | no new functional defect found |

## K. Implemented Changes

- `DocumentLibraryClient`: 12-card paging, visible/total live count, explicit next-batch copy.
- `DocumentReviewClient`: one main landmark and labelled result region.
- `HistoryClient`: localized actions/entities and removal of opaque IDs.
- `PlatformShell`: no duplicate secondary tasks; responsive state activates at 900 px.
- `platform-shell.css`: complete 801–900 px off-canvas tablet shell.
- `dashboard.css`: earlier composition breakpoint and balanced quick-action grids.
- `ai-lawyer.css`: denser desktop columns, readable typography, two-row laptop layout, mobile dynamic-height dialog.
- Tests: new focused product-UX regression coverage plus the existing shell breakpoint assertion.

No backend, schema, entitlement, legal-source, billing, provider, or deployment configuration was changed.

## L. Before / After

| Before | After | Why |
| --- | --- | --- |
| 820 px shell: 230 px rail; 574.8 px content | off-canvas rail; 804.8 px content | tablet tasks need a real working canvas |
| mobile AI composer bottom 812 px; nav top 744 px | composer bottom 744 px; nav top 744 px | input must remain reachable above fixed navigation |
| 48 initial templates; 8278 px page | 12 initial templates; 3594 px page | scanning and rendering should be progressive |
| two `main` landmarks in review | one `main` + labelled result `section` | valid navigation for assistive technology |
| raw actions and UUIDs in history | localized actions and semantic entity types | privacy and user comprehension |
| duplicated Create/Review in 13 secondary links | 11 distinct secondary links | one clear route per primary intent |
| AI dialog 608 px at 1440 | AI dialog 658 px at 1440 | legal answers need readable measure |
| three quick actions followed by an orphan fourth | balanced 4-wide / 2-wide / mobile scroller | visual rhythm and predictable scanning |

## M. Remaining Limitations

- The release candidate is not deployed to production.
- Production after-state, Cloudflare version health, and post-deploy smoke are therefore not verified.
- Chrome DevTools MCP was unavailable; Lighthouse, LCP, CLS, INP, TBT, request waterfalls, and accessibility audit scores are not claimed.
- Standalone Chrome, Edge, Firefox, Safari, and WebKit were not run.
- No real iPhone or iPad was used.
- Local AI provider credentials were intentionally absent, so local visual QA exercised the honest unavailable state while production baseline supplied the configured-state layout.
- Browser QA used a local personal workspace. Business route parity is covered by source/build/tests, not a separate signed-in visual pass.
- P3 concepts remain opportunities until their data, interaction contract, and user value are validated.

## N. Final Score

Scores describe the release candidate, not production after-state.

| Criterion | Before | After |
| --- | ---: | ---: |
| Visual Quality | 7.1/10 | 8.0/10 |
| UX | 6.6/10 | 7.8/10 |
| Mobile UX | 6.1/10 | 8.0/10 |
| Safari/iOS | 4.0/10 | 4.5/10 |
| Navigation | 6.7/10 | 8.1/10 |
| AI Chat UX | 6.8/10 | 7.8/10 |
| Documents UX | 7.2/10 | 8.1/10 |
| Sources UX | 7.2/10 | 7.2/10 |
| Trust | 8.0/10 | 8.3/10 |
| Motion | 6.5/10 | 6.5/10 |
| Accessibility | 6.9/10 | 8.1/10 |
| Performance | 6.8/10 | 7.2/10 |
| Brand Identity | 8.0/10 | 8.2/10 |
| Product Maturity | 7.1/10 | 8.0/10 |
| Wow Factor | 7.2/10 | 7.8/10 |

The conservative overall assessment moves from approximately **7.0/10** to **7.7/10**. The largest remaining uncertainty is not visual design but unperformed production, cross-browser, real-device, and Core Web Vitals verification.

## Validation evidence

- Full `npm test`: build/artifact validation plus 791 application tests and 186 queue/runtime tests passed.
- Focused product UX tests: 6/6 passed.
- Existing shell/core targeted tests: 79/79 passed before the final full run.
- `npm run type-check`: passed.
- `npm run lint`: passed.
- Artifact regression budgets passed: CSS 520.8 KiB; initial browser JS 293.7 KiB; largest lazy route increment 208.1 KiB; fonts 454.7 KiB; images 564.4 KiB; Worker 5820.9 KiB.
- Artifact budgets are raw emitted bytes and are not Core Web Vitals.
