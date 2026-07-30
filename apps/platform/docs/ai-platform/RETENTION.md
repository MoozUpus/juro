# JURO retention and account deletion

Updated: 2026-07-30
Status: the account-deletion lifecycle and purge implementation is locally verified and deployed to owner-only protected staging. Schema, bindings, consumers, cron, and fail-closed probe dispatch are verified. A controlled rerun after secret re-entry still rejected the malformed identity keyring before fixture creation; the full synthetic D1/R2 purge remains open pending owner correction. Production is unchanged.

## Policy boundary

The configured policy targets remain:

- guest content: 24 hours;
- original voice audio: 30 days;
- technical logs: 90 days;
- access audit: 3 years;
- consent history: account lifetime plus required legal retention;
- cost history: retained for financial accounting;
- user content: until user deletion, subject to the rules below.

Only the account-deletion path described here is implemented by the current slice. Guest purge, voice purge, general log retention, legal holds, scheduled backup retention, and cross-provider deletion are not claimed as complete.

## User-selected deletion modes

`recoverable_30d` schedules purge 30 days after verified email-OTP confirmation. The user may sign in again and cancel while the request is `scheduled` or pre-purge `blocked`, provided the irreversible boundary has not been crossed.

`immediate` schedules the same protected purge without a recovery window. It cannot be cancelled. Both modes revoke current sessions, devices, and opaque device continuity when confirmed.

The API requires a recent local JURO email session, same-origin CSRF proof, a six-digit account-deletion code, one-time challenge consumption, and a purpose-separated keyed subject hash. It does not accept a platform header as authentication.

## Durable state machine

The implemented states are `scheduled`, `purging`, `blocked`, `cancelled`, `completed`, and retryable `failed` handling where the operation already crossed its irreversible boundary. Legacy `requested` or `reviewing` rows are migrated to `blocked` for explicit review.

The irreversible boundary is persisted before the first R2 or D1 deletion. Before that boundary, a recoverable request may be cancelled. After it, cancellation fails closed and the same request must retry to completion. Workspace sole ownership and an active privileged staff assignment block purge before this boundary and do not touch content. After the operator/user removes the blocker, a fresh authenticated retry creates exactly one new outbox job under concurrent requests.

## Deletion order

1. Acquire a bounded D1 lease for the due request.
2. Validate the keyed deletion subject and blockers.
3. Inventory only R2 keys owned by the subject or referenced by subject-owned documents/comparisons.
4. Persist `purge_irreversible_at` for the lease.
5. Delete the exact private R2 keys.
6. Execute the D1 cleanup transaction.
7. Tombstone the profile and complete append-only purge evidence.

R2 is deleted before D1 because deleting D1 first would destroy the authoritative object inventory. A retryable R2 failure preserves D1 content and releases the lease. A retryable D1 failure keeps the irreversible marker and retries without permitting cancellation.

## Removed, redacted, and retained data

The purge removes owned documents/files, comparisons linked to targeted files, cases, chats, analyses, contacts, sessions/devices, MFA credentials, memberships, and other user-owned operational content covered by the tested SQL plan. Contributions on content owned by another user are redacted rather than deleting that owner's object.

The profile becomes a non-reversible tombstone: direct identifiers and personal fields are cleared, email becomes a deterministic non-routable pseudonym, `lifecycle_status=deleted`, and `deletion_completed_at` is recorded. Database guards prevent mutation, resurrection, or deletion of that tombstone.

Minimum records retained for documented security, consent, access-audit, confirmation/signature, and financial purposes remain referentially stable. The append-only lifecycle chain and purge-evidence row contain keyed subject evidence, counts, policy version, timestamps, and hashes, not deleted text or original object names.

## Retry, cancellation, and idempotency

- cancellation and blocker retry are guarded by the keyed subject;
- cancellation rejects pending/retrying cleanup outbox rows atomically;
- blocker retry uses a transient transaction marker so concurrent retries create one outbox row and one lifecycle edge;
- queue execution is idempotent by request/job identifiers;
- a completed or cancelled request is terminal;
- duplicate delivery cannot repeat a completed purge.

## Known boundaries

User-document Vectorize deletion is not yet connected because user-document indexing is not an enabled product feature. It must be added before that index accepts tenant content. Provider-side AI deletion, guest cleanup, voice-audio cleanup, legal holds, and production retention automation remain deferred and feature-gated.
