# Staging federation authorized action — 2026-09-02

The authorized staging action rebuilt the existing logical ownership projection
in `juro-staging-corpus-shard-4` at `2026-09-02T10:32:36.443Z` from commit
`ef97fc8f41392299cc5ccfc659ebb4752567fff6`.

The projection verified 12,333 source rows, 7,152 unique canonical document
IDs and 5,181 duplicate source rows. Each canonical ID has exactly one logical
owner selected by `sha256(canonical_document_id) modulo 4`; the four buckets
contain 1,812 / 1,728 / 1,806 / 1,806 IDs. Source tables and the append-only
failure ledger were unchanged.

Queue handling remained fail-closed. Ingestion is frozen by the active release
gate; the two 10 GB databases cannot safely accept more writes, shard-3 has
only 106,496 bytes of headroom with seven terminal/dead-letter failures, and
v2 has stale running rows without a live lock. No queue row or failure-ledger
row was changed.

The legacy job `legal-corpus:07aa10e095f0c77b28e6ada80fc8` (`lexuz:8411573`)
was not retried. Its recovery is available only through the protected staging
admin action with a named legal-corpus staff assignment and fresh MFA/TOTP.
The failure ledger remains append-only; the already indexed family aliases in
shard-1 and shard-3 remain the safe retrieval fallback.

The release gate is still closed. This evidence is staging-only and does not
claim physical disjointness, corpus snapshot/restore, legal review, evaluation,
Qdrant/D1 restore or production approval.

Machine-readable evidence: [STAGING_FEDERATION_AUTHORIZED_ACTION_2026-09-02T1032Z.json](STAGING_FEDERATION_AUTHORIZED_ACTION_2026-09-02T1032Z.json).
