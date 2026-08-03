# JURO route inventory

Audit date: 2026-07-28
Production Sites revision: `4031078` (v20)
Integration branch baseline: remote `8ab1693` plus the current local Phase 2 checkpoint

> Current staging delta — 2026-08-04: commit `33ff471`, deployed as protected
> staging Worker `166f25f3-caa2-4312-b577-beabdfd1f37c`, adds validated
> canonical case sections for personal and explicit business workspaces. This
> supersedes the older plan-only/ignored-ID statement below. Production remains
> unchanged; authenticated browser QA is still open.

This inventory distinguishes actual routes from target routes. An entry marked `missing` is not represented as working.

Production routing is split: `app.juro.uz` serves Sites v20, while `admin.juro.uz` and the `juro` workers.dev hostname serve a separate legacy Worker asset set. The Workers Domains and Sites control planes both report ownership information for `app.juro.uz`; no route migration or DNS change is safe until that ambiguity is reconciled. `staging.app.juro.uz`, `staging.juro.uz`, and `status.juro.uz` currently have no DNS records.

## Authentication and entry routes

| Current URL | Target URL | Action | Code | Reason / test result |
|---|---|---|---:|---|
| `/` | `/uz/auth/login`, `/uz/onboarding`, or localized persona `/dashboard` | implemented locally; production unchanged | 307 | Local guest/default-onboarding behavior is Uzbek; completed profiles retain saved locale/persona |
| `/login` | `/:locale/auth/login` | retain as compatibility surface | — | Canonical RU/UZ auth pages now exist locally; unlocalized page remains for inbound links |
| `/register` | `/:locale/auth/register` | retain as compatibility surface | — | Canonical RU/UZ registration pages now exist locally |
| `/:locale/login` | `/:locale/auth/login` | implemented locally | 308 | Preserves a safe `returnTo` |
| `/:locale/register` | `/:locale/auth/register` | implemented locally | 308 | Preserves safe `accountType` and `returnTo` |
| `/onboarding` | `/:locale/onboarding` | localized route implemented locally; compatibility page retained | — | Canonical route uses URL locale and protected onboarding state |
| `/main` | `/:locale/:accountType/dashboard` | compatibility entry retained locally; production unchanged | 307/308 | Unlocalized entry resolves saved locale/persona; localized `/:locale/:accountType/main` uses a tested method-preserving 308 redirect |

Production still defaults through its older unlocalized flow. The local integration branch now defaults unauthenticated root and incomplete onboarding to Uzbek; completed profiles retain their saved locale.

## Current canonical platform routes

The dynamic platform router currently permits:

- locales: `ru`, `uz`;
- account types: `individual`, `entrepreneur`, `lawyer`, `business`;
- modules: `dashboard`, `ai-chat`, `cases`, `document-review`, `monitoring`, `action-plan`, `consultations`, `history`, `archive`, `team`, `billing`, `security`, `help`, `profile`, `settings`.

Current route shells:

```text
/:locale/:accountType
/:locale/:accountType/:module
/:locale/:accountType/cases/:caseId
/:locale/:accountType/cases/:caseId/:section
/:locale/:accountType/action-plan/:caseId
/:locale/:accountType/contacts
/:locale/:accountType/notifications
/:locale/:accountType/settings/privacy
/:locale/:accountType/settings/security
```

`cases/:caseId` is now an object-specific, tenant-backed overview. Its validated
URL sections are `chat`, `documents`, `analyses`, `plan`, `calendar`, `sources`,
`participants`, `lawyer`, `activity`, and `access`. Explicit business routes use
`/:locale/business/:workspaceId/cases/:caseId/:section`; reserved legacy business
routes preserve the section through the existing workspace-selection redirect.
`action-plan/:caseId` remains the dedicated editable plan surface linked from the
case workspace.

## Document builder

These routes are current production contracts and must remain covered by regression tests:

```text
/:locale/:accountType/document-builder
/:locale/:accountType/document-builder/:categorySlug
/:locale/:accountType/document-builder/:categorySlug/:documentCode
/:locale/:accountType/documents
/:locale/:accountType/documents/:id
/:locale/:accountType/documents/:id/edit
/:locale/:accountType/documents/comparisons/:comparisonId
```

Primary regression URL:

```text
https://app.juro.uz/ru/individual/document-builder
```

Guest production smoke: safe redirect to login with the complete `returnTo`.

Internal `app/_document-builder/**` paths are implementation modules and are not public URL contracts.

