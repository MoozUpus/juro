# Staging migration 0034 and business-workspace evidence

Updated: 2026-07-30
Scope: owner-only `juro-platform-staging`; production was not changed.

## Backup and restore gate

Before migration `0034_business_workspace_identity.sql`, exact D1 `juro-staging`
(`bb716a96-b2fb-4823-90d6-6c228fed181a`) was protected by Time Travel bookmark
`0000004f-00000000-000050b7-717b7ad53c68d9c6faf4db93aa35c718` and four
portable artifacts under private R2 prefix
`d1/juro-staging/20260730T224840Z/pre-0034/`:

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| data | 31,307 | `9c52c99912536a71be9ef5bdeefbf4eaa5b0e5881dcbca24d145c78ee500d8b1` |
| full | 183,262 | `24464cd703bfd727519acd351f7da0a2e20fb2ac5ea079886ac2694c5749fd63` |
| schema | 151,987 | `dd0410958e2428d3e0dddd7f31848592653c54148aa85f0f5a96250378810e25` |
| manifest | 1,088 | `6d6b790938572030a553b6a3b22b4dafe7b6403c54eb6ec6d4d1567f765b256f` |

Every object was downloaded from the private bucket and matched the local
SHA-256. The official full export was retained byte-for-byte. Direct import of
that export exposed two ordering constraints: child data preceded some parent
tables, and triggers were created before data. A deterministic restore-only
adapter split the immutable export into 115 table commands, 106 data commands,
and 268 index/trigger commands. The isolated restore completed with 113 application tables (114 including `d1_migrations`), 70 triggers, 198 indexes, 34 migration rows through
`0033`, representative row counts equal to the remote source, `quick_check=ok`,
and zero foreign-key violations.

After migration, bookmark
`00000052-00000004-000050b7-b4da7533d9c295272b804898f0d609dd` and four
additional artifacts were recorded under private prefix
`d1/juro-staging/20260729T230100Z/post-0034/`:

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| data | 33,005 | `c71cf40936379c83eeb704ca5b25ac5bbc3f48798cc42a2e52fde0a0a505a1ad` |
| full | 186,034 | `fd749e89ce39def68aafe20fffc32657855451baa00c36b3fbf35f8ea9532c99` |
| schema | 153,061 | `289501646dff175d1f99595a89aa24a2241664c024be41d35635cfaa8cca5e4e` |
| manifest | 1,195 | `411237d37a5304c959c094edc6d15b4c790e55b9d4d8dd10ade68e0baab3727c` |

All post-migration objects also passed private-R2 byte-for-byte verification.
The post set is a retained recovery checkpoint; the isolated restore drill was
performed against the pre-migration set. Signed export URLs were ephemeral and
are not retained in Git, documentation, or logs.

## Migration result

Wrangler applied only `0034_business_workspace_identity.sql` to staging. The
remote postflight reports 35 ordered migration rows through `0034`, 113 application tables (114 including `d1_migrations`), 72 triggers, 199 non-internal indexes, the four workspace
identity/idempotency columns, the partial request index, both business identity
guards, no pending migration, and zero foreign-key violations. Production and
development remain through `0004`.

## Deployment and authenticated QA

The final pushed source is commit `cd24095c8307a4c3b145549f147a823000a438e3`.
Worker version `3d1ac5c1-2f69-4c0e-b000-377054c8606a` serves 100% of
`juro-platform-staging` traffic behind owner-only Cloudflare Access. The
artifact retains staging-only D1/R2/Queue/Vectorize/Analytics/Images/Assets
bindings, seven Queue producers, the email and retention consumers, and the
single `*/5 * * * *` schedule. Secret values were not read; only configured
binding names are evidence.

Authenticated browser QA created one synthetic business workspace
`ws_b610ce380e774379afd49fd7e1ad5967` (`QA 0034`). Remote D1 proves one active
owner membership, one `business_workspace_created` audit event, creator and
request evidence, and zero foreign-key violations. After that business
workspace became the default, the canonical personal builder remained at
`/ru/individual/document-builder`; the explicit business builder remained at
`/:locale/business/:workspaceId/document-builder` in RU and UZ. The UZ route
now returns `lang="uz"`, `Hujjatlar kutubxonasi`, and title
`Hujjat yaratish — JURO`.

Browser checks covered effective client widths 1521, 753, 375, and 305 CSS px
(the explicit test viewports were desktop, 768, 390, and 320). All checked
routes had one main work surface, no horizontal overflow, no browser console
warning/error, reachable skip navigation, and mobile bottom navigation. This
is bounded route/responsive evidence, not a complete axe, 200% zoom,
reduced-motion, Lighthouse, real-device, provider, or cross-account security
matrix.

## Rollback boundary

Application rollback uses the prior staging Worker version while keeping the
additive migration dormant if necessary. D1 Time Travel or portable restore is
reserved for demonstrated schema/data corruption under staging maintenance.
Production migration, production functional deployment, and production UI
replacement remain three separate prohibited actions until their explicit
owner approvals and gates are complete.