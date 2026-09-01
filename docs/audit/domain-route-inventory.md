# JURO Domain & Route Inventory

Status: **live baseline, not a completion certificate**

Evidence cutoff: **2026-09-01 09:58 UZT (2026-09-01 04:58 UTC)**

Repository baseline: production commit `7935d560b29705f1886fa34f7bb61eb1b3af2c11`; live Worker v99 and public Sites v95 were verified independently after deployment

This inventory separates live production, protected staging, provider-owned Sites surfaces, code-only hostnames, and legacy DNS. It intentionally does not inspect or change the legislation database, legal-corpus contents, Lex.uz ingestion, Advice.uz ingestion, vectors, or legal-source records, following the owner's explicit scope exclusion.

## Evidence and classification rules

Sources used:

- Cloudflare DNS dashboard for the `juro.uz` zone: 22 active records, including seven Worker hostnames;
- Wrangler 4.115.0 deployment and version metadata for the platform, admin, staging, and legacy app router Workers;
- Wrangler 4.127.1 and the Cloudflare zone/Worker-route API for current read-only control-plane confirmation;
- public DNS, Certificate Transparency, RIPE RDAP, certificate inspection, and narrowly targeted service-port checks for legacy host verification;
- Sites project `appgprj_6a5e1b9547e88191bf759bbeae44d315`, live version 95;
- live HTTPS GETs with redirects enabled;
- `https://juro.uz/sitemap.xml` and rendered canonical/robots metadata;
- the current GitHub tree: 161 platform `page.tsx` route definitions and 227 API `route.ts` definitions.

Status meanings follow the execution brief: `VERIFIED`, `PARTIAL`, `BROKEN`, `MISSING`, `REDUNDANT`, `DEPRECATED`, `SECURITY RISK`, and `NOT APPLICABLE`.

An HTTP `200` after a redirect proves reachability and the public/auth boundary only. It does not prove an authenticated workflow or backend mutation.

## Host inventory

