# JURO completion matrix — protected staging beta

Last updated: 2026-08-07. This is an evidence ledger, not a release claim.
`VERIFIED_WORKING` means that the stated staging evidence and regression tests
exist; it does not authorize or describe a production change.

| Module | Route / API | Current status | Evidence | Existing implementation location | Missing behaviour | Security impact | Data migration required | Next action | Tests | Final status |
|---|---|---|---|---|---|---|---|---|---|---|
| Auth, OTP, sessions, workspace isolation | localized platform routes | VERIFIED_WORKING | Existing staging evidence through 0105 and authenticated Chrome Access smoke on 2026-08-07 | `lib/auth`, `_auth`, `app/api/auth` | Complete device and screen-reader matrix | Critical | No | Run final authenticated mobile matrix | Route/security suites | Preserved in staging |
| AI chat and structured response | `/api/platform/ai`, `/api/guest/ai`, `/:locale/:accountType/ai-chat` | VERIFIED_WORKING | 2026-08-07 Chrome synthetic answer rendered a structured, source-backed response; missing evidence returned a no-charge clarification | `lib/ai`, `app/api/platform/ai`, `_platform/AIChatClient.tsx` | Broader legal evaluation remains a release gate | Critical | No | Execute final beta evaluation harness | `test`, `test:cloudflare`, browser smoke | RU source-backed staging smoke passed |
| Query-scoped official sources | source panel, `/api/platform/legal-sources/health` | VERIFIED_WORKING | Direct Advice card `https://advice.uz/ru/document/2620` was rendered from a new synthetic query on 2026-08-07; no source was invented for an unrelated question | `lib/legal/direct-retrieval.ts`, migration `0106` | Lex coverage and independent legal review | Critical | No | Run source-coverage report and legal acceptance | Direct-source contracts and browser smoke | Staging verified; no corpus writes |
| Legacy legal corpus | legacy review/sync routes | DORMANT | Flags disable ingestion, RSS discovery and staff source API in staging | `wrangler.jsonc`, legacy legal tables/indexes | Decommission only under a separate retention plan | High | No | Keep rollback assets read-only and document any use | Flag/type regression | Dormant |
| Builder and document lifecycle | `/:locale/:accountType/document-builder` | VERIFIED_WORKING | Synthetic Builder → version → DOCX/PDF/ZIP staging evidence | `app/_document-builder`, `app/api/document-builder` | Full upload-to-analysis cross-flow repeat | Critical | No | Re-run with the scanner path after this release | Builder/R2 suites | Staging browser smoke passed |
| Document analysis and compare | document-review / comparison routes | VERIFIED_WORKING | Existing synthetic analysis accepted a revision and comparison rendered redline | `lib/document-analysis`, `app/_platform/DocumentReviewClient.tsx` | 100-package beta run remains owner-beta acceptance only | High | No | Run final synthetic suite with report hashes | Analysis/compare suites | Staging browser smoke passed |
| Cases, plans, deadlines | case / action-plan routes | VERIFIED_WORKING | Saved AI answer created persisted steps, tasks and linked citations | `lib/platform/cases`, `app/_platform/CaseWorkspaceClient.tsx` | Complete touch/keyboard matrix | High | No | Repeat at mobile breakpoints | Lifecycle/action-plan suites | Staging browser smoke passed |
| Lawyer profile lifecycle and directory | `/api/platform/lawyer-profile`, `/api/platform/lawyer-profile/photo`, `/api/platform/lawyers` | DEPLOY_PENDING | Migration 0108 lifecycle plus local 2026-08-07 public/private photo boundary fix | `lib/platform/lawyer-marketplace.ts`, `app/api/platform/lawyer-profile/**`, `_platform/LawyerDirectoryClient.tsx` | Post-deploy photo scan and approved-lawyer handoff smoke; public website marketplace | Critical | No | Build, deploy staging, then verify public endpoint rejects a pending profile | Type-check; `test`; `test:cloudflare`; lifecycle test | Local security fix awaiting staging deploy |
| Admin and demo payments | admin routes / payment demo routes | PARTIAL | Sandbox checkout and entitlement persistence have browser evidence | `app/[locale]/admin`, `app/api/platform/admin`, `lib/payments` | Separate admin deployment/session, cancellation/failure smoke and fresh reviewer MFA | Critical | Likely no | Prototype isolated admin deployment before UI migration | Admin/payment suites | Staging-only; not a production payment service |
| Public lawyer marketplace | `juro.uz/:locale/lawyers` | NOT_STARTED | Current website has no marketplace route | `apps/website/app` | Prototype, public read API, approved-profile listing, SEO/i18n QA | Critical | No | Create isolated website prototype after design approval | Website render/route tests | Not implemented |
| Cinematic UI and accessibility | shell, priority routes | PARTIAL | Authenticated Chrome desktop smoke has no console errors or horizontal overflow on core routes | `app/_platform/PlatformShell.tsx`, `app/globals.css` | Full mobile, reduced-motion, screen-reader and performance matrix | Medium | No | Run final QA and fix only evidenced issues | Rendered suite + browser smoke | In progress |

## Current non-release gates

- Independent, human legal-review evidence remains distinct from the owner's
  private staging-beta acceptance of 314 legal, 100 document and 30 comparison
  decisions.
- The public `juro.uz` marketplace and a separately deployed admin surface
  are not implemented; platform-only routes are not substitutes.
- No production deployment, production migration or production feature flag
  has been changed by this work.
