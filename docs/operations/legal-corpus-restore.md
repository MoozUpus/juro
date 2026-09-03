# Legal corpus restore rehearsal

## Custom hybrid Search Release

Restore legal D1 only into an isolated database and verify integrity, exact
release roots and the 7 GB capacity gate. Verify the evidence-R2 and
derivative-index-R2 inventories independently. Open the pinned immutable BM25
manifest, validate every declared analyzer, base/delta segment, lexicon/posting
range, statistic and hash, and run representative sparse queries.

Create a new compatible Vectorize index and its four metadata indexes. Populate
it exclusively from hash-verified content-addressed R2 embedding artifacts; do
not call OpenAI. Wait until the final mutation is processed, start a fresh list
snapshot, and prove exact vector ID/count/metadata parity before representative
hybrid, temporal and declared-lane failure probes. A restore based only on vector
count, provider-local disk, cache state or components from different Search
Releases fails.

No provider Batch input, output or error File is restore authority. Before a
release backup is accepted, its content-free Batch receipts must prove exact
output reconciliation and verified File cleanup. Restoration uses the immutable
deduplicated input-manifest hashes and content-addressed R2 embeddings only; it
must neither recreate a Batch nor make a synchronous OpenAI call.

The retained Qdrant steps below are legacy-only. When no full-corpus snapshot
exists, record the exact incomplete inventory and test snapshot mechanics
separately rather than claiming a complete backup.

## Source Snapshot candidate

Restore the dedicated green2 D1 export only into an isolated database, then
run `PRAGMA quick_check`, `PRAGMA foreign_key_check` and exact table inventory
comparison. Reconcile every canonical chunk with its immutable R2 byte count
and SHA-256, prove each eligible Snapshot Provision occurs exactly once in the
sparse, dense, release-member and shard sets, and repeat the dry run to prove
the same inventory/projection/release identities. A Ticket 12 Search Release
remains draft and inactive: restoration must not promote green2, select an
Activation Set or move visible staging off the legacy Adapter.

When resuming a replay, an already-completed run is terminal and its stored
root must be returned unchanged; do not enqueue its lanes again. An incomplete
run resumes from each lane's last immutable page. Complete every lane, rebuild
the run root, compare `baseline` and `repeat`, and run the non-mutating dry run
before accepting recovery parity. A conflicting page or root is a failed
restore, never a reason to delete or rewrite the evidence.

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
