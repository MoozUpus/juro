# Staging D1 shard-1 export and restore — 2026-09-02

The frozen `juro-staging-corpus-shard-1` database was exported remotely with
Wrangler and restored into an isolated local SQLite file on `D:`. The restore
used `apps/platform/scripts/verify-d1-full-export-restore.mjs` and completed
with `PRAGMA quick_check = ok`, zero foreign-key violations and migration
ledger count `143`.

The restored topology contains 1,635 documents, 370,808 provisions and
369,081 chunks. The remote export command reported no writes to the source
database; no source rows or failure-ledger rows were modified.

This closes only the isolated shard-1 D1 export/restore check. It does not
prove a federated snapshot, physical disjointness, Qdrant parity, indexed
314-scenario evaluation, legal review or production readiness. The full
release gate remains closed.
