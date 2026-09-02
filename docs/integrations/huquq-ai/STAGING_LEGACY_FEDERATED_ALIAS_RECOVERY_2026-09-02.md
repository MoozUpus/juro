# Legacy dead-letter federated resolution — 2026-09-02

The preserved legacy failure for `https://lex.uz/en/docs/8411573` uses the
older identifier `lexuz:8411573`. Sequential read-only checks found the same
official URL already indexed in shard-1 and shard-3 as
`lexuz-family:8407544`, with the `ПП-294` document available in English,
Russian, Uzbek Cyrillic and Uzbek Latin (1/11/11/11 current provisions).

The existing five-source federation therefore has a verified URL-level
representative for chat retrieval. No legacy job, failure row, source document,
or shard row was modified. The administrative retry remains a separate
MFA-bound action and was not simulated. This evidence resolves the retrieval
alias, but it does not turn the legacy dead-letter into a successful job or
close the release gate.

Machine-readable evidence: [STAGING_LEGACY_FEDERATED_ALIAS_RECOVERY_2026-09-02.json](STAGING_LEGACY_FEDERATED_ALIAS_RECOVERY_2026-09-02.json).
