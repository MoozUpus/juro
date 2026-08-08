# Staging 0069–0078 — document lifecycle and legal knowledge checkpoint

Date: 2026-08-05 Asia/Tashkent

Environment: protected staging only. Exact application commit: `cff38f0208e05f522cbb3acfde295107bbbfd98c`. D1: `juro-staging` (`bb716a96-b2fb-4823-90d6-6c228fed181a`). Production was not targeted.

## Backup and restore evidence

Immediately before migration, full, schema-only and data-only exports were stored in private bucket `juro-staging-backups` under:

`d1/juro-staging/20260805-011837/`

| Object | Bytes | SHA-256 |
|---|---:|---|
| `full.sql` | 1,400,649 | `ae06a542c97b8d3041d196eec8564ddba786a7e2dc63509225cca9a955738027` |
| `schema.sql` | 261,236 | `424f33a9f4a407b463ee51c8f293967f996274b96b44aeedf43e02315e98b9a5` |
| `data.sql` | 1,139,445 | `c0b98f9bdd181971abfc80e48dd4744c037906a223bf3b577f814e8057f02dc1` |

Each object was independently downloaded from private R2 and matched its local SHA-256. The downloaded schema/data restored into isolated SQLite with `quick_check=ok`, zero foreign-key violations, 172 tables, 348 non-system indexes, 128 triggers and 69 pre-existing migration rows.

## Migration result

Wrangler applied exactly these additive migrations, in ledger order:

1. `0069_analysis_document_revisions.sql`
2. `0070_analysis_corrected_exports.sql`
3. `0071_comparison_exports.sql`
4. `0072_comparison_change_decisions.sql`
5. `0073_analysis_version_object_writes.sql`
6. `0074_analysis_case_links.sql`
7. `0075_document_case_links.sql`
8. `0076_user_legal_bookmarks.sql`
9. `0077_knowledge_base.sql`
10. `0078_knowledge_base_authoring.sql`

The remote ledger ends at id 79 / `0078_knowledge_base_authoring.sql`. A post-migration schema/data export restored independently with `quick_check=ok`, zero foreign-key violations, 185 tables, 393 non-system indexes, 192 triggers and 79 migration rows.

Direct remote `PRAGMA quick_check` and `PRAGMA foreign_key_check` exceeded the D1 query memory ceiling (`SQLITE_NOMEM`). They are not claimed as remote passes. Integrity evidence comes from fresh post-migration exports restored and checked outside the live database.

## Deployment and boundary evidence

The repository-controlled staging deploy built and published only `juro-platform-staging`:

- Worker version: `3af9bfe6-bd1d-436c-a94a-3fa3ef9283d4`;
- traffic: 100%;
- startup time reported by Wrangler: 235 ms;
- D1/R2/Queues/Vectorize/Analytics/Images/Workers AI bindings were read back;
- `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` secret names were present; values were never read;
- GitHub PR #3 head was `cff38f0`; both platform and website validation checks passed;
- local exact-commit type-check, lint and staging build passed.

Anonymous requests to root, AI lawyer, document analysis, admin knowledge base and canonical `/ru/individual/document-builder` returned the expected Cloudflare Access `302`. This proves the outer Access boundary and route reachability, not authenticated product behavior.

## Rollback

Application rollback is a Worker traffic rollback to the previous staging version. Migrations `0069–0078` are additive and may remain unused. Restore the private export only after proven corruption, under maintenance, after preserving the current state. No production action is authorized by this checkpoint.
