# Domain and route inventory — 2026-08-25

This inventory separates production, protected staging and DNS-only names. A
source route is not treated as live merely because a page file exists.

## Production hosts

| Host | Runtime | Access/index boundary | Current evidence |
| --- | --- | --- | --- |
| `juro.uz` | Public Sites/website | Public and indexable only for useful canonical content | 78 sitemap URLs, all 2xx with exact canonical metadata; RU/UZ/EN |
| `www.juro.uz` | Cloudflare canonical redirect | Public | 308 to apex with path/query preservation in prior release evidence |
| `app.juro.uz` | Platform Worker `juro` | Authenticated Client/Business; all application HTML/API noindex | HTTPS login 200; HTTP POST 308; production smoke passed |
| `lawyer.juro.uz` | Platform Worker with server Lawyer-host routing | Professional persona, session + role/workspace checks | Dedicated RU login rendered; HTTP POST 308 |
| `admin.juro.uz` | `juro` custom domain delegated to isolated Admin Worker | Staff capability, source session and fresh MFA | Unauthenticated console produced protected 303 handoff; HTTP POST 308 |
| `status.juro.uz` | Restricted status-host branch of Platform Worker | Public status only, no application routes, noindex | API 200 and operational; HTTP POST 308 |

Mail/FTP records are DNS-only infrastructure and are not JURO web application
surfaces. They must not be added to application route or SEO claims.

## Protected staging and inactive names

`staging.app.juro.uz`, `admin.staging.juro.uz` and the other configured staging
surfaces are separated from production by staging resources and Cloudflare
Access where configured. Historical evidence lists `status.staging.juro.uz` as
a status surface. Repository-only or inactive names such as
`staging.juro.uz`, `app.staging.juro.uz`, `api.juro.uz` and `local.juro.uz` are
not production surfaces. They require a fresh DNS/control-plane read before any
future claim because hostname state can change.

## Route families

The current Platform source contains 164 `page.tsx` and 238 `route.ts` files
(402 source-declared route files; 194 handlers are under `/api`). Dynamic
locale/account/workspace parameters expand these patterns at runtime, and
internal implementation routes can have a separate canonical wrapper. The
production build and rendered suites, rather than this raw count, control
deployability.

| Family | Canonical shape | Boundary | Status |
| --- | --- | --- | --- |
| Auth/onboarding | `/{ru|uz}/auth/*`, `/onboarding` | Public entry; OTP/Turnstile/server session | VERIFIED for RU/UZ login render and automated auth boundaries |
| Client/individual | `/:locale/:accountType/{module}` | Session + active workspace + account type | Existing 20-route responsive evidence; current release smoke only rechecked login |
| Business | `/:locale/business/:workspaceId/{module}` | Session + explicit workspace membership | Automated tenant and creation/invitation tests pass |
| Lawyer | clean paths on `lawyer.juro.uz/:locale/{module}` | Server host routing + Lawyer role/workspace | Existing 20-route responsive evidence; current release rechecked dedicated login persona |
| Admin | `/:locale/admin/*` and isolated host | Capability + current MFA; feature flags hide disabled inboxes | Existing authenticated evidence; current release rechecked handoff only |
| Document Builder/share | localized builder plus public invitation/share URLs | Owner/collaborator server checks; signed shares noindex/no-store | Automated suites and new signed-share production fail-closed smoke pass |
| AI/voice/analysis | localized AI/analysis routes and private APIs | Tenant, quotas, provider circuit, verified sources | Automated and prior production evidence; no new paid user prompt sent in this release |
| Status | `/api/status`, `/status` on status host | Public, content-free health | VERIFIED operational |
| Legacy aliases | explicit redirect/rewrite allowlist only | Safe return paths; arbitrary aliases fail closed | Rendered suite passes; no blanket compatibility routing |

The public website sitemap currently lists 78 canonical RU/UZ/EN URLs across
home, Trust, video, lawyer catalogue/profiles, knowledge and legal content. A
fresh Sites-version-80 crawl followed every listed URL and found 78 final 2xx
responses, exact canonical metadata, zero unexpected redirects and zero
failures. `robots.txt` points to `https://juro.uz/sitemap.xml`.

For historical authenticated route-by-route browser evidence, see
`docs/investor-ready/QA_MATRIX.md`. This file deliberately distinguishes that
evidence from what was re-run on the current release.
