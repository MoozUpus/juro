# JURO Domain & Route Inventory

Status: **live baseline, not a completion certificate**

Evidence cutoff: **2026-08-30 04:18 UZT (2026-08-29 23:18 UTC)**

Repository baseline: `origin/main` at merge commit `e7434b6f3cb1dd937ee16b8950a849a61195168f`

This inventory separates live production, protected staging, provider-owned Sites surfaces, code-only hostnames, and legacy DNS. It intentionally does not inspect or change the legislation database, legal-corpus contents, Lex.uz ingestion, Advice.uz ingestion, vectors, or legal-source records, following the owner's explicit scope exclusion.

## Evidence and classification rules

Sources used:

- Cloudflare DNS dashboard for the `juro.uz` zone: 22 active records, including seven Worker hostnames;
- Wrangler 4.115.0 deployment and version metadata for the platform, admin, staging, and legacy app router Workers;
- Sites project `appgprj_6a5e1b9547e88191bf759bbeae44d315`, live version 94;
- live HTTPS GETs with redirects enabled;
- `https://juro.uz/sitemap.xml` and rendered canonical/robots metadata;
- the current GitHub tree: 161 platform `page.tsx` route definitions and 227 API `route.ts` definitions.

Status meanings follow the execution brief: `VERIFIED`, `PARTIAL`, `BROKEN`, `MISSING`, `REDUNDANT`, `DEPRECATED`, `SECURITY RISK`, and `NOT APPLICABLE`.

An HTTP `200` after a redirect proves reachability and the public/auth boundary only. It does not prove an authenticated workflow or backend mutation.

## Host inventory

