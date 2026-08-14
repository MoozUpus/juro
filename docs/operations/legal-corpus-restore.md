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

`SQLITE_NOMEM`, a timeout or an incomplete import is a failed probe. It must
never be recorded as an integrity pass. Delete local plaintext exports after
the isolated restore and checksum evidence are complete.
