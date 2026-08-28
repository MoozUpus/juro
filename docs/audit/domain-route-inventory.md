# Domain and route inventory — 2026-08-28

Status: **PARTIAL**. The production and staging web surfaces, Worker custom
domains, zone Worker routes, public sitemap and source-declared route families
were refreshed on 2026-08-27. The current Wrangler OAuth session can read the
zone, Worker domains and Worker routes, but `GET /zones/{zone}/dns_records`
returns HTTP 403. Consequently this is a complete inventory of the web
surfaces visible through those sources, not a claim that every DNS record type
has been enumerated.

Evidence was collected read-only from Cloudflare control-plane APIs, recursive
DNS, unauthenticated HTTP probes, the v86 sitemap and the current Platform
runtime source at `93bb6abf48478af8de5bb86bbc38df3e6dcdbe15`. A source file is not treated as a
live route merely because it exists.

## Domain and URL matrix

| Full URL | Environment and purpose | Role / auth / language | Discovery source | HTTP and redirect | Canonical, index and sitemap | Function / design / mobile | Data sensitivity / criticality | Problem and required action | Final status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `https://juro.uz/` and `/{ru|uz|en}` | Production public website, Sites v86 via `juro-legaltech` | Public; RU, UZ, EN | Zone Worker route, live HTML, sitemap | `200`; apex resolves to the localized public experience | Locale pages self-canonical, `index, follow`; 78 sitemap URLs | Public release smoke, responsive evidence and production Lighthouse recorded | Public / P0 entrypoint | Keep v85 as rollback; repeat crawl after every release | **VERIFIED** |
| `https://www.juro.uz/*` | Production canonical alias | Public; all public languages | Zone Worker route and HTTP | `308` to the apex; root verified live | Destination owns canonical and sitemap | Redirect only | Public / P1 | Preserve path and query in release smoke | **VERIFIED** |
| `https://app.juro.uz/` and `/:locale/:accountType/*` | Production Client/Business application on Worker `juro` | Session plus tenant/workspace checks; RU and UZ | Worker domain API, source, HTTP, authenticated Chrome | Root `307` to `/uz/auth/login`; an existing Individual session retained authentication across 21 Client route visits; a 2026-08-28 replay of the original misplaced Lawyer-host Client URL reached the exact authenticated app path; RU and UZ Business dashboard attempts in that Individual session returned to the matching localized Individual dashboard | Private documents declare `noindex, nofollow, nocache`; not in sitemap | 21/21 Individual routes passed desktop and `390×844` read-only loops. The latest corrected-route and cross-account replays retained one H1, one main landmark, loaded fonts, private noindex, no Business-only signal, overflow, role alert or warning/error log | Private legal/user data / P0 | Authenticated Business functionality, request-level network coverage and mutable workflow replay remain open | **PARTIAL** |
| `https://lawyer.juro.uz/` and `/:locale/lawyer/*` | Production professional portal on Worker `juro` 158 | Lawyer persona, role and workspace; RU and UZ | Worker domain API, source, HTTP, Chrome | Root `200`; dashboard reaches the dedicated Lawyer re-authentication page; anonymous workspace API returns `401`; a refreshed original Client-link tab followed the non-cacheable `307` to the exact `app.juro.uz` path; writes and unknown paths return `404` | Noindex/noarchive; not in sitemap | Dedicated host persona and cross-host boundary verified. The production re-authentication page rendered one H1/main with no overflow or Client-data disclosure; the exact production CSS asset contains the Lawyer 44 px workflow contract. Signed-in route rendering still awaits a Lawyer session | Private professional/client data / P0 | Sign in as Lawyer, then replay dashboard, case and document flows | **PARTIAL** |
| `https://admin.juro.uz/` and `/:locale/admin/*` | Production admin entry on Worker `juro` 158, delegated internally to `juro-admin` | Staff capability and fresh MFA | Worker domain API, service binding, HTTP, Chrome | Console and anonymous costs request return private/no-store `303` handoffs to the protected app Admin surface | Noindex/noarchive; not in sitemap | Isolated Chrome verified one H1/main, no overflow, no console warnings/errors and no staff-data disclosure; production CSS contains the non-corpus Admin 44 px target contract | Highly privileged / P0 | Establish a fresh protected Admin session before read-only and authorised write scenarios; legal-source controls were excluded from this iteration | **PARTIAL** |
| `https://status.juro.uz/`, `/{ru|uz}/status` and `/api/status` | Production public-safe status branch on Worker `juro` 158 | Public, no session; bare host UZ, explicit RU/UZ | Worker domain API, source, HTTP, Chrome | Page, icons and API `200`; non-status application route `404`; both API hosts reported 8/8 operational at `2026-08-28T02:53:33.522Z` | Noindex/noarchive; not in sitemap | Both locales have matching document/content language, localized title/H1, loaded fonts, same-origin icons and no overflow | Low-content operational metadata / P1 | Worker 157 is the immediate application rollback | **VERIFIED** |
| `https://staging.app.juro.uz/` | Protected staging Platform Worker `juro-platform-staging` | Owner Access before application auth | Worker domain API, recursive DNS, HTTP | `302` to Cloudflare Access before content | Access response; must remain non-indexable and absent from sitemap | Deny-before-auth verified; signed-in staging journey not repeated | Staging private data / P0 | Complete an authenticated staging crawl without bypassing Access | **PARTIAL** |
| `https://admin.staging.juro.uz/` | Protected staging Admin Worker `juro-admin-staging` | Owner Access, then staff/MFA | Worker domain API, recursive DNS, HTTP | `302` to Cloudflare Access before content | Access response; absent from sitemap | Deny-before-auth verified | Staging privileged data / P0 | Complete authenticated Admin staging smoke | **PARTIAL** |
| `https://status.staging.juro.uz/` and `/api/status` | Staging public-safe status branch on `juro-platform-staging` | Public, no session | Worker domain API, recursive DNS, source, HTTP | Page and API `200`; sampled application route `404` | Noindex/noarchive; absent from sitemap | Route fence verified | Low-content staging health / P2 | Keep the response content-free; repeat route-fence tests after staging deploys | **VERIFIED** |
| `https://juro-legaltech.muzaffarbekmurodoff.chatgpt.site/` | Provider-generated direct Sites hostname | Public | Sites v86 release record and HTTP | `200` | Locale HTML canonicalizes to `juro.uz`; response adds `X-Robots-Tag: noindex, nofollow, noarchive`; not in sitemap | Same public UI as the apex | Public duplicate surface / P2 | Retain the host-aware noindex header in every release | **VERIFIED** |

