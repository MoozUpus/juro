# Staging federation activation preflight — 2026-09-03 09:52Z

This is a read-only preflight for handoff
`14f54255-7025-47cd-ae13-38da842132fe`. No activation SQL was executed.

## Observed state

- source `juro-staging-corpus-shard-3`: `frozen`; handoff jobs `23,706`, source
  ready jobs `0`;
- target `juro-staging-corpus-shard-4`: `handoff_prepared`; handoff jobs
  `23,706`;
- target locks/runs/running jobs: `0 / 0 / 0`;
- target ready jobs: `23,706`; all target ready jobs: `23,706`;
- target split: `23,702 queued` and `4 retrying`;
- target documents/provisions/chunks: `0 / 0 / 0`;
- every probe returned `rows_written=0` and `changed_db=false`.

The technical handoff parity checks are currently satisfied, but activation is
deliberately withheld. The protected legacy recovery job
`legal-corpus:07aa10e095f0c77b28e6ada80fc8` remains `dead_letter` at attempt
`5/5`, and the legacy database has zero matching
`legal_corpus_admin_events`. A real named-staff staging session with fresh
MFA/TOTP must record `recover_legacy_ingestion` before this goal's required
activation-and-drain sequence can begin. No technical token, direct D1 write or
ledger substitution was used.

Production, DNS, merge state and production feature flags are unchanged.
