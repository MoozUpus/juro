# JURO backup and restore boundary

> Current `0038` recovery checkpoint — 2026-07-31: pre-change bookmark `000001cb-00000000-000050b9-33ca6e2205d62bf7a5d39a773b0f4344`; private R2 export `d1/juro-staging/20260731T050713Z/pre-0038-full.sql`, 399,627 bytes, SHA-256 `db727653fc02f0d1f1a7dab15848ea23be46db8217e67b833309aa4e9879259e`, exact round trip; final post-probe bookmark `000001d5-00000008-000050b9-14ad566220bf7432803d38b87be08bd8`. Direct import of this raw export is not claimed because Cloudflare's row order violates the local FK graph; exact Time Travel plus the previously verified parent-first through-`0037` restore are the recovery evidence. See `STAGING-0038-ADVICE-EVIDENCE.md`.

Updated: 2026-07-30
Status: empty-staging Time Travel restore/undo, portable SQL exports, private staging R2 upload/download checksum verification, isolated local SQL restore, and disposable remote-D1 import drills are verified; protected staging is through migration `0034` with migration-specific pre/post private-R2 checkpoints and a pre-change isolated restore. Scheduled backup automation, production protection, and an operational RTO remain unverified.

Before the 2026-07-30 synthetic account-deletion probe, staging bookmark
`0000003f-00000004-000050b7-3c394315c39668592aa1df99f9932548` was recorded.
The probe failed closed during identity-key validation before fixture creation:
both exact R2 keys were absent, synthetic profile/deletion/file counts remained
zero, `PRAGMA quick_check` returned `ok`, and `PRAGMA foreign_key_check`
returned no rows. The bookmark is recovery evidence only; no restore was needed.

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

## Current evidence and remaining recovery gate

Wrangler OAuth was approved only for staging. The first three portable SQL
checkpoints were exported, hashed locally, uploaded to private
`juro-staging-backups`, downloaded again, and compared byte-for-byte:

| Checkpoint | Protected object | Bytes | SHA-256 | Restored state |
|---|---|---:|---|---|
| before `0022`–`0028` | `d1/juro-staging/20260728T230035Z/pre-0022-0028.sql` | 98,760 | `fb388a77cd4c07af06a7bfb3950e91f69266d1938b66a711f3963fc352bc12bb` | 22 migrations; 99 non-internal tables; integrity `ok`; zero FK errors |
| after `0022`–`0024`, before retry | `d1/juro-staging/20260728T231145Z/pre-0025-0028.sql` | 101,926 | `27180d625c96f13b370cfedc05d2c290531a9b9106b7ef063cd95f643434474e` | 25 migrations; 99 non-internal tables; integrity `ok`; zero FK errors |
| after `0028` | `d1/juro-staging/20260728T231347Z/post-0028.sql` | 137,345 | `20e9d14e5eb279160eeebb59cd839882f3ff70afb758924a15bcd735965b981c` | 29 migrations; 107 non-internal tables; 58 triggers; integrity `ok`; zero FK errors |

The first checkpoint restored 325 SQL commands. Each local restore used the
exact downloaded bytes in a separate SQLite database; no application data or
signed export URL was printed or committed. The R2 objects are private and
contain staging schema/data only.

On 2026-07-29 the exact `post-0028.sql` object was downloaded again and its
137,345-byte size and SHA-256 were reverified before import into disposable
EEUR D1 `juro-staging-restore-drill-20260729`
(`0c3f0d3c-b752-4aff-83b9-17621a5ef92e`). Wrangler processed 396 queries,
reported 515 rows read, 667 rows written, a 33.63 ms D1 SQL duration, and final
bookmark `00000000-0000002e-000050b7-46635df5f2714068c57af19c5a56f025`.
Identical read-only queries against source and restored D1 returned 29
migrations, 108 total/107 non-internal tables, 58 triggers, matching final five
migration rows, and zero `foreign_key_check` results. The disposable name/ID
was revalidated, the database was deleted, and the local temporary copy was
removed. This proves the remote logical import path for this staging artifact;
it is not a production RTO or an incident/load recovery measurement.

