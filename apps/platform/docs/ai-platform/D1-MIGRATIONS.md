# JURO D1 migrations

Updated: 2026-07-29
Latest source migration: `0028_orange_nightmare.sql`
Remote application status: `0000`–`0004` are applied to both `juro-production` and `juro-development`; `0005`–`0028` are not applied there. Isolated EEUR `juro-staging` (`bb716a96-b2fb-4823-90d6-6c228fed181a`) has the exact 29-entry `0000`–`0028` ledger. Its post-migration export restores with `integrity_check = ok`, zero foreign-key violations, 107 non-internal tables, and 58 triggers. No production migration was run.

## Migration policy

JURO uses additive expand-contract migrations. A remote migration requires:

1. verified external D1 protection;
2. recorded schema and application version;
3. local and staging compatibility checks;
4. an isolated restore rehearsal;
5. post-migration counts and foreign-key validation;
6. a documented application/config rollback.

Do not infer remote migration state from source files or a local Wrangler database.

D-040 allowed one bootstrap of a freshly created, immediately re-verified empty staging database without a retrievable portable export. That exception is now consumed. It does not weaken the normal policy above for any further staging mutation, any populated database, or production.

## Staging migration record — 2026-07-28 UTC

Before migration `0022`, Wrangler exported the 22-entry staging database,
verified its SHA-256, uploaded it to private `juro-staging-backups`, downloaded
the object again, and restored 325 SQL commands into an isolated local
database. Integrity, foreign keys, table inventory, and the migration ledger
passed.

The first standard Wrangler migration run applied `0022`, `0023`, and `0024`.
Migration `0025` then failed atomically with `incomplete input`; `0026`–`0028`
did not run. The remote parser rejected `SELECT CASE ... THEN RAISE(...) END`
inside trigger bodies even though local SQLite accepted it. The trigger guards
were rewritten without changing their predicates or error messages to the
D1-compatible form `SELECT RAISE(...) WHERE condition`. A regression test now
rejects the incompatible form in migrations `0025` and later.

A second portable export/private-R2 retrieval/local-restore checkpoint captured
the exact `0000`–`0024` state before retry. The retry then applied `0025`–`0028`
successfully. Wrangler reports no pending staging migrations. A third export
of the `0000`–`0028` state passed the same restore, integrity, foreign-key,
table, trigger, and ledger checks. The exact artifact hashes and protected
object references are recorded in `BACKUP-RESTORE.md`.

The exact post-`0028` artifact was also imported on 2026-07-29 into a separate
remote EEUR D1. Source and restore agreed on the 29-entry migration ledger,
107 non-internal tables, 58 triggers, the final five migration rows, and zero
foreign-key violations. Wrangler processed 396 import queries with 667 rows
written. The disposable database was reidentified by exact name/UUID and
deleted after evidence capture. This verifies logical remote import for the
staging artifact, not production compatibility or an operational RTO.

Remote D1 rejects `PRAGMA integrity_check` through the service authorization
boundary. The integrity claim above comes from the exact exported bytes after
private-R2 round trip, not from an unsupported remote pragma. Remote queries
separately verified the ledger, tables, and triggers.

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

## Migration 0017

`0017_ancient_thunderbird.sql` is the additive invitation-evidence expand
step. It:

- adds nullable AES-GCM ciphertext/IV/key-version and versioned lookup-HMAC
  fields to workspace invitation email;
- adds nullable email/phone kind and versioned lookup-HMAC fields to document
  invitation targets;
- adds partial lookup indexes for workspace and document authorization paths;
- rejects partial or malformed protected groups with insert/update triggers;
- preserves workspace plaintext email, legacy SHA-256 fields, tokens,
  invitation lifecycle state, and every pre-existing row;
- stores no key, secret, ciphertext backfill, or fabricated keyed digest.

The migration alone protects no invitation. Checked-in mode remains `legacy`.
After a reviewed staging switch to `dual_write`, newly created invitations use
keyed evidence while pre-0017 invitations retain legacy compatibility for
their bounded seven-day lifetime. A later contract migration requires a
verified TTL drain or revocation/reissue process.

