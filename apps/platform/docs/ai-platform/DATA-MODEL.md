# JURO platform data model

Updated: 2026-07-30
Status: additive source schema through migration `0034`; isolated protected staging is also through `0034` with pre/post private-R2 checkpoints, an isolated pre-change restore, postflight integrity, and authenticated business-workspace evidence. Production and development remain on their existing `0004` schema.

## Modeling rules

- Existing document-builder, collaboration, invitations, comments, suggestions, signatures, exports, shares, cases, and workspace tables are extended rather than duplicated.
- Tenant ownership is represented by user, workspace, case, document, and membership relations and must be revalidated by every server operation.
- Migrations use expand-contract. Code rollback may leave additive tables/columns unused; destructive down migrations are not part of this candidate.
- Immutable or tamper-evident evidence is separated from mutable delivery/job state.

## Deadline calculation evidence — local migration 0067 candidate

Existing `action_plan_steps` and `tasks` retain their manual `due_at` behavior.
Migration `0067` adds the source date, bounded day count, inclusion and roll
rules, optional holiday-calendar version, safe earlier date, method, legal basis,
serialized evidence and confidence. Existing rows backfill only safe defaults:
no source or calculation is invented and confidence is `unverified`.

The deterministic calculator can produce only `preliminary`. A later protected
legal/calendar verification service may write `source_verified`, but user input
and AI output alone cannot. Plan-version snapshots retain the readable evidence
summary while the full calculation JSON stays on the current step/task records.

## Account deletion domain

`account_deletion_challenges` stores one-time email verification evidence without retaining the code. `account_deletion_requests` stores mode, keyed subject, schedule, lease, irreversible boundary, blocker/failure code, and terminal timestamps.

`account_deletion_lifecycle_events` is an append-only per-request hash chain covering scheduled, blocked, purge-started, failed, cancelled, retried-as-scheduled, and completed transitions. `account_deletion_purge_evidence` is one append-only terminal row with policy version, deletion/redaction counts, retained-evidence summary, and evidence hash.

`user_profiles.lifecycle_status` and `user_profiles.deletion_completed_at` support an irreversible tombstone. Triggers reject invalid request states, mutation of completed/cancelled requests, lifecycle/evidence update or delete, malformed hashes/JSON, and tombstone resurrection.

`job_outbox`, `job_runs`, `scheduled_run_locks`, and `scheduled_runs` provide dispatch, idempotency, leasing, cron locking, and operational evidence. The account purge uses the existing `cleanup.run` envelope and a dedicated staging Queue/DLQ rather than a parallel task table.

## Identity and retained evidence

Deletion revokes/removes mutable authentication records while retaining only documented consent, acceptance, access/security audit, confirmation/signature, and financial evidence required by policy. Retained rows reference the tombstoned user ID; they do not retain deleted message/file text through the purge evidence record.

## Migration 0033 footprint

Migration `0033_freezing_havok.sql` is additive except for replacing the active-request partial index with the expanded state predicate and normalizing legacy in-flight rows to review-required `blocked`. It adds two tables, lifecycle/tombstone fields, indexes, state checks, and append-only/immutability triggers. It does not drop user content or run a purge.

## Migration 0034 footprint

Migration `0034_business_workspace_identity.sql` additively introduces full and short business names, creator and idempotency-request evidence, a partial unique request index, bounded legacy backfill, and insert/update guards for business identity. Personal workspaces remain nullable and unchanged. Creation uses one authenticated, CSRF-protected D1 batch for workspace, owner membership, active selection, and audit; exact request replay is idempotent and cross-user or payload-mismatched replay fails closed.

The complete local migration sequence is `0000`–`0034` (35 ledger entries). Migration-safety tests apply the sequence from empty D1, verify `quick_check`, `foreign_key_check`, Drizzle snapshot continuity, the unchanged 112-table/158-FK source topology, business-name normalization, state guards, append-only evidence, and representative cascades. Remote staging has the same 35-entry ledger and reports 113 application tables (114 including `d1_migrations`), 72 triggers, 199 indexes, and zero foreign-key violations.

## Deferred domains

The target AI chat, legal-source retrieval, document intelligence/OCR, user-document vectors, lawyer marketplace, billing entitlements, support/status, voice/avatar, and full admin domains are not all runtime-complete. Existing foundational tables are not proof that their product behavior, external providers, or retention automation is active.

## User memory domain — local migration 0062 candidate

`user_memory_settings` stores the account-level automatic-memory preference.
`user_memories` stores user ownership, optional workspace scope, semantic
category, encrypted statement envelope, normalized equality hash, lifecycle and
source kind. Global scope requires a null workspace and the fixed `global`
scope key; workspace scope requires the exact referenced workspace and derived
scope key. A partial unique index applies only to active rows, so it prevents an
active duplicate without blocking multiple retained deleted records.

`memory_sources` links a memory record to a manual action, profile source or
originating conversation/message. Source deletion uses `SET NULL`; memory and
user deletion cascade. Human-readable memory text is never stored in source or
workspace audit metadata. Migration `0062_nervous_shinko_yamashiro.sql` is
additive and local-only until the staging backup/restore/migration gate passes.

## Analysis correction domain — local migration 0069 candidate

`analysis_document_versions` is an immutable chain under one completed analysis.
Version 1 is the normalized extracted Markdown; later versions reference their
immediate parent, a canonical idempotency/selection hash, and a unique set of
applied revision IDs. Content lives in private R2 and D1 stores its opaque key,
byte length and SHA-256.

`suggested_revisions` binds one risk, its version-1 excerpt and proposed wording
to the same owner/workspace/analysis. Statuses are pending, accepted, rejected,
applied, stale or ambiguous. Applied rows point to the resulting corrected
version. D1 triggers enforce identity immutability, legal state transitions,
tenant/source agreement and corrected-version membership. Cascading analysis or
account deletion removes D1 rows; the purge service deletes the inventoried R2
objects before crossing its D1 deletion boundary.
