# Legal corpus rollback

The first rollback action is server-side flag disablement:

- `LEGAL_CORPUS_ENABLED=false`
- `LEGAL_CORPUS_AUTO_INGEST_ENABLED=false`
- `LEGAL_CORPUS_LIVE_LEXUZ_ENABLED=false`

This immediately returns chat to the existing validated direct Lex path and
stops new discovery/ingestion claims. Immutable sources and historical
versions remain intact for audit.

If data restoration is necessary, restore only a backup that passed the
isolated rehearsal. A version rollback changes the audited
`current_version_id` pointer; it never edits or deletes a version, provision
or citation span. Verify direct retrieval, current-version retrieval and
private-scope isolation before any gradual re-enable.

Do not roll back by deleting migrations from a production ledger, removing
historical legal text, changing DNS, or publishing an unverified snapshot.