## Public and token routes

| Current route | Current purpose | Target treatment |
|---|---|---|
| `/invite/:token` | workspace invitation | retain; local conditional acceptance exists, but requires full HTTP/remote-D1 staging proof and localized result UI |
| `/document-builder/invitations/:token` | document collaboration invitation | retain; pre-accept denial and atomic one-winner/replay handling are fixed locally, not staged |
| `/document-builder/share/:token` | public document share | retain with tighter audit and expiration policy |
| `/document-builder/signed-share/:token` | signed-file share | retain; replace weak access-code design |
| `/legal/:slug?lang=ru\|uz` | app policy pages | migrate or alias to localized canonical legal URLs |

## Legacy redirects to preserve

Existing handlers cover:

```text
/main
/:locale/:accountType/main
/dashboard
/ai-lawyer
/action-plans
/cases
/documents
/consultations
/lawyers
/billing
/subscriptions
/history
/archive
/team
/profile
/settings
/settings/privacy
/settings/security
/notifications
/document-builder/**
/document-builder/library/**
/document-builder-test/**
```

`document-builder-test/**` currently redirects to `document-builder/**`. The word `test` must not return to a canonical URL, but the redirect must remain for inbound links.

Authenticated Chrome verification on 2026-07-28 confirmed that `/ru/individual/document-builder` renders and that `/uz/individual/document-builder` preserves the localized route and Uzbek shell. The builder module inside the UZ route remains Russian and is an implementation/i18n defect, not a route failure. A direct Chrome check of `/ru/individual/document-builder-test` was blocked by the client before response inspection, so it does not replace the existing HTTP/source evidence for the `308` redirect.

## Canonical workspace routing

### Profiles and workspaces

- `entrepreneur` and `lawyer` personal personas remain on
  `/:locale/:accountType/*`.
- Business workspaces use `/:locale/business/:workspaceId/*`.
- The canonical business layout re-authorizes active membership server-side,
  activates only an accessible workspace, and returns neutral not-found behavior
  for an inaccessible identifier.
- Reserved legacy roots such as `/business/dashboard` and
  `/business/document-builder/**` remain compatibility entries and redirect
  an authenticated user to the active workspace URL.

### Dashboard and AI lawyer

Implemented locally:

```text
/:locale/:accountType/dashboard
/:locale/:personalType/ai-lawyer
/:locale/:personalType/ai-lawyer/new
/:locale/:personalType/ai-lawyer/chat/:chatId
/:locale/business/:workspaceId/ai-lawyer
/:locale/business/:workspaceId/ai-lawyer/new
/:locale/business/:workspaceId/ai-lawyer/chat/:chatId
```

The `main` module migration is complete in source with a localized 308
compatibility redirect and rendered-Worker coverage. AI-lawyer target URLs now
have permanent, locale/account/workspace-preserving compatibility redirects to
the existing functional `ai-chat` surface. Chat detail accepts only a UUID and
maps it to `conversationId`; unknown paths and malformed IDs return neutral
404. These redirects pass local direct route tests but are not yet deployed to
staging or production.

### Cases

The list route exists as a module shell. Missing complete routes and object-specific behavior for:

```text
/:locale/:accountType/cases/new
/:locale/:accountType/cases/:caseId
/:locale/:accountType/cases/:caseId/chat
/:locale/:accountType/cases/:caseId/documents
/:locale/:accountType/cases/:caseId/analyses
/:locale/:accountType/cases/:caseId/plan
/:locale/:accountType/cases/:caseId/calendar
/:locale/:accountType/cases/:caseId/sources
/:locale/:accountType/cases/:caseId/participants
/:locale/:accountType/cases/:caseId/lawyer
/:locale/:accountType/cases/:caseId/activity
/:locale/:accountType/cases/:caseId/access
```

### Document analysis and calendar

Missing:

```text
/:locale/:accountType/document-analysis
/:locale/:accountType/document-analysis/new
/:locale/:accountType/document-analysis/:analysisId
/:locale/:accountType/document-analysis/compare
/:locale/:accountType/document-analysis/compare/:comparisonId
/:locale/:accountType/calendar
```

The existing `document-review` module is not the target async analysis flow.

### Lawyers

Missing:

```text
/:locale/lawyer/dashboard
/:locale/lawyer/requests
/:locale/lawyer/cases
/:locale/lawyer/clients
/:locale/lawyer/calendar
/:locale/lawyer/profile
/:locale/lawyer/reviews
/:locale/:accountType/lawyers
/:locale/:accountType/lawyers/:lawyerId
```