| Host / URL | Environment | Purpose, role, auth, language | Discovery source | Live HTTP / redirect evidence | Indexing and sensitivity | Issue / next action | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [juro.uz](https://juro.uz/) | production | Public website; anonymous; RU/UZ/EN | Cloudflare apex A records; Sites hosting metadata | `200`; `/`, `/ru`, `/uz`, `/en` all `200`; 78/78 sitemap URLs `200` after v95 with self-canonical metadata | `index, follow`; public | v95 preserves the custom-domain indexing contract; saved v94 is the rollback | `VERIFIED` |
| [www.juro.uz](https://www.juro.uz/) | production alias | Public website alias | Proxied CNAME | One redirect to `https://juro.uz/`, final `200` | Redirect-only; public | Keep as canonical alias | `VERIFIED` |
| [juro-legaltech.muzaffarbekmurodoff.chatgpt.site](https://juro-legaltech.muzaffarbekmurodoff.chatgpt.site/) | production provider surface | Sites service hostname; anonymous; RU/UZ/EN content clone | Sites deployment result | `200`; canonical points to `https://juro.uz/ru` | v95 returns `X-Robots-Tag: noindex, nofollow, noarchive` on `/`, RU/UZ/EN, `robots.txt`, and `sitemap.xml` | Duplicate-host indexing boundary restored while `juro.uz` remains indexable | `VERIFIED` |
| [app.juro.uz](https://app.juro.uz/) | production | Client and business platform; auth required; RU/UZ | Cloudflare Worker v99 and `apps/platform/wrangler.jsonc` | One redirect to localized login, final `200`; public lawyer API returns only approved profiles; oversized public JSON returns bounded `413` | HTML and header both `noindex`; private data | Fresh status, directory, and public API body-boundary contracts are operational; authenticated Client/Business flow remains incomplete | `PARTIAL` |
| [lawyer.juro.uz](https://lawyer.juro.uz/) | production | Lawyer entry and workspace; public entry plus protected routes; RU/UZ | Cloudflare Worker v99 and platform host router | Root `200`; isolated `/ru/lawyer/dashboard` continues to lawyer login with the exact lawyer dashboard `returnTo`; registration renders at 360 px without horizontal overflow | `noindex`; private/professional data | Production keeps the dedicated lawyer persona; authenticated Lawyer Chrome flow remains open | `PARTIAL` |
| [admin.juro.uz](https://admin.juro.uz/) | production | Staff/admin entry; strong auth required; RU | Cloudflare Worker domain; `juro` Worker service binding to `juro-admin` | Redirects to `app.juro.uz/ru/admin/console?reason=admin-session`, final `200` | `noindex`; highly sensitive | Authenticated staff/fresh-MFA Chrome QA is not proven in this audit | `PARTIAL` |
| [status.juro.uz](https://status.juro.uz/) | production | Public-safe operational status; anonymous | Cloudflare Worker v99 domain; `STATUS_HOSTNAME` | Root and `/api/status` return `200`; the checked v99 snapshot reports all eight components operational with no active incident | `noindex`; public-safe telemetry | Five consecutive OpenAI, Anthropic, and routed document-analysis records are operational; retain freshness monitoring and do not equate provider health with authenticated Legal Answer quality | `VERIFIED` for checked health snapshot |
| [staging.app.juro.uz](https://staging.app.juro.uz/) | staging | Protected platform; test accounts; RU/UZ | Cloudflare Worker domain and Access | `/ru/lawyer/auth` returns `302` to Cloudflare Access with `no-store` | Access-protected; private test data | Main now uses this shared canonical staging origin; authenticated post-Access runtime QA and a safe staging deployment remain incomplete | `PARTIAL` |
| [admin.staging.juro.uz](https://admin.staging.juro.uz/) | staging | Protected staff console | Cloudflare Worker domain and `apps/admin/wrangler.jsonc` | Redirects to Cloudflare Access login, final login page `200` | Access-protected; highly sensitive | Staging health is stale/degraded; staff browser QA remains incomplete | `PARTIAL` |
| [status.staging.juro.uz](https://status.staging.juro.uz/) | staging | Public-safe staging status | Cloudflare Worker domain; `STATUS_HOSTNAME` | Root and `/api/status` return `200` | `noindex`; public-safe telemetry | All eight components are degraded/stale; active cron delivery fails before persistence because staging D1 has reached its maximum size | `BROKEN` |
| `api.juro.uz` | code/docs legacy | Historical API hostname | Repository documentation only | DNS resolution fails; HTTP status `000` | Not indexable; intended API sensitivity unknown | Remove stale references or provision only with an approved route contract | `DEPRECATED` |
| `app.staging.juro.uz` | rejected legacy alias | Non-canonical staging spelling retained only in negative regression tests | PR #80 / `lawyer-entry-routing.test.ts` | DNS resolution fails; current platform routing returns no lawyer origin for this host | Not indexable | Keep rejected; use only `staging.app.juro.uz` | `DEPRECATED` |
| `lawyer.staging.juro.uz` | rejected legacy alias | Former accepted-but-unroutable lawyer staging hostname | PR #80 / Worker and auth host routing | DNS resolution fails; current platform routing returns no lawyer origin for this host | Not indexable | Keep rejected; shared staging uses `staging.app.juro.uz/{locale}/lawyer/**` behind Access | `DEPRECATED` |
| `staging.juro.uz` | historical docs | Old staging alias | Historical route documentation | DNS resolution fails; HTTP status `000` | Not indexable | Keep marked historical; remove from current-state prose | `DEPRECATED` |
| `local.juro.uz` | local-only | Development identity fixture, not a network service | Dev-login code and tests | DNS resolution fails as expected | Not applicable; synthetic/local data | Keep explicitly local-only | `NOT APPLICABLE` |
| `ftp.juro.uz` | legacy/misnamed origin | DNS-only A record to `95.46.96.77` | Cloudflare DNS and public DNS | HTTP `200` serves the default AlmaLinux/nginx test page; HTTPS presents a certificate only for `dns1.webspace.uz`; ports 80, 443, and 587 answer while FTP port 21 does not | Direct, unproxied origin and SMTP submission exposure; ownership and active clients unverified | Treat as P1: identify the owner and mail dependency, record the recovery configuration, then repair or retire through a separate reversible change | `SECURITY RISK` |
| `mail.juro.uz` | email/legacy | DNS-only CNAME to apex; not a product web app | Cloudflare DNS | HTTPS `403` | Email infrastructure; not in sitemap | Confirm the DNS-only CNAME is intentional and does not expose an origin | `PARTIAL` |
| `send.juro.uz` | email | MX/TXT only for sending; no web service expected | Cloudflare DNS | No A/AAAA/CNAME; HTTP resolution fails as expected | Email infrastructure; not indexable | No web action; retain only while the mail provider uses it | `NOT APPLICABLE` |

Cloudflare DNS composition at the evidence cutoff: three A records, two CNAME records, four MX records, six TXT records, and seven Worker hostname records. The dashboard also reports: **“Your origin IP address is partially exposed.”** No DNS mutation was made because the affected legacy service ownership is not yet proven.

### Control-plane permission and legacy-origin verification

The current Cloudflare OAuth session can read the active `juro.uz` zone and confirms Worker routes `juro.uz/*` and `www.juro.uz/*` target `juro-legaltech`. The same session receives HTTP `403` for DNS-record, SSL-setting, Page Rule, and Ruleset APIs because those scopes are not granted. The 22-record composition above therefore remains grounded in the earlier authenticated DNS-dashboard snapshot, while current route ownership is independently confirmed through the readable Worker-route endpoint.

Certificate Transparency and public DNS confirm current certificates or active records for `admin.juro.uz`, `admin.staging.juro.uz`, `app.juro.uz`, `juro.uz`, `lawyer.juro.uz`, `staging.app.juro.uz`, `status.juro.uz`, and `status.staging.juro.uz`. The rejected aliases `api.juro.uz`, `app.staging.juro.uz`, `lawyer.staging.juro.uz`, and `staging.juro.uz` remain unresolved.

The legacy address `95.46.96.77` is registered in RIPE as `ARSENAL-D-NET` in Uzbekistan. A narrow check found ports 80, 443, and 587 open; ports 21, 22, 25, 465, and 993 were closed. `http://ftp.juro.uz/` serves the default “Test Page for the HTTP Server on AlmaLinux”; HTTPS serves the same page with a hostname-mismatched Let's Encrypt certificate whose only SAN is `dns1.webspace.uz`. SMTP STARTTLS on 587 presents a `webspace.uz` wildcard certificate. This proves the record is not an FTP endpoint and exposes a generic web/mail origin, but it does not prove who owns it or whether a mail client still depends on it. No DNS, server, certificate, or mail mutation was made.

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

1. **Resolved — provider-host indexing:** Sites v95 is live. The provider hostname returns `X-Robots-Tag: noindex, nofollow, noarchive`, while `juro.uz` retains `index, follow`; 78/78 sitemap URLs and 149/149 discoverable JURO-zone links return `200`.
2. **P1 — staging observability:** the staging status endpoint is reachable but reports all eight components degraded from stale evidence. Active Cloudflare schedules were verified, and a live five-minute cron failed in `claimSchedule` with `D1_ERROR: Exceeded maximum DB size`; capacity remediation stays in the separately excluded legislation/corpus scope.
3. **P1 — legacy origin exposure:** Cloudflare flags partial origin exposure; `ftp.juro.uz` points directly to `95.46.96.77`, serves a default AlmaLinux/nginx page, presents certificates for other Webspace hostnames, and accepts SMTP submission while FTP itself is closed. Establish owner and mail-client dependency, preserve the exact recovery configuration, then repair or retire it through a separate reversible change.
4. **Resolved code-only drift:** PR #80 removed the accepted `app.staging.juro.uz` and `lawyer.staging.juro.uz` aliases from platform auth and Worker routing. The canonical staging host remains `staging.app.juro.uz` behind Cloudflare Access; the staging Worker itself was not redeployed in this increment.
5. **Open evidence gate:** authenticated Client, Business, Lawyer, Pending Lawyer, and Staff/Admin Chrome runs are still required before these families can be marked `VERIFIED`. No session was fabricated. Anonymous evidence preserves the lawyer persona and public/private boundaries on Worker v99.
6. **Resolved — production provider availability:** after the owner funded both accounts, five consecutive production probes for OpenAI and Anthropic succeeded, and five consecutive routed document-analysis probes succeeded. This closes the provider-availability P1 only; authenticated RU/UZ Legal Answer quality remains open.
