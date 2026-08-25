# Component inventory

Static inventory captured on 2026-08-25:

- 319 TSX files under the platform application;
- 30 TSX files under the public website;
- 164 platform page modules and 195 platform API route modules;
- 56 CSS files across the audited applications.

These counts describe surface area, not feature completeness.

| Family | Canonical surfaces | Shared contract | Consolidation status |
| --- | --- | --- | --- |
| Global chrome | public `SiteChrome`, platform shell, topbar, sidebar, mobile nav | Identity, locale, theme, skip link, 44 px actions | Shared behavior exists; visual tokens remain duplicated between products. |
| Auth/onboarding | login, registration, OTP/MFA, account-type onboarding | Safe `returnTo`, server-selected persona destination, errors, rate limits | Route/security contracts are centralized; CSS is still route-specific. |
| AI workspace | chat list, composer, clarification, source panel, feedback, voice | Answer state, verified citations, cancellation, retry/fallback | Functional primitives are cohesive; legacy `ai-chat` aliases remain compatibility routes. |
| Case/action plan | case list/workspace, tasks, deadlines, sources, proposals | Tenant scope, lifecycle, evidence links | Case and plan APIs are linked; presentation is split across several CSS modules. |
| Documents | builder, library, editor, analysis, comparison, review, exports | Quarantine, owner scope, revisions, deterministic diff, signed shares | Builder has a reusable component family; analysis/comparison use separate visual systems. |
| Lawyer marketplace | directory, profile, request, offer, checkout, consultation | Lawyer persona, conflict checks, consented access grant | Citizen and lawyer experiences share data contracts, not UI primitives. |
| Lawyer workspace | assigned matters, schedule, time, knowledge, tasks, calls | Server-enforced lawyer role and assignment | Dedicated shell/persona retained. |
| Admin | system status, jobs, billing/cost, AI quality, legal sources, audit log | Admin capability, fresh MFA for sensitive actions, immutable audit evidence | Hosted inside the platform route tree, not a separate frontend package. |
| Trust/legal | public trust, legal, knowledge, status, source cards | Truthful claims, canonical metadata, noindex for private content | Public content system is localized RU/UZ/EN. |
| Feedback/status | empty/error/loading states, notices, banners, toasts | Accessible live status and recovery action | Patterns exist but lack a single exported primitive library. |

## Consolidation priorities

1. Extract semantic form, button, notice, source-card, and empty-state primitives
   only when a real feature change touches two or more implementations.
2. Replace hard-coded brand colors with semantic tokens in touched files.
3. Retire compatibility routes only after production analytics proves no use and
   redirect tests are updated.
4. Add visual regression fixtures for shell, AI answer/source states, document
   review, and lawyer request lifecycle before broad CSS consolidation.

A component is not considered shared merely because selectors look similar.
Shared primitives need a typed API, accessibility behavior, localization, and
consumer tests.
