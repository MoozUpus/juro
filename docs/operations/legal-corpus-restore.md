# Legal corpus restore rehearsal

Restore only into an isolated D1 database and private test R2 namespace. Never
use production as a rehearsal target.

1. Import the exact D1 export referenced by the verified backup manifest.
2. Run `PRAGMA quick_check` and `PRAGMA foreign_key_check` sequentially.
3. Compare every corpus registry, language-link, version, provision, chunk,
   checkpoint and failure-ledger count with the manifest.
4. Read back representative immutable R2 objects and verify their SHA-256.
5. Execute current and historical representative retrievals for RU, Uzbek
   Latin and Uzbek Cyrillic; English is checked when an official variant is
   present.
6. Store the results as release evidence without source text or user content.

For Qdrant, restore only the latest D1-ledgered manifest whose environment,
collection, manifest SHA-256, snapshot size and R2 SHA-256 all verify. Recovery
uses Qdrant's uploaded-snapshot endpoint with `priority=snapshot` and the exact
checksum. It must then verify the collection contract and total point count.
Because Container disk is ephemeral, application startup is allowed to perform
this recovery through the private binding; it must fail closed when D1 has
tracked point IDs but the private snapshot is absent or invalid. Any D1 point ID
whose dense indexing timestamp is later than the restored snapshot cutoff is
cleared and deterministically re-backfilled. Never create a new empty collection
over an existing D1 vector ledger.

`SQLITE_NOMEM`, a timeout or an incomplete import is a failed probe. It must
never be recorded as an integrity pass. Delete local plaintext exports after
the isolated restore and checksum evidence are complete.