## Migration 0018

`0018_loud_puck.sql` is the additive short-lived challenge-evidence expand
step. It:

- adds nullable, versioned HMAC fields for OTP email, request IP, and code;
- adds nullable, versioned HMAC fields for account-deletion email and code;
- adds OTP email/time and IP/time lookup indexes used across retained key
  versions;
- rejects partial, malformed, or cross-group keyed evidence with insert/update
  triggers;
- preserves every raw email, legacy SHA-256 digest, salt, attempt counter,
  expiry/lifecycle timestamp, foreign-key reference, and pre-existing row;
- stores no key, secret, plaintext code, generated backfill, or fabricated
  digest.

The migration alone protects no challenge. In checked-in `legacy` mode the
application continues writing the old fields and null keyed groups. A reviewed
staging `dual_write` switch writes both forms, treats keyed evidence as
authoritative, checks retained SHA consistency, and tries all retained lookup
key versions for rate limiting. Contract cleanup is separate: a ten-minute TTL
does not prove that an historical row is unreferenced by MFA, policy, or
deletion-request evidence.

## Migration 0019

`0019_broad_mongu.sql` adds the dedicated email-change challenge boundary. It:

- creates `email_change_challenges` without modifying or deleting an existing
  table or row;
- binds each challenge to one user and one local session;
- stores separate salted code evidence for the current and proposed email;
- adds rollback-safe raw/SHA fields plus nullable, versioned encrypted/HMAC
  evidence for `dual_write`;
- limits a user to one active challenge and one successful operation ID;
- indexes protected new-email lookup, expiry, and user/time paths;
- rejects partial evidence groups, malformed digests/key versions, provider
  queueing before reservation, consumption before queueing, mixed consumed
  state, and invalidation after successful consumption.

The migration stores no plaintext code, key material, fabricated backfill, or
provider credential. It deliberately retains the proposed raw email and legacy
SHA evidence while checked-in identity mode remains `legacy`; removing either
requires a later verified contract migration.

## Migration 0020

`0020_elite_leo.sql` creates the separate platform staff assignment boundary.
It does not create a staff user, bootstrap a role, add an admin route, or grant
access to a workspace, case, document, or customer record. It:

- allows only `administrator`, `support`, and `legal_reviewer`; workspace
  `owner`, `admin`, and `lawyer` values are intentionally invalid;
- records whether a grant came from a separately authorized operator bootstrap
  or another administrator, including the actor, reason, and expiry;
- requires every assignment to expire and limits a user to one unrevoked
  assignment for each role;
- prevents self-grant through the administrator path;
- makes identity, role, source, reason, grant time, expiry, and creation
  evidence immutable;
- permits only one transition from active to revoked, then rejects
  reactivation, further mutation, and deletion;
- keeps subject/grant/revoke actor foreign keys restrictive so privileged
  evidence cannot disappear through profile deletion.

The application policy rechecks the live D1 session, active TOTP credential,
MFA timestamp, device/session revocation, assignment start/expiry/revocation,
and an explicit capability on each invocation. Administrator, support, and
legal-review capabilities are non-inheriting; combining duties requires
separate assignments. No checked-in route invokes the boundary yet.

## Migration 0021

`0021_supreme_albert_cleary.sql` adds
`platform_staff_role_events`, an append-only role-change ledger. It does not
insert an administrator, provide operator bootstrap, expose an HTTP endpoint,
or grant access to customer content. The migration:

- accepts only `staff.role.granted` and `staff.role.revoked` for the fixed
  `staff.roles.manage` capability and exact platform-role vocabulary;
- retains restrictive actor, subject, and assignment references while keeping
  the historical session identifier opaque and non-cascading;
- requires a live, unrevoked local MFA session and device, MFA no more than
  five minutes old, active TOTP, and an active administrator assignment at
  the exact event time;
