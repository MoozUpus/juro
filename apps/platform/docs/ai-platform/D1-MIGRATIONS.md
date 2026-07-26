# JURO D1 migrations

Updated: 2026-07-26  
Latest source migration: `0016_brief_madelyne_pryor.sql`
Remote application status: not applied.

## Migration policy

JURO uses additive expand-contract migrations. A remote migration requires:

1. verified external D1 protection;
2. recorded schema and application version;
3. local and staging compatibility checks;
4. an isolated restore rehearsal;
5. post-migration counts and foreign-key validation;
6. a documented application/config rollback.

Do not infer remote migration state from source files or a local Wrangler database.

## Migration 0011

`0011_thankful_masked_marvel.sql` adds seven tables without changing or deleting existing tables:

| Table | Purpose |
|---|---|
| `idempotency_keys` | Request-level idempotency records; queue execution uses its own lease/fencing model |
| `job_outbox` | IDs-only durable dispatch boundary with status, attempts, short lease, retry time, and fenced completion |
| `job_runs` | Queue delivery state, canonical envelope hash, tenant identifiers, attempts, short processing lease, retry time, and allowlisted error code |
| `scheduled_locks` | Future scheduled-operation overlap lock |
| `scheduled_runs` | Future deterministic scheduled-run ledger |
| `backup_runs` | Evidence ledger for requested/verified backups and restore tests |
| `cleanup_runs` | Dry-run-first cursor and scanned/deleted/failed counters |

No raw queue payload, prompt, document text, OCR, filename, email, token, object key, or provider error is stored in `job_runs`.

`backup_runs` includes fields for the D1 source bookmark, schema/app version, protected object reference, SHA-256 checksum, byte size, manifest version, verification time, and restore-test time. Empty fields do not constitute backup evidence.

## Migration 0012

`0012_groovy_ben_parker.sql` is an expand/backfill migration for the Phase 2
authorization boundary. It:

- backfills a null `documents.workspace_id` only from the owner's current
  default workspace when the owner still has an active membership;
- backfills linked `document_files.workspace_id` from the linked document;
- backfills remaining files from the owner's active default workspace;
- intentionally leaves unresolved or removed-membership rows null so
  application authorization fails closed;
- adds `auth_otp_ip_created_idx` for OTP IP/time gating;
- adds `documents_workspace_updated_idx` for active-workspace lists.

The migration does not invent a workspace for ambiguous records. Staging is
blocked unless post-migration audits report zero unresolved rows:

```sql
SELECT count(*) FROM documents WHERE workspace_id IS NULL;
SELECT count(*) FROM document_files WHERE workspace_id IS NULL;
```

## Migration 0013

`0013_new_jubilee.sql` is an additive identity-security migration. It:

- creates `auth_devices` for sanitized local-login device labels;
- adds nullable device linkage, explicit authentication method and assurance,
  authentication time, and idle expiry to `auth_sessions`;
- creates the user-scoped `security_events` chain;
- prevents `UPDATE` and `DELETE` on security events with database triggers;
- prevents two events for the same user from claiming the same previous hash;
- leaves legacy session device/authentication/idle fields nullable so the
  existing absolute-expiry behavior remains readable during expansion.

No TOTP secret, backup code, raw IP address, raw user agent, encryption key, or
key-ring value is inserted by the migration.

## Migration 0014

`0014_reflective_captain_cross.sql` adds the complete local MFA persistence
boundary without enabling it in any remote environment. It:

- adds nullable `mfa_verified_at` to `auth_sessions`;
- creates `auth_totp_credentials` for encrypted, versioned TOTP material and
  pending/active/disabled lifecycle state;
- creates `auth_backup_codes` containing only versioned, domain-separated
  HMAC values and one-time consumption metadata;
- creates short-lived `auth_mfa_challenges` between successful email OTP and
  primary-session issuance;
- creates `auth_mfa_factor_claims` as the exact operation/factor fence used by
  confirmation, login, regeneration, and disable batches;
- adds uniqueness and lookup indexes that reject replay and competing factor
  claims while retaining additive, nullable compatibility with 0013.

No plaintext TOTP secret, backup code, OTP, encryption key, or session token is
stored by the migration.

## Migration 0015

`0015_empty_phil_sheldon.sql` adds immutable policy/version evidence and the
verified account-deletion request boundary. It creates the policy registry and
dedicated deletion challenges, adds exact challenge/session evidence to
deletion requests, marks legacy acceptances without inventing content hashes,
and installs append-only/mismatch/one-active-request constraints.

