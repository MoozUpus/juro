# Production readiness — 2026-08-27

This is an evidence record for the signed-share/HTTPS baseline and the
privacy-safe analytics/effective-cost follow-up. It does not claim that every
item in the wider ecosystem audit is complete.

## Release identity

| Item | Verified value |
| --- | --- |
| Branch | `codex/investor-ready-ecosystem` |
| Latest public website runtime commit | `286c8cec55695173b0ef623c31bee692f2349d68` |
| Draft PRs | Platform `#64`; public website `#67` |
| GitHub Actions | Client-link correction CI `33071334033`, v86 source CI `33067543449` and plaintext-cleanup evidence CI `33076094186`; Website and Platform successful in all three |
| Production Worker | `juro` version `28dd4ac8-1ae2-4582-9697-8aa28e109cb5` (version 148), deployment `76e6f966-d069-4565-a7f9-9b2103a8ea47`, 100% traffic |
| Immediate application rollback | `ed0253e1-1c35-416e-9f2a-5bd8352c1936` (version 147) |
| Public Sites release | Version 86, deployment `appgdep_6a9027658100819189e6e6bc1a20bf1d`; rollback version 85 |
| Production D1 | `juro-production`, binding `DB` |
| Applied migration | `0159_signed_share_verification_guard.sql`; no migration remains pending |
| Effective price configuration | Four append-only rows effective `2026-08-25T07:44:49.444Z` |

## 2026-08-27 Lawyer-host Client-link correction

Worker 148 fixes the exact production defect where
`lawyer.juro.uz/ru/individual/dashboard` returned a plaintext `404`. Known
Client account paths now return a non-cacheable `307` to the fixed
`app.juro.uz` origin for `GET` and `HEAD`; query strings are retained. Writes
are never forwarded across hosts, and unknown Lawyer paths still fail closed
with `404`. The exact commit passed local tests, the three-environment
Cloudflare matrix and GitHub CI `33071334033` before deployment. Post-deploy
HTTP smoke passed and status remained operational 8/8.

A fresh production Chrome reload of the original failing URL followed the live
redirect to `https://app.juro.uz/ru/individual/dashboard` and rendered the
authenticated Client dashboard at 1920×945. It had one localized H1, loaded
fonts, the private `noindex, nofollow, nocache` boundary, zero horizontal
overflow, no role alert and an empty warning/error log. The same Chrome session
reached the dedicated Lawyer re-authentication page without Client-data
disclosure and the Admin fresh-session handoff; their signed-in route loops
remain open until the corresponding protected sessions are established.

## 2026-08-27 Platform privacy correction

Production HTML had exposed absolute Windows build-machine paths in generated
vinext font URLs. Commit `6503667cbf18f249656b29749040cda8b200fd47`
adds a post-transform URL normalizer plus an artifact regression gate.

- Focused tests: 3/3 passed.
- Production build, dry-run, artifact validation, performance budgets,
  type-check and lint passed.
- GitHub CI `33063995387`: Website and Platform successful.
- Built artifact: zero `C:/Users/` and zero `.vinext/fonts` matches.
- Post-deploy production HTML: zero matches; 12 normalized
  `/assets/_vinext_fonts/...` URLs.
- Three sampled normalized WOFF2 assets returned `200 font/woff2`.
- Chrome: Status and authenticated Client dashboard completed font loading,
  rendered their primary headings, contained no absolute build path and
  produced no warning/error log entries.
- Production route smoke retained Client `307`, private API `401`, Lawyer
  `200/307`, Admin `303`, Status `200` and Status application-route `404`.
- `/api/status` reported 8/8 operational and zero active incidents at
  `2026-08-27T11:02:55Z`.
- Wrangler error-only tail produced no event during the post-deploy smoke
  window.

This proves the font-path correction and sampled host boundaries on Worker
147. It does not prove every authenticated write path or the whole ecosystem
Definition of Done.

## Database recovery gate

The pre-migration full export was 155,507,956 bytes with SHA-256
`11a00bda41475ed8fec0030a7cac9bc65d46d5ca9f92219327ebcd14b19d522f`.
Its isolated restore returned `quickCheck=ok`, zero foreign-key violations, 157
migrations, 281 tables, 607 indexes and 378 triggers.

The post-migration full export was 155,660,095 bytes with SHA-256
`2179a00dd03c3173cc3bd7059ed0c9302c458d60f917f59c073bfececb217cec`.
Its isolated restore returned `quickCheck=ok`, zero foreign-key violations, 158
migrations, 282 tables, 608 indexes and 380 triggers.

Both exports and manifests were uploaded to the private
`juro-production-backups` bucket under
`d1/juro-production/2026-08-25/`. Independent downloads matched source byte
lengths and SHA-256 values. The exact local release directory contained ten
temporary SQL, SQLite, manifest and readback files (980,681,954 bytes); it was
removed after the private round trip. Private R2 is the recovery source.