- binds each event to the matching grant or one-way revocation state;
- enforces one grant and one revoke event per assignment;
- requires the first per-actor event to use the genesis hash and every later
  event to continue the sole current chain head;
- rejects event update and deletion.

The internal service grants roles for at most 30 days, requires active TOTP on
the subject, forbids administrator self-grant, rejects stale/expired role
state, and permits explicit administrator self-deprovisioning. Role mutation
and event insertion share one D1 batch; a chain race retries against the new
head, while an assignment race has one winner. No checked-in route, Worker,
job, or UI imports this service.

## Migration 0022

`0022_workspace_invitation_claim.sql` adds the atomic workspace-invitation
acceptance fence without deleting or rewriting existing invitation rows. It:

- adds nullable `workspace_invitations.acceptance_claim_id`;
- creates a unique partial index for non-null claim identifiers;
- requires `accepted_at` and `acceptance_claim_id` to be present or absent
  together on insert/update;
- makes both fields immutable after a claim has been recorded.

The acceptance service uses one D1 batch. A guarded `UPDATE ... RETURNING`
claims only the exact token and invitation identity evidence while the row is
unaccepted, unrevoked, and unexpired. Membership activation, default-workspace
selection, and the deterministic `workspace-invitation:<id>:accepted` audit
event are all conditional on that exact claim. An existing `owner` role is
preserved rather than downgraded by an invitation. The immutable claim is not
a general tamper-evident replacement for `workspace_audit_events`.

## Migration 0023

`0023_otp_verification_lock.sql` adds the verification-abuse lock without
changing an existing challenge's default behavior. It:

- adds nullable `auth_otp_challenges.verification_locked_until`;
- adds legacy-email and keyed-email lookup indexes for active locks;
- permits a lock only when `attempt_count >= max_attempts`;
- makes a non-null lock timestamp immutable.

The local verification service sets the lock atomically when the fifth wrong
attempt exhausts the default five-attempt challenge. The lock expires after 15
minutes, is returned as a distinct unavailable state with retry timing, and
prevents reservation of a replacement challenge for the same email while
active. Independent hourly request limits are application logic, not new
columns in this migration.

## Migration 0024

`0024_parched_catseye.sql` is an additive onboarding-profile expansion. It
adds nullable `last_name`, `first_name`, `middle_name`,
`phone_verified`, and `phone_verified_at` columns to `user_profiles`, plus a
database guard that prevents contradictory phone-verification evidence. It
does not backfill an asserted name, change an existing `account_type`, or
claim that legacy phone numbers were verified. Existing profiles remain
compatible with all new fields unset.

## Migration 0025

`0025_clean_harpoon.sql` is an additive legal-source lifecycle expansion. It
adds source versions, sections, chunks, synchronization runs/errors, and a
legal-review queue. Existing `legal_sources` rows receive a fail-closed
`verification_state='draft'`; no legacy verified state, reviewer, timestamp,
or content digest is invented.

Database triggers enforce bounded lifecycle vocabularies, explicit
reviewer/time/lowercase-SHA-256 evidence for verified sources and versions,
immutability of that evidence while verified, terminal sync completion
evidence, nonnegative counters, and complete legal-review decisions. A
partial unique index permits only one running source synchronization for a
given lock key.

## Migration 0026

`0026_panoramic_toad_men.sql` additively creates
`legal_source_fetch_requests` and a unique `(version_id, reason_code)` review
fence. It does not modify or delete an existing legal source or promote any
record to verified. The request table stores only an official canonical URL
and opaque identifiers; fetched HTML remains in private R2.

Database triggers enforce exact environment/source/locale/status vocabulary,
canonical HTTPS Lex/Advice path shape, paired source/version results,
attempt/start/finish/error evidence for every lifecycle state, immutable
request identity, nondecreasing attempts, and immutable completed evidence.
The application creates the request and identifiers-only outbox row in one D1
batch. Fetch execution is idempotent and stores only `fetched`/
`pending_review` results. R2 and D1 cannot form one transaction; the service
writes an immutable content-addressed R2 object first, then performs
idempotent D1 persistence. A D1 failure can leave an unreferenced immutable
object for later inventory/cleanup, but cannot create a trusted source.

