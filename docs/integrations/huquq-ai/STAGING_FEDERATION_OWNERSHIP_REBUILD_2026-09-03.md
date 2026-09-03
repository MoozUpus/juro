# Staging logical ownership rebuild — 2026-09-03

After the shard-3 → shard-4 handoff, the staging ownership projection was
rebuilt from the five unchanged corpus sources. The deterministic rule remains
`sha256(canonical_document_id) modulo 4`, with the official/newest source used
as the representative. Verification returned 12,333 source document rows,
7,152 unique canonical IDs and 5,181 duplicate occurrences, distributed as
1,812 / 1,728 / 1,806 / 1,806 across the four logical buckets.

This action changed only the rebuildable ownership projection in shard-4. The
source documents, provisions, chunks, queue/failure rows and the handoff ledger
were not rewritten. It is a logical disjoint retrieval index; source IDs still
overlap physically, so this artifact is not a physical partition snapshot and
does not close the release, Qdrant, evaluation, legal-review or production
gates.