## Effective AI price configuration

The production price table was empty before this configuration. One atomic
insert created exactly four immutable price versions effective
`2026-08-25T07:44:49.444Z`:

| Provider/model/operation | Input / cached input / output microusd per million tokens | Official source |
| --- | --- | --- |
| OpenAI `gpt-5.6-sol` / `responses` | 5,000,000 / 500,000 / 30,000,000 | `https://platform.openai.com/pricing` |
| OpenAI `gpt-5.6-terra` / `responses` | 2,500,000 / 250,000 / 15,000,000 | `https://platform.openai.com/pricing` |
| OpenAI `text-embedding-3-large` / `embeddings` | 130,000 / 0 / 0 | `https://developers.openai.com/api/docs/models/text-embedding-3-large` |
| Anthropic `claude-sonnet-4-6` / `messages` | 3,000,000 / 300,000 / 15,000,000 | `https://platform.claude.com/docs/en/about-claude/pricing` |

The 156,868,036-byte pre export had SHA-256
`df1a19c3a58b7d9929ec535b84f5d47064d90318320fb1bf93d53dcf64e5a7e0`.
The 156,873,094-byte post export had SHA-256
`90f8ad5a6d7c97e7cc24aa8ec068f649e54b7826902ca9f5d4b3fb73208569c8`.
Both isolated restores returned `quickCheck=ok`, zero foreign-key violations,
158 migrations, 282 tables, 608 indexes and 380 triggers; the post restore
contained exactly four price rows. Source exports/manifests and downloaded
readbacks matched byte size and SHA-256 under private prefix
`d1/juro-production/20260825T074158Z-price-config-f42c48fc/`.

On 2026-08-27, the two SQL exports and two manifests were downloaded again from
that exact private prefix. All four files matched the recorded byte sizes and
SHA-256 values. The exact plaintext source directory and the temporary
verification directory were then deleted; `Test-Path` returned false and exact
parent-directory match counts were zero for both. Private R2 remains the
recovery source.

No successful production provider event exists after the effective timestamp
at this checkpoint. This means the prices are configured, not that current AI
cost is proven to be zero. Historical unpriced append-only events remain
historical evidence.

## Post-migration verification

- The new verification-guard table, lock index and two secret-state triggers
  exist.
- All six public-token/access-code ciphertext metadata columns exist.
- Live `pragma_foreign_key_check` returned zero rows.
- Production contained zero standalone signed-share rows, so no legacy row
  needed lazy encryption during this release.
- An unknown share token returned `410 LINK_EXPIRED`, `no-store`, and no cookie.
- Five-failure lockout, atomic guard clearing and encryption boundaries are
  covered by the passing local suites; there was no real production share on
  which to perform a destructive lockout rehearsal.

## Live transport and health

POST probes to `http://app.juro.uz`, `lawyer.juro.uz`, `admin.juro.uz` and
`status.juro.uz` returned exact 308 HTTPS redirects while preserving method,
path and query. The redirects were private/no-store. HTTPS login pages returned
200 with HSTS, `X-Robots-Tag: noindex` and private/no-store caching. The Admin
route returned the expected protected-session handoff rather than content.

`https://status.juro.uz/api/status`, generated at
`2026-08-25T06:35:29.802Z`, reported `overallStatus=operational`, all eight
published components operational and no active or recent incident.

The in-app browser rendered the RU and UZ Client login surfaces and the
dedicated RU Lawyer persona. The accessibility tree contained localized
headings, labels, theme controls, language links and the correct Lawyer account
registration destination.

## Analytics and public Sites release — 2026-08-25 checkpoint

GitHub CI `32822786084` passed exact commit `f42c48fc`. Website passed 42/42.
Platform passed rendered HTML 34/34, core 1086/1086 and Cloudflare 201/201,
plus generated types, lint, type-check, deployable artifact, environment matrix,
production dependency audit and licence policy.

At that checkpoint, Sites version 82 contained the exact 121-file
`apps/website` source extracted
from `d0310b90`; source-tree comparison reported identical Git tree
`f35a8f36db9240a281e204f7d7e8b3675d2a18e7` before internal source commit
`ec6b7868ea2a34fc60b609b0b707a153dc984e52` was pushed. The saved archive has
canonical storage hash `sha256:2417277aaad0eda9781816fd861be0080d49c5bff63f03908c5e2001cb016ebb`. The
live custom domain rendered the localized privacy banner. Both consent controls
measured 44 pixels high; choosing essential-only removed the banner without
exposing private data. All 78 canonical sitemap URLs returned a successful
response and `robots.txt` points to `https://juro.uz/sitemap.xml`.

The live public telemetry endpoint returned:

