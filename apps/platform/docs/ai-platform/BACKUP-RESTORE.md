# JURO backup and restore boundary

Updated: 2026-07-28
Status: bookkeeping schema implemented locally; empty-staging Time Travel restore/undo and the subsequent one-time verified-empty staging schema bootstrap through `0021` are verified; portable export retrieval, protected backup object, isolated SQL import/restore, R2 restore, and RTO remain unverified.

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

## Supported D1 recovery mechanisms

JURO uses the current GA mechanisms, not the legacy alpha `wrangler d1 backup` command:

- [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) for bookmark-based point-in-time recovery of the same production-version D1 database;
- [SQL export/import](https://developers.cloudflare.com/d1/best-practices/import-export-data/) for a portable artifact and an isolated restore drill.

Time Travel is always enabled for production-version D1. Its retention window is plan-dependent (currently documented as 30 days on Workers Paid and 7 days on Free), and restore is rate-limited. Exact limits are rechecked immediately before a drill. Time Travel does not clone/fork a database; isolated recovery proof therefore requires SQL export/import into a separate drill database.

## Isolated staging rehearsal

Before any migration of a database containing durable application/user data, and before any further staging migration after the consumed D-040 exception:

1. put the staging application in maintenance/read-only mode and stop queue producers/consumers;
2. prove by database name and UUID that only `juro-staging` is selected;
3. record pinned Wrangler version, account ID, D1 info, exact migration ledger, table/schema/row-count manifest, and current Time Travel bookmark `B0`;
4. export remote `juro-staging` to a local protected SQL artifact outside Git;
5. record bytes and SHA-256 without logging row contents;
6. import the SQL artifact into a separate temporary `juro-staging-restore-drill-<date>` D1;
7. run `PRAGMA quick_check`, `PRAGMA foreign_key_check`, schema inventory, migration-version, row-count, and representative tenant/domain invariants;
8. record import final bookmark, query count, exit status, timings, and sanitized Cloudflare audit-log event identities;
9. delete the drill database only after evidence is captured and the exact disposable ID is revalidated; deletion is a separately reviewed destructive action;
10. keep the export protected according to retention policy and never commit it.

The Time Travel drill then:

1. preserves `B0`;
2. creates one uniquely named synthetic staging marker and captures `B1`;
3. restores `B0` and verifies the marker is absent plus baseline invariants still hold;
4. saves the restore result's `previous_bookmark`, restores it, and verifies the marker returns (undo proof);
5. restores `B0` again, verifies the original baseline, and only then releases maintenance.

Use an exact bookmark rather than a timestamp. Restore operates in place and can cancel in-flight queries/transactions; no production bookmark, name, or UUID may participate in this rehearsal.

Required least privilege:

- read-only info/bookmark/export uses an account-scoped D1 read token if the live export preflight confirms that permission;
- import/restore uses a separate short-lived D1 edit/write token;
- Global API keys are prohibited;
- credential material is entered only through the approved Cloudflare/Wrangler secret profile, never chat, Git, docs, screenshots, or logs.

Cloudflare documentation uses both `D1 Edit` and `D1 Write` wording in different permission surfaces. The exact permission group ID must be resolved from the current account permission catalog before token creation; a `403` does not justify silently broadening access.

Important export/import limits to preflight:

- export blocks other database requests during the operation;
- virtual tables, including FTS5, are not supported by export;
- large integer values outside JavaScript's safe range need explicit verification;
- raw `.sqlite3` files are not accepted as import artifacts;
- current documented file and statement-size limits must be checked before import;
- foreign keys remain enabled; only `PRAGMA defer_foreign_keys` may be used where required, never a permanent disable.

For retained backups outside the Time Travel window, the target automation is the official D1 export API polled by bookmark and streamed to private R2 through a reviewed Workflow. The one-hour signed export URL is never logged or stored as durable evidence.

## R2 protection

An R2 backup manifest must identify only approved object metadata and checksums. It must not expose object keys, user filenames, signed URLs, encryption keys, or document content in logs/alerts. Restore validation samples isolated objects through server-side authorization and checksum verification.

Quarantine, private documents, and backups must be separate buckets in each environment. The remote inventory found production primary `juro-private-documents`, the three older development buckets `juro-private-documents-development`, `juro-private-backups-development`, and `juro-quarantine-development`, plus six new empty private development/staging target buckets. Empty targets are not backup or restore evidence; no object or binding was copied or cut over. No production backup/quarantine bucket exists. Cross-environment restore requires an explicit reviewed procedure and must never reuse production credentials in development.

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

Verified remotely through the one-time verified-empty EEUR `juro-staging` exception only:

- captured pre-bootstrap bookmark `00000016-00000000-000050b6-d17b2ef8af450f78e2ba993d4272fe26`;
- proved the synthetic marker table was absent before the drill;
- created the marker, restored the original bookmark, and proved it was absent;
- restored the API-provided `previous_bookmark` and proved the marker returned;
- restored the original bookmark again and proved the final marker count was zero;
- every verification query was served from EEUR, and the final cleanup state was explicitly re-read.
- applied exactly 22 migrations in ordered ledger sequence `0000`–`0021`, advancing to post-bootstrap bookmark `00000016-00000036-000050b6-48eec1201b71eda52af14c1ba998f030`;
- re-read `PRAGMA quick_check = ok`, zero foreign-key violations, 98 tables including `d1_migrations`, 275 schema objects, and all seven migration-0011 control tables;
- proved the CRLF failure mode for compound `CREATE TRIGGER` statements and the LF success path; `.gitattributes` now pins `apps/platform/drizzle/*.sql` to LF.

Not verified:

- production/development bookmark or export;
- a retrievable staging SQL export with byte size and SHA-256;
- protected R2 backup object;
- restored isolated D1 database;
- R2 restore;
- scheduled backup execution;
- backup-failure alert.

The staging export API reached `complete`, but the authorized connector's egress policy returned HTTP `403` because requests to the signed `r2.cloudflarestorage.com` host are not allowed. The local Wrangler CLI could not retry because the non-interactive shell has no `CLOUDFLARE_API_TOKEN`; no token is requested in chat. No SQL bytes, checksum, protected R2 object, or isolated restore-drill database were produced, so the portable procedure remains blocked and no backup, portable restore, or RTO is claimed.

No further remote migration or deployment may use this document as evidence that the missing portable operations succeeded. The verified-empty D-040 exception is consumed and cannot be reused for a populated staging database or production.

Remote schema-inventory evidence now records: `juro-production` (`4cce509b-0e02-4ca9-a3ba-a5ce1327aeda`) and `juro-development` (`d07670cf-f7bf-460c-a668-101671d4c330`) each report 61 non-internal tables and applied migrations `0000`–`0004`; `juro-staging` reports the exact `0000`–`0021` ledger and verified manifest above. That bootstrap evidence is not portable-backup, isolated-import, restore, or RTO evidence.
