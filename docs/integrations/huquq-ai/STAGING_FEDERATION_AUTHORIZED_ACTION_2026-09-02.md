# Staging federation authorized action — 2026-09-02

The staging-only ownership projection was rebuilt sequentially from the five
legacy corpus D1 sources into `juro-staging-corpus-shard-4`. The verified run
`ownership-20260902100911` contains 7,152 unique canonical identifiers across
four deterministic partitions and accounts for 12,333 source occurrences.
Source rows and the append-only failure ledger were unchanged (`0` rows
written to source databases and `0` failure-ledger rows changed).

## Queue safety decision

Queue processing was requested but deliberately not started. `juro-staging`
and `juro-staging-corpus-v2` are at the Cloudflare 10 GB ceiling; shard-3 has
only 106,496 bytes of headroom and already has seven terminal/dead-letter
failures. Shard-2 has no queued work. Force-reconciling running/retrying jobs
would mutate the ledger without a safe capacity window, so the worker remains
fail-closed.

## Legacy recovery decision

The exact legacy job `legal-corpus:07aa10e095f0c77b28e6ada80fc8` remains
`dead_letter` after five attempts with
`LEGAL_CORPUS_LANGUAGE_FAMILY_CONFLICT`. Its English family variant is
already available in shard-1 and shard-3 under `lexuz-family:8407544`, so
federated retrieval can use the alias without rewriting the failed job.
Recovering the job itself is still restricted to the protected staging admin
action, which requires a named staff session with fresh MFA and the queue
processing flag. No guard was bypassed and no failure row was rewritten.

## Additional catalog discovery

Three newer `juro-legal-catalog-staging*` databases were checked read-only.
The `green2-20260831` database contains a separate normalized Lex catalog with
6,895 source documents, 165,852 snapshot provisions, 160,978 canonical
chunks, sparse and dense projections, and a frozen snapshot. Its search
release is still `draft` and its qualification record reports
`qualificationPending=true`; it has no current Worker binding. It is therefore
held as a candidate and is not silently merged into the legacy federation.

The other two catalog databases also lack the legacy
`legal_corpus_documents`/variants/provisions contract and were not added.

The release gate remains closed. No production binding, migration, flag,
deployment, or DNS was changed. Full machine-readable evidence is in the
adjacent JSON artifact.
