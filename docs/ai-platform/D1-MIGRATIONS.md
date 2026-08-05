# D1 migration checkpoint

## 0089–0090 — protected staging checkpoint

Status: applied and independently restore-verified in protected staging on
2026-08-05; production is unchanged.

The exact commit `1aadfc6`, private R2 backup hashes, ordered ledger,
post-migration integrity, Worker version, CI and Access-boundary evidence are in
`STAGING-0089-0090-EVIDENCE.md`. Protected staging is through `0090` with 91
ledger rows. Statements below that call `0090` or earlier migrations local are
historical preflight notes superseded by this checkpoint.

## 0091 — verified corpus freshness

Status: applied and independently restore-verified in protected staging on
2026-08-05; production is unchanged.

`0091_verified_corpus_freshness.sql` makes legal freshness fail closed. A full
corpus run may be `success` only when every discovered item was fetched and
matches an activated, staff-published verified version. New or changed
pending-review material closes the run as `partial`. Terminal run evidence is
immutable; legacy rows are preserved for audit. A new private backup,
restore-check, exact migration and exact Worker deploy passed under
`STAGING-0091-VERIFIED-CORPUS-FRESHNESS-EVIDENCE.md`. Authenticated reviewer,
controlled corpus-run and Queue/email evidence remain separate gates.

## 0079–0088 — protected staging checkpoint

Status: applied and independently restore-verified in protected staging on 2026-08-05; production is unchanged.

The exact Git commit, private R2 backup hashes, ordered ledger, post-migration restore, Worker version, binding read-back, CI and Access-boundary evidence are recorded in `STAGING-0079-0088-EVIDENCE.md`. Statements below that still call these migrations “local candidates” are retained as their original preflight notes; this checkpoint supersedes those status lines. Authenticated operator rehearsals remain open and are not inferred from anonymous Access redirects.

## 0090 — immutable legal-version applicability

Status: applied in protected staging under `STAGING-0089-0090-EVIDENCE.md`; production is unchanged.

`0090_legal_source_applicability.sql` adds reviewer-bound, append-only effective/expiry evidence for each newly approved legal-source version. D1 requires an assigned in-review source/version, canonical evidence fields, a matching reviewer/session/MFA boundary and the applicability row before the review can transition to approved. Updates and deletes fail closed. Existing terminal approvals remain readable as legacy evidence; they are not retroactively assigned invented dates.

Publication projects the reviewed interval onto the verified version. A replacement archives the previous version at the earlier of its reviewed expiry or the successor effective date. Historical retrieval revalidates the predecessor publication, immutable applicability record, replacement lifecycle evidence and successor applicability evidence before it accepts the derived boundary.

Backup/restore, migration and exact Worker deployment passed. Authenticated
reviewer approval/publication/current-vs-historical retrieval/tamper-denial
checks in RU and UZ remain a distinct gate.

## 0086 — protected platform audit access

`0086_platform_audit_access.sql` adds a per-actor immutable SHA-256 chain for
administrator access to the safe global audit projection. D1 verifies the live
MFA session, active TOTP, current administrator assignment and 15-minute
freshness before each query/export evidence insert. No audit metadata or user
content is copied into the table.

This migration is local-only. Before staging, create and restore-verify a fresh
private D1 export, apply `0079`–`0086` in order, deploy the exact matching Worker
and run authenticated query/export, denial, integrity and content-absence
checks. Production is unchanged.

## 0085 — guarded operational job redrives

Status: additive local candidate; protected staging is currently through `0078`;
production is unchanged.

`0085_operational_job_redrives.sql` adds an immutable, actor-bound SHA-256 event
chain. A D1 trigger reopens only the same identifiers-only job/outbox projection
and preserves its idempotency key. Environment, relationship, prior state,
expired lease and an explicit recoverable error class are verified again in D1.
Permanent failures and broken evidence fail closed.

Before staging application: take and round-trip-verify a fresh full private
backup, restore it in isolation, apply `0079`–`0086` in order, inspect the new
table/indexes/triggers, deploy the exact Worker and reconcile one controlled
redrive through Queue/DLQ, domain effect, usage/cost and alert evidence.

