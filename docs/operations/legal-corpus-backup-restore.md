# Legal corpus backup, restore and rollback

## Backup contents

Before an enabled corpus update, create a private R2 manifest containing:

- D1 export or a scoped export of `legal_corpus_*` tables;
- source registry and variant current-version pointers;
- version/provision/chunk counts and SHA-256 manifest hash;
- R2 keys for raw and normalized immutable artifacts;
- ingestion job and failure ledger state; and
- the current feature-flag configuration with secrets excluded.

Never include API keys, session data, user documents, or corpus raw HTML in a
Git commit or public artifact.

## Restore rehearsal

1. Export production or staging D1 before changing corpus pointers.
2. Restore into an isolated D1 database; never use the production database as
   a rehearsal target.
3. Run `PRAGMA quick_check`, `PRAGMA foreign_key_check`, row-count comparison,
   and R2 manifest SHA-256 readback.
4. Query representative RU, Uzbek Latin and Uzbek Cyrillic article numbers.
5. Keep restoration evidence separately from legal-answer content.

`SQLITE_NOMEM` from a remote D1 integrity probe is a failed probe, not a
successful integrity claim. Retry sequentially with an isolated restore.

## Rollback

1. Disable `LEGAL_CORPUS_ENABLED` and `LEGAL_CORPUS_AUTO_INGEST_ENABLED`.
2. Leave immutable versions and raw objects intact for audit.
3. Point `legal_corpus_variants.current_version_id` to a verified prior
   version only through an audited repair procedure; do not edit a version or
   provision row.
4. Restore the verified snapshot only after the isolated rehearsal succeeds.
5. Verify that direct Lex retrieval remains available before re-enabling
   indexed corpus traffic.

Rollbacks do not delete historical legal text or silently replace citations.
