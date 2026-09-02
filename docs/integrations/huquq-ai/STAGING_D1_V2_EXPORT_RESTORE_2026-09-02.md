# Staging D1 v2 export and restore — 2026-09-02

The frozen `juro-staging-corpus-v2` database was exported remotely with
Wrangler and restored into an isolated local SQLite file on `D:`. The restore
used `apps/platform/scripts/verify-d1-full-export-restore.mjs` and completed
with `PRAGMA quick_check = ok`, zero foreign-key violations and migration
ledger count `142`.

The verifier processed 69,074,536 statements and found 258 tables, 563
indexes and 346 triggers. The restored topology contains 599 documents,
1,311,096 provisions and 1,308,850 chunks. The export SHA-256 is
`c1ffaca73040bb85b668215888f1ba28db545102a73dfc68a8b903d9ef8e0b14`; the
restore SHA-256 is
`687189c97645cc827332976e601d28bc2a850f4a48c2319fb211b3692e84f490`.

The remote export is read-only: no source rows, queue rows or failure-ledger
rows were changed. This closes only the isolated v2 D1 export/restore check.
It does not prove a federated snapshot, physical disjointness, Qdrant parity,
indexed 314-scenario evaluation, legal review or production readiness. The
full release gate remains closed.
