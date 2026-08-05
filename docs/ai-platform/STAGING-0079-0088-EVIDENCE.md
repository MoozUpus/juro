# Staging 0079–0088 — operations and AI governance checkpoint

Date: 2026-08-05 Asia/Tashkent

Environment: protected staging only. Exact application commit: `bb05f09d263bf1fd8371a6c7a004bca9f688043c`. D1: `juro-staging` (`bb716a96-b2fb-4823-90d6-6c228fed181a`). Production was not targeted.

## Git and CI evidence

- Remote branch `feature/juro-ai-platform` and draft PR #3 resolve to `bb05f09d263bf1fd8371a6c7a004bca9f688043c`.
- GitHub CI completed successfully for both `validate (apps/platform)` and `validate (apps/website)`.
- The deployment was built from a detached exact-commit worktree. The main development worktree and its later local commits were not deployed.

## Backup and restore evidence

Immediately before migration, full, schema-only and data-only exports were stored in private bucket `juro-staging-backups` under:

`d1/juro-staging/20260805-093958/`

| Object | Bytes | SHA-256 |
|---|---:|---|
| `full.sql` | 1,520,881 | `371ef241ae2cc19e3fccd72c4bfd76e79907ca37b68d587f89b03e288fe4db7a` |
| `schema.sql` | 319,172 | `c99a764b8fd03b5957a0a488220e5fe521483b73ae4816e85a3a0807908d2112` |
| `data.sql` | 1,201,741 | `b62bc9841dee174b416a9e412d2c32a8a95ed6ab3f86d4badbede11e432a204e` |

Each private object was downloaded independently and matched its source SHA-256. The schema/data restore in isolated SQLite passed `quick_check=ok`, zero foreign-key violations, 185 tables, 393 non-system indexes, 192 triggers and 79 migration rows.

## Migration result

Wrangler applied exactly these migrations from the `bb05f09` worktree:

1. `0079_lawyer_review_replies.sql`
2. `0080_user_document_vectors.sql`
3. `0081_provider_cost_observability.sql`
4. `0082_provider_cost_circuit_breaker.sql`
5. `0083_system_status_incidents.sql`
6. `0084_operational_feature_flags.sql`
7. `0085_operational_job_redrives.sql`
8. `0086_platform_audit_access.sql`
9. `0087_ai_quality_reviews.sql`
10. `0088_ai_runtime_settings.sql`

The exact-commit ledger then reported no pending migrations. A fresh post-migration schema/data export restored independently with `quick_check=ok`, zero foreign-key violations, 205 tables, 442 non-system indexes, 248 triggers and 89 migration rows. The last row is id 89 / `0088_ai_runtime_settings.sql`.

## Deployment and boundary evidence

- Worker: `juro-platform-staging`.
- Current version: `1fdf14a0-9a13-4cb9-924d-3d299ab8f921`.
- Worker startup time reported by Wrangler: 236 ms.
- D1, private R2, seven Queue producers/consumers, four Vectorize indexes, Analytics Engine, Images and Workers AI bindings were read back from the deployment.
- Secret names include `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY` and protected identity/payment secrets. Values were never read.
- Anonymous probes for root, AI lawyer, the canonical `/ru/individual/document-builder`, admin AI settings and status returned the expected Cloudflare Access `302` from `server: cloudflare`.

These anonymous probes prove DNS, route reachability and the outer Access boundary only. Authenticated operator rehearsals for feature disable/re-enable, redrive, audit export, quality review, runtime configuration, provider cost circuit and status lifecycle remain release gates and are not claimed by this checkpoint.

## Rollback

Application rollback is a Worker traffic rollback from version `1fdf14a0-9a13-4cb9-924d-3d299ab8f921` to the prior staging version. Migrations `0079–0088` are additive and may remain unused. Restore the private pre-migration export only after proven corruption, under maintenance, and after preserving the current state. Production deployment and production UI replacement remain separately prohibited without owner approval.