- `204` for a valid same-site `landing_view`;
- `403` for a foreign origin;
- `403` with missing Fetch Metadata;
- `400` for an invalid event/page pair;
- `413` for an oversized body.

Every response was non-cacheable. Cloudflare rate-limiting rule
`b6afd1615e2042c898f2a446c7dbb525` is Active and matches only
`POST` + `app.juro.uz` + `/api/public/analytics`; it blocks for 10 seconds after
20 requests per IP in 10 seconds. This closes the one Low/high-confidence
finding from diff scan `3424a2a8-02aa-42b6-9de1-7b57963082ce`. A deliberate
production burst was not fired from the shared operator IP.

The in-app browser also rendered the public RU home and lawyer catalogue, the
Client login, the dedicated Lawyer login, the fail-closed Admin re-auth surface
and the public status page. The status API generated at
`2026-08-25T08:10:26.036Z` reported `overallStatus=operational`, all eight
components operational and no incident.

## Repository security and public dependency hardening

Standard scan `df6f1247-116c-42b8-b233-a693efb52263` targeted immutable
`e4f407a8`, inventoried 1,898 tracked files and closed 8/8 planned threat
surfaces with zero reportable findings. Its coverage remains PARTIAL because an
independent delegated baseline, TAC and destructive production tests were not
available.

The scan identified advisory-affected transitive PostCSS and Sharp versions as
a dependency-hygiene candidate. Production exploit reachability was rejected:
the public site does not process attacker-controlled CSS or images through
those packages. Commit `81aaf408` pins patched PostCSS `8.5.23` and Sharp
`0.35.3`. Production `npm audit` reports zero vulnerabilities across 716 locked
packages. The release head passed 43/43 website tests, types, lint, licence and
artifact gates.
Exact hardening diff scan `a2cb0d4a-7512-4b0a-aa5e-362681007619` retained zero
findings. Metadata diff scan `fa1b3e34-235b-48e6-8fb4-41e9f731f210` covered all
six changed source files in `33d7f8e3..ee0687af` and retained zero findings.
Social-preview diff scan `1985bd83-d685-4ae3-8978-60f4f469d1e7` covered all
seven changed source files in `3f2bf72e..d0310b90` and retained zero findings.
GitHub CI `32838994132` passed and Sites version 82 succeeded at that checkpoint. The replacement
crawl verified 78/78 exact canonical, RU/UZ/EN hreflang, complete Open Graph
and Twitter metadata, single H1, valid present JSON-LD and indexability; the
in-app browser rendered representative legal, lawyer and EN-video routes with
no overflow or page log. Screenshot capture timed out and is not claimed as
evidence. Status generated at `2026-08-25T10:58:57.247Z` was operational 8/8.

Zone origin TLS was then changed from automatic `Full` to explicit
`Full (strict)`. Sites reported the apex custom-domain SSL active, and the four
application hosts are Worker Custom Domains. Post-change probes retained the
expected six production outcomes (`200/308/200/200/303/200`) and three protected
staging outcomes (`302/302/200`) with no `526`. Status generated at
`2026-08-25T11:25:16.533Z` remained operational 8/8 with no active incident.
The control-plane rollback is the previous `Full` mode.

Cloudflare Security Settings also confirmed that the Free Managed Ruleset is
checked and `Always active`; its viewer lists 31 rules with `Block` actions.
The separate public-analytics rate limit remains active. Custom rules are 0/5,
but this is not represented as absent WAF protection, and no unrelated rule was
added solely to change that count.

## Open release risks

- The Cloudflare account UI showed an overdue balance of USD 381.29 and warned
  about possible service interruption. No financial action was taken.
- A real Lighthouse/Core Web Vitals trace is not claimed because the required
  `chrome-devtools` MCP was unavailable in this session.
- Cleanup of the release-created public Sites snapshot and archive directories
  `C:\Users\A S U S\AppData\Local\Temp\juro-sites-source-v80-81aaf408` and
  `C:\Users\A S U S\AppData\Local\Temp\juro-sites-v80-81aaf408` was also
  blocked by execution policy. They now contain only the public version-80/81
  source snapshots, Git metadata without a persisted token and public build
  archives; manual cleanup remains desirable but this is not a private-data
  exposure.
- Remote URL document import remains disabled in development, staging and
  production. It must not be enabled until a dedicated SSRF/DNS-rebinding gate
  validates the exact Cloudflare egress path.
- Provider-side retention and regional handling for voice transcription and
  synthesis remain an operational privacy assurance question; repository code
  does not prove a zero-retention contractual boundary.

Release status: the named analytics/cost and website dependency-hardening
production releases are verified. This
is not a blanket ecosystem Definition of Done: Cloudflare billing, CWV
evidence and any explicitly PARTIAL browser/device rows remain open.