## Migration 0027

`0027_closed_masked_marvel.sql` adds canonical legal-review decision evidence
to the existing review queue. It records the exact reviewer, session, source,
version, raw/parsed hashes, decision, substantive notes, fresh-MFA time,
canonical evidence JSON, and its SHA-256 without fabricating evidence for
legacy terminal rows. Guards enforce one-assignee review, coherent relational/
JSON evidence, restrictive reviewer identity, and immutable/undeletable
terminal decisions. Approval deliberately does not publish trusted content.

## Migration 0028

`0028_orange_nightmare.sql` additively creates
`legal_source_publications`. Each publication is uniquely bound to one approved
review and one version and records the exact review/raw/parsed evidence, the
publisher, canonical identifiers-only publication evidence, and its SHA-256.
Insert guards require an approved coherent `0027` decision, a still-pending
version, matching unverified source identity, canonical reviewer/publisher
session/assignment/MFA references, and exact bounded section/chunk counts and
1:1 row shape. The server service validates those access references against
live staff, session, and TOTP state. Missing JSON fields fail closed via
explicit `COALESCE`.
Publication records are immutable and undeletable. Once published, the
version-specific reading sections and chunks are also immutable and
undeletable. The application performs canonical SHA-256 verification because
SQLite/D1 has no built-in SHA-256 function.

## Local migration evidence

The SQLite-backed migration tests:

- derive migration 0011 from the Drizzle journal instead of relying on its generated adjective name;
- require every 0011 statement to be `CREATE TABLE`, `CREATE INDEX`, or `CREATE UNIQUE INDEX`;
- verify the journal and `0011_snapshot.json`;
- apply migrations `0000`–`0028` with foreign keys enabled;
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

Migration 0017 tests additionally prove legacy workspace/document invitation
preservation, additive-only SQL, snapshot/index agreement, DB rejection of
partial or invalid evidence, record-bound encryption, purpose separation,
keyed-authoritative matching, unknown-key failure, and explicit legacy
rollback behavior.

Migration 0018 tests additionally prove additive-only SQL, snapshot/index
agreement, preservation of legacy challenge rows, DB rejection of partial
email/code/IP keyed groups, old-key rate-limit lookup, record/purpose/session
code binding, keyed-authoritative verification, retained-SHA divergence
failure, exact legacy rollback, attempt fencing, and one-winner concurrency.

Migration 0019 tests additionally prove additive-only SQL, snapshot/index
agreement, rollback-safe legacy rows, complete dual-write groups, the
one-active-challenge and one-operation fences, and DB rejection of partial or
impossible queue/consume/invalidate states. Service tests cover provider
acceptance gating, dual-code attempt accounting, session/MFA binding,
target-ownership races, revoked-session denial, one-winner confirmation,
identity rotation, challenge invalidation, other-session/device revocation,
and full rollback when audit insertion fails.

Migration 0020 tests additionally prove additive-only SQL, snapshot/index
agreement, exact role vocabulary, no workspace/account-type coupling,
restrictive foreign keys, one-active-role uniqueness, self-grant rejection,
immutable grant evidence, one-way revocation, reactivation/delete rejection,
and zero foreign-key errors. Policy tests cover capability separation, local
MFA/TOTP enforcement, session and credential revocation, role expiry, and
optional fresh-MFA windows.

Migration 0021 tests additionally prove additive-only SQL, snapshot/index/FK
agreement, exact event and capability vocabulary, five-minute actor MFA,
active administrator/TOTP evidence, a single connected chain head,
grant/revoke state binding, append-only events, 30-day grant bounds,
subject-MFA enforcement, self-grant denial, expired-role denial,
self-deprovisioning, one-winner concurrent grants, and rollback when event
insertion fails.

