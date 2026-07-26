# JURO route inventory

Audit date: 2026-07-26  
Baseline revision: `86843ca`

This inventory distinguishes actual routes from target routes. An entry marked `missing` is not represented as working.

## Authentication and entry routes

| Current URL | Target URL | Action | Code | Reason / test result |
|---|---|---|---:|---|
| `/` | `/uz/auth/login`, `/uz/onboarding`, or `/uz/individual/dashboard` | replace conditional redirect | 307 | Current guest redirect is `/login`; target behavior is missing |
| `/login` | `/:locale/auth/login` | retain temporarily, redirect after migration | 308 | Existing production entry; localized target absent |
| `/register` | `/:locale/auth/login` | retain temporarily | 308 | Registration is part of OTP flow |
| `/:locale/login` | `/:locale/auth/login` | migrate redirect | 308 | Currently redirects back to unlocalized `/login` |
| `/:locale/register` | `/:locale/auth/login` | migrate redirect | 308 | Currently redirects back to unlocalized `/register` |
| `/onboarding` | `/:locale/onboarding` | migrate with state preservation | 308 | Current locale is query/profile based |
| `/main` | `/:locale/:accountType/dashboard` | migrate | 308 | Current post-login destination |

Root defaults to Russian when locale/profile input is absent; the target default is Uzbek.

## Current canonical platform routes

The dynamic platform router currently permits:

- locales: `ru`, `uz`;
- account types: `individual`, `business`;
- modules: `main`, `ai-chat`, `cases`, `document-review`, `monitoring`, `action-plan`, `consultations`, `history`, `archive`, `team`, `billing`, `security`, `help`, `profile`, `settings`.

Current route shells:

```text
/:locale/:accountType
/:locale/:accountType/:module
/:locale/:accountType/cases/:caseId
/:locale/:accountType/action-plan/:caseId
/:locale/:accountType/contacts
/:locale/:accountType/notifications
/:locale/:accountType/settings/privacy
/:locale/:accountType/settings/security
```

`cases/:caseId` and `action-plan/:caseId` currently ignore the object ID when rendering and load the general cases collection. They are not complete object-specific screens.

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
| `/invite/:token` | workspace invitation | retain; add atomic acceptance and localized result UI |
| `/document-builder/invitations/:token` | document collaboration invitation | retain; deny document access before acceptance |
| `/document-builder/share/:token` | public document share | retain with tighter audit and expiration policy |
| `/document-builder/signed-share/:token` | signed-file share | retain; replace weak access-code design |
| `/legal/:slug?lang=ru\|uz` | app policy pages | migrate or alias to localized canonical legal URLs |

## Legacy redirects to preserve

Existing handlers cover:

```text
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

## Target route gaps

### Profiles and workspaces

- `entrepreneur` and `lawyer` account types are absent.
- Business URLs do not contain `workspaceId`.
- Target: `/:locale/business/:workspaceId/...`.

### Dashboard and AI lawyer

Missing:

```text
/:locale/:accountType/dashboard
/:locale/:accountType/ai-lawyer/new
/:locale/:accountType/ai-lawyer/chat/:chatId
```

Current `main` and `ai-chat` modules require a migration and compatibility redirects.

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

All required `/admin` modules remain absent. The local 0020 foundation now
defines a separate expiring platform-staff/capability boundary that accepts
only a live JURO MFA session and does not recognize workspace roles,
`account_type`, or platform headers. No role is bootstrapped and no staff route,
mutation, content grant, or UI invokes that boundary yet.

### Help and status

- localized article routes `/:locale/help/:articleSlug` are absent;
- `status.juro.uz` returned `502` during audit.

## API inventory

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
```

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

1. Add target routes before redirecting old ones.
2. Preserve locale, account type, workspace, object ID, and safe query state.
3. Do not place confidential content in URLs.
4. Use `308` for permanent method-preserving migrations unless a browser-flow exception is documented.
5. Return neutral not-found behavior when tenant access is absent.
6. Add route and security tests for every redirect.
7. Re-run `/ru/individual/document-builder` regression after every routing change.
