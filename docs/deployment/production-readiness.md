# Production readiness — 2026-08-25

This is an evidence record for the signed-share and HTTPS hardening release. It
does not claim that every item in the wider ecosystem audit is complete.

## Release identity

| Item | Verified value |
| --- | --- |
| Branch | `codex/investor-ready-ecosystem` |
| Commit | `a3f22f87fd40ee92fc7276c7babaf9fea0f30b2c` |
| Draft PR | `#64` |
| GitHub Actions | CI run `32816221498` / run number `783`, Website and Platform successful |
| Production Worker | `juro` version `357d0438-1a5f-4b29-ba81-869cbc130c0a`, 100% traffic |
| Immediate application rollback | `f91406c2-903b-438f-bafb-01a64f5af2b7` |
| Production D1 | `juro-production`, binding `DB` |
| Applied migration | `0159_signed_share_verification_guard.sql`; no migration remains pending |

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

## Open release risks

- The Cloudflare account UI showed an overdue balance of USD 381.29 and warned
  about possible service interruption. No financial action was taken.
- Zone SSL mode is `Full`, not `Full (strict)`. The deployed Worker enforces
  HTTPS and HSTS, but origin-certificate strictness remains a control-plane
  hardening item.
- No custom zone WAF or zone rate-limit rule was present during discovery.
  Application rate limits and signed-share D1 guards are tested, but a separate
  edge policy is still recommended.
- A real Lighthouse/Core Web Vitals trace is not claimed because the required
  `chrome-devtools` MCP was unavailable in this session.

Release status: the named production release is verified. The broader product
audit remains in progress until its separately listed accessibility,
performance and analytics gates are closed or explicitly accepted.
