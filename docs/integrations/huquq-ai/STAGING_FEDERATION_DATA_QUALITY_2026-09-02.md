# Staging federation data-quality assessment — 2026-09-02

## Dataset and intended grain

The five D1 sources are independent physical stores. The release grain is one
canonical legal document and one current provision/chunk; a sum of per-source
rows is therefore not a unique-corpus measure until the source identities and
chunk identities are proven disjoint.

## Checks performed

- Sequential, read-only D1 counts for documents, current provisions, indexed
  current chunks, open jobs, dead-letter jobs, terminal failures and completed
  checkpoints.
- Pairwise canonical-document identity intersections from
  `STAGING_CANONICAL_ID_OVERLAP_RECHECK_2026-09-02.json`.
- Read-only ownership projection check on shard-4.
- Failure-ledger status and latest scheduled-run checks; all queries returned
  `rows_written=0`.

## Findings

| Finding | Evidence | Severity | Downstream risk |
| --- | --- | --- | --- |
| Physical canonical IDs overlap | 12,333 source rows, 7,152 IDs in the union, 5,181 repeated rows; shard-1/shard-2 overlap is 1,335 IDs and shard-2/shard-3 overlap is 2,477 IDs | Critical | Summing source counters overstates unique legal coverage and invalidates a physical disjoint release manifest |
| Queue state is incomplete | legacy 43,539 open jobs; v2 27,689; shard-3 23,706; shard-3 has 7 dead-letter and 7 terminal rows | High | A snapshot could capture partial or failed ingestion and cannot satisfy the queue/failure gate |
| Capacity is unsafe for a drain | shard-3 is 9,999,892,480 of 9,999,998,976 bytes (106,496 bytes remaining) | Critical | A retry can fail again or create additional ledger rows; queue processing remains fail-closed |
| Logical ownership projection is internally consistent | shard-4 has 7,152 ownership rows, 7,152 distinct IDs, 4 partitions and occurrence sum 12,333 | Medium | This makes retrieval deduplication deterministic but does not prove physical data or chunk disjointness |

## Temporal assessment

The latest scheduled shard-3 run remains the failed run at
`2026-09-02T07:10:57.197Z`; no newer run or lock was observed. The post-stop
recheck found zero new terminal/dead-letter rows after the previous observation.

## Likely causes and impacted use cases

The overlap is consistent with staged backfills and shard rollover copies; the
available evidence does not prove that any particular row is a duplicate in
content. The seven terminal jobs all target historical Russian revisions of
`lexuz:4674893`, but the sanitized ledger intentionally omits the underlying
provider or SQL error. Legal answers may use the read-only federated runtime,
but release metrics, point-in-time snapshots and benchmark claims must remain
closed.

## Remediation and stable automated checks

1. Keep source D1s immutable while producing a separately verified physical
   partition/snapshot, or obtain an independently reviewed migration plan for
   that operation.
2. Require zero open/dead-letter/terminal jobs and a fresh capacity record
   before any queue drain or release snapshot.
3. Keep a CI check that rejects duplicate canonical-ID or chunk-ID sets in the
   federated partition manifest; the existing evidence builder already enforces
   this rule.
4. Do not rewrite failure rows. A legacy retry, if still required, must go
   through the named-staff MFA-bound admin operation.

## Source and scope

Machine-readable counts and hashes are in
`STAGING_FEDERATION_QUEUE_AUTHORIZATION_RECHECK_2026-09-02.json`; the pairwise
identity analysis is in `STAGING_CANONICAL_ID_OVERLAP_RECHECK_2026-09-02.json`.
This is a staging data-quality assessment, not a legal opinion, corpus
snapshot, evaluation result or release approval.
