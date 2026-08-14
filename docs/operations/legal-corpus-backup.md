# Legal corpus backup

Create a backup before enabling discovery, ingestion, reindexing or a version
pointer update in an environment.

The private backup set contains a D1 export, all `legal_corpus_*` registries,
source-alias and checkpoint ledgers, current-version pointers, version and
chunk counts, ingestion failures, and a manifest of immutable R2 raw and
normalized objects. The manifest records SHA-256 hashes and the server-side
feature-flag state but never secret values.

Do not include sessions, API keys, access tokens, private user documents, or
plaintext corpus artifacts in Git or public CI artifacts. Read back the
private R2 manifest and verify its hash before treating a backup as usable.

Record the D1 database ID, export timestamp, manifest key, manifest SHA-256,
row counts and index version in the release evidence. Backup creation alone is
not restore evidence.

The corpus sparse index must use ordinary exportable D1 tables. Do not add an
FTS5 virtual table to the application D1 database: Wrangler rejects a full D1
export while such a table exists. Migration
`0126_exportable_legal_corpus_sparse_index.sql` replaces the initial virtual
index with `legal_corpus_sparse_terms`, which is rebuildable from immutable
chunks and included in normal export/restore evidence.

## Staging migration evidence — 2026-08-15

Before migrations 0124–0126, the complete `juro-staging` export was restored
into isolated SQLite and passed `PRAGMA quick_check` with zero foreign-key
violations. The SQL export SHA-256 is
`35d4a940039fa8316358f2b8fccd15f00e96ee3ceb7a5bdea65bc874a6314549` and
the private R2 readback matched it byte-for-byte.

After migration 0126 removed the non-exportable FTS5 index, a new complete
export restored successfully with 247 tables, 544 indexes, 327 triggers and
127 migration records. `PRAGMA quick_check` returned `ok`, foreign-key
violations were zero, and the SQL export plus private R2 readback shared
SHA-256
`6b5ac6b5469b5c0dd226bfdcd859b5dd833923c93ba622dce2670db6c5f83ca6`.

The private object keys are:

- `legal-corpus/migrations/2026-08-15/pre-0124-0125-5ca1228/juro-staging.sql`
- `legal-corpus/migrations/2026-08-15/post-0126-5ca1228/juro-staging.sql`

These checks cover staging only. They are not evidence that production was
migrated, ingested or rolled out.