### Session-token rotation checkpoint — 2026-07-29

Before migration `0029`, a second migration-specific set was retained under
`d1/juro-staging/20260729T111105Z/`:

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `pre-0029.sql` | 147,785 | `8388fe9098d9c1ec14ff4d4ce2c18e5a173522104546188c4cdb771995b63c00` |
| `pre-0029.schema.sql` | 130,474 | `94b91cdfb6c57a72cd085001de211693e1994b9338542abb15aeb4cbff489850` |
| `pre-0029.data.sql` | 17,343 | `3738a618cb46176a3ba7bbcd8da21bfc53020049819b145c7570c4d745a3589f` |
| `pre-0029.restore.sql` | 159,412 | `33576f95ecffc97d3eaaceae764821264001b84ea7f99f2f52d096aa19d1238e` |

Every object passed a private-R2 download/checksum round trip. The official
full export was retained unchanged but is not directly importable because its
statement order references `workspaces` before creating it. Schema-then-data
also fails against its trigger/foreign-key order. The restore-only adapter is a
deterministic reconstruction of the exact official schema/data with parent-
first rows and triggers last; it never changes the retained source exports.
A clean remote drill processed 414 queries. Read-only comparison proved all
106 exported tables and all 74 rows identical to source, together with 29
migrations, 58 triggers, and zero foreign-key violations. The exact disposable
D1 was revalidated and deleted after the drill.

After migration `0029`, a fresh set was retained under
`d1/juro-staging/20260729T113422Z/`:

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `post-0029.sql` | 150,134 | `c8474fc28b5a80c8705b10cc59de158bbf3bc60687211dfce16042beec9accfd` |
| `post-0029.schema.sql` | 132,700 | `edb5751fd97af0c1fd8995b6bb5d05eda50185e54af55edb54fb09033139caaf` |
| `post-0029.data.sql` | 17,466 | `00d5566e6eadfca0a89f23c8d96ef803505b2a77438d2ee461cf2e0c38dd4953` |

All three post-migration objects passed byte-for-byte private-R2 round trips.
Remote D1 then reported 30 migrations through `0029`, 109 non-internal tables,
58 triggers, both new token-security tables, zero rows in them, no pending
migration, and zero foreign-key violations. A direct incident-load RTO remains
unmeasured; the verified pre-migration restore plus additive migration file is
the tested recovery route for this checkpoint.

The earlier Time Travel drill remains valid and separate. A pre-migration
bookmark at `2026-07-28T23:00:35Z` was also recorded as
`00000017-00000002-000050b6-5518e3818b19ceb53f63bd9b37be4e08`.
It was not used for a restore because the additive migration completed and all
post-migration checks passed.

### Pending security-email checkpoint - migration 0030

Migration `0030` is local only. Before any remote application, create new
pre-migration full/schema/data exports, record the staging bookmark and exact
30-entry ledger, verify private-R2 checksum round trips, and repeat the
disposable remote-D1 logical import. Apply only `0030`, verify the 31-entry
ledger plus the new table/index/trigger and zero foreign-key violations, then
retain and checksum a post-migration export. If any step fails, do not deploy
the email consumer; restore to a disposable database and use the retained
pre-0030 artifact as the reviewed recovery input. No 0030 backup or restore
claim exists yet.

Still not verified:

- an operational RTO/RPO under representative incident conditions and load;
- production/development export, backup, restore, or bookmark state;
- R2 user-file backup and object-level recovery;
- scheduled backup execution, retention cleanup, failure alert, and RTO;
- production backup/quarantine buckets.

The verified-empty D-040 exception remains consumed. These staging artifacts
do not authorize a production migration. Production/development remain through
`0004`; only `juro-staging` is through `0033`.

### Pre-0030–0033 account-deletion checkpoint — 2026-07-30

