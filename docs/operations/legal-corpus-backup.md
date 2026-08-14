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
