# Production readiness — 2026-08-25

This is an evidence record for the signed-share/HTTPS baseline and the
privacy-safe analytics/effective-cost follow-up. It does not claim that every
item in the wider ecosystem audit is complete.

## Release identity

| Item | Verified value |
| --- | --- |
| Branch | `codex/investor-ready-ecosystem` |
| Commit | `f42c48fcd67c8b24f3e27369401d3ae8b6c1be8a` |
| Draft PR | `#64` |
| GitHub Actions | CI run `32822786084`, Website and Platform successful |
| Production Worker | `juro` version `c3237f9e-a258-42eb-8b94-62f5045b7b03` (version 146), 100% traffic |
| Immediate application rollback | `357d0438-1a5f-4b29-ba81-869cbc130c0a` (version 145) |
| Public Sites release | Version 79, deployment `appgdep_6a8d4bf3fe548191aa044dd3bed0f11f`; rollback version 78 |
| Production D1 | `juro-production`, binding `DB` |
| Applied migration | `0159_signed_share_verification_guard.sql`; no migration remains pending |
| Effective price configuration | Four append-only rows effective `2026-08-25T07:44:49.444Z` |

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

## Analytics and public Sites release

GitHub CI `32822786084` passed exact commit `f42c48fc`. Website passed 42/42.
Platform passed rendered HTML 34/34, core 1086/1086 and Cloudflare 201/201,
plus generated types, lint, type-check, deployable artifact, environment matrix,
production dependency audit and licence policy.

Sites version 79 contains the exact 121-file `apps/website` source extracted
from `f42c48fc`; source comparison reported 121/121 and zero differences. The
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

## Open release risks

- The Cloudflare account UI showed an overdue balance of USD 381.29 and warned
  about possible service interruption. No financial action was taken.
- Zone SSL mode is `Full`, not `Full (strict)`. The deployed Worker enforces
  HTTPS and HSTS, but origin-certificate strictness remains a control-plane
  hardening item.
- The scoped public-analytics edge rate limit is active. General custom rules
  remain 0/5, so no broader custom WAF posture is claimed.
- A real Lighthouse/Core Web Vitals trace is not claimed because the required
  `chrome-devtools` MCP was unavailable in this session.
- The verified private price-backup round trip completed, but the execution
  policy blocked deletion of exact local directory
  `C:\Users\A S U S\AppData\Local\Temp\juro-production-price-config-f42c48fc-20260825T074158Z`.
  It contains plaintext export/restore/readback artifacts and still requires
  manual removal. Switching shells to evade the policy was intentionally not
  attempted.

Release status: the named analytics/cost production release is verified. This
is not a blanket ecosystem Definition of Done: Cloudflare billing, Full-not-
Strict TLS, general WAF/CWV evidence, the local plaintext cleanup and any
explicitly PARTIAL browser/device rows remain open.
