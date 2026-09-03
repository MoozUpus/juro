# Staging shard-3 → shard-4 handoff — 2026-09-03

The authorized staging handoff from `juro-staging-corpus-shard-3` to the
existing `juro-staging-corpus-shard-4` completed with handoff ID
`14f54255-7025-47cd-ae13-38da842132fe` and manifest SHA
`8a2d7192d0023c1ba1f667729e03aa705638c520990e1c4e4ad13f278d6b698d`.

The source had no running or document-affinity jobs. Its 23,706 queued/retrying
jobs, 44 checkpoints, 27,900 discovery rows and the 14 failure rows associated
with those jobs were copied idempotently to the target. The source jobs became
immutable `LEGAL_CORPUS_SHARD_HANDOFF` completion tombstones and shard-3 is now
`frozen`; the append-only source failure ledger remains 408 rows, including the
existing dead-letter history. No source documents, provisions, chunks or
failure rows were deleted or rewritten.

The first import attempt exposed two transient operational errors (a D1 import
state race and a Cloudflare API authentication error). Resuming the same
handoff ID completed the manifest and source commit. Target verification is
44 checkpoints, 27,900 discovery rows, 23,706 jobs, 23,706 handoff-job rows and
14 failure rows; it contains no legal-corpus document/provision/chunk data.

Shard-4 remains `handoff_prepared` and has no deployed worker binding, so no
queue drain or automatic crawl was started. Activation is intentionally
pending a target-bound staging deployment review. The existing logical
ownership projection in shard-4 remains a deterministic deduplication index;
this handoff does not prove physical disjointness, a federated snapshot,
Qdrant parity, indexed evaluation, legal review or production approval.

The exact legacy job `legal-corpus:07aa10e095f0c77b28e6ada80fc8` /
`lexuz:8411573` was not retried. Its recovery still requires the protected
named-staff staging admin action with fresh MFA/TOTP; technical access cannot
impersonate that audit principal. See the JSON companion for exact counts and
the preserved failure-ledger policy.