Migration 0022 tests additionally prove additive-only SQL, snapshot/index
agreement, preservation of pre-existing invitation rows, completeness and
immutability guards, one-winner concurrent acceptance, owner-role
preservation, stale identity-evidence rejection, and rollback of claim,
membership/default-workspace, and audit effects when the batch fails.

Migration 0023 tests additionally prove additive-only SQL, snapshot/index
agreement, preservation of pre-existing challenge rows, rejection of a lock
before attempt exhaustion, immutability of the lock timestamp, the fifth
wrong-attempt lock, and refusal of a new challenge during the 15-minute lock.

Migration 0024 tests additionally prove additive-only SQL, snapshot/journal
agreement, preservation of existing account personas and profiles, explicit
unverified phone defaults, and rejection of partial or contradictory phone
verification evidence. Onboarding service tests cover strict bounded input,
exact current policy digests, deterministic one-personal-workspace creation,
concurrent completion, and preservation of existing business workspaces.

Migration 0025 tests additionally prove additive-only SQL, snapshot/journal
agreement, fail-closed legacy-row behavior, exact verification evidence,
verified-evidence immutability, sync/review state guards, a one-active-sync
lock, 103 resulting non-internal tables, 138 foreign keys, and zero
foreign-key violations.

Migration 0026 tests additionally prove additive-only SQL, snapshot/journal/
foreign-key agreement, canonical URL and lifecycle guards, immutable request
identity and completed evidence, 104 resulting non-internal tables, 141
foreign keys, and zero foreign-key violations. Service tests additionally
cover atomic request/outbox creation, request idempotency conflicts, policy-
disabled Advice, R2/D1 pending-review persistence, replay idempotency, safe
failure evidence, empty-content rejection, actor/environment conflict fencing,
and `legal.sync` Queue execution.

Migration 0027 tests additionally prove additive-only SQL, snapshot/journal/
foreign-key agreement, preservation without fabricated backfill of legacy
terminal reviews, coherent JSON/relational decision evidence, a restrictive
reviewer foreign key, and immutable/undeletable terminal decisions. Service
tests additionally cover dedicated-role and fresh-MFA denial, one-assignee
claim, same-evidence replay, conflicting evidence rejection, R2 tamper
rejection, approval without publication, and atomic source/version rejection.

Migration 0028 tests additionally prove additive-only SQL, snapshot/journal/
foreign-key agreement, exact approved-review and publication evidence,
fail-closed missing JSON fields, restrictive source/version/reviewer/publisher
keys, bounded 1:1 section/chunk evidence, rejection of malformed metadata,
immutable/undeletable publication rows, and immutable/undeletable published
reading rows. Service tests cover separate capability and fresh-MFA
denial, R2 and approved-evidence revalidation, deterministic bounded reading
rows, one-winner concurrency, exact idempotent replay, and tamper/pre-existing-
data rejection.

The full local migration sequence changes the SQLite table count from 79 to
105, contains 146 foreign keys, and reports zero foreign-key integrity errors. Migration `0025` adds six
tables and expands `legal_sources`; migrations `0022`–`0024` alter existing
tables and add indexes/triggers rather than tables; migration `0026` adds one
request table; migration `0027` expands the review queue; migration `0028` adds
one publication table. This is compatibility evidence for the checked-in
`0000`–`0028` sequence. Remote production and development each report 61
non-internal tables and ledger entries only through `0004`. Isolated staging
reports 107 non-internal tables, 58 triggers, and the exact `0000`–`0028`
ledger. The post-migration portable export restores locally with integrity
`ok` and zero foreign-key violations.

## Staging bootstrap evidence and remaining procedure

The one-time D-040 verified-empty bootstrap is complete. It captured pre-bookmark
`00000016-00000000-000050b6-d17b2ef8af450f78e2ba993d4272fe26`
and post-bookmark
`00000016-00000036-000050b6-48eec1201b71eda52af14c1ba998f030`,
applied exactly 22 ordered migrations `0000`–`0021`, and verified all seven
migration-0011 control tables: `idempotency_keys`, `job_outbox`, `job_runs`,
`scheduled_locks`, `scheduled_runs`, `backup_runs`, and `cleanup_runs`.

