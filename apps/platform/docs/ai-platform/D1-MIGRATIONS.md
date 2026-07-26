# JURO D1 migrations

Updated: 2026-07-26  
Latest source migration: `0014_reflective_captain_cross.sql`
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

## Local migration evidence

The SQLite-backed migration tests:

- derive migration 0011 from the Drizzle journal instead of relying on its generated adjective name;
- require every 0011 statement to be `CREATE TABLE`, `CREATE INDEX`, or `CREATE UNIQUE INDEX`;
- verify the journal and `0011_snapshot.json`;
- apply migrations `0000`–`0014` with foreign keys enabled;
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

The full local migration sequence changes the SQLite table count from 79 to
92 and reports zero foreign-key integrity errors. This is compatibility
evidence for the checked-in migration sequence, not
evidence about the live production schema.

## Staging procedure

After remote inventory and backup/restore gates:

1. record the staging D1 database ID and current migration ledger;
2. create and verify an external backup;
3. record its bookmark/checksum/manifest without storing secret values;
4. apply only pending migrations, including 0011–0014 if absent;
5. verify table/index presence and foreign keys;
6. run existing route/security tests and isolated document-builder/comparison smoke flows;
7. verify outbox/job lease behavior and Queue/DLQ delivery;
8. run both null-workspace audits and stop if either is non-zero;
9. verify local-session creation, idle expiry, single/other/all revocation, and
   the security-event chain without exposing token or device fingerprints;
10. configure the protected identity key ring and run enrollment, TOTP,
    one-time backup-code, regeneration, disable, and concurrent-claim tests;
11. retain the backup until the release window and restore test are complete.

Production migration remains prohibited without explicit owner approval after all staging gates.
