# JURO AI platform decision log

This log records material implementation decisions. Status values are `accepted`, `pending approval`, or `superseded`.

## D-001 — implementation baseline

Status: accepted
Date: 2026-07-26

Use the Sites source revision `86843ca` as the implementation baseline because it is materially ahead of GitHub `main`. Synchronize it into `feature/juro-ai-platform` before relying on GitHub CI or deployment.

Consequence: GitHub `main` must not be deployed over the current application.

## D-002 — production freeze

Status: accepted
Date: 2026-07-26

Do not modify production schema, resources, secrets, or deployment during phases 0–9. Production requires a separate explicit approval after staging gates.

## D-003 — migration strategy

Status: accepted  
Date: 2026-07-26

Use additive expand-contract migrations:

```text
add → dual read/write if necessary → backfill → verify → switch → remove later
```

An in-D1 table copy is not accepted as a backup. Every remote migration requires an external verified export and isolated restore rehearsal.

## D-004 — external collaboration scope

Status: accepted  
Date: 2026-07-26

An invitation in `invited` state grants no document access. Accepted external collaboration is modeled separately from active-workspace membership, displayed in an explicit shared scope, and always constrained by the more restrictive rule.

## D-005 — asynchronous infrastructure order

Status: accepted  
Date: 2026-07-26

Implement and test queue consumers, idempotency, DLQ behavior, scheduled locks, and run records before binding live queues or Cron triggers. Do not attach resources to placeholder handlers.

## D-006 — Vectorize metadata strategy

Status: accepted  
Date: 2026-07-26

Store all required user-document metadata but create at most ten indexed metadata properties per index. Each environment declares a distinct index name intended for a physically separate index; control-plane inventory must prove that separation before `environment` is omitted as a filter. Authorization remains a D1/server check before and after vector search.

## D-007 — legal source authority

Status: accepted  
Date: 2026-07-26

LexUZ is the normative source of truth; AdviceUZ supplies practical scenarios; internal JURO materials are always labeled non-official. A citation is not confirmed solely by vector similarity. Exact server-side source/version verification is mandatory.

The rule governing RU/UZ text divergence remains `pending approval` and must live in protected configuration rather than an editable prompt.

## D-008 — AI provider configuration

Status: accepted  
Date: 2026-07-26

Provider calls are server-only. Model names are versioned server configuration, not secrets. Structured output is validated with Zod, with bounded repair/retry. Actual provider/model, instruction hash, source index version, and legal database version are recorded for each run.

## D-009 — personal AI Gateway logging

Status: accepted  
Date: 2026-07-26

If Cloudflare AI Gateway is used, personal requests disable payload collection while retaining safe cost/latency/error metadata. Semantic cache is disabled for user content. Public non-personal legal-source operations may be cached only after an explicit privacy review.

## D-010 — deferred provider features

Status: accepted  
Date: 2026-07-26

Realtime audio/video calls and payments use adapter interfaces and disabled feature flags until providers are selected and tested. UI must say “Скоро” and must not simulate calls, charges, or completion.

## D-011 — Sites binding normalization

Status: accepted  
Date: 2026-07-26

Use `wrangler.jsonc` as the environment-aware source configuration. During Vite build, mutate the resolved Cloudflare config in place. Replace the canonical Sites `DB` and `BUCKET` only for an explicit production build; development and staging retain isolated source bindings. Returning an additional configuration object is prohibited because `defu` concatenates arrays and can produce duplicate binding names.

Deployable validation targets the flattened `dist/server/wrangler.json`, selected at build time with `CLOUDFLARE_ENV`. Do not add `--env` to deployment of that artifact.

## D-012 — queue content and execution fencing

Status: accepted  
Date: 2026-07-26

Queue envelopes contain opaque identifiers only and reject unknown fields. Tenant-scoped jobs require `workspaceId`; consumers reload and reauthorize state server-side. Job execution and outbox dispatch use separate short leases, owner-token fencing, canonical envelope hashes, and bounded retries.

Raw user/provider content and raw errors are prohibited in queue bodies, job records, metrics, and logs.

Until a tenant-scoped composite idempotency model is introduced, all job and
request idempotency keys must be generated server-side in a globally
namespaced format. No client-supplied key may reach these tables.

## D-013 — Cron and consumer activation

Status: accepted  
Date: 2026-07-26

Omit `triggers` entirely until the Cloudflare control-plane inventory and reviewed scheduled job exist. `CRON_ENABLED=false` is defense in depth, not a replacement for trigger inventory.

