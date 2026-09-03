# Legal corpus backup

## Custom hybrid Search Release

Before any Tickets 23–27 or refactored Tickets 13–22 mutation, capture and
verify the exact account/environment, legal D1 export/isolated restore, evidence
R2 inventory root, derivative-index R2 inventory root, active/prior Activation
Sets, Vectorize index/configuration/mutation state, Workflow/Queue configuration,
Gateway logging/cache/authentication state, and the truthful legacy AI Search and
Qdrant inventories. Configuration evidence contains names, IDs, versions, counts,
hashes and safe states only—never token/key values, query/evidence text, postings
or vectors.

A sealed custom release backup includes its Retrieval Chunk inventory; every
BM25 analyzer/base/delta/lexicon/posting/statistics manifest and SHA-256; every
content-addressed embedding manifest and vector hash; the Vectorize full-list
snapshot identity and final processed mutation; D1 release/gate/activation roots;
the deduplicated Batch JSONL manifest hashes; content-free provider File/Batch
IDs and terminal counts; actual usage/cost; output/error reconciliation; verified
provider-File deletion receipts; and cost/privacy/evaluation evidence. Never
back up JSONL bodies or provider output/error bodies. Backup succeeds only after an isolated
reader opens the exact BM25 artifacts and a fresh Vectorize index is reconstructed
solely from R2 embeddings without an OpenAI call, then representative hybrid
queries pass.

The root `CLOUDFLARE_API_TOKEN` and platform `OPENAI_API_KEY` stay in their
ignored `.env` files and are never backup material. By owner direction the root
token is not removed until every migration ticket is resolved; Ticket 22 owns
final verified readback, removal of only that entry, leakage scan and owner
revocation.

## Source Snapshot candidate boundary

Before any Ticket 12 green2 mutation, verify the Cloudflare account, exact D1
UUID/name, exact R2 bucket, route-free Worker and paused private namespace;
verify the latest full D1 export restores with `quick_check=ok` and zero foreign
key failures; and verify the R2 inventory/readback manifest. Preserve the
export, restored SQLite, configuration, current/deferred/post-cutoff inventory
and checksums outside Git. After the build, capture all additive Source
Document/Snapshot/Provision/Eligibility and projection/release tables plus a
complete hash-verified readback of `search-releases/<release-id>/`. Never put
`OPENAI_API_KEY`, payload text or private objects in logs or evidence.

For final Source Snapshot qualification, preserve both independently named
replay run roots, the injected failure/restart record, dry-run identity, review
attestations and the pre-qualification export/restore hashes. The coordinator
may be sealed only after those external hashes exist. Record the final
qualification object separately; it must still show a draft Search Release,
zero active Activation Sets and the Ticket 13 provider boundary.

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

The implemented legacy sparse index uses ordinary exportable D1 tables. Do not
add an FTS5 virtual table to the application D1 database: Wrangler rejects a
full D1 export while such a table exists. Migration
`0126_exportable_legal_corpus_sparse_index.sql` remains historical recovery
machinery. The accepted custom target writes no term dictionary, posting or
position table to D1; its exportable immutable BM25 artifacts and exhaustive
inventories live in derivative-index R2.

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
