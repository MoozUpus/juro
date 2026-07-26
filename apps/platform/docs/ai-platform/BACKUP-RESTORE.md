# JURO backup and restore boundary

Updated: 2026-07-26  
Status: bookkeeping schema implemented locally; no remote backup or restore rehearsal verified.

## What is not a backup

Migration `0004_secure_sandstone.sql` copied operational tables into `__backup_*` tables inside the same D1 database. Those copies are preserved as migration history, but they are not independent protection against database loss, account compromise, or a failed database-wide migration.

The `backup_runs` table is an evidence ledger. Creating a row does not create a backup, verify bytes, or prove recoverability. A run must never be marked `verified` or `restore_tested` without the corresponding control-plane operation and evidence.

## Required D1 protection

Before every remote migration:

1. identify the exact environment and D1 database;
2. record the application version, schema version, and D1 bookmark/time-travel reference;
3. create a control-plane export or other approved independent snapshot;
4. store it in a protected, environment-specific backup location;
5. calculate and record SHA-256, byte size, and manifest version;
6. restore into an isolated database;
7. run schema, row-count, foreign-key, tenant-isolation, and representative read checks;
8. record verification and restore-test timestamps;
9. keep production write access disabled during an actual recovery decision.

The application request Worker must not claim that an export succeeded merely because a `BACKUP_BUCKET` binding exists. If the scoped control-plane capability is unavailable, the run status is `blocked` or `not_configured`.

## R2 protection

An R2 backup manifest must identify only approved object metadata and checksums. It must not expose object keys, user filenames, signed URLs, encryption keys, or document content in logs/alerts. Restore validation samples isolated objects through server-side authorization and checksum verification.

Quarantine, private documents, and backups are separate buckets in each environment. Cross-environment restore requires an explicit reviewed procedure and must never reuse production credentials in development.

## Queue and cleanup recovery

Outbox and job execution are at-least-once:

- dispatch uses a short lease and fenced status update;
- a crash after `Queue.send()` but before `dispatched` can resend;
- consumers deduplicate by canonical envelope hash and idempotency key;
- cleanup remains cursor-based and dry-run-first;
- user content, consents, and access audit are not automatically purged by the Phase 1 runtime.

Deletion of R2-backed content will require a tombstone/outbox flow so the object key remains recoverable until idempotent R2 deletion succeeds.

## Current evidence and blocker

Verified locally:

- additive migration and foreign-key integrity;
- backup/cleanup ledger schema;
- source-to-artifact migration SHA-256 equality;
- outbox retry/lease behavior in SQLite-backed tests.

Not verified:

- production or staging D1 bookmark/export;
- protected R2 backup object;
- restored isolated D1 database;
- R2 restore;
- scheduled backup execution;
- backup-failure alert.

No remote migration or deployment may use this document as evidence that those missing operations succeeded.
