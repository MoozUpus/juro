# JURO D1 migrations

> Current checkpoint — 2026-08-05: protected `juro-staging` is through
> `0091_verified_corpus_freshness.sql` with 92 ledger rows. A fresh pre-change
> full/schema/data export round-tripped through private `juro-staging-backups`
> and restored in isolation with `quick_check=ok` and zero foreign-key
> violations. Worker `3625c4b0-5bd9-4220-94b0-81ee3480acec` is the exact
> `81de7bb` artifact. Sections below that describe earlier migrations as pending
> are historical candidate notes and are superseded by this checkpoint.
> are historical notes superseded by this checkpoint. Production is unchanged.
> Exact evidence is in `STAGING-0091-VERIFIED-CORPUS-FRESHNESS-EVIDENCE.md`.

## Migration 0089 — legal corpus operational alerts (staging applied)

`0089_legal_corpus_alerts.sql` additively creates one content-free alert table,
an environment/source/type/epoch uniqueness fence, a failed-run ownership guard,
immutable identity guard and delete guard. Delivery state may advance through
the bounded Resend lifecycle, but source/run identity and freshness evidence
cannot be rewritten. The table references existing `source_sync_runs` and adds
no user-content or recipient column. Staging requires a fresh private backup and
restore check, ordered application, exact Worker deployment and
foreign-key/integrity postflight passed on 2026-08-05. A controlled Queue/email
rehearsal remains open and is not inferred from deployment or secret presence.

## Migration 0090 — legal source applicability (staging applied)

`0090_legal_source_applicability.sql` additively records immutable,
reviewer-bound status and effective-interval evidence for an exact legal source
version. Staging application, schema/FK postflight and exact Worker deployment
passed with `0089`; production is unchanged.

## Migration 0091 — verified corpus freshness (staging applied)

`0091_verified_corpus_freshness.sql` replaces only the existing insert/update
guards and adds a delete guard for `source_sync_runs`. A corpus success must
cover every fetched source with the current activated, staff-published verified
version; otherwise the run is `partial` or `failed` and cannot satisfy freshness
queries. Legacy rows are preserved for audit. Private backup round-trip,
isolated pre/post restores, migration and exact Worker deployment passed on
2026-08-05. Controlled corpus/Queue/email and authenticated reviewer gates
remain open.

## Pending 0086 — protected platform audit access

`0086_platform_audit_access.sql` additively stores immutable evidence for each
administrator query or CSV export of the identifiers-only platform audit
projection. D1 binds inserts to a live MFA session, active TOTP, current
administrator assignment and 15-minute freshness. The per-actor predecessor
chain, canonical SHA-256 hash, unique head and update/delete triggers fail
closed. No source audit table or user content is copied.

The migration is local-only. Staging requires a fresh verified private backup,
ordered `0079`–`0086` application, exact matching Worker deploy, foreign-key and
integrity postflight, plus authenticated administrator query/export and denial
tests. Production is unchanged.

## Pending 0085 — guarded operational job redrives

`0085_operational_job_redrives.sql` additively records immutable operator
redrive evidence and uses a D1 projection trigger to reopen the same recoverable
`job_runs` and `job_outbox` rows. It never creates a new idempotency key. Guards
verify actor, environment/queue prefix, exact prior state, relationship,
expired lease, recoverable typed error, monotonic version and predecessor hash.

Focused tests cover successful same-job redrive, immutable evidence, permanent
failure, active lease, cross-environment denial and corrupted-chain fail-closed
behavior. Staging requires a fresh private backup/restore, ordered `0079`–`0086`
application, exact Worker deployment and a controlled one-effect Queue/DLQ and
ledger reconciliation. Production is unchanged.

## Pending 0081 — provider cost observability

`0081_provider_cost_observability.sql` additively creates immutable provider
usage events, immutable effective-dated price versions and a daily aggregate
projection. Document indexing/search records actual provider response token
counts; the schema contains no prompt, answer, document, filename, email or
phone fields. Price versions are not seeded and accept only a provider-matching
official HTTPS source through the server service.

Local focused tests cover exact integer cost calculation, unpriced/failed calls,
duplicate-event atomic rollback, immutability, account-deletion retention and
fresh-MFA administrator route contracts. Staging requires a new verified private
backup, the complete ordered migration set `0069`–`0081`, schema/FK/postflight
checks, official price entry and matching Worker deploy under explicit owner
authorization. Rollback is application-first; the additive tables can remain
unused.

## Pending 0080 — tenant-safe user-document vectors

`0080_user_document_vectors.sql` additively creates the D1 authorization and
lifecycle ledger for immutable normalized analysis versions in Vectorize. It is
owner-only, verifies private-R2 size/SHA-256 before indexing and after every
search match, and records bounded retryable delete mutations for superseded
versions and account purge. No document text enters the ledger or queue envelope.
It remains local and must be applied before `0081` in the same authorized cycle.

## Pending 0079 — moderated lawyer review replies

`0079_lawyer_review_replies.sql` additively introduces versioned lawyer replies
and a separate immutable moderation record. D1 accepts a reply only when the
review and its original moderation are approved and the actor owns the matching
public-approved lawyer profile. A review may have one pending or approved reply;
after rejection the lawyer can submit the next immutable version. Only an
approved reply with its own moderation evidence enters the public projection.

The complete migration chain replays locally with 186 tables, 369 foreign keys
and no FK violations. Before staging, take and restore-verify a fresh private
`juro-staging-backups` export, apply `0069`–`0079` in order, verify the reply
guards/moderation/public projection, then deploy the matching Worker only under
new explicit authorization.

## Pending 0078 — MFA-bound Knowledge Base authoring