## 0084 — operational feature flags

Status: additive local candidate; protected staging is currently through `0078`; production is unchanged.

`0084_operational_feature_flags.sql` adds one append-only, per-environment version history for `ai_chat`, `document_analysis_upload`, `lawyer_handoff` and `voice_mode`. D1 rejects missing actors, gaps, predecessor-hash mismatches, updates and deletes. The service verifies the SHA-256 chain before reads that control execution and before appending a new version. Missing history preserves the pre-existing enabled behavior; a recorded disabled state or a broken chain fails closed before provider calls, upload writes or handoff creation.

The protected RU/UZ operator route `/:locale/admin/feature-flags` and its API require `staff.operations.manage`, fresh MFA and CSRF for writes. The kill switches cover authenticated and guest AI, document upload/import/finalize, new lawyer handoff, and voice upload/finalize/transcription/speech. Data-management operations such as deleting an existing voice recording remain available during a pause.

Before staging application: create and round-trip-verify a new full `juro-staging` export in private `juro-staging-backups`, restore it in isolation, then apply all pending migrations in ledger order. Postflight must include an independent post-migration restore, ledger/table/index/trigger inspection, exact Worker identity, Access-boundary probes and an authenticated operator disable/re-enable rehearsal proving that no usage, provider call, R2 write or request row is created while disabled.

Rollback is application-first. Restore the prior Worker version; the additive immutable history table may remain. Do not delete operator evidence during recovery.

## 0069–0078 — protected staging checkpoint

Status: applied and independently restore-verified in protected staging on 2026-08-05; production is unchanged.

The pre-migration private R2 backup, exact ledger, post-migration restore, Worker version and Access-boundary evidence are recorded in `STAGING-0069-0078-EVIDENCE.md`. Direct remote integrity pragmas exceeded the D1 query memory ceiling, so the report relies on fresh exported schema/data restored into isolated SQLite and explicitly does not claim those remote pragmas passed.

## 0083 — public system status incidents

Status: additive local candidate; staging remains through `0078`; production is
unchanged.

`0083_system_status_incidents.sql` adds three tables for bilingual public-safe
incidents, fixed component impact and immutable progress updates. It does not
alter or delete existing platform data. Actor guards require a real profile;
incidents move only forward and cannot be deleted or reopened. Public projection
tests prove that staff, tenant and internal resource identifiers are omitted.

Before staging application: create and round-trip-verify a fresh full
`juro-staging` export in private `juro-staging-backups`, restore it into an
isolated D1 database, and apply all pending migrations in ledger order. Postflight
must include `quick_check`, `foreign_key_check`, table/index/trigger inspection,
exact Worker artifact identity, negative status-host route probes and an
operator incident create/update/resolve rehearsal.

Rollback is application-first: remove or roll back the status hostname/Worker
route while retaining the expand-only tables. Do not drop incident evidence in
the same release. DNS/custom-domain attachment and production routing require
separate explicit approval.

## 0082 — provider cost circuit breaker

Status: additive local candidate; staging remains through `0078`; production is
unchanged.

`0082_provider_cost_circuit_breaker.sql` adds versioned cost-guard policies,
one provider circuit state per environment/provider, immutable transition
events and operational-alert delivery evidence. It does not alter or drop an
existing table and stores no prompt, answer, document text, email recipient or
provider secret. SQLite lifecycle tests cover automatic daily-cost and
failure-spike opening, duplicate evaluation, manual close, immutability and
foreign-key integrity.

Before staging application: export `juro-staging` into the private
`juro-staging-backups` bucket, verify a full-object SHA-256 round trip and restore
the export into an isolated D1 database. Apply pending migrations in ledger
order only after that restore passes `quick_check` and `foreign_key_check`.
Postflight must verify migration ledger, new tables/indexes, empty FK violations,
Worker artifact identity and protected HTTP boundaries.

Rollback is application-first: disable automatic policies or roll back the
Worker to the previous version. Because `0082` is expand-only, its unused tables
may remain during incident recovery. Do not drop them in the same release; any
contract migration requires a new backup and separate review.

