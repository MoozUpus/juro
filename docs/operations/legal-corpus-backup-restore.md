# Legal corpus backup, restore and rollback

## Backup contents

Before an enabled corpus update, create a private R2 manifest containing:

- D1 export or a scoped export of `legal_corpus_*` tables;
- source registry and variant current-version pointers;
- version/provision/chunk counts and SHA-256 manifest hash;
- R2 keys for raw and normalized immutable artifacts;
- ingestion job and failure ledger state; and
- the Qdrant collection name, engine version and collection snapshot SHA-256
  when dense retrieval is enabled; and
- the current feature-flag configuration with secrets excluded.
- the dedicated legal D1 export including every `legal_source_*`,
  `legal_snapshot_*`, `legal_retrieval_eligibility`, `legal_canonical_chunks`,
  sparse/dense projection, build/checkpoint/inventory, Search Release, shard
  and activation table;
- the immutable `search-releases/<release-id>/` R2 prefix and manifest, with
  complete object count, byte count and SHA-256 readback identity; and
- exact baseline, deferred, post-cutoff, unresolved temporal and quarantine
  inventories for the build cutoff.

Never include API keys, session data, user documents, or corpus raw HTML in a
Git commit or public artifact.

## Restore rehearsal

1. Export production or staging D1 before changing corpus pointers.
2. Restore into an isolated D1 database; never use the production database as
   a rehearsal target.
3. Run `PRAGMA quick_check`, `PRAGMA foreign_key_check`, row-count comparison,
   and R2 manifest SHA-256 readback.
4. Query representative RU, Uzbek Latin and Uzbek Cyrillic article numbers.
5. Restore the matching Qdrant collection snapshot into an isolated collection
   with `priority=snapshot`, verify exact point count and repeat dense, sparse
   and hybrid queries before changing an active collection pointer.
6. Keep restoration evidence separately from legal-answer content.
7. For a Source Snapshot candidate, prove every eligible provision appears in
   exactly one canonical chunk, sparse row, dense candidate, release member
   and shard; prove the shard union is complete and pairwise disjoint; then
   repeat the dry run and compare inventory, projection and release identities.

The executable CI rehearsal is
`npm run validate:legal-corpus:qdrant-gate`. It follows Qdrant's official
[collection snapshot procedure](https://qdrant.tech/documentation/operations/snapshots/),
pins the official image by OCI digest and emits a private CI artifact containing
only engine/version/count/timing/hash evidence. It contains no legal text,
provider key or user data.

`SQLITE_NOMEM` from a remote D1 integrity probe is a failed probe, not a
successful integrity claim. Retry sequentially with an isolated restore.

## Rollback

1. Disable `LEGAL_CORPUS_ENABLED` and `LEGAL_CORPUS_AUTO_INGEST_ENABLED`.
2. Leave immutable versions and raw objects intact for audit.
3. Point `legal_corpus_variants.current_version_id` to a verified prior
   version only through an audited repair procedure; do not edit a version or
   provision row.
4. Restore the verified snapshot only after the isolated rehearsal succeeds.
5. Restore the Qdrant collection snapshot that is bound to the same D1/R2
   manifest; never pair an index with a different corpus snapshot.
6. Verify that direct Lex retrieval remains available before re-enabling
   indexed corpus traffic.
7. If the Source Snapshot Search Release has not been activated, leave it
   draft and leave the visible staging service on the legacy Adapter. Do not
   delete its D1 rows or R2 objects; restore or reconcile from the verified
   build checkpoints. If it was activated later, atomically select the prior
   Activation Set rather than changing release membership.

Rollbacks do not delete historical legal text or silently replace citations.