Queue consumer declarations are also not proof that resources exist or are safe to activate. A disabled runtime still receives and retries messages when live consumers are attached. Staging activation therefore requires exact resource inventory, handler readiness, DLQ behavior, and alert verification.

Malformed envelopes and disabled handlers are intentionally terminal in the
current inert implementation. A live producer must not be wired until
quarantine/DLQ consumers, alerts, redrive policy, ledger reconciliation, and
per-kind producer/handler flags are implemented. Side-effecting handlers also
require provider idempotency or immutable subject-version identifiers plus
lease renewal/fencing; the current short lease is sufficient only for the
read-only D1 probe.

## D-014 — OTP claim and request atomicity

Status: accepted  
Date: 2026-07-26

A valid OTP is spent by a guarded `UPDATE ... RETURNING` before account or
session side effects. Incorrect attempts use a separately guarded increment.
OTP creation uses a conditional `INSERT ... SELECT` in one D1 batch with
previous-challenge invalidation and a result snapshot. Resend is called only
after the reservation succeeds.

The fail-closed consequence is deliberate: a downstream account/session
failure can consume a valid code, but it cannot create two sessions. The user
must request a new code.

Missing `CF-Connecting-IP` is represented as null; it is never hashed into a
shared `"unknown"` bucket.

## D-015 — active workspace and external document grants

Status: accepted  
Date: 2026-07-26

Owner authorization requires the document or standalone file to belong to the
owner's verified active workspace. A null workspace fails closed. Accepted
external collaborator grants remain usable across workspaces and appear only
in the explicit shared scope.

Invitation rows grant no access before acceptance. Accept and decline update
the invitation, collaborator grant, and deterministic audit event in one D1
batch. Legacy accepted collaborators do not require `joined_at`, and an
already accepted active collaborator cannot be demoted by a new invitation.

## D-016 — authentication principal and local session scope

Status: accepted  
Date: 2026-07-26

Authentication state carries its source, local session ID, and assurance
level. A trusted edge header is `platform_header/upstream`; it is not silently
treated as a JURO local session or as JURO MFA. The session/device UI manages
only JURO email-code sessions and states this boundary explicitly.

New local sessions use both a 30-day absolute lifetime and a seven-day idle
lifetime. Last-seen writes are throttled to five minutes. Login and revocation
state changes are committed with an append-only, per-user hash-chained
security event.

## D-017 — identity key rotation and MFA activation

Status: accepted  
Date: 2026-07-26

Identity encryption uses a versioned server-only key ring: AES-256-GCM with
record-bound AAD for recoverable secrets and domain-separated HMAC-SHA-256 for
lookups and high-entropy recovery codes. Writes use the active version; reads
may use retained prior versions during rotation.

TOTP enrollment must not become user-visible until one complete vertical is
ready: encrypted enrollment, confirmation, one-time backup-code display,
email-OTP pre-auth challenge, mandatory TOTP/backup verification before
session issuance, replay fencing, recent re-authentication, and rollback-safe
audit. Merely adding an enrollment toggle would create an authentication
bypass and is prohibited.

## D-018 — MFA pre-authentication and exact factor claims

Status: accepted
Date: 2026-07-26

When an account has an active TOTP credential, a successful email OTP consumes
that OTP but creates only a short-lived, hashed pre-auth challenge. A primary
session is created only after a valid TOTP step or one-time backup code.
Pre-auth state is stored in a separate HttpOnly, Secure, SameSite=Strict cookie
scoped to `/api/auth/verify-mfa`; it is never accepted as an application
session.

Every confirmation, login, backup-code regeneration, and disable operation
uses a unique factor claim bound to the exact operation ID and credential ID.
All downstream credential, session, backup-code, and audit mutations check
that exact claim in the same D1 batch. A losing concurrent operation therefore
cannot reuse the winner's factor proof or revoke/downgrade the winner's
session.

MFA management requires a current, active, absolute-unexpired and
idle-unexpired JURO local session. Trusted platform headers cannot enroll,
manage, or satisfy JURO MFA, and an account with active MFA cannot fall back to
a platform-header principal.

## D-019 — security-event chain tail follows topology

Status: accepted
Date: 2026-07-26

The current per-user security-event head is the event whose hash is not
referenced as another event's `previous_hash`. It is not the event with the
latest client-provided timestamp. Choosing by `created_at` can select a
non-tail after concurrent or out-of-order writes and permanently reject later
events through the chain uniqueness fence.

Tail selection therefore follows the stored hash graph using a `NOT EXISTS`
child query. The database uniqueness constraint remains the concurrency fence;
callers retry from the newly observed tail instead of weakening append-only or
fork protection.