### Admin

All required `/admin` modules remain absent. The local 0020–0021 foundation
defines a separate expiring platform-staff/capability boundary and an internal
administrator grant/revoke service with fresh MFA and chained role-change
evidence. It does not recognize workspace roles, `account_type`, or platform
headers. No role is bootstrapped. Three narrow legal-source staff POST routes
now invoke review/publication services locally, but
`LEGAL_SOURCE_STAFF_API_ENABLED=false` makes them neutral `404` surfaces in
every checked-in environment. No general admin route, staff UI, Worker
deployment, job, or customer-content grant is active.

### Help and status

- localized article routes `/:locale/help/:articleSlug` are absent;
- `status.juro.uz` has no DNS record and no verified status application.

### Cinematic prototype

The production build route inventory contains no protected staging-only cinematic platform route. An adjacent Sites source checkout previously contained a public in-memory prototype, but that is not an acceptable staging surface: Sites deployments are production, the prototype was demo-only, and it did not use isolated staging data. The target `/:locale/...` prototype must be introduced behind a staging-only deployment or server-side feature flag and must never be inferred from a local static component.

## API inventory

The inventory below describes the reconciled local integration branch, not a claim that every route exists in deployed Sites v20. The deployed Sites source supplies the original OTP/logout/onboarding, platform MVP, and document-builder APIs. The following security routes or semantics are integration-branch-only and remain unstaged:

| Integration-branch addition | Deployed Sites v20 state |
|---|---|
| `POST /api/auth/verify-mfa` | absent |
| session/device listing and revoke APIs | absent |
| email-change APIs | absent |
| TOTP setup/confirm/backup-code APIs | absent |
| verified deletion-challenge semantics on the existing deletion route | prior weaker behavior remains deployed |
| document invitation pre-accept denial and atomic one-winner consume | insecure deployed behavior remains until approved release |
| active-workspace builder isolation | cross-workspace deployed behavior remains until approved release |
| platform staff assignment/role-event foundations | local service/schema only; no role-management route exists and no role is bootstrapped |
| legal-source claim/decision/publication POST routes | present in local build only; fail closed behind `LEGAL_SOURCE_STAFF_API_ENABLED=false`; staging schema `0027`–`0028` is present, while reviewer bootstrap, deployed route, and browser evidence are absent |

This separation is mandatory when reading the route blocks: source presence is not staging or production evidence.

### Authentication

```text
POST /api/auth/request-otp
POST /api/auth/verify-otp
POST /api/auth/verify-mfa
POST /api/auth/logout
POST /api/onboarding
```

### Platform

```text
GET,POST /api/platform/ai
POST /api/platform/ai/action-plan
GET /api/platform/ai/runs/:idempotencyKey
PATCH /api/platform/ai/facts/:factId
GET /api/platform/dashboard
GET,POST /api/platform/cases
PATCH /api/platform/cases/:caseId/steps/:stepId
GET,PATCH /api/platform/archive
GET /api/platform/history
GET,POST /api/platform/billing
GET,POST /api/platform/consultations
GET,POST /api/platform/document-comparisons
GET,PATCH,DELETE /api/platform/document-comparisons/:comparisonId
POST /api/platform/document-comparisons/:comparisonId/process
GET /api/platform/document-comparisons/:comparisonId/files/:version
GET /api/platform/document-comparisons/:comparisonId/export
GET,POST /api/platform/document-review
GET /api/platform/document-review/files/:fileId
POST /api/platform/legal-sources/reviews/:reviewId/claim
POST /api/platform/legal-sources/reviews/:reviewId/decision
POST /api/platform/legal-sources/reviews/:reviewId/publication
GET,POST /api/platform/monitoring
GET /api/platform/privacy/export
POST /api/platform/privacy/deletion-request
GET,PATCH /api/platform/profile
GET /api/platform/search
GET,DELETE /api/platform/security/sessions
DELETE /api/platform/security/sessions/:sessionId
GET,POST /api/platform/security/email-change
GET,DELETE /api/platform/security/mfa
POST /api/platform/security/mfa/setup
POST /api/platform/security/mfa/confirm
POST /api/platform/security/mfa/backup-codes
GET,POST /api/platform/team
DELETE /api/platform/team/invitations/:invitationId
POST /api/platform/team/invitations/accept
PATCH,DELETE /api/platform/team/members/:memberId
GET,POST /api/platform/workspaces
GET /api/platform/legal-sources/reviews
POST /api/platform/legal-sources/reviews/:reviewId/claim
POST /api/platform/legal-sources/reviews/:reviewId/decision
POST /api/platform/legal-sources/reviews/:reviewId/publication
```

