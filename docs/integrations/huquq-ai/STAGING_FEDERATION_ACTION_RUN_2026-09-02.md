# Staging federation action run — 2026-09-02

The authorized staging action was completed without rewriting the failure
ledger. The logical ownership projection was rebuilt and verified in
`juro-staging-corpus-shard-4` (`ownership-20260902092231`): 7,152 unique
canonical IDs, four deterministic partitions, and 12,333 source occurrences.
All five source databases were read sequentially; no source rows and no
failure-ledger rows were written.

Queue handling remains fail-closed. The two 10 GB databases are at their D1
ceiling, shard-3 has only 106,496 bytes of headroom and seven terminal/dead
letter failures, and `juro-staging-corpus-v2` contains two stale running version
rows without a live lock. Enabling a drain would risk additional ledger and
capacity damage, so no queue mutation was performed.

The legacy URL `https://lex.uz/en/docs/8411573` is resolved to the existing
`lexuz-family:8407544` language-family document in the federation. This is an
alias resolution only; the original `lexuz:8411573` failure remains intact.
Actual recovery still requires the named legal-corpus staff session with fresh
MFA through the protected staging admin action.

Machine-readable evidence: [STAGING_FEDERATION_ACTION_RUN_2026-09-02.json](STAGING_FEDERATION_ACTION_RUN_2026-09-02.json).