No account data is purged by this migration. The partial active-request index
requires a preflight for duplicate legacy `requested`/`reviewing` rows.

## Migration 0016

`0016_brief_madelyne_pryor.sql` is the expand step for canonical profile email
and phone protection. It:

- adds nullable AES-GCM ciphertext, IV, and key-version columns independently
  for email and phone;
- adds nullable, versioned HMAC-SHA-256 lookup columns;
- adds a unique email lookup index and a non-unique phone lookup index;
- rejects partial protected groups with insert/update triggers;
- leaves existing plaintext identity columns and the legacy email unique index
  unchanged;
- stores no key, secret, ciphertext backfill, or fabricated digest.

The migration alone does not encrypt a row. The application remains explicitly
in `legacy` mode. A protected staging key ring, reviewed backfill invocation,
verification, and a separate contract migration are required before plaintext
can be cleared.

## Local migration evidence

The SQLite-backed migration tests:

- derive migration 0011 from the Drizzle journal instead of relying on its generated adjective name;
- require every 0011 statement to be `CREATE TABLE`, `CREATE INDEX`, or `CREATE UNIQUE INDEX`;
- verify the journal and `0011_snapshot.json`;
- apply migrations `0000`–`0016` with foreign keys enabled;
- report zero `PRAGMA foreign_key_check` rows;
- apply `0000`–`0010`, insert a sentinel workspace, apply 0011, and prove the sentinel and every prior table definition remain unchanged;
- confirm that exactly seven tables are added.

Migration 0012 tests additionally prove that active memberships backfill
documents and files, while a removed membership stays null, and that the
Drizzle snapshot contains both lookup indexes.

Migration 0013 tests additionally prove the new tables/columns/indexes,
database-enforced immutability, chain-fork rejection, and snapshot agreement.

Migration 0014 tests additionally prove the encrypted-credential, backup-code,
pre-auth challenge, factor-claim, session-assurance, replay, and snapshot
contracts. Service tests cover competing login/disable operations and verify
that a losing exact claim cannot perform the winner's session or audit
side-effects.

Migration 0015 tests additionally prove immutable policy rows and acceptance
evidence, honest legacy backfill without an invented content hash, dedicated
deletion challenges, exact request-verification triggers, one active challenge
and request per user, and snapshot agreement. Service tests cover cooldown and
hourly limits, stale/revoked session denial, concurrent reservation and
confirmation, attempt exhaustion, expiry, foreign-session denial, and full
rollback when audit insertion fails.

Migration 0016 tests additionally prove raw-row preservation, nullable expand
compatibility, completeness triggers, keyed email uniqueness, snapshot
agreement, protected dual-read, bounded idempotent backfill, divergence
failure, old-key read/current-key rewrite, and response/session projection
without ciphertext fields.

The full local migration sequence changes the SQLite table count from 79 to
94 and reports zero foreign-key integrity errors. This is compatibility
evidence for the checked-in migration sequence, not
evidence about the live production schema.

## Staging procedure

After remote inventory and backup/restore gates:

1. record the staging D1 database ID and current migration ledger;
2. create and verify an external backup;
3. record its bookmark/checksum/manifest without storing secret values;
4. verify that no user has multiple `requested`/`reviewing` deletion rows,
   because 0015 intentionally installs a partial unique index;
5. apply only pending migrations, including 0011–0016 if absent;
6. verify table/index/trigger presence and foreign keys;
7. run existing route/security tests and isolated document-builder/comparison smoke flows;
8. verify outbox/job lease behavior and Queue/DLQ delivery;
9. run both null-workspace audits and stop if either is non-zero;
10. verify local-session creation, idle expiry, single/other/all revocation, and
   the security-event chain without exposing token or device fingerprints;
11. configure the protected identity key ring while keeping
    `IDENTITY_PROTECTION_MODE=legacy`, then run enrollment, TOTP,
    one-time backup-code, regeneration, disable, and concurrent-claim tests;
12. use an isolated reviewed invocation of the bounded identity backfill,
    verify every profile decrypts and matches retained plaintext, then prove
    old-key read/current-key rewrite before proposing `dual_write`;
13. verify rendered RU/UZ policy digests and run real deletion-code delivery,
    concurrent confirmation, audit, and session-revocation checks;
14. retain the backup until the release window and restore test are complete.

Production migration remains prohibited without explicit owner approval after all staging gates.