| Host / URL | Environment | Purpose, role, auth, language | Discovery source | Live HTTP / redirect evidence | Indexing and sensitivity | Issue / next action | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [juro.uz](https://juro.uz/) | production | Public website; anonymous; RU/UZ/EN | Cloudflare apex A records; Sites hosting metadata | `200`; `/`, `/ru`, `/uz`, `/en` all `200`; 78/78 sitemap URLs `200` with self-canonical metadata | `index, follow`; public | Provider hostname is still indexable on live v94; publish saved v95 after approval | `PARTIAL` |
| [www.juro.uz](https://www.juro.uz/) | production alias | Public website alias | Proxied CNAME | One redirect to `https://juro.uz/`, final `200` | Redirect-only; public | Keep as canonical alias | `VERIFIED` |
| [juro-legaltech.muzaffarbekmurodoff.chatgpt.site](https://juro-legaltech.muzaffarbekmurodoff.chatgpt.site/) | production provider surface | Sites service hostname; anonymous; RU/UZ/EN content clone | Sites deployment result | `200`; canonical points to `https://juro.uz/ru` | Live v94 returns `meta robots=index, follow` and no `X-Robots-Tag` | SEO duplicate boundary regressed after v86. Fix is validated and saved as Sites v95, not deployed | `SECURITY RISK` |
| [app.juro.uz](https://app.juro.uz/) | production | Client and business platform; auth required; RU/UZ | Cloudflare Worker v176 and `apps/platform/wrangler.jsonc` | One redirect to localized login, final `200`; public lawyer API returns only approved profiles | HTML and header both `noindex`; private data | Fresh status and directory contracts are operational; authenticated Client/Business flow remains incomplete | `PARTIAL` |
| [lawyer.juro.uz](https://lawyer.juro.uz/) | production | Lawyer entry and workspace; public entry plus protected routes; RU/UZ | Cloudflare Worker v176 and platform host router | Root `200`; isolated `/ru/lawyer/dashboard` continues to lawyer login with the exact lawyer dashboard `returnTo`; registration renders at 360 px without horizontal overflow | `noindex`; private/professional data | Anonymous persona and responsive registration boundaries are verified; authenticated Lawyer Chrome flow remains open | `PARTIAL` |
| [admin.juro.uz](https://admin.juro.uz/) | production | Staff/admin entry; strong auth required; RU | Cloudflare Worker domain; `juro` Worker service binding to `juro-admin` | Redirects to `app.juro.uz/ru/admin/console?reason=admin-session`, final `200` | `noindex`; highly sensitive | Authenticated staff/fresh-MFA Chrome QA is not proven in this audit | `PARTIAL` |
| [status.juro.uz](https://status.juro.uz/) | production | Public-safe operational status; anonymous | Cloudflare Worker domain; `STATUS_HOSTNAME` | Root and `/api/status` return `200` | `noindex`; public-safe telemetry | Overall status operational; retain no-sensitive-data boundary | `VERIFIED` |
| [staging.app.juro.uz](https://staging.app.juro.uz/) | staging | Protected platform; test accounts; RU/UZ | Cloudflare Worker domain and Access | Redirects to Cloudflare Access login, final login page `200` | Access-protected; private test data | Authenticated post-Access matrix remains incomplete | `PARTIAL` |
| [admin.staging.juro.uz](https://admin.staging.juro.uz/) | staging | Protected staff console | Cloudflare Worker domain and `apps/admin/wrangler.jsonc` | Redirects to Cloudflare Access login, final login page `200` | Access-protected; highly sensitive | Staging health is stale/degraded; staff browser QA remains incomplete | `PARTIAL` |
| [status.staging.juro.uz](https://status.staging.juro.uz/) | staging | Public-safe staging status | Cloudflare Worker domain; `STATUS_HOSTNAME` | Root and `/api/status` return `200` | `noindex`; public-safe telemetry | All eight components are degraded/stale; active cron delivery fails before persistence because staging D1 has reached its maximum size | `BROKEN` |
| `api.juro.uz` | code/docs legacy | Historical API hostname | Repository documentation only | DNS resolution fails; HTTP status `000` | Not indexable; intended API sensitivity unknown | Remove stale references or provision only with an approved route contract | `DEPRECATED` |
| `app.staging.juro.uz` | code-only mismatch | Alternate staging spelling used by public analytics host classification | Sites v94 source `PublicAnalyticsBridge.tsx` | DNS resolution fails; HTTP status `000` | Not indexable | Replace with canonical `staging.app.juro.uz` in source and test host classification | `BROKEN` |
| `lawyer.staging.juro.uz` | code-only | Lawyer staging hostname accepted by platform host router | `apps/platform/worker/index.ts` | DNS resolution fails; HTTP status `000` | Not indexable | Either provision behind Access or remove the accepted-but-unroutable hostname | `MISSING` |
| `staging.juro.uz` | historical docs | Old staging alias | Historical route documentation | DNS resolution fails; HTTP status `000` | Not indexable | Keep marked historical; remove from current-state prose | `DEPRECATED` |
| `local.juro.uz` | local-only | Development identity fixture, not a network service | Dev-login code and tests | DNS resolution fails as expected | Not applicable; synthetic/local data | Keep explicitly local-only | `NOT APPLICABLE` |
| `ftp.juro.uz` | legacy | DNS-only A record to `95.46.96.77` | Cloudflare DNS | HTTPS fails certificate hostname validation | Potentially exposes an origin; operational purpose unverified | Confirm owner/service, certificate, and whether record is needed before proxying or removing | `SECURITY RISK` |
| `mail.juro.uz` | email/legacy | DNS-only CNAME to apex; not a product web app | Cloudflare DNS | HTTPS `403` | Email infrastructure; not in sitemap | Confirm the DNS-only CNAME is intentional and does not expose an origin | `PARTIAL` |
| `send.juro.uz` | email | MX/TXT only for sending; no web service expected | Cloudflare DNS | No A/AAAA/CNAME; HTTP resolution fails as expected | Email infrastructure; not indexable | No web action; retain only while the mail provider uses it | `NOT APPLICABLE` |

Cloudflare DNS composition at the evidence cutoff: three A records, two CNAME records, four MX records, six TXT records, and seven Worker hostname records. The dashboard also reports: **“Your origin IP address is partially exposed.”** No DNS mutation was made because the affected legacy service ownership is not yet proven.

## Public sitemap route matrix

The sitemap contains 26 route shapes for each of RU, UZ, and EN: **78 URLs total**. Every URL below returned `200`, retained itself as canonical, returned `meta robots=index, follow`, and appeared in the sitemap. These results prove HTTP/SEO reachability; visual and mobile status remains `PARTIAL` until every state is manually checked in Chrome.

| Route shape | RU URL | UZ URL | EN URL | HTTP / canonical / sitemap | Result |
| --- | --- | --- | --- | --- | --- |
| home | [RU](https://juro.uz/ru) | [UZ](https://juro.uz/uz) | [EN](https://juro.uz/en) | `200`, self-canonical, present | `VERIFIED` |
| trust | [RU](https://juro.uz/ru/trust) | [UZ](https://juro.uz/uz/trust) | [EN](https://juro.uz/en/trust) | same | `VERIFIED` |
| video | [RU](https://juro.uz/ru/video) | [UZ](https://juro.uz/uz/video) | [EN](https://juro.uz/en/video) | same | `VERIFIED` |
| lawyers | [RU](https://juro.uz/ru/lawyers) | [UZ](https://juro.uz/uz/lawyers) | [EN](https://juro.uz/en/lawyers) | same | `VERIFIED` |
| legal centre | [RU](https://juro.uz/ru/legal) | [UZ](https://juro.uz/uz/legal) | [EN](https://juro.uz/en/legal) | same | `VERIFIED` |
| legal-information | [RU](https://juro.uz/ru/legal/legal-information) | [UZ](https://juro.uz/uz/legal/legal-information) | [EN](https://juro.uz/en/legal/legal-information) | same | `VERIFIED` |
| user-agreement | [RU](https://juro.uz/ru/legal/user-agreement) | [UZ](https://juro.uz/uz/legal/user-agreement) | [EN](https://juro.uz/en/legal/user-agreement) | same | `VERIFIED` |
| public-offer | [RU](https://juro.uz/ru/legal/public-offer) | [UZ](https://juro.uz/uz/legal/public-offer) | [EN](https://juro.uz/en/legal/public-offer) | same | `VERIFIED` |
| privacy-policy | [RU](https://juro.uz/ru/legal/privacy-policy) | [UZ](https://juro.uz/uz/legal/privacy-policy) | [EN](https://juro.uz/en/legal/privacy-policy) | same | `VERIFIED` |
| personal-data-processing-policy | [RU](https://juro.uz/ru/legal/personal-data-processing-policy) | [UZ](https://juro.uz/uz/legal/personal-data-processing-policy) | [EN](https://juro.uz/en/legal/personal-data-processing-policy) | same | `VERIFIED` |
| personal-data-consent | [RU](https://juro.uz/ru/legal/personal-data-consent) | [UZ](https://juro.uz/uz/legal/personal-data-consent) | [EN](https://juro.uz/en/legal/personal-data-consent) | same | `VERIFIED` |
| cross-border-ai-consent | [RU](https://juro.uz/ru/legal/cross-border-ai-consent) | [UZ](https://juro.uz/uz/legal/cross-border-ai-consent) | [EN](https://juro.uz/en/legal/cross-border-ai-consent) | same | `VERIFIED` |
| cookie-policy | [RU](https://juro.uz/ru/legal/cookie-policy) | [UZ](https://juro.uz/uz/legal/cookie-policy) | [EN](https://juro.uz/en/legal/cookie-policy) | same | `VERIFIED` |
| payments-subscriptions-refunds | [RU](https://juro.uz/ru/legal/payments-subscriptions-refunds) | [UZ](https://juro.uz/uz/legal/payments-subscriptions-refunds) | [EN](https://juro.uz/en/legal/payments-subscriptions-refunds) | same | `VERIFIED` |
| ai-use-policy | [RU](https://juro.uz/ru/legal/ai-use-policy) | [UZ](https://juro.uz/uz/legal/ai-use-policy) | [EN](https://juro.uz/en/legal/ai-use-policy) | same | `VERIFIED` |
| marketplace-client-rules | [RU](https://juro.uz/ru/legal/marketplace-client-rules) | [UZ](https://juro.uz/uz/legal/marketplace-client-rules) | [EN](https://juro.uz/en/legal/marketplace-client-rules) | same | `VERIFIED` |
| lawyer-platform-terms | [RU](https://juro.uz/ru/legal/lawyer-platform-terms) | [UZ](https://juro.uz/uz/legal/lawyer-platform-terms) | [EN](https://juro.uz/en/legal/lawyer-platform-terms) | same | `VERIFIED` |
| document-storage-rules | [RU](https://juro.uz/ru/legal/document-storage-rules) | [UZ](https://juro.uz/uz/legal/document-storage-rules) | [EN](https://juro.uz/en/legal/document-storage-rules) | same | `VERIFIED` |
| electronic-communications-consent | [RU](https://juro.uz/ru/legal/electronic-communications-consent) | [UZ](https://juro.uz/uz/legal/electronic-communications-consent) | [EN](https://juro.uz/en/legal/electronic-communications-consent) | same | `VERIFIED` |
| marketing-consent | [RU](https://juro.uz/ru/legal/marketing-consent) | [UZ](https://juro.uz/uz/legal/marketing-consent) | [EN](https://juro.uz/en/legal/marketing-consent) | same | `VERIFIED` |
| acceptable-use-policy | [RU](https://juro.uz/ru/legal/acceptable-use-policy) | [UZ](https://juro.uz/uz/legal/acceptable-use-policy) | [EN](https://juro.uz/en/legal/acceptable-use-policy) | same | `VERIFIED` |
| complaints-disputes | [RU](https://juro.uz/ru/legal/complaints-disputes) | [UZ](https://juro.uz/uz/legal/complaints-disputes) | [EN](https://juro.uz/en/legal/complaints-disputes) | same | `VERIFIED` |
| data-subject-request-form | [RU](https://juro.uz/ru/legal/data-subject-request-form) | [UZ](https://juro.uz/uz/legal/data-subject-request-form) | [EN](https://juro.uz/en/legal/data-subject-request-form) | same | `VERIFIED` |
| knowledge: contract-review-preparation | [RU](https://juro.uz/ru/knowledge/contract-review-preparation) | [UZ](https://juro.uz/uz/knowledge/contract-review-preparation) | [EN](https://juro.uz/en/knowledge/contract-review-preparation) | same | `VERIFIED` |
| knowledge: facts-for-action-plan | [RU](https://juro.uz/ru/knowledge/facts-for-action-plan) | [UZ](https://juro.uz/uz/knowledge/facts-for-action-plan) | [EN](https://juro.uz/en/knowledge/facts-for-action-plan) | same | `VERIFIED` |
| knowledge: when-lawyer-review-is-needed | [RU](https://juro.uz/ru/knowledge/when-lawyer-review-is-needed) | [UZ](https://juro.uz/uz/knowledge/when-lawyer-review-is-needed) | [EN](https://juro.uz/en/knowledge/when-lawyer-review-is-needed) | same | `VERIFIED` |

## Platform route families

The current tree defines 161 page files and 227 API route files. Dynamic parameters expand those definitions into more concrete URLs, so the file counts are not live-route counts.

| Family | Representative URL | Anonymous production result | Auth / role expectation | Coverage status |
| --- | --- | --- | --- | --- |
| Authentication | `https://app.juro.uz/ru/auth/login` | `200` | Anonymous entry | `VERIFIED` |
| Client dashboard | `https://app.juro.uz/ru/individual/dashboard` | Redirect to login with `returnTo`, final `200` | Client | `PARTIAL`: boundary verified, authenticated flow open |
| Business dashboard | `https://app.juro.uz/ru/business/dashboard` | Protected platform route | Business member/owner | `PARTIAL`: code and boundary only |
| Lawyer dashboard | `https://lawyer.juro.uz/ru/lawyer/dashboard` | Redirect to lawyer login with `returnTo`, final `200` | Lawyer | `PARTIAL`: boundary verified, authenticated flow open |
| Admin console | `https://admin.juro.uz/ru/admin/console` | Redirect to `app.juro.uz` admin console, final `200` | Staff + fresh MFA | `PARTIAL`: boundary verified, authenticated flow open |
| Status | `https://status.juro.uz/api/status` | `200` | Public-safe | `VERIFIED` |
| Guest AI | `https://app.juro.uz/api/guest/ai` | Method/body-specific API | Anonymous with rate/abuse controls | `PARTIAL`: not mutated in this audit |
| Document Builder | `/{locale}/{accountType}/document-builder/**` | Protected | Client/Business/Lawyer according to route | `PARTIAL`: local/CI evidence exists; production session replay open |
| Cases, plans, documents, consultations | `/{locale}/{accountType}/cases/**` and related API families | Protected | Tenant-scoped user or lawyer | `PARTIAL`: route definitions found; full role/data matrix open |
| Internal staging legal evaluation | `/api/platform/internal/staging/legal-evaluation` | Staging-only | Restricted internal | `NOT APPLICABLE` in this audit because legislation DB work was excluded |

## Confirmed gaps and priorities

1. **P1 — provider-host indexing:** live Sites v94 exposes indexable duplicate HTML. A tested v95 is saved but not deployed.
2. **P1 — staging observability:** the staging status endpoint is reachable but reports all eight components degraded from stale evidence. Active Cloudflare schedules were verified, and a live five-minute cron failed in `claimSchedule` with `D1_ERROR: Exceeded maximum DB size`; capacity remediation stays in the separately excluded legislation/corpus scope.
3. **P1 — legacy origin exposure:** Cloudflare flags partial origin exposure and `ftp.juro.uz` fails TLS hostname validation. Ownership must be confirmed before DNS changes.
4. **P2 — staging hostname drift:** `app.staging.juro.uz` and `lawyer.staging.juro.uz` are present in code paths but do not resolve; the active app hostname is `staging.app.juro.uz`.
5. **Open evidence gate:** authenticated Client, Business, Lawyer, Pending Lawyer, and Staff/Admin Chrome runs are still required before these families can be marked `VERIFIED`. Chrome was reconnected without real signed-in sessions; no session was fabricated. Anonymous Chrome evidence preserves the lawyer persona boundary and public-approved directory contract on Worker v176.
