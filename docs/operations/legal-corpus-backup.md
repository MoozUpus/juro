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

The staging Qdrant Container has ephemeral disk. A dense release therefore also
requires a collection snapshot in the private `BACKUP_BUCKET`. Snapshot
creation is automatic only after Lex acquisition is disabled, no ingestion job
or dense chunk remains pending, and Qdrant current/total point counts match the
D1 vector-ID ledger. The Worker streams the snapshot directly to R2 using the
Qdrant SHA-256 as R2's write-time integrity check, verifies size and checksum by
`head()`, writes a separately hashed JSON manifest, records that manifest in
`legal_corpus_snapshots`, and deletes only the temporary Container-local
snapshot. The API key, vector values and legal text are not written to the
manifest or logs.

Do not treat the private snapshot as a release backup until the final evidence
also records an independent R2 readback hash and a successful isolated restore
with point-count and representative hybrid-query parity.

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

## Staging migration evidence — 0127 admin control

Before `0127_legal_corpus_admin_control.sql`, a complete `juro-staging` export
was restored into isolated SQLite. `PRAGMA quick_check` returned `ok`, foreign
key violations were zero, and the topology contained 247 tables, 544 indexes,
327 triggers and 127 migration records. The SQL export and private R2 readback
shared SHA-256
`8a764c121e7d2cf5d0d68b50a877b047f738ee408cc972eeeceade9a17e3900f`.

After the migration, a second complete export restored with 248 tables, 547
indexes, 329 triggers and 128 migration records. `PRAGMA quick_check` returned
`ok`, foreign key violations were zero, and the export/readback SHA-256 was
`c642f0b34515042b30e1505e3dacd6555020220e981a67d7cff500aebf0e45b6`.

The private objects are:

- `legal-corpus/migrations/2026-08-15/pre-0127-7af9aa2/juro-staging.sql`
- `legal-corpus/migrations/2026-08-15/post-0127-7af9aa2/juro-staging.sql`

The six local plaintext export/readback/restore files and their dedicated
temporary directory were deleted after verification. The private R2 objects
remain the recoverable staging backups. Corpus feature flags remained `false`;
this migration and backup evidence did not start ingestion or modify
production.

## Staging and production release evidence — 0128 / 0124–0128

Migration `0128_owner_corpus_publications.sql` was applied to staging only after
a full export restored with `quick_check=ok`, zero foreign-key violations and a
matching private-R2 readback. The pre/post SHA-256 values were respectively
`be14908649ec07f727cabdbe1c2622ec096b9b479b14e529c0b91e60c664de94` and
`b18b7412b201ebc31b375da328b3b2c30a78f27b5c8192e5f5a9ce06243164de`.

The production release then captured Time-Travel bookmark
`00000915-0000000a-000050c7-d63e76604752eede4907e81cb350859b` and rehearsed a
full restore before applying production-safe migrations `0124–0128`.
Staging-only migrations `0122–0123` remained excluded. The production pre/post
export SHA-256 values were
`78fe976cf8b226957d3819fc90cca474f26973f1b1f0ccf0ba28962db0200fec` and
`4a9e5d8d3c187ec66da6af7f9218ef651a2a117cb824357456838223b966190a`;
both isolated restores passed `quick_check` with zero foreign-key violations,
and both private-R2 readbacks matched byte-for-byte.

The complete version IDs, object keys, topology counts and browser-smoke record
are in
`docs/integrations/huquq-ai/FULL_LEGAL_CORPUS_RELEASE_EVIDENCE_2026-08-15.md`.
No corpus feature flag was enabled and no corpus row or pending job was created.