`0078_knowledge_base_authoring.sql` additively attaches nullable actor evidence
to the 0077 article/version projections and creates append-only authoring
events. D1 triggers require an actor/timestamp for every new article/version,
draft edit, publication and status transition; published versions and all
article/version/event deletes remain fail-closed. Existing seeded published
versions retain their `body-v1` hash evidence and are not backfilled or mutated;
new staff versions use `full-v2`, covering titles, summaries, both language
bodies and related slugs.

The migration and the later 0079 candidate replay locally with 186 tables, 369 foreign keys and no FK
violations. Before staging, take and restore-verify a fresh private
`juro-staging-backups` export, apply the complete ordered pending set
`0069`–`0079`, verify the ledger/triggers/FKs and deploy the matching Worker only
under new explicit authorization.

## Pending 0077 — versioned RU/UZ knowledge base

`0077_knowledge_base.sql` is an additive local candidate. It creates published
article/version projections, immutable published versions, tenant-bound
helpfulness projections and append-only feedback events mirrored into the
existing workspace audit. Four truthful RU/UZ product-help articles are seeded;
their SHA-256 values are computed from canonical RU body, UZ body and related
slug JSON and verified by the focused test suite.

The migration has not been applied to staging or production. Before staging,
take and restore-verify a fresh private `juro-staging-backups` export, apply the
complete ordered pending set `0069`–`0079`, verify the ledger, hashes, triggers,
`foreign_key_check` and public/authenticated route boundaries, then deploy the
matching Worker only under a new explicit authorization. Rollback is
application-first; the additive tables may remain unused.

## Current staging checkpoint and pending local migrations

Isolated `juro-staging` is through `0068_file_scan_evidence.sql`. Its verified
pre-migration full/schema/data exports remain in private
`juro-staging-backups/d1/juro-staging/20260804-080310-0068/`; migration and
foreign-key postflight passed, and Worker version
`030e3db0-6de5-455f-a90b-0350d346f5cf` has 100% protected staging traffic.
Production is unchanged. Exact evidence is in
`STAGING-0068-FILE-SCAN-EVIDENCE.md`.

Migrations `0069`–`0081` are local additive candidates and have not been applied
to staging or production. They cover immutable analysis corrections, corrected
exports, comparison exports, per-change review decisions and fenced R2 write
reconciliation, analysis/document case links, legal bookmarks and the versioned
knowledge base, protected staff authoring, moderated lawyer-review replies,
tenant-safe user-document vectors and provider cost observability respectively.

## Pending 0073 — analysis-version R2 write intents

`0073_analysis_version_object_writes.sql` additively records a unique write
intent before every normalized analysis-version R2 write. A D1 batch moves the
intent to `attaching` and inserts the immutable version; triggers verify exact
tenant/version/key/size/SHA identity and atomically mark it `attached`. Losing
concurrent writers remain non-visible and become eligible for the bounded
scheduled reconciler, which claims the intent before deleting its exact key.
Account deletion inventories both attached versions and pending intents.

Local migrations apply cleanly with 175 tables, 338 foreign keys and no FK
violations. Tests cover normal attachment, synchronized concurrent correction
writers, orphan deletion, audit minimization and account-purge inventory. Before
staging, take and restore-verify a fresh private backup, then apply the complete
ordered pending set `0069`–`0073` and deploy the matching Worker under a new
explicit authorization.

## Pending 0072 — comparison change decisions

`0072_comparison_change_decisions.sql` additively extends existing comparison
rows with nullable `accepted`/`rejected` state, decision actor/time, optimistic
version and unique event identity. Insert/transition/tenant triggers reject
preset, partial, malformed and cross-owner decisions. Existing rows backfill to
pending through nullable/default columns; neither source document is changed.

Rollback is application-first: disable or roll back the Worker and leave the
unused columns/indexes/triggers in place. Before staging, make and restore-verify
a fresh private D1 backup, apply the whole pending ordered set `0069`–`0073`,
then verify the ledger, trigger/index inventory, `foreign_key_check`, decision
service smoke and existing document-builder regression before deployment.

## Migration 0065 — guest AI sessions

`0065_guest_ai_sessions.sql` additively creates `guest_ai_sessions` and
`guest_ai_runs`. It has no plaintext question/answer columns: tokens, IPs and
requests are digested or AES-GCM encrypted. State/count/encryption checks and a
cascading foreign key constrain lifecycle; unique idempotency and atomic
reservation prevent duplicate final answers.

Before staging: create and verify a fresh D1 checkpoint, write a checksummed
export to private `juro-staging-backups`, restore it into a disposable database,
apply only `0065`, then run ledger, `quick_check`, `foreign_key_check`, schema
inventory and a post-checkpoint. Rollback disables `GUEST_AI_ENABLED` and leaves
the additive tables unused. Production migration/deploy is not authorized.

> Current migration checkpoint — 2026-08-03: isolated `juro-staging` is through additive `0060_lethal_slapstick.sql`. A checksum-verified private pre-export and post-export are retained in `juro-staging-backups`; postflight reports `quick_check=ok`, an empty `foreign_key_check`, and the new `ai_feedback` table. Production is unchanged.

Updated: 2026-08-03
Latest source migration: `0060_lethal_slapstick.sql` (applied only to isolated staging)
Remote application status: `0000`–`0004` are applied to both `juro-production` and `juro-development`; `0005`–`0034` are not applied there. Isolated EEUR `juro-staging` (`bb716a96-b2fb-4823-90d6-6c228fed181a`) has the exact 35-entry `0000`–`0034` ledger. Migration `0034` was applied only after a new Time Travel bookmark, full/schema/data/manifest export, private-R2 checksum round trip, and isolated pre-change restore. Postflight reports 113 application tables (114 including `d1_migrations`), 72 triggers, 199 non-internal indexes, no pending migration, and zero foreign-key violations. No production or development migration was run.

