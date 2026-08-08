# Staging D1 export and restore evidence — 2026-07-31

## Snapshot

- Database: `juro-staging` (`bb716a96-b2fb-4823-90d6-6c228fed181a`).
- Operation: `wrangler d1 export juro-staging --remote`.
- Export was downloaded locally only for validation; it was not committed, uploaded, or retained.
- Snapshot SHA-256: `1a0e493cffade1e7f93b01d9c784313ad08c40dd9649a56d61f4ec7f6b56e38e`.
- Snapshot size: 578,326 bytes.
- Structural validation confirmed D1 schema SQL and 51 migration records.
- The time-limited signed download URL is intentionally not recorded in this document or Git.

## Isolated restore rehearsal

The same snapshot was imported into a disposable local SQLite database with foreign-key enforcement disabled only during schema import. Post-import validation returned:

- `d1_migrations`: 51 rows;
- `workspaces`: 2 rows;
- `PRAGMA foreign_key_check`: 0 rows.

A prior attempt through Wrangler's local D1 importer failed on schema ordering (`no such table: main.workspaces`). That importer path is therefore not used as restore evidence. The independent SQLite rehearsal above validates the exported snapshot's relational integrity. No staging or production database write occurred. Temporary SQL and SQLite artifacts were deleted after verification.

This is staging backup-and-restore evidence only; production backup/restore rehearsal remains a separate release gate before production migration.