Immediately before the staging candidate, remote `juro-staging` reported `quick_check=ok`, 30 applied migrations through `0029`, and exactly four pending files: `0030_eager_shen.sql`, `0031_melted_nextwave.sql`, `0032_fixed_wasp.sql`, and `0033_freezing_havok.sql`.

Time Travel bookmark: `00000035-00000000-000050b7-179d399e193e3067399de9571322a50b`.

Private prefix: `d1/juro-staging/20260729T203509Z/` in `juro-staging-backups`.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `juro-staging-pre-0030-0033-full.sql` | 150,134 | `cca4b78cee1e56b323da2a3a89d88df07ea6f14aff310ba3b04681e4b0de4832` |
| `juro-staging-pre-0030-0033-schema.sql` | 132,700 | `edb5751fd97af0c1fd8995b6bb5d05eda50185e54af55edb54fb09033139caaf` |
| `juro-staging-pre-0030-0033-data.sql` | 17,466 | `4d585bcc89cf3c80eb131e526ad7d7da2d80b97d6cb8c77fd97e0c5e4566df73` |
| `manifest.json` | 1,023 | `99f4321c3db6a7ec5e84971c3dbecc6c71338f069aa4226cff53f48862b65f53` |

All four objects were downloaded from private R2 and matched local bytes exactly. The current schema export is byte-identical to the prior verified post-`0029` schema; the data export differs only in `auth_sessions` and `auth_devices` rows, not table shape. The existing disposable logical-import drill therefore covers the same schema/import topology, while the current bookmark and round-tripped exports cover current row recovery. This is not a measured incident RTO.

If staging verification fails, first roll the Worker back to version `448e5bf1-4bf8-4000-af2b-2c034e3eca10` and disable async/cron/purge. If schema recovery is actually required, place staging in maintenance and use the recorded Time Travel bookmark; portable exports are the independent recovery input. Never run the restore against production.

### Post-0033 account-deletion checkpoint — 2026-07-29 UTC

After `0030`–`0033` were applied and postflight passed, Wrangler recorded Time Travel bookmark `00000038-00000000-000050b7-3dd08fc7ac98dc71649719b525b4abf6`. The exact deployed commit is `a1261c3c68151f9c275187fd422bd58c67b673a8`; staging deployment `a38d3cbc-7fd1-4829-be9d-97249f265882` serves Worker version `12a3abf3-af6d-41da-8726-b7abf03f5dbf`.

Private prefix: `d1/juro-staging/20260729T210508Z/` in `juro-staging-backups`.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `juro-staging-full.sql` | 169,952 | `c52bf13c57d21671b592c680fe57f488347e280d3810164186b0fe73d06be398` |
| `juro-staging-schema.sql` | 151,987 | `dd0410958e2428d3e0dddd7f31848592653c54148aa85f0f5a96250378810e25` |
| `juro-staging-data.sql` | 17,997 | `4a124d8fc85abe9cb965e2576016c4017b5ded80d31cba3a0b4983575a489694` |
| `manifest.json` | 1,007 | `fdbb0673933d3feb97c6201e998c9c5e4fc4cd8c63b9c50eb174fe325a71b10d` |

All four objects were downloaded from the private bucket and matched their local SHA-256 exactly. This verifies portable backup round-trip, not a measured operational RTO. Application rollback uses prior Worker version `448e5bf1-4bf8-4000-af2b-2c034e3eca10`; schema recovery is reserved for demonstrated corruption and uses the pre-change bookmark under staging maintenance. Production is never a target for these commands.

## Migration 0034 checkpoint

The exact bookmarks, private object prefixes, byte sizes, SHA-256 values,
restore ordering evidence, topology, and postflight for the `0034` migration
are recorded in `STAGING-0034-EVIDENCE.md`. The pre-change set passed an
isolated local restore with source-equivalent counts and integrity. Both
pre/post four-object sets passed private-R2 round-trip verification. This does
not establish an operational RTO or production recovery readiness.## Post-0036 legal-source checkpoint — 2026-07-30