## Staging-applied `0060` — tenant-scoped AI answer feedback

`0060_lethal_slapstick.sql` is additive: `ai_feedback` stores a bounded feedback
type and optional comment, and references the existing workspace, user,
conversation, persisted assistant message, and completed AI run. Its unique
index makes each feedback type idempotent per user/answer; no AI question or
answer is copied into analytics. The remote preflight found 60 migrations
through `0059`, no existing `ai_feedback` table, `quick_check=ok`, and no
foreign-key violations. After applying only `0060`, staging reports 61
migrations, four `ai_feedback` indexes (including SQLite's primary-key index),
zero feedback rows, `quick_check=ok`, and no foreign-key violations. Exact
private checkpoint hashes, Worker version, tests, and remaining browser gate
are recorded in `STAGING-0060-AI-FEEDBACK-EVIDENCE.md`.

## Staging-applied `0034` — business workspace identity

The migration is additive: four nullable workspace columns, one partial unique index, a bounded backfill for existing business names, and two fail-closed identity guards. It adds no table or foreign key and drops no content. Local and staging evidence proves a 35-entry ledger, exact replay idempotency, one-owner creation, creator/request evidence, cross-user denial, batch rollback on audit failure, canonical personal/business routing after workspace selection, and intact foreign keys. Exact backup, restore, migration, deployment, browser, and synthetic workspace evidence is recorded in `STAGING-0034-EVIDENCE.md`.
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

### Staging migration `0029` record — 2026-07-29 UTC

Before applying `0029`, Wrangler recorded bookmark
`00000028-00000000-000050b7-42614e5669d57a2adc22f5edb39bd29d` and exported
full, schema-only, and data-only artifacts. Exact bytes were uploaded to
private `juro-staging-backups`, downloaded again, and SHA-256 compared. Because
the official full export orders some child objects before parent
`workspaces`, a restore-only adapter was deterministically derived without
modifying the source exports. Its disposable EEUR import processed 414 queries;
source and restore matched all 106 exported tables and all 74 rows, the
29-entry migration ledger, 58 triggers, and zero foreign-key violations. The
revalidated disposable D1
`juro-staging-restore-drill-0029-20260729t111105z-v2`
(`a3738cff-5d2f-4083-8871-d4af98e000b5`) was then deleted.

Wrangler applied only `0029_session_token_rotation.sql` to exact D1
`juro-staging`: ten executed commands and a successful migration record. The
post-check reports 30 migrations through `0029`, 109 non-internal tables, 58
triggers, both new tables, nine SQLite indexes including primary-key auto
indexes, zero history/replay rows, and zero foreign-key violations. A fresh
post-`0029` full/schema/data export also passed private-R2 byte-for-byte
round-trip verification. Exact objects and hashes are in `BACKUP-RESTORE.md`.

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
107, contains 151 foreign keys, and reports zero foreign-key integrity errors. Migration `0025` adds six
tables and expands `legal_sources`; migrations `0022`–`0024` alter existing
tables and add indexes/triggers rather than tables; migration `0026` adds one
request table; migration `0027` expands the review queue; migration `0028` adds
one publication table. This is compatibility evidence for the checked-in
`0000`–`0029` sequence. Remote production and development each report 61
non-internal tables and ledger entries only through `0004`. Isolated staging
reports 109 non-internal tables, 58 triggers, and the exact `0000`–`0029`
ledger. The migration-specific portable checkpoint passed a remote restore
rehearsal, and the post-migration exports passed private-R2 checksum round
trips with zero remote foreign-key violations.

## Migration 0029

`0029_session_token_rotation.sql` adds two session-security evidence tables
without altering or deleting existing rows:

- `auth_session_token_history` stores only the retired SHA-256 token digest,
  session/user references, a bounded rotation reason, rotation time, and the
  original absolute expiry;
- `auth_session_token_replays` allows one durable replay claim per retired
  token and fixes the response action to current-session and device
  revocation;
- seven indexes provide unique retired-token and replay fences plus bounded
  session/user/expiry lookups.

The migration contains exactly nine additive `CREATE` statements and no
`ALTER`, `DROP`, `UPDATE`, or `DELETE`. Runtime tests prove MFA elevation, MFA disable, and confirmed email change
rotate the current token without extending absolute expiry.
Enrollment binds to the exact pre-rotation digest and rolls back on an
intervening token change; concurrent disable and concurrent email confirmation each have one guarded winner. A retired
token records only one critical replay event before revoking the affected
session and device. Raw session tokens are never persisted. The full local
`0000`–`0029` sequence has 107 application tables,
151 foreign keys, and zero foreign-key violations. Migration `0029` is now
schema-applied to isolated staging; protected-staging HTTP/cookie/replay
behavior remains a separate open gate.

## Migration 0030

`0030_eager_shen.sql` adds the durable security-email boundary required by a
confirmed canonical email change:

- `security_email_jobs` stores user/workspace/challenge references, locale,
  encrypted recipient evidence, bounded status/attempt/error state, and the
  Resend provider message ID after success;
- the previous email address is never stored as a plaintext job or outbox field;
- the challenge/event unique index gives the transaction one durable job winner;
- status/user indexes support bounded retry and operational reconciliation;
- a trigger makes recipient ciphertext, IV, and key version immutable.

The migration has five additive statements: one table, three indexes, and one
trigger. It contains no `ALTER`, `DROP`, `UPDATE`, or `DELETE`. The full
local `0000`–`0030` sequence has 108 application tables, 154 foreign keys,
and zero foreign-key violations. Runtime tests additionally prove one
transactional outbox row, identifiers-only Queue delivery, provider
idempotency, sequential and concurrent duplicate suppression, retryable
failure state, and fail-closed missing configuration.

This migration is not applied to remote staging. Before it can be applied,
capture and checksum new full/schema/data exports, retain the current bookmark,
repeat the disposable remote-D1 restore drill, apply only `0030`, verify the
31-entry ledger/table/index/trigger/FK state, retain a post-migration export,
and then deploy the reviewed staging-only email consumer. Production and
development remain unchanged.

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
## Migration 0031

`0031_melted_nextwave.sql` adds the opaque device-continuity boundary:

- `auth_device_continuities` stores a tenant-scoped versioned HMAC, never the
  raw browser token;
- bounded first/last country and region codes are optional coarse risk evidence;
- `(user_id, key_version, token_hmac)` is unique;
- existing `auth_devices` receives a nullable `continuity_id` with `ON DELETE
  SET NULL`, so legacy rows remain valid;
- user deletion cascades continuity records while account-deletion workflow
  revokes them before later purge.

The migration has five additive statements: one table, two table indexes, one
nullable `ALTER TABLE ... ADD`, and one device index. It contains no `DROP`,
`DELETE`, or data `UPDATE`. The full local `0000`–`0031` sequence reports 109
application tables, 156 foreign-key references, a clean `foreign_key_check`, and
constraint tests for malformed HMAC/location evidence and duplicate lookup
claims. A code rollback may leave the additive table/column unused; no down
migration or destructive drop is required.

This migration is not applied to remote staging. Before applying `0030` and
`0031`, create a new portable D1 checkpoint, verify its checksum, repeat the
disposable restore drill, record the pending migration list, and stop on any
schema or ledger mismatch. Production is unchanged.
## Migration 0032

`0032_fixed_wasp.sql` adds the generic encrypted login-security notification
boundary without rebuilding the email-change-specific table from `0030`:

- `security_notification_jobs` accepts only `login_new_device` and
  `login_new_region` over the email delivery channel;
- recipient addresses use authenticated encryption and a dedicated key purpose;
- only coarse country/region, a bounded generic device label, event/session IDs,
  and delivery state are stored; raw IP, raw User-Agent, and the continuity
  token are absent;
- `(session_id, event_type, delivery_channel)` fences duplicate jobs;
- immutable-content enforcement covers recipient, event, session, device,
  location, locale, and occurrence evidence while allowing delivery-state
  transitions and workspace `ON DELETE SET NULL`;
- the existing identifiers-only `job_outbox` and `email.send` consumer contract
  are reused with provider idempotency and stale-lease recovery.

The migration has five additive statements: one table, three indexes, and one
trigger. It contains no `ALTER`, `DROP`, data `UPDATE`, or `DELETE`. The full
local `0000`–`0032` sequence has 110 application tables, 158 foreign-key
references, and a clean `foreign_key_check`; the Drizzle snapshot has 84 modeled
tables and 156 modeled foreign keys. Constraint tests cover duplicate delivery,
immutable evidence, legal status transitions, and workspace deletion.

Migrations `0030`–`0032` are not applied to remote staging. Before any staging
write, capture/checksum a new D1 checkpoint, repeat the disposable restore
exercise, verify the exact pending list, apply the reviewed migrations in order,
retain a post-migration export, and then prove protected primary/MFA login,
Queue/DLQ behavior, and real Resend delivery. Production is unchanged.

## Migration 0033

`0033_freezing_havok.sql` adds the durable account-deletion lifecycle:

- deletion mode, keyed subject, schedule, cancellation, lease, irreversible-boundary, failure, and terminal timestamps on `account_deletion_requests`;
- `lifecycle_status` and `deletion_completed_at` on `user_profiles`;
- append-only `account_deletion_lifecycle_events` and `account_deletion_purge_evidence`;
- state, hash, JSON, tombstone, append-only, and terminal-immutability guards;
- schedule/subject/hash indexes and an expanded one-active-request predicate;
- safe normalization of legacy `requested`/`reviewing` rows to `blocked` with `LEGACY_REQUEST_REQUIRES_REVIEW`.

The migration does not delete user content and does not execute a purge. It replaces only the active-request index so the new in-flight states remain one-per-user. The complete local sequence has 34 migrations (`0000`–`0033`). Clean-database application, Drizzle journal/snapshot continuity, `quick_check`, zero foreign-key violations, transition guards, append-only behavior, legacy normalization, and representative cascade behavior pass.

Code rollback leaves additive columns/tables unused. D1 recovery uses the recorded pre-`0030`–`0033` staging Time Travel bookmark or private portable exports; no destructive down migration is planned. Production application is prohibited without its own snapshot, rehearsal, and explicit owner approval.

### Staging `0030`–`0033` record — 2026-07-29 UTC

Preflight reported `quick_check=ok`, zero deletion requests, zero duplicate active users, 30 applied migrations through `0029`, and exactly `0030`–`0033` pending. The first Wrangler run applied `0030`–`0032`; D1 rejected `0033` atomically because one Drizzle `statement-breakpoint` marker was concatenated with the following `CREATE TRIGGER`. Read-only verification proved that none of the `0033` tables or columns existed and the database remained integral.

Commit `a1261c3c68151f9c275187fd422bd58c67b673a8` fixes only that separator. Migration/account-deletion tests passed 64/64 before retry. The second run applied only `0033`. Postflight proves 34 ledger rows through `0033`, two lifecycle/evidence tables, ten exact lifecycle trigger guards, two profile lifecycle columns, ten request lifecycle columns, `quick_check=ok`, an empty `foreign_key_check`, and no pending migration.
## Staging checkpoint 0036 — current Lex URL guard

Migration 0036_current_lex_url_guard.sql is additive in effect: it drops and recreates only legal_source_fetch_requests_insert_guard. The new guard accepts both current positive and retained legacy negative Lex document IDs, requires the canonical ID to match the exact URL suffix, and preserves the Advice host/feature boundary. It does not modify production.

The migration chain passes 53/53 migration tests and the Cloudflare suite passes 82/82. Staging preflight showed 36 ledger rows through 0035, quick_check=ok, and no foreign-key violations. The apply changed only the guard and produced 37 ledger rows through 0036. Postflight again returned quick_check=ok, no foreign-key violations, and no pending migration.

Pre/post bookmarks, portable export hashes, private-R2 round trips, and both remote restore drills are recorded in STAGING-0036-EVIDENCE.md. The post checkpoint restored 753 queries into a disposable EEUR D1 with 115 application tables, 295 indexes, 78 triggers, 37 migrations, exact exported non-empty row counts, quick_check=ok, and zero foreign-key violations. The disposable database was deleted after verification.

## Migration 0040 — analysis export lifecycle

`0040_luxuriant_winter_soldier.sql` additively creates `analysis_exports`, five
indexes, and two trigger programs with four source/state guards. It does not alter or delete existing analysis,
document-builder, collaboration, invitation, share, signature, or workspace data.
The guards require a completed same-workspace/same-owner source analysis, immutable
identity, legal state transitions, and complete R2 artifact evidence before the
terminal `completed` state. Nonterminal rows cannot carry an artifact key/hash.

The complete local migration chain has 41 ledger entries (`0000`–`0040`), 119
application tables, and 190 foreign-key references. Clean application,
`quick_check`, `foreign_key_check`, D1-compatible trigger syntax, illegal transition,
tenant mismatch, and immutable evidence tests pass. Rollback is application-first:
roll back the Worker or disable the export consumer and leave the additive empty
table unused. A D1 Time Travel bookmark plus checksummed private-R2 portable export
is mandatory before the staging apply; no destructive down migration is planned.

### Staging `0040` record — 2026-07-31

Preflight proved 40 ledger rows through `0039`, `quick_check=ok`, zero foreign-key
violations, no export table, and exactly `0040` pending. The pre checkpoint bookmark
was `00000200-00000000-000050b9-a424c2364078007537608621517e16d6`; its 446,306-byte
portable export round-tripped through private R2 with SHA-256
`e8230a91eb38472666b2333278038d5e75c57153a4f707da2b18b148cdb5fb2b`.

Wrangler applied only `0040`. Postflight proved 41 ledger rows, the expected table,
five explicit indexes, two trigger programs, zero export rows, `quick_check=ok`,
zero foreign-key violations, and no pending migration. Post bookmark
`00000201-00000006-000050b9-0cf0522bce80aeababd50a483ea35489` and the 450,367-byte
private-R2 export matched SHA-256
`42d0e9970ca0ef229c09f632d48b211c5135170adf877b5af0896ed1844f0460`.

## Migration 0041 — PDF/DOCX analysis report exports

`0041_analysis_report_exports.sql` additively creates one table, five explicit
indexes, and two trigger programs. The table has three tenant/source foreign keys
and stores only report lifecycle and private-object evidence. The migration contains
no table rebuild, destructive `DROP`, data backfill, or mutation of existing rows.

Insert guards require an already completed analysis with the same workspace and
owner. Update guards freeze identity, allow only the reviewed queue lifecycle, and
require format-specific `.pdf`/`.docx` keys, MIME type, minimum bytes, SHA-256, and
completion time before `completed`. Nonterminal rows cannot carry artifact evidence.

The complete local chain applies cleanly with 42 ledger entries (`0000`–`0041`),
120 application tables, 193 foreign-key references, `quick_check=ok`, and zero
foreign-key violations. Contract tests reject cross-tenant source insertion,
incomplete completion, and invalid transitions. Staging application requires a
fresh Time Travel bookmark plus checksummed private-R2 pre/post portable exports.
Application rollback leaves the additive table unused; production is unauthorized.

### Staging `0041` record — 2026-07-31

Preflight proved 41 ledger rows through `0040`, `quick_check=ok`, zero foreign-key
violations, no report table, zero export/outbox rows, and exactly `0041` pending.
The pre bookmark was
`00000213-00000000-000050b9-d3188759cc17b15922cc19e3067e435e`; its 458,765-byte
private-R2 portable export matched SHA-256
`aeafeb5e83aef30a3a3f2af2b4e5a63f0474f6c069696edf3407ef633785aafe`.

Wrangler applied only `0041`. Postflight proved 42 ledger rows, 16 columns, five
explicit indexes, two triggers, zero report rows, `quick_check=ok`, zero FK
violations, and no pending migration. Post bookmark
`00000213-00000002-000050b9-98618a5881cf0c076ff24687e4bae749` and the 463,690-byte
private-R2 export matched SHA-256
`99f0357fc665338f53e4a0c6062134ac267cb5fc04dde34f2da12302a5b1d51f`.
Exact evidence is in `STAGING-0041-ANALYSIS-REPORT-EXPORT-EVIDENCE.md`.

## Migration 0061 — Payment foundation (protected staging applied)

`0061_cheerful_christian_walker.sql` is an additive Stage-1 financial schema.
It creates versioned pricing/tax/plan configuration, tenant-owned orders,
immutable pricing snapshots, invoices, payment attempts/events, subscription
entitlements, usage records, and a balanced double-entry ledger. Existing
`subscriptions` receive only nullable/additive lifecycle columns; the existing
`payments` table is preserved.

The migration contains no table drop or destructive backfill. D1 triggers freeze
approved version records and accepted snapshots, prevent order identity changes,
require ledger totals to match actual entries before posting, and freeze posted
transactions/entries. Application rollback disables `PAYMENT_FOUNDATION_ENABLED`
and deploys the prior Worker while retaining unused additive tables.

On 2026-08-03, the owner authorized the staging gate. A Time Travel bookmark,
three pre-export artifacts, private R2 round-trip SHA-256 verification and an
isolated SQLite restore preceded the apply. The isolated checkout contained only
`0061` pending; Wrangler applied it successfully. Postflight found 17 billing
tables, 14 financial guards, `quick_check=ok`, no foreign-key rows, and the
synthetic test-only `staging_individual` plan. A second post-export also passed
private R2 checksum verification. Exact evidence is in
`STAGING-0061-PAYMENT-FOUNDATION-EVIDENCE.md`. Production is not authorized.

`scripts/staging-payment-foundation-seed.sql` is a separate, explicit synthetic
fixture with zero tax/provider fee and one test plan. It is never part of the
migration chain and must never run against production.

## Migration 0048 — protected staging provider connectivity evidence

`0048_staging_provider_probe.sql` additively creates only the
`staging_provider_probes` technical-evidence table and two indexes. It contains
no user content, no foreign keys, no destructive DDL, and no data backfill. The
unique `(probe_key, provider)` index ensures that a provider cannot be retried
implicitly. This table is a protected Phase 9 diagnostic, not an application
feature or a production schema authorization.

### Staging `0048` record — 2026-07-31

Before apply, `juro-staging` passed `quick_check`, had zero foreign-key
violations, and listed exactly `0048` as pending. The pre Time Travel bookmark
and a 529,404-byte SHA-256-verified private-R2 export are recorded in
`STAGING-0048-PROVIDER-PROBE-EVIDENCE.md`. Wrangler applied only `0048`.
Postflight proved no pending migrations, `quick_check=ok`, no foreign-key rows,
and a 532,542-byte private-R2 export that passed an independent round trip.
Rollback is application-first: leave the additive table unused and deploy the
prior Worker or disable the synthetic flag. No production migration was applied.

## Migration 0062 — encrypted user memory (pending staging authorization)

`0062_nervous_shinko_yamashiro.sql` additively creates
`user_memory_settings`, `user_memories`, and `memory_sources`. It does not drop,
rename, rebuild or backfill existing data. Scope/category/source/status/hash
checks reject malformed rows. User/workspace/conversation/message foreign keys
preserve tenant lifecycle. A partial unique index covers only active
`(user_id, scope_key, content_sha256)` identities, allowing multiple deleted
records while preventing two active duplicates.

Application rollback deploys the prior Worker and leaves the additive tables
unused. Before staging apply: make and verify a fresh Time Travel bookmark,
write a checksummed portable export to private `juro-staging-backups`, prove a
disposable restore, apply only `0062`, then run migration-ledger, `quick_check`,
`foreign_key_check`, schema/index inventory, and private post-checkpoint checks.
The server-only `IDENTITY_KEYRING` must parse before enabling memory. Production
migration or deployment is not authorized.

## Migration 0064 — one active marketplace payment attempt (pending staging authorization)

`0064_marketplace_open_payment_attempt.sql` adds one partial unique index only:
an order can have at most one `client_action_required` payment attempt. Failed
attempts are not included, so an approved retry path remains available. This
prevents two distinct concurrent confirmation requests from creating two active
sandbox attempts for the same priced legal-service order. It has no data
backfill, table rebuild, delete, or drop.

The migration has passed the local full migration matrix, foreign-key checks,
marketplace lifecycle tests, typecheck, and lint. It has not been applied to
staging or production. Before staging application, take and verify a private
`juro-staging-backups` D1 export, apply only `0064`, then rerun migration list,
`quick_check`, `foreign_key_check`, and the marketplace replay/concurrency
tests. Application rollback keeps the additive index unused by rolling the
Worker back; index removal is deferred to a separately approved contract
phase.

## Migration 0067 — auditable deadline calculation evidence (staging applied)

`0067_deadline_calculation_evidence.sql` is expand-only. It adds calculation
inputs, safe-date output, calendar/source version and serialized evidence fields
to existing `action_plan_steps` and `tasks`; existing manual due dates remain
unchanged and default to `deadline_confidence='unverified'`. Bounds reject more
than 3,650 days, invalid inclusion flags, unsupported roll rules and invented
confidence states.

The migration passed the isolated in-memory apply/constraint test and local
Wrangler apply to `juro-development`. On 2026-08-04 a fresh full/schema/data
staging export was uploaded to private `juro-staging-backups`, downloaded with
matching SHA-256 hashes and restored into disposable SQLite with
`quick_check=ok` and zero FK violations. Wrangler then applied only `0067` to
`juro-staging`; the ledger records id `68`, no migrations remain pending, the
new columns/defaults are present and remote `foreign_key_check` returns no rows.
The staging Worker was deployed at version `5e85ee33-f7ec-4e5d-a726-431c67ea46f0`.
Authenticated RU/UZ browser verification remains open. Production has not
received `0067`. Rollback is application-first; the additive fields may remain
unused. Full evidence is in `STAGING-0067-DEADLINE-CALCULATION-EVIDENCE.md`.

## Migration 0068 — immutable file-scan evidence (staging applied)

`0068_file_scan_evidence.sql` is expand-only. It adds a terminal
`file_scan_results` evidence table, two one-to-one indexes, a tenant/time index,
strict clean/infected JSON invariants, a source SHA/tenant/quarantine guard and
an immutable-update trigger. It does not create a scanner, clean a file or
enable provider access.

On 2026-08-04 a fresh full/schema/data export was uploaded to private
`juro-staging-backups`, independently downloaded with identical SHA-256 hashes
and restored into disposable SQLite with `quick_check=ok` and zero FK
violations. Wrangler then applied only `0068` to `juro-staging`; the ledger
records id `69`, the six expected schema objects are present, evidence-row count
is zero, remote `foreign_key_check` is empty and no migrations remain pending.
Protected staging now runs Worker version
`030e3db0-6de5-455f-a90b-0350d346f5cf`. Production has not received `0068`.
Application rollback leaves this additive empty table unused. Full evidence is
in `STAGING-0068-FILE-SCAN-EVIDENCE.md`.

## Migration 0069 — immutable analysis corrections (local candidate)

`0069_analysis_document_revisions.sql` is expand-only. It adds
`analysis_document_versions` for immutable normalized text artifacts and
`suggested_revisions` for the pending → accepted/rejected → applied lifecycle.
Tenant/source/parent/revision triggers reject cross-analysis links, duplicate
revision IDs, invalid state transitions, mutation of a stored version, and a
corrected version that does not reference eligible suggestions. Applying a
revision never mutates the uploaded PDF/DOCX or any document-builder row.

Local evidence: all migrations apply from empty D1, `quick_check` and
`foreign_key_check` pass, the schema contains 173 application tables and 331
foreign keys, and integration tests cover tenant denial, exact-match application,
ambiguous text, idempotent replay, immutability, cascade deletion, and R2 purge.
Migration 0069 has not been applied to staging or production. Before staging,
take and verify a fresh private `juro-staging-backups` export, restore-check it,
apply only 0069, verify no pending migrations/FK violations, then deploy the
matching Worker. Rollback is application-first; the additive tables may remain
unused until a separately approved contract phase.

## Migration 0070 — corrected-version exports (local candidate)

`0070_analysis_corrected_exports.sql` additively extends the existing
`analysis_report_exports` lifecycle with an allowlisted variant and an optional
foreign key to an immutable corrected analysis version. Existing report rows
backfill through the non-destructive `analysis_report` default. Insert triggers
require clean/redline rows to reference a corrected version from the same
analysis, workspace and owner; variant/source identity is immutable afterwards.

The matching Worker reuses the existing document-export queue, private R2
namespace, checksum verification, audited download/delete path and account purge.
Local typecheck, lint and all 456 application tests plus 102 Cloudflare contract
tests pass. Synthetic generator tests cover clean/redline DOCX and PDF, explicit
deleted/inserted labels, OOXML strike/underline marks, version binding and
cross-tenant denial. Migration 0070 has not been applied to staging or
production. Staging requires a new owner authorization covering a fresh verified
private D1 backup, migration 0069 followed by 0070, and the matching Worker
deploy. Rollback is application-first; both additive migrations can remain unused.

## Migration 0071 — durable comparison exports (local candidate)

`0071_comparison_exports.sql` additively creates a tenant/owner-bound lifecycle
for comparison PDF and DOCX artifacts. Insert guards require a completed,
non-deleted comparison from the same workspace and owner. Identity is immutable;
only queued → processing → retrying/completed/failed transitions are accepted.
A completed row requires a private `comparison-exports/` key, matching MIME and
extension, at least 1,000 bytes, SHA-256 and completion time.

The matching Worker uses the existing document-export queue and does not alter
source comparisons. Local migration tests validate 174 tables, 334 foreign keys,
source mismatch denial, lifecycle guards and foreign-key integrity. Migration
0071 has not been applied to staging or production. Staging requires a fresh
verified private D1 backup, migrations 0069–0071 in order, and matching Worker
deployment under a new explicit authorization.

## Migration 0074 — analysis-to-case links (local candidate)

`0074_analysis_case_links.sql` is expand-only. It adds the nullable current case
projection and monotonic revision to `document_analyses`, plus append-only
`analysis_case_link_events`. Triggers reject direct projection changes,
cross-workspace/archived targets, stale writers, actor substitution, mutation or
deletion of retained evidence. Successful events atomically update the analysis
projection and append metadata-only case/workspace audit records.

The event has one lifecycle FK to its owning analysis. Workspace, actor and case
identifiers are proven against that analysis and target case by the insert guard
but intentionally are not sibling FKs, because simultaneous user/workspace
account cascades otherwise become order-dependent in SQLite. Local clean-schema
application produces 176 application tables and 341 foreign keys; `quick_check`,
`foreign_key_check`, account cascade and direct-mutation guards pass. Wrangler
applied 17 statements only to local `juro-development`; no local migrations are
pending. Staging and production remain unchanged.

## Migration 0075 - document-to-case links (local candidate)

`0075_document_case_links.sql` is expand-only. Existing document links remain at
revision zero; future attach, move and detach transitions require an immutable
`document_case_link_events` row. Insert and projection guards enforce the exact
owner/workspace, active target case, old projection, monotonic revision and actor.
The projection trigger clears any old `plan_step_id` and appends metadata-only
case/workspace evidence.

The event owns one lifecycle foreign key to `documents`; guarded historical IDs
do not introduce SQLite cascade-order dependencies. Local clean-schema application
produces 177 application tables and 343 foreign keys. Migration safety, foreign
key integrity, account cascade, stale-writer and direct-mutation tests pass.
Staging and production remain unchanged pending a separately authorized backup,
ordered migrations `0069`-`0075` and deploy. Wrangler executed all 16 statements
against local `juro-development`; a repeat local list reports no pending migration.

## Migration 0076 - verified legal bookmarks (local candidate)

`0076_user_legal_bookmarks.sql` additively creates a user/workspace-owned
bookmark projection and append-only mutation events. Each row references one
legal source and the exact verified version that was current when saved. An
optional case uses `SET NULL` on case deletion; account/workspace deletion
cascades the user content and its events.

The active-scope index prevents duplicate live bookmarks for the same user,
source version and case. Event guards verify tenant, actor, source/version,
projection revision and archive state; update/delete triggers preserve evidence.
Workspace audit and case activity contain IDs, revision and comment hash only.
Wrangler 4.92.0 executed 14 statements only against local `juro-development`; a
repeat local list reports no pending migration. Staging and production remain
unchanged pending a fresh verified private staging backup, ordered migrations
`0069`-`0076` and separately authorized deploy.

## Migration 0087 — AI legal quality review (local candidate)

`0087_ai_quality_reviews.sql` additively creates deletion-coupled review content
and retained metadata-only access/decision evidence. D1 validates the exact live
legal-reviewer assignment, session, active TOTP, 15-minute MFA window, chain
head, current feedback timestamp and monotonic decision version. Evidence and
content rows are immutable; deleting user feedback cascades corrected/golden
text while retaining hashes/classification/opaque IDs for access audit.

Local SQLite tests pass clean application, foreign-key integrity, multi-version
decisions, stale-write rejection, forged-role denial, immutable triggers,
content cascade and hash-chain tamper detection. Staging remains through `0078`;
production is unchanged. Before staging, take and isolated-restore a fresh full
private backup, apply all pending migrations in ledger order through `0087`,
run postflight integrity/trigger inspection, deploy the exact Worker and perform
authenticated positive and negative capability/MFA/content-minimization probes.
Rollback is application-first; retained evidence must not be dropped.
## Pending 0088 — protected AI runtime settings

`0088_ai_runtime_settings.sql` adds an immutable per-environment configuration
history for deployment-allowlisted OpenAI/Anthropic models and the fixed
`clear|formal|concise` response-tone policy. D1 enforces sequential versions,
an environment hash chain, administrator assignment, a live device/session,
active TOTP and MFA verified within 15 minutes. Update/delete are prohibited.
Jurisdiction, legal-source allowlist, privacy, retention, authorization and
prompt-injection controls are deliberately absent from the mutable schema.

Status: local additive candidate. Protected staging remains through `0078`;
production is unchanged. Before staging application, take and independently
checksum/restore a fresh export in private `juro-staging-backups`, then apply
the complete pending ledger in order rather than cherry-picking `0088`.

## Migration 0092 — document evaluation review evidence (local candidate)

`0092_document_evaluation_reviews.sql` additively adds a nullable SHA-256 for
normalized completed analysis output and a content-free, immutable review/export
event ledger. Runtime completion writes the hash in the same state transition.
D1 validates the live legal-reviewer assignment, active TOTP, 15-minute MFA,
chain head, private file SHA/size, clean scan, completed analysis/provider run,
critical-risk count and completed comparison membership. Export events bind the
application commit, artifact-manifest SHA-256 and latest-review digest.

Local ordered migration, foreign-key, immutable-trigger, forged-role, stale
provider and evidence-tamper tests pass. Staging remains through `0091`; before
`0092`, create and independently restore/checksum a private staging backup,
apply only the ordered pending migration, run D1 postflight and deploy the exact
Worker. Production is unchanged.

## Migration 0093 — case lifecycle evidence (local candidate)

`0093_case_lifecycle_evidence.sql` is expand-only. It adds completion/archive
projection fields to `cases` and an immutable, tenant-checked, hash-chained
`case_lifecycle_events` ledger. `complete`, `reopen`, `archive` and `restore`
are the only transitions. D1 recomputes unresolved task/plan-step counts from
authoritative rows before accepting an event; the projection trigger updates
the case in the same statement.

The migration deliberately does not yet reject every direct legacy `cases`
update. That contract fence belongs in a later migration after the matching
Worker is active, so applying `0093` before deploy cannot break the old archive
route. Local tests pass the full migration chain, tenant denial, idempotent
replay, invalid counts, immutable events and the four-state lifecycle. Staging
remains through `0091`; production is unchanged.

## Migration 0095 — Builder document-analysis handoff (local candidate)

`0095_builder_document_analysis_handoffs.sql` is expand-only. It adds a
content-free handoff ledger that binds an active owner, exact Builder revision,
private file SHA-256, analysis ID, RU/UZ mode and SHA-256 of the request key.
Insert and transition triggers independently reject cross-tenant identities,
stale revisions, non-private/non-safe file states and a ready state without the
matching pending `document.analyze` outbox row. User-data deletion cascades the
handoff; there is no retained document text in this table.

Local migration and service tests pass private R2 integrity, atomic D1/outbox
state, exact replay, idempotency conflicts, tenant denial, plan limits and
fail-closed R2 retry. Migration `0095` was applied to protected staging after a
private backup and isolated restore; the matching Worker was deployed and
anonymous Access boundaries passed. Authenticated Builder/R2/queue browser
evidence remains open. Production is unchanged.

## Migration 0096 — immutable Builder document versions (local candidate)

`0096_builder_document_versions.sql` adds metadata-only private-object
checkpoints and append-only restore evidence. D1 guards active membership,
exact owner/workspace/document identity, current source revision and a ready
same-tenant source version. Identity is immutable; only bounded pending retry
or pending-to-ready object lifecycle transitions are accepted. No answers,
title, party data, legal text or raw idempotency key is stored in the tables.

Before staging application: export `juro-staging` to private
`juro-staging-backups`, verify the uploaded SHA-256, restore it into isolated D1
and pass integrity/FK checks. Apply `0096`, inspect ledger/tables/triggers, then
deploy the exact tested commit and run authenticated synthetic
create/list/restore/replay. Rollback is application-first; production remains
unchanged.