## 0066 — voice recordings

Status: additive migration applied and schema-verified in staging on 2026-08-04; not applied to production.

`0066_voice_recordings.sql` adds one tenant-scoped table with five foreign keys, bounded audio metadata, idempotency evidence, non-PII R2 keys, encrypted transcript fields and a 30-day retention index. It adds no destructive statement and does not modify existing document-builder data.

Staging evidence:

1. A fresh pre-0066 export was stored under private prefix `d1/juro-staging/20260803-203732/`; the full-object round-trip SHA-256 is `04ca84e33ee6553b1cd0e233937439cfab872cea64811b4b80f0e62bf9e18683`.
2. The isolated restore passed `quick_check`, foreign-key verification and schema counts.
3. Wrangler applied `0066` as remote ledger id 67 and now reports no pending staging migrations.
4. The remote table and four indexes exist, and `PRAGMA foreign_key_check` is empty.
5. Worker version `d22705e4-446a-47f1-825e-b77f1135504d` was deployed with the repository staging script. Anonymous Access-boundary smokes passed; authenticated voice E2E remains a separate gate.

Rollback is application-first: disable or roll back the Worker to the previous version. Because `0066` is expand-only, the unused table may remain safely during incident recovery. Do not drop it in the same release; data removal requires a later reviewed contract migration and a fresh backup.

## 0087 — AI legal quality review

Status: additive local candidate; protected staging is through `0078` and
production is unchanged. The migration adds immutable per-reviewer query/view/
resolve evidence and deletion-coupled corrected/golden content. D1 requires an
active legal-reviewer assignment, live TOTP-backed session, 15-minute MFA,
monotonic versions and the current feedback timestamp. Staging requires a fresh
private backup with isolated restore, ordered pending migrations, postflight and
authenticated positive/negative rehearsal before the matching Worker deploy is
claimed.

## 0093 — case lifecycle evidence

Status: additive local candidate; protected staging remains through `0091` and
production is unchanged.

The migration adds case completion/archive projection fields and an immutable,
tenant-checked lifecycle event chain. Accepted events atomically project
`complete`, `reopen`, `archive` and `restore`; D1 verifies exact current state,
active membership, revision and unresolved task/step counts. It is intentionally
expand-compatible with the old Worker. A later, separately backed-up contract
migration will reject every legacy direct projection update after the matching
Worker is proven in staging.

## 0094 — AI document prefill handoff

Status: additive local candidate; protected staging remains through `0092` and
production is unchanged.

The migration adds one content-free provenance row for explicit AI-answer to
Document Builder confirmation. It stores opaque tenant/message/document IDs,
selected field identifiers and SHA-256 digests; reviewed values and raw
idempotency keys are excluded. D1 independently requires active membership,
the tenant-owned persisted assistant result and the matching tenant-owned draft.
Rows are update-immutable and intentionally cascade-deletable with user content.

Before staging application, create a fresh full export in private
`juro-staging-backups`, verify full-object SHA-256 after upload, restore it to an
isolated D1 database and pass `quick_check`/`foreign_key_check`. Apply pending
migrations in order, inspect the table/indexes/triggers, deploy the exact tested
commit and perform authenticated RU/UZ preview/confirm/replay/delete proof.
Rollback is application-first; the expand-only table may remain unused.

## 0096 — immutable Builder document versions

Status: applied and independently restore-verified in protected staging on
2026-08-05; production is unchanged.

The migration adds metadata-only private-object checkpoints and append-only
restore evidence. D1 guards active membership, exact owner/workspace/document
identity, current source revision and a ready same-tenant source version. No
answers, title, party data, legal text or raw idempotency key is stored.

Private pre/post backups, uploaded SHA-256 round trips, isolated restores,
ordered `0096` application, schema/FK postflight, exact commit deployment, CI
and Access-boundary probes passed. Authenticated synthetic
create/list/restore/replay remains open. Rollback is application-first. Exact
evidence is recorded in
`apps/platform/docs/ai-platform/STAGING-0096-BUILDER-VERSIONS-EVIDENCE.md`.