The bootstrap adapter normalized only line endings to LF and split migrations
only at Drizzle's explicit `--> statement-breakpoint` markers. The diagnostic
proved that remote D1 rejected the compound `CREATE TRIGGER` input with CRLF
and accepted the same statement with LF. Repository-root `.gitattributes` now
pins `apps/platform/drizzle/*.sql text eol=lf`. No checked-in migration content
was rewritten.

The later staging migration record, artifact hashes, and disposable remote-D1
import are documented near the top of this file and in `BACKUP-RESTORE.md`.
Application/runtime behavior, mutating row-level business invariants, and an
operational RTO remain unverified. Before application enablement or any further staging
migration:

1. create and verify a new portable external checkpoint for that migration;
2. repeat a disposable remote-D1 import drill for the new checkpoint and do
   not infer operational RTO from the 2026-07-29 logical-import result;
3. record the current staging bookmark, checksum, manifest, and exact ledger
   without storing secret values;
4. verify that no user has multiple `requested`/`reviewing` deletion rows,
   because 0015 intentionally installs a partial unique index;
5. prove there is no unexpected pending, duplicate, or reordered migration;
6. reverify table/index/trigger presence, `quick_check`, and foreign keys;
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
13. verify both `platform_staff_assignments` and
    `platform_staff_role_events` are empty; keep the internal role-management
    service unreachable. Any operator bootstrap, admin/support/legal-review
    route, or customer-resource grant requires a separate reviewed release
    and immutable resource-access evidence;
14. verify rendered RU/UZ policy digests and run real deletion-code delivery,
    concurrent confirmation, audit, and session-revocation checks;
15. verify OTP/deletion keyed fields and both lookup-key versions without
    logging digests; keep cleanup disabled and record legacy/keyed counts;
16. verify the email-change table, triggers, unique fences, two-address
    provider batch, one-winner D1 confirmation, canonical identity rotation,
    current-session preservation, other-session/device revocation, and
    old/new challenge invalidation without logging addresses or codes;
17. apply and verify `0022`, then repeat workspace-invitation one-winner,
    identity-binding, owner-role preservation, expiry/revocation, and audit
    rollback tests through the full staging HTTP boundary;
18. apply and verify `0023`, then repeat fifth-failure/15-minute-lock,
    replacement-challenge denial, independent email/IP rate limits, and
    concurrency tests through the full staging HTTP boundary;
19. apply and verify `0024`, then repeat structured profile completion,
    exact policy-digest validation, personal-workspace idempotency and
    concurrent onboarding through the full staging HTTP boundary;
20. apply and verify `0025`, prove legacy sources remain untrusted, verify the
    one-active-sync lock and evidence guards, and keep ingestion/retrieval
    disabled until their separate service gates pass;
21. apply and verify `0026`, keep both global async activation and Advice
    ingestion disabled, then exercise the Lex request/outbox/fetch/R2/review
    flow only through protected staging with synthetic or explicitly approved
    public source targets; verify no `verified` or Vectorize record is created;
22. apply and verify `0027` only after the staff tables are inventoried; keep
    `LEGAL_SOURCE_STAFF_API_ENABLED=false` until a reviewed legal-reviewer bootstrap,
    fresh-MFA flow, immutable decision evidence, R2 tamper rejection, and
    non-publishing approval behavior pass protected staging tests;
23. apply and verify `0028` only after `0027` passes; keep the same staff API
    flag false until separate publish capability/fresh-MFA enforcement, R2
    revalidation, one-winner publication, immutable reading rows, and exact
    replay pass protected staging tests; keep indexing and AI consumption off;
24. retain the backup until the release window and restore test are complete.

Production migration remains prohibited without explicit owner approval after all staging gates.