## Inactive or source-only names

| Name | Current evidence | Required treatment | Status |
| --- | --- | --- | --- |
| `api.juro.uz` | No A answer; not present in Worker domains or routes | Do not publish or document as live | **MISSING** |
| `app.staging.juro.uz` | No A answer; not present in Worker domains or routes | Historical/source-only name | **MISSING** |
| `lawyer.staging.juro.uz` | No A answer; not present in Worker domains or routes | Historical/source-only name | **MISSING** |
| `staging.juro.uz` | No address answer; not present in Worker domains or routes | Do not confuse with `staging.app.juro.uz` | **MISSING** |
| `local.juro.uz` | No public address answer | Local-development name only | **NOT APPLICABLE** |

Mail, FTP and verification records are DNS infrastructure, not JURO web
application surfaces. They cannot be refreshed exhaustively until the active
credential has Zone DNS Read access.

## Cloudflare routing topology

The active `juro.uz` zone is full, active and not paused.

| Routing source | Pattern or hostname | Target |
| --- | --- | --- |
| Zone Worker route | `juro.uz/*` | `juro-legaltech` |
| Zone Worker route | `www.juro.uz/*` | `juro-legaltech` |
| Worker custom domain | `app.juro.uz` | `juro` |
| Worker custom domain | `lawyer.juro.uz` | `juro` |
| Worker custom domain | `admin.juro.uz` | `juro` |
| Worker custom domain | `status.juro.uz` | `juro` |
| Worker custom domain | `staging.app.juro.uz` | `juro-platform-staging` |
| Worker custom domain | `admin.staging.juro.uz` | `juro-admin-staging` |
| Worker custom domain | `status.staging.juro.uz` | `juro-platform-staging` |

## Route-family inventory

The current Platform source declares 164 `page.tsx` files and 239 `route.ts`
handlers: 195 under `/api` and 44 non-API compatibility/RSC handlers. Dynamic
locale, account, workspace and ID segments expand those patterns at runtime.
The counts describe source coverage; deployment builds, server authorization
and live probes decide whether a route is usable.

| Family | Canonical shape | Server boundary | Current evidence | Status |
| --- | --- | --- | --- | --- |
| Public marketing | `juro.uz/{ru|uz|en}/*` | Public content only | v86 sitemap contains 78 URLs (26 per locale); 78/78 production responses passed the release crawl | **VERIFIED** |
| Auth and onboarding | `/:locale/auth/*`, `/register`, `/onboarding` | OTP, Turnstile, server session | Root/login redirects and automated auth tests pass | **PARTIAL** — full live OTP journey not repeated here |
| Client and Business | `/:locale/:accountType/*` and workspace-scoped modules | Session, active workspace, account type and tenant membership | 21/21 current Individual routes passed desktop and `390×844` read-only Chrome loops; private cases API returns `401` anonymously | **PARTIAL** — Business, request-level network coverage and mutable workflows remain open |
| AI, document and case workflows | Localized UI plus `/api/platform/*` | Tenant, quotas, feature gates and provider controls | Source/build/CI coverage and prior production evidence; no paid prompt or private upload sent during this inventory | **PARTIAL** |
| Lawyer | Clean paths on `lawyer.juro.uz` | Server host routing plus Lawyer role/workspace | Dedicated re-authentication page, account type, return path, `401` API fence and production Lawyer 44 px CSS contract verified | **PARTIAL** — signed-in rendered route loop awaits a Lawyer session |
| Admin | `/:locale/admin/*` plus isolated Admin Worker | Staff capability and fresh MFA | Protected handoff, anonymous costs fence and production non-corpus 44 px CSS contract verified | **PARTIAL** — authenticated replay awaits fresh Admin access |
| Status | `/`, `/status`, `/api/status` on status hosts | Explicit hostname route fence | Status returns `200`; sampled application path returns `404`; production fonts load from normalized URLs | **VERIFIED** |
| Legacy aliases | Explicit redirect/rewrite allowlist | Safe return paths; arbitrary aliases fail closed | Rendered suite passes in CI | **VERIFIED** at source/build level |

## Cross-domain navigation

The production RU homepage currently links only to `app.juro.uz` for login,
registration, AI Lawyer, cases and document-analysis entrypoints. Sampled
private deep links preserve the requested route through authentication. Theme
cookie precedence and bidirectional persistence have separate production
evidence in `docs/investor-ready/QA_MATRIX.md`; they were not re-executed as
part of this read-only inventory.

## Remaining evidence gates

1. Grant the active audit credential Zone DNS Read, then export and classify
   every A, AAAA, CNAME, TXT, MX and other record.
2. Complete authenticated Client, Business, Lawyer and Admin route-by-route
   browser evidence on the exact deployed Platform version.
4. Treat the inventory as **PARTIAL** until those gates have direct evidence.
