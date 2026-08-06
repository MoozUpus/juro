# Route inventory — 2026-08-07

This is a security-oriented inventory of the current authenticated platform
and public website routes. It records what exists, rather than treating a
desirable URL as implemented.

| Area | Canonical route | Access boundary | Status |
|---|---|---|---|
| Dashboard | `/:locale/:accountType/dashboard` | Session + tenant membership | staging smoke passed |
| AI lawyer | `/:locale/:accountType/ai-chat`, `/ai-lawyer/new`, `/ai-lawyer/chat/:chatId` | Session + tenant membership | source-backed staging smoke passed |
| Voice | `/:locale/:accountType/ai-lawyer/voice` | Session + tenant membership | feature available; avatar remains explicitly disabled |
| Builder | `/:locale/:accountType/document-builder` | Session + tenant membership | staging smoke passed |
| Review / comparison | `/:locale/:accountType/document-review` | Session + tenant membership | staging smoke passed |
| Cases / plan / calendar | `/:locale/:accountType/cases`, `/action-plan`, `/calendar` | Session + tenant membership | targeted staging smoke passed |
| Lawyer directory | `/:locale/:accountType/lawyers` | Session + tenant membership; only approved profiles in directory | deploy pending security correction |
| Professional lawyer profile | `/:locale/lawyer/profile` and `/api/platform/lawyer-profile` | Owner-only session boundary | lifecycle staged |
| Admin | `/:locale/admin/*` | Staff role + fresh MFA on write/review actions | not a separate deployment yet |
| Website landing | `https://juro.uz/` | public | existing landing |
| Website legal pages | `https://juro.uz/:locale/:legalSlug` | public | existing routes |
| Website marketplace | `https://juro.uz/:locale/lawyers` | public, approved profiles only | not implemented |

Legacy routes are retained only where the rendered-route suite asserts their
redirect or compatibility contract. No `document-builder-test` URL is revived.