`POST /api/platform/ai/action-plan` accepts only an assistant-message UUID,
locale, and an optional destination-case UUID. It rehydrates the saved
structured answer server-side. Without a destination it creates one new case;
with a destination it appends an immutable version and real tasks to a
tenant-owned non-archived case. The operation is CSRF-protected and replay-safe.

### Inactive staff surface

| Current URL | State | Access contract | Activation |
|---|---|---|---|
| `/:locale/admin/legal-sources/reviews` | Implemented locally; hidden | Exact RU/UZ locale, local session, `legal.sources.review`, active TOTP, MFA not older than 15 minutes | Exact `LEGAL_SOURCE_STAFF_API_ENABLED=true` only after reviewed staging setup |

The page and its four API operations return neutral `404` behavior while the
flag is false. It is not linked from customer navigation and is not enabled in
development, staging, or production configuration.

### Workspace creation API

`POST /api/platform/workspaces` retains the legacy authenticated switch contract and adds strict action-discriminated business creation. The create payload is bounded to 2 KiB, requires RU/UZ locale, a UUID idempotency request, and normalized full/short names. It is same-origin/CSRF protected, creates the workspace plus owner membership, active selection, and audit in one D1 batch, and returns the canonical `/:locale/business/:workspaceId/dashboard` target. Exact replay returns the same workspace; cross-user or mismatched replay returns a neutral conflict. This source route requires migration `0034` and is not deployed to staging yet.
### Document builder

```text
GET,PATCH /api/document-builder/bootstrap
POST /api/document-builder/ai-review
POST /api/document-builder/attachment-analysis
POST /api/document-builder/configured-drafts
GET,PUT /api/document-builder/configured-documents/:id
POST /api/document-builder/configured-documents/:id/generate
POST /api/document-builder/consultations
GET,POST /api/document-builder/contacts
PUT,DELETE /api/document-builder/contacts/:id
POST /api/document-builder/drafts
GET,POST /api/document-builder/documents
GET,PUT,PATCH,DELETE /api/document-builder/documents/:id
POST,PATCH,DELETE /api/document-builder/documents/:id/attachments
GET,POST /api/document-builder/documents/:id/collaboration
GET /api/document-builder/documents/:id/files/:fileId
POST /api/document-builder/documents/:id/generate
POST /api/document-builder/documents/:id/share
POST /api/document-builder/documents/:id/signed-file
GET,POST /api/document-builder/invitations/:token
GET,PATCH /api/document-builder/notifications
GET,PATCH,DELETE /api/document-builder/standalone-files/:id
GET,POST /api/document-builder/standalone-files/:id/share
POST /api/document-builder/standalone-signed-shares/:token/verify
GET /api/document-builder/standalone-signed-shares/:token/file
```

## Migration rules

### Canonical case creation — protected staging

| Current URL | Target/behavior | Evidence |
|---|---|---|
| `/:locale/:accountType/cases/new` | Authenticated RU/UZ personal-account create surface | `STAGING-0087-CANONICAL-CASE-CREATE-EVIDENCE.md` |
| `/:locale/business/:workspaceId/cases/new` | Authenticated create surface bound to the explicit business workspace | `STAGING-0087-CANONICAL-CASE-CREATE-EVIDENCE.md` |
| `/:locale/business/cases/new` | Resolves the active permitted workspace, then redirects to its canonical route | `STAGING-0087-CANONICAL-CASE-CREATE-EVIDENCE.md` |

`POST /api/platform/cases` is the real persistence boundary for all three routes. It resolves tenant context server-side and writes the case, plan, steps, immutable plan version and event in one D1 batch.

1. Add target routes before redirecting old ones.
2. Preserve locale, account type, workspace, object ID, and safe query state.
3. Do not place confidential content in URLs.
4. Use `308` for permanent method-preserving migrations unless a browser-flow exception is documented.
5. Return neutral not-found behavior when tenant access is absent.
6. Add route and security tests for every redirect.
7. Re-run `/ru/individual/document-builder` regression after every routing change.
8. Keep the staging prototype `noindex`, inaccessible from production navigation, and backed only by isolated staging resources.