The current post-0036/probe Time Travel bookmark is 00000132-00000000-000050b8-5322bcabc623a793a84c98f8d6290f3d. Four portable artifacts are retained under private R2 prefix juro-staging-backups/d1/juro-staging/20260730T170300Z/. Their byte sizes, SHA-256 values, and exact download round trips are listed in STAGING-0036-EVIDENCE.md.

Because the raw Cloudflare export order can violate foreign-key insertion order on remote import, the recovery set includes a deterministic parent-first artifact generated from the actual exported schema's foreign-key graph. That artifact was first restored locally and then imported into disposable remote D1 a4959a8e-a93b-435a-a9d2-4412ee651f89. Aggregate data/schema fingerprints, quick_check, and foreign_key_check passed. The disposable D1 was deleted after the drill; the private R2 recovery set remains available.

This is a verified staging checkpoint, not a production backup authorization or a measured production RTO.

## Migration 0040 staging recovery points — 2026-07-31

Before `0040`, `juro-staging` recorded bookmark
`00000200-00000000-000050b9-a424c2364078007537608621517e16d6` and private-R2
portable export `d1/juro-staging/20260731-141719/pre-0040.sql`, 446,306 bytes,
SHA-256 `e8230a91eb38472666b2333278038d5e75c57153a4f707da2b18b148cdb5fb2b`.

After `0040`, bookmark
`00000201-00000006-000050b9-0cf0522bce80aeababd50a483ea35489` and private-R2
portable export `d1/juro-staging/20260731-141949/post-0040.sql`, 450,367 bytes,
SHA-256 `42d0e9970ca0ef229c09f632d48b211c5135170adf877b5af0896ed1844f0460`
were retained. Both objects were independently downloaded and matched their local
hash. Use Time Travel or the pre export only for demonstrated corruption; normal
rollback restores Worker version `3bc029a3-8722-4edd-8c05-d615d5ce9a13` and leaves
the additive empty table unused.

## Migration 0041 staging recovery points — 2026-07-31

Before `0041`, `juro-staging` recorded bookmark
`00000213-00000000-000050b9-d3188759cc17b15922cc19e3067e435e` and private object
`d1/juro-staging/20260731-104422/pre-0041.sql`: 458,765 bytes, SHA-256
`aeafeb5e83aef30a3a3f2af2b4e5a63f0474f6c069696edf3407ef633785aafe`.

After `0041`, the bookmark is
`00000213-00000002-000050b9-98618a5881cf0c076ff24687e4bae749`; private object
`d1/juro-staging/20260731-104422/post-0041.sql` is 463,690 bytes with SHA-256
`99f0357fc665338f53e4a0c6062134ac267cb5fc04dde34f2da12302a5b1d51f`.

Both portable exports were downloaded independently from
`juro-staging-backups` and matched their local SHA-256. A routine Worker rollback
does not require D1 restore because `0041` is additive and empty. A Time Travel
restore is destructive and is reserved for demonstrated D1 corruption.

## Migration 0048 staging recovery points — 2026-07-31

Before `0048`, `juro-staging` recorded bookmark
`0000027f-00000000-000050b9-568547b6791b8ebf3181ddc4feec38c2` and private object
`d1/juro-staging/20260731-phase9/pre-0048.sql`: 529,404 bytes, SHA-256
`a17a152eea9fc16dcd95f3a61a6ca6093dcb201a5392b8014314abbbffb853fd`.

After `0048`, the bookmark is
`00000282-00000000-000050b9-4bd7353de17021bcc16033ffcda9b598`; private object
`d1/juro-staging/20260731-phase9/post-0048.sql` is 532,542 bytes with SHA-256
`d3337083b48abb922b7d66ac3b2178f4ff3c9239acdbe55e9182025c4880df0e`.

Both private exports were independently downloaded and matched their local
hash. A routine Worker rollback leaves the additive diagnostic table unused;
Time Travel is reserved for demonstrated database corruption. Production is out
of scope.